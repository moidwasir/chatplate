import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { HandledBy, MessageDirection, Prisma } from '@prisma/client';
import { ConversationState } from '@safi/types';
import { buildText } from '@safi/whatsapp';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertBranchAccess } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/auth.types';
import { SessionService } from './session.service';
import { WhatsAppService } from './whatsapp.service';

/** Meta only allows free-form messages within 24 h of the customer's last message */
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ChatMessageView {
  id: string;
  direction: MessageDirection;
  at: Date;
  status: string | null;
  text: string;
  buttons?: string[];
  imageUrl?: string;
  location?: { lat: number; lng: number };
  /** Staff member who typed it on the dashboard; absent for bot messages */
  staffName?: string;
}

/**
 * Staff side of WhatsApp conversations: list chats, read a thread, reply,
 * and take over from the bot or hand back to it.
 */
@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly session: SessionService,
  ) {}

  /** One row per customer (their latest conversation), most recent first */
  async list(branchId: string, user: AuthUser, opts: { q?: string; handledBy?: HandledBy }) {
    assertBranchAccess(user, branchId);
    const q = opts.q?.trim();
    const conversations = await this.prisma.conversation.findMany({
      where: {
        branchId,
        ...(opts.handledBy && { handledBy: opts.handledBy }),
        ...(q && {
          customer: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q.replace(/\D/g, '').replace(/^0/, '') || q } },
            ],
          },
        }),
      },
      orderBy: { lastMessageAt: 'desc' },
      distinct: ['customerId'],
      take: 100,
      include: {
        customer: { select: { id: true, name: true, phone: true, isBlocked: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const humanCount = await this.prisma.conversation.count({ where: { branchId, handledBy: 'HUMAN' } });

    return {
      humanCount,
      items: conversations.map((c) => {
        const last = c.messages[0];
        return {
          customer: c.customer,
          handledBy: c.handledBy,
          state: c.state,
          lastMessageAt: c.lastMessageAt,
          lastMessage: last ? { direction: last.direction, text: describe(last).text } : null,
          /** Staff is handling it and the customer spoke last */
          waitingForStaff: c.handledBy === 'HUMAN' && last?.direction === 'INBOUND',
        };
      }),
    };
  }

  /** Last 200 messages with this customer across their conversations in the branch */
  async thread(customerId: string, branchId: string, user: AuthUser) {
    assertBranchAccess(user, branchId);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, phone: true, isBlocked: true, createdAt: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const [messages, latest, lastInbound, orderCount] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversation: { customerId, branchId } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.latestConversation(customerId, branchId),
      this.prisma.message.findFirst({
        where: { conversation: { customerId, branchId }, direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.order.count({ where: { customerId, branchId } }),
    ]);

    const windowEndsAt = lastInbound ? new Date(lastInbound.createdAt.getTime() + SERVICE_WINDOW_MS) : null;
    return {
      customer,
      orderCount,
      handledBy: latest?.handledBy ?? 'BOT',
      windowOpen: !!windowEndsAt && windowEndsAt > new Date(),
      windowEndsAt,
      messages: messages.reverse().map(describe),
    };
  }

  /** Staff reply; the bot steps back so it doesn't answer over the staff member */
  async reply(customerId: string, branchId: string, text: string, user: AuthUser) {
    assertBranchAccess(user, branchId);
    const customer = await this.findCustomer(customerId);
    const staff = await this.prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });

    return this.session.withLock(customer.phone, async () => {
      const conversation = await this.latestConversation(customerId, branchId);
      if (!conversation) throw new NotFoundException('No conversation with this customer yet');

      const messageId = await this.whatsapp.sendMessage(customer.phone, buildText(customer.phone, text), conversation.id);
      if (!messageId) {
        throw new BadGatewayException(
          'WhatsApp did not accept the message. If the customer last wrote more than 24 hours ago, they need to message you first.',
        );
      }
      // Mark it as typed by staff, so the dashboard can tell it apart from the bot
      const sent = await this.prisma.message.findUnique({ where: { waMessageId: messageId } });
      if (sent) {
        await this.prisma.message.update({
          where: { id: sent.id },
          data: { content: { ...(sent.content as Prisma.JsonObject), _staff: staff?.name ?? 'Staff' } },
        });
      }
      await this.applyHandler(customer, conversation.id, branchId, 'HUMAN');
      return { sent: true };
    });
  }

  /** Take the chat over from the bot (HUMAN) or give it back (BOT) */
  async setHandler(customerId: string, branchId: string, handledBy: HandledBy, user: AuthUser) {
    assertBranchAccess(user, branchId);
    const customer = await this.findCustomer(customerId);

    await this.session.withLock(customer.phone, async () => {
      const conversation = await this.latestConversation(customerId, branchId);
      if (!conversation) throw new NotFoundException('No conversation with this customer yet');
      const wasHuman = conversation.handledBy === 'HUMAN';
      await this.applyHandler(customer, conversation.id, branchId, handledBy);

      if (handledBy === 'BOT' && wasHuman) {
        // Best effort: outside the 24 h window Meta refuses it, which is fine
        await this.whatsapp.sendMessage(
          customer.phone,
          buildText(customer.phone, '🤖 Thanks for chatting with us! Type *menu* anytime to order.'),
          conversation.id,
        );
      }
    });
    return { handledBy };
  }

  private async applyHandler(
    customer: { id: string; phone: string; language: 'EN' | 'UR' | 'UR_ROMAN' },
    conversationId: string,
    branchId: string,
    handledBy: HandledBy,
  ) {
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { handledBy } });

    // The bot reads its state from the Redis session, so update that too
    const s = await this.session.getSession(customer.phone);
    if (handledBy === 'HUMAN') {
      await this.session.setSession(customer.phone, {
        ...(s ?? { customerId: customer.id, conversationId, branchId, cart: [], tipPaisa: 0, language: customer.language }),
        state: ConversationState.HUMAN_HANDOVER,
        // Staff activity counts: the bot only takes back over after 30 quiet minutes
        lastActivityAt: Date.now(),
      });
    } else if (s?.state === ConversationState.HUMAN_HANDOVER) {
      await this.session.setSession(customer.phone, { ...s, state: ConversationState.GREETING });
    }
  }

  private async findCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, phone: true, language: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private latestConversation(customerId: string, branchId: string) {
    return this.prisma.conversation.findFirst({
      where: { customerId, branchId },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, handledBy: true },
    });
  }
}

/** Turn a stored Meta payload (inbound message or our outbound request) into something readable */
function describe(m: { id: string; direction: MessageDirection; type: string; content: Prisma.JsonValue; status: string | null; createdAt: Date }): ChatMessageView {
  const c = (m.content ?? {}) as any;
  const view: ChatMessageView = { id: m.id, direction: m.direction, at: m.createdAt, status: m.status, text: '' };
  if (typeof c._staff === 'string') view.staffName = c._staff;

  switch (c.type ?? m.type) {
    case 'text':
      view.text = c.text?.body ?? '';
      break;
    case 'image':
      view.text = c.image?.caption ?? '📷 Photo';
      if (typeof c.image?.link === 'string') view.imageUrl = c.image.link;
      break;
    case 'location':
      view.text = ['📍 Location', c.location?.name, c.location?.address].filter(Boolean).join(' · ');
      if (c.location?.latitude != null) view.location = { lat: c.location.latitude, lng: c.location.longitude };
      break;
    case 'button':
      view.text = c.button?.text ?? '';
      break;
    case 'template':
      view.text = `Template: ${c.template?.name ?? ''}`;
      break;
    case 'interactive': {
      const i = c.interactive ?? {};
      // Inbound: the customer tapped something
      if (i.button_reply || i.list_reply) {
        view.text = `👆 ${i.button_reply?.title ?? i.list_reply?.title}`;
        break;
      }
      view.text = [i.header?.text, i.body?.text].filter(Boolean).join('\n');
      if (i.header?.image?.link) view.imageUrl = i.header.image.link;
      if (i.type === 'button') view.buttons = (i.action?.buttons ?? []).map((b: any) => b.reply?.title).filter(Boolean);
      if (i.type === 'list') {
        view.buttons = (i.action?.sections ?? []).flatMap((s: any) => (s.rows ?? []).map((r: any) => r.title)).slice(0, 10);
      }
      if (i.type === 'carousel') {
        const cards = i.action?.cards ?? [];
        view.text += `\n🖼️ ${cards.length} photo cards: ${cards.map((k: any) => (k.body?.text ?? '').split('\n')[0]).join(' · ')}`;
        view.imageUrl = cards[0]?.header?.image?.link;
      }
      break;
    }
    default:
      view.text = `[${m.type}]`;
  }
  return view;
}
