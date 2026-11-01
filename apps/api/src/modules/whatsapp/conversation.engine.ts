import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ConversationState, MessageDirection } from '@safi/types';
import {
  buildText,
  buildButtons,
  buildList,
  buildImage,
  buildLocationRequest,
  buildGreeting,
  buildOrderReceived,
  buildTipSelection,
  buildCarousel,
  CAROUSEL_MAX_CARDS,
} from '@safi/whatsapp';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MenuService } from '../menu/menu.service';
import { OrdersService } from '../orders/orders.service';
import { WhatsAppService } from './whatsapp.service';
import {
  SessionService,
  WaSession,
  CartItem,
  SelectedModifier,
  SESSION_IDLE_MS,
  addToCart,
  cartSubtotal,
  unitTotal,
} from './session.service';
import { quoteDelivery, ZoneLike } from './delivery-quote';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_QUANTITY = 20;
/** Text that always brings the customer back to the main menu (cart is kept) */
const RESTART_WORDS = ['hi', 'hello', 'hey', 'salam', 'assalam o alaikum', 'aoa', 'start', 'order'];
/** Text asking to see the menu itself, e.g. "show me your full menu", "price list" */
const FULL_MENU_TEXT =
  /^menu$|\bmenu\b.*\b(dikhao|dikha|dikhain|dikhayen|dikhaen|bhejo|bhej|bhejein|send|please|plz|chahiye|show)\b|\b(show|send|see|view)\b.*\bmenu\b|\b(full|whole|complete|entire) menu\b|\b(price|rate) ?list\b|kya kya (hai|milta)|khana dikhao/;
/** WhatsApp text messages are capped at 4096 characters */
const MAX_TEXT_CHARS = 3800;
const CANCEL_WORDS = ['cancel', 'stop'];
/** Text that hands the chat to a person (the greeting's footer points here) */
const STAFF_WORDS = ['help', 'staff', 'agent', 'human', 'talk to staff'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type FullMenu = Awaited<ReturnType<MenuService['getFullMenu']>>;
type MenuItem = FullMenu[number]['items'][number];

/** What the customer sent, normalised across message types */
interface Input {
  /** Button or list-row id */
  id: string | null;
  /** Lower-cased, trimmed text body */
  text: string;
  location: { latitude: number; longitude: number; name?: string; address?: string } | null;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

@Injectable()
export class ConversationEngine {
  private readonly logger = new Logger(ConversationEngine.name);
  private readonly timeZone: string;

  constructor(
    private readonly session: SessionService,
    private readonly prisma: PrismaService,
    private readonly menu: MenuService,
    private readonly orders: OrdersService,
    private readonly whatsapp: WhatsAppService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('RESTAURANT_TIMEZONE') ?? 'Asia/Karachi';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public entry point
  // ─────────────────────────────────────────────────────────────────────────────

  async handle(message: any, metadata: any): Promise<void> {
    const phone: string = message?.from ?? '';
    if (!phone) return this.handleLocked(message, metadata);
    // Webhooks can arrive in parallel; one customer's messages are handled in order
    return this.session.withLock(phone, () => this.handleLocked(message, metadata));
  }

  private async handleLocked(message: any, metadata: any): Promise<void> {
    // ── Parse inbound message ────────────────────────────────────────────────
    const phone: string = message?.from ?? '';
    const waMessageId: string = message?.id ?? '';
    const msgType: string = message?.type ?? 'text';

    if (!phone || !waMessageId) {
      this.logger.warn('Received message with missing phone or id — skipping');
      return;
    }

    // ── Step 1: Idempotency check ────────────────────────────────────────────
    const existing = await this.prisma.message.findUnique({ where: { waMessageId } });
    if (existing) {
      this.logger.debug(`Duplicate message ${waMessageId} — skipping`);
      return;
    }

    // ── Step 2: Upsert customer (WhatsApp profile name fills in a missing name) ──
    const profileName: string | undefined = metadata?.contacts?.find(
      (c: any) => c?.wa_id === phone,
    )?.profile?.name;
    let customer = await this.prisma.customer.findUnique({ where: { phone } });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { phone, language: 'EN', name: profileName },
      });
      this.logger.log(`New customer created: ${phone} (id=${customer.id})`);
    } else if (!customer.name && profileName) {
      customer = await this.prisma.customer.update({
        where: { id: customer.id },
        data: { name: profileName },
      });
    }
    if (customer.isBlocked) {
      this.logger.warn(`Ignoring message from blocked customer ${phone}`);
      return;
    }

    // ── Step 3: Get or init session ──────────────────────────────────────────
    let s = await this.session.getSession(phone);
    const isNew = !s;
    if (!s) {
      const branchId = await this.resolveBranchId(metadata);
      const conversation = await this.prisma.conversation.create({
        data: { customerId: customer.id, branchId, state: ConversationState.GREETING },
      });
      s = {
        customerId: customer.id,
        conversationId: conversation.id,
        branchId,
        state: ConversationState.GREETING,
        cart: [],
        tipPaisa: 0,
        language: customer.language,
        lastActivityAt: Date.now(),
      };
    }
    const idleMs = Date.now() - s.lastActivityAt;

    // ── Step 4: Save inbound message ─────────────────────────────────────────
    try {
      await this.prisma.message.create({
        data: {
          conversationId: s.conversationId,
          waMessageId,
          direction: MessageDirection.INBOUND,
          type: msgType,
          content: message,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        // Unique violation: a concurrent delivery of the same message got here first
        this.logger.debug(`Duplicate message ${waMessageId} (race) — skipping`);
        return;
      }
      this.logger.warn(`Could not save inbound message ${waMessageId}: ${err?.message}`);
    }

    // ── Step 5: Route ────────────────────────────────────────────────────────
    const input = parseInput(message);
    try {
      await this.route(phone, s, input, isNew ? 0 : idleMs);
    } catch (err: any) {
      this.logger.error(`Error in state handler for ${phone}: ${err?.message}`, err?.stack);
      await this.send(
        phone,
        s,
        buildButtons(phone, '⚠️ Something went wrong. Please try again, or talk to our staff.', [
          { id: 'action_staff', title: '💬 Talk to Staff' },
        ]),
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Routing
  // ─────────────────────────────────────────────────────────────────────────────

  private async route(phone: string, s: WaSession, input: Input, idleMs: number): Promise<void> {
    // Staff is handling this chat; after 30 idle minutes the bot takes over again
    if (s.state === ConversationState.HUMAN_HANDOVER) {
      // The customer can always come back to ordering: any button, "menu", "hi"…
      const backToBot =
        !!input.id || (!!input.text && (RESTART_WORDS.includes(input.text) || FULL_MENU_TEXT.test(input.text)));
      if (idleMs < SESSION_IDLE_MS && !backToBot) {
        await this.save(phone, s);
        return;
      }
      await this.setHandledBy(s, 'BOT');
      s.state = ConversationState.GREETING;
      if (!backToBot) return this.startGreeting(phone, s);
      // Fall through and handle what they just sent
    }

    // Answers to the "continue where you left off?" prompt
    if (input.id === 'resume_continue') return this.prompt(phone, s);
    if (input.id === 'resume_restart') {
      this.resetOrder(s);
      return this.startGreeting(phone, s);
    }

    // Back after a long break mid-order: offer to continue
    if (idleMs >= SESSION_IDLE_MS && s.cart.length > 0 && s.state !== ConversationState.GREETING) {
      await this.save(phone, s);
      const count = s.cart.reduce((n, i) => n + i.quantity, 0);
      await this.send(
        phone,
        s,
        buildButtons(
          phone,
          `👋 Welcome back! You still have ${count} item${count !== 1 ? 's' : ''} in your cart.\n\nWould you like to continue your order?`,
          [
            { id: 'resume_continue', title: '▶️ Continue' },
            { id: 'resume_restart', title: '🔄 Start over' },
          ],
        ),
      );
      return;
    }
    if (idleMs >= SESSION_IDLE_MS) return this.startGreeting(phone, s);

    // Keywords work from any step
    if (input.text && RESTART_WORDS.includes(input.text)) return this.startGreeting(phone, s);
    if (input.text && CANCEL_WORDS.includes(input.text)) {
      this.resetOrder(s);
      await this.save(phone, s);
      await this.send(phone, s, buildText(phone, "❌ Order cancelled. Send *hi* whenever you're ready to order again!"));
      return;
    }

    // Shortcuts that can be tapped from several steps
    if (input.id === 'action_staff' || (input.text && STAFF_WORDS.includes(input.text))) return this.handover(phone, s);
    if (input.id === 'cart_view') return this.showCart(phone, s);
    if (input.id === 'cart_add') return this.sendCategoryMenu(phone, s);
    const tappedItem = stripPrefix(input.id, 'buy_') ?? stripPrefix(input.id, 'add_');
    if (tappedItem) {
      const mode = input.id!.startsWith('buy_') ? 'buy' : 'add';
      if (!s.orderType) {
        // Ask delivery/pickup first, then carry on with this item
        s.pendingItem = { id: tappedItem, mode };
        return this.askOrderType(phone, s);
      }
      return mode === 'buy' ? this.buyNow(phone, s, tappedItem) : this.handleItemSelection(phone, s, input);
    }
    const customise = stripPrefix(input.id, 'opt_');
    if (customise) return this.startItemOptions(phone, s, customise);
    const midOrder =
      s.state === ConversationState.ITEM_DETAIL || s.state === ConversationState.CART ||
      s.state === ConversationState.ADDRESS || s.state === ConversationState.TIP ||
      s.state === ConversationState.PAYMENT;
    // "View Menu" / "menu dikhao": photo cards to browse and buy from
    if (input.id === 'menu_full' || (input.text && FULL_MENU_TEXT.test(input.text))) {
      await this.sendVisualMenu(phone, s);
      return midOrder ? this.prompt(phone, s) : undefined;
    }
    // The text price list
    if (input.id === 'menu_text') {
      await this.sendFullMenu(phone, s);
      return midOrder ? this.prompt(phone, s) : this.sendCategoryMenu(phone, s);
    }
    // A category card from the photo menu
    const tappedCategory = input.id?.startsWith('cat_page_') ? null : stripPrefix(input.id, 'cat_');
    if (tappedCategory && s.state !== ConversationState.MENU_CATEGORY) {
      if (!s.orderType) {
        s.pendingItem = { id: tappedCategory, mode: 'category' };
        return this.askOrderType(phone, s);
      }
      return this.sendItemsForCategory(phone, s, tappedCategory);
    }

    switch (s.state) {
      case ConversationState.GREETING:
        return this.handleGreeting(phone, s, input);
      case ConversationState.ORDER_TYPE:
        return this.handleOrderType(phone, s, input);
      case ConversationState.MENU_CATEGORY:
        return this.handleCategorySelection(phone, s, input);
      case ConversationState.MENU_ITEM:
        return this.handleItemSelection(phone, s, input);
      case ConversationState.ITEM_DETAIL:
        return this.handleItemDetail(phone, s, input);
      case ConversationState.CART:
        return this.handleCartAction(phone, s, input);
      case ConversationState.ADDRESS:
        return this.handleAddress(phone, s, input);
      case ConversationState.TIP:
        return this.handleTip(phone, s, input);
      case ConversationState.PAYMENT:
        return this.handlePayment(phone, s, input);
      default:
        return this.startGreeting(phone, s);
    }
  }

  /** Re-ask the question for the current step (resume, or after unrecognised input) */
  private async prompt(phone: string, s: WaSession): Promise<void> {
    switch (s.state) {
      case ConversationState.ORDER_TYPE:
        return this.askOrderType(phone, s);
      case ConversationState.MENU_CATEGORY:
        return this.sendCategoryMenu(phone, s);
      case ConversationState.MENU_ITEM:
        return s.selectedCategoryId
          ? this.sendItemsForCategory(phone, s, s.selectedCategoryId)
          : this.sendCategoryMenu(phone, s);
      case ConversationState.ITEM_DETAIL:
        return this.askItemDetail(phone, s);
      case ConversationState.CART:
        return this.showCart(phone, s);
      case ConversationState.ADDRESS:
        return this.askAddress(phone, s);
      case ConversationState.TIP:
        return this.askTip(phone, s);
      case ConversationState.PAYMENT:
        return this.sendPaymentSummary(phone, s);
      default:
        return this.startGreeting(phone, s);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 1 — Greeting
  // ─────────────────────────────────────────────────────────────────────────────

  private async startGreeting(phone: string, s: WaSession): Promise<void> {
    const customer = await this.prisma.customer.findUnique({ where: { id: s.customerId } });
    const restaurantName = await this.getRestaurantName(s.branchId);
    const { isOpen, opensAt } = await this.checkBusinessHours(s.branchId);
    const isReturning = (await this.prisma.order.count({ where: { customerId: s.customerId } })) > 0;

    s.state = ConversationState.GREETING;
    await this.save(phone, s);
    await this.send(
      phone,
      s,
      buildGreeting(phone, restaurantName, customer?.name ?? undefined, isOpen, opensAt, isReturning),
    );
  }

  /** GREETING — main-menu buttons are showing */
  private async handleGreeting(phone: string, s: WaSession, input: Input): Promise<void> {
    switch (input.id) {
      case 'action_order':
      case 'action_reorder':
        return this.askOrderType(phone, s);
      case 'action_track':
        return this.sendTrackingInfo(phone, s);
      default:
        return this.startGreeting(phone, s);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 2 — Delivery or pickup
  // ─────────────────────────────────────────────────────────────────────────────

  private async askOrderType(phone: string, s: WaSession): Promise<void> {
    // The greeting may have been sent while open; check again before taking an order
    const { isOpen } = await this.checkBusinessHours(s.branchId);
    if (!isOpen) return this.startGreeting(phone, s);

    s.state = ConversationState.ORDER_TYPE;
    await this.save(phone, s);
    await this.send(
      phone,
      s,
      buildButtons(phone, '🚀 How would you like to receive your order?', [
        { id: 'type_delivery', title: '🚗 Delivery' },
        { id: 'type_pickup', title: '🏃 Pickup' },
        { id: 'action_back', title: '🔙 Back' },
      ]),
    );
  }

  private async handleOrderType(phone: string, s: WaSession, input: Input): Promise<void> {
    switch (input.id) {
      case 'type_delivery':
      case 'type_pickup':
        s.orderType = input.id === 'type_delivery' ? 'DELIVERY' : 'PICKUP';
        s.deliveryAddressId = undefined;
        s.deliveryFeePaisa = undefined;
        // An item tapped before choosing delivery/pickup carries on now
        if (s.pendingItem) {
          const { id, mode } = s.pendingItem;
          s.pendingItem = undefined;
          if (mode === 'category') return this.sendItemsForCategory(phone, s, id);
          return mode === 'buy'
            ? this.buyNow(phone, s, id)
            : this.handleItemSelection(phone, s, { id: `add_${id}`, text: '', location: null });
        }
        // Changing order type from the cart goes straight back to checkout
        return s.cart.length > 0 ? this.checkout(phone, s) : this.sendCategoryMenu(phone, s);
      case 'action_back':
        return this.startGreeting(phone, s);
      default:
        return this.sendFallback(phone, s);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 3 — Categories and items
  // ─────────────────────────────────────────────────────────────────────────────

  private async sendCategoryMenu(phone: string, s: WaSession, page = 0): Promise<void> {
    if (!s.orderType) return this.askOrderType(phone, s);

    const categories = dealsFirst(await this.menu.getFullMenu(s.branchId));
    if (categories.length === 0) {
      await this.send(phone, s, buildText(phone, '😔 Sorry, no menu items are available right now. Please try again later.'));
      return;
    }

    // First time in this order: show the whole menu once, so the customer can browse before picking
    if (!s.fullMenuShown && page === 0) await this.sendVisualMenu(phone, s, false);

    // WhatsApp lists hold 10 rows: categories, then "full menu" and (with items) the cart
    const extras = [{ id: 'menu_text', title: '📋 Price list', description: 'All items and prices in one message' }];
    if (s.cart.length > 0) {
      extras.push({ id: 'cart_view', title: '🛒 View cart', description: `PKR ${pkr(cartSubtotal(s.cart))}` });
    }
    const { slice, next } = paginate(categories, page, 10 - extras.length);
    const rows = slice.map((c) => ({
      id: `cat_${c.id}`,
      title: truncate(`${isDealCategory(c.name) ? '🔥' : categoryEmoji(c.name)} ${c.name}`, 24),
      description: isDealCategory(c.name)
        ? `${c.items.length} deal${c.items.length !== 1 ? 's' : ''} · save up to PKR ${pkr(Math.max(0, ...c.items.map(saving)))}`
        : `${c.items.length} item${c.items.length !== 1 ? 's' : ''} · from PKR ${pkr(Math.min(...c.items.map((i) => i.price)))}`,
    }));
    if (next !== null) rows.push({ id: `cat_page_${next}`, title: '➡️ More categories', description: `Page ${next + 1}` });

    s.state = ConversationState.MENU_CATEGORY;
    await this.save(phone, s);
    await this.send(
      phone,
      s,
      buildList(
        phone,
        '🍽️ What are you in the mood for? Pick a category:',
        [
          { title: 'Categories', rows },
          { title: 'More', rows: extras },
        ],
        'View Categories',
        'Our Menu',
      ),
    );
  }

  /**
   * The menu as swipeable photo cards, deals first: every item when they fit in one
   * carousel (⚡ Buy now / ➕ Add to cart on each), otherwise one card per category.
   * Falls back to the text menu when there aren't enough photos or WhatsApp refuses.
   */
  private async sendVisualMenu(phone: string, s: WaSession, withButtons = true): Promise<void> {
    const categories = dealsFirst(await this.menu.getFullMenu(s.branchId));
    s.fullMenuShown = true;
    const restaurantName = await this.getRestaurantName(s.branchId);
    const photoItems = categories.flatMap((c) => c.items.filter((i) => isPublicImage(i.imageUrl)));
    const photoCategories = categories.filter((c) => c.items.some((i) => isPublicImage(i.imageUrl)));

    let carousel: ReturnType<typeof buildCarousel> | null = null;
    if (photoItems.length >= 2 && photoItems.length <= CAROUSEL_MAX_CARDS) {
      carousel = buildCarousel(
        phone,
        `🍽️ *${restaurantName}: our menu*\nSwipe 👉 and tap *⚡ Buy now* or *➕ Add to cart*.`,
        photoItems.map((item) => ({
          imageUrl: item.imageUrl!,
          text: `*${item.name}*\n${priceText(item)}${item.description ? `\n${truncate(item.description, 80)}` : ''}`,
          buttons: [
            { id: `buy_${item.id}`, title: '⚡ Buy now' },
            { id: `add_${item.id}`, title: '➕ Add to cart' },
          ],
        })),
      );
    } else if (photoCategories.length >= 2) {
      carousel = buildCarousel(
        phone,
        `🍽️ *${restaurantName}: our menu*\nSwipe 👉 and open a category.`,
        photoCategories.slice(0, CAROUSEL_MAX_CARDS).map((c) => ({
          imageUrl: c.items.find((i) => isPublicImage(i.imageUrl))!.imageUrl!,
          text: `${isDealCategory(c.name) ? '🔥' : categoryEmoji(c.name)} *${c.name}*\n${c.items.length} item${c.items.length !== 1 ? 's' : ''} · from PKR ${pkr(Math.min(...c.items.map((i) => i.price)))}`,
          buttons: [{ id: `cat_${c.id}`, title: '👀 See items' }],
        })),
      );
    }

    await this.save(phone, s);
    if (!carousel || !(await this.send(phone, s, carousel))) {
      if (carousel) this.logger.warn('Photo menu was refused; sending the text menu instead');
      return this.sendFullMenu(phone, s, categories);
    }
    if (!withButtons) return;

    const buttons = [
      { id: 'cart_add', title: '📂 Categories' },
      { id: 'menu_text', title: '📋 Price list' },
    ];
    if (s.cart.length > 0) buttons.push({ id: 'cart_view', title: '🛒 View cart' });
    await this.send(phone, s, buildButtons(phone, 'Or browse by category, or see every price in one list:', buttons));
  }

  /** The whole menu as formatted text: categories, items, prices, short descriptions */
  private async sendFullMenu(phone: string, s: WaSession, categories?: Awaited<ReturnType<MenuService['getFullMenu']>>): Promise<void> {
    categories = dealsFirst(categories ?? (await this.menu.getFullMenu(s.branchId)));
    s.fullMenuShown = true;
    if (categories.length === 0) {
      await this.send(phone, s, buildText(phone, '😔 Sorry, no menu items are available right now.'));
      return;
    }

    const restaurantName = await this.getRestaurantName(s.branchId);
    const blocks = categories.map((c) => {
      const lines = c.items.map((i) => {
        const hasOptions = i.modifierGroups.some((g) => g.modifiers.length > 0);
        const details = [
          i.description ? `   _${truncate(i.description, 70)}_` : '',
          hasOptions ? '   ✨ Customisable' : '',
        ].filter(Boolean);
        return [`▸ *${i.name}* · ${priceText(i)}`, ...details].join('\n');
      });
      return `${isDealCategory(c.name) ? '🔥' : categoryEmoji(c.name)} *${c.name.toUpperCase()}*\n${lines.join('\n')}`;
    });

    // Split between categories so no message runs past WhatsApp's length limit
    const messages: string[] = [];
    let current = `📋 *${restaurantName} — Menu*\n_All prices in PKR, before tax_`;
    for (const block of blocks) {
      if (current.length + block.length + 2 > MAX_TEXT_CHARS) {
        messages.push(current);
        current = block;
      } else {
        current += `\n\n${block}`;
      }
    }
    messages.push(`${current}\n\n👇 Tap *View Categories* to start ordering.`);

    for (const text of messages) await this.send(phone, s, buildText(phone, text));
  }

  private async handleCategorySelection(phone: string, s: WaSession, input: Input): Promise<void> {
    const page = stripPrefix(input.id, 'cat_page_');
    if (page !== null) return this.sendCategoryMenu(phone, s, Number(page) || 0);
    const categoryId = stripPrefix(input.id, 'cat_');
    if (!categoryId) return this.sendCategoryMenu(phone, s);
    return this.sendItemsForCategory(phone, s, categoryId);
  }

  private async sendItemsForCategory(phone: string, s: WaSession, categoryId: string, page = 0): Promise<void> {
    const categories = await this.menu.getFullMenu(s.branchId);
    const category = categories.find((c) => c.id === categoryId);

    if (!category) {
      await this.send(phone, s, buildText(phone, '😔 No items are available in that category right now.'));
      return this.sendCategoryMenu(phone, s);
    }

    s.selectedCategoryId = categoryId;
    s.state = ConversationState.MENU_ITEM;

    // Photo cards when every item has a public photo; the text list otherwise
    // (or if WhatsApp refuses the carousel)
    if (category.items.length >= 2 && category.items.every((i) => isPublicImage(i.imageUrl))) {
      if (await this.sendItemCarousel(phone, s, category, page)) return;
      this.logger.warn(`Carousel for "${category.name}" was refused; sending the list instead`);
    }
    // A single item with a photo: one photo message with Add (carousels need 2+ cards)
    const only = category.items.length === 1 ? category.items[0] : null;
    if (only && isPublicImage(only.imageUrl)) {
      await this.save(phone, s);
      const sent = await this.send(
        phone,
        s,
        buildButtons(
          phone,
          `*${only.name}*\n${priceText(only)}${only.description ? `\n${truncate(only.description, 300)}` : ''}`,
          [
            { id: `buy_${only.id}`, title: '⚡ Buy now' },
            { id: `add_${only.id}`, title: '➕ Add to cart' },
            { id: 'back_categories', title: '⬅️ Categories' },
          ],
          { imageUrl: only.imageUrl! },
        ),
      );
      if (sent) return;
    }

    // 10 rows: items, "more" when there are further pages, and "back"
    const { slice, next } = paginate(category.items, page, 9);
    const rows = slice.map((item) => ({
      id: `item_${item.id}`,
      title: truncate(item.name, 24),
      description: truncate(`${priceText(item, false)}${item.description ? ` · ${item.description}` : ''}`, 72),
    }));
    if (next !== null) {
      rows.push({ id: `items_page_${next}`, title: '➡️ More items', description: `Page ${next + 1} of ${Math.ceil(category.items.length / 8)}` });
    }
    rows.push({ id: 'back_categories', title: '⬅️ Back to categories', description: '' });

    await this.save(phone, s);
    const heading = `${categoryEmoji(category.name)} ${category.name}`;
    await this.send(
      phone,
      s,
      buildList(
        phone,
        `Choose an item${page > 0 ? ` (page ${page + 1})` : ''}. Tap one to see its options.`,
        [{ title: truncate(category.name, 24), rows }],
        'View Items',
        truncate(heading, 60),
      ),
    );
  }

  /**
   * The category's items as swipeable photo cards with a "➕ Add" button each, then a
   * small message with Back / Cart / More. Returns false if WhatsApp refused the carousel.
   */
  private async sendItemCarousel(
    phone: string,
    s: WaSession,
    category: Awaited<ReturnType<MenuService['getFullMenu']>>[number],
    page: number,
  ): Promise<boolean> {
    // Even pages (e.g. 11 items → 6 + 5) so no page is left with a single card
    const pages = Math.ceil(category.items.length / CAROUSEL_MAX_CARDS);
    const perPage = Math.ceil(category.items.length / pages);
    const current = Math.min(Math.max(page, 0), pages - 1);
    const items = category.items.slice(current * perPage, (current + 1) * perPage);
    const next = current + 1 < pages ? current + 1 : null;

    await this.save(phone, s);
    const sent = await this.send(
      phone,
      s,
      buildCarousel(
        phone,
        `${categoryEmoji(category.name)} *${category.name}*${pages > 1 ? ` (${current + 1}/${pages})` : ''}\nSwipe to see everything 👉`,
        items.map((item) => ({
          imageUrl: item.imageUrl!,
          text: `*${item.name}*\n${priceText(item)}${item.description ? `\n${truncate(item.description, 80)}` : ''}`,
          buttons: [
            { id: `buy_${item.id}`, title: '⚡ Buy now' },
            { id: `add_${item.id}`, title: '➕ Add to cart' },
          ],
        })),
      ),
    );
    if (!sent) return false;

    const buttons = [{ id: 'back_categories', title: '⬅️ Categories' }];
    if (next !== null) buttons.push({ id: `items_page_${next}`, title: '➡️ More items' });
    if (s.cart.length > 0) buttons.push({ id: 'cart_view', title: '🛒 View cart' });
    await this.send(
      phone,
      s,
      buildButtons(phone, '⚡ *Buy now*: straight to checkout with the standard options\n➕ *Add to cart*: choose options, keep shopping', buttons),
    );
    return true;
  }

  private async handleItemSelection(phone: string, s: WaSession, input: Input): Promise<void> {
    if (input.id === 'back_categories') return this.sendCategoryMenu(phone, s);
    const page = stripPrefix(input.id, 'items_page_');
    if (page !== null && s.selectedCategoryId) return this.sendItemsForCategory(phone, s, s.selectedCategoryId, Number(page) || 0);
    // A category row tapped on an older list still works
    const categoryId = stripPrefix(input.id, 'cat_');
    if (categoryId) return this.sendItemsForCategory(phone, s, categoryId);

    const fromCard = stripPrefix(input.id, 'add_');
    const itemId = fromCard ?? stripPrefix(input.id, 'item_');
    const item = itemId ? await this.findMenuItem(s.branchId, itemId) : null;
    if (!item) {
      if (itemId) await this.send(phone, s, buildText(phone, '😔 Sorry, that item is no longer available.'));
      return this.prompt(phone, s);
    }

    const hasOptions = item.modifierGroups.some((g) => g.modifiers.length > 0);
    if (!fromCard && hasOptions) {
      // Let the customer skip the questions entirely
      const body = `*${item.name}*\n${priceText(item)}${item.description ? `\n${item.description}` : ''}\n\n⚡ *Buy now* uses the standard options: ${standardOptionsText(item)}`;
      await this.save(phone, s);
      await this.send(
        phone,
        s,
        buildButtons(
          phone,
          body,
          [
            { id: `buy_${item.id}`, title: '⚡ Buy now' },
            { id: `opt_${item.id}`, title: '🛠️ Choose options' },
            { id: 'back_categories', title: '⬅️ Back' },
          ],
          isPublicImage(item.imageUrl) ? { imageUrl: item.imageUrl! } : undefined,
        ),
      );
      return;
    }
    return this.startItemOptions(phone, s, item.id, fromCard !== null);
  }

  /** Begin the options → quantity questions for an item */
  private async startItemOptions(phone: string, s: WaSession, itemId: string, photoSeen = true): Promise<void> {
    const item = await this.findMenuItem(s.branchId, itemId);
    if (!item) {
      await this.send(phone, s, buildText(phone, '😔 Sorry, that item is no longer available.'));
      return this.prompt(phone, s);
    }
    const fromCard = photoSeen ? item.id : null;
    // Show the item: photo when we have a public one, then its options
    const caption = `*${item.name}* — ${priceText(item)}${item.description ? `\n${item.description}` : ''}`;
    if (fromCard) {
      // The customer just saw the photo card; go straight to options / quantity
    } else if (isPublicImage(item.imageUrl)) {
      await this.send(phone, s, buildImage(phone, item.imageUrl!, caption));
    } else if (item.description) {
      await this.send(phone, s, buildText(phone, caption));
    }

    s.draft = { menuItemId: item.id, groupIndex: 0, selectedModifiers: [] };
    s.state = ConversationState.ITEM_DETAIL;
    return this.askItemDetail(phone, s);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 4 — Item options and quantity
  // ─────────────────────────────────────────────────────────────────────────────

  /** Ask the next option group, or the quantity once all groups are answered */
  private async askItemDetail(phone: string, s: WaSession): Promise<void> {
    const item = s.draft ? await this.findMenuItem(s.branchId, s.draft.menuItemId) : null;
    if (!s.draft || !item) {
      s.draft = undefined;
      await this.send(phone, s, buildText(phone, '😔 Sorry, that item is no longer available.'));
      return this.sendCategoryMenu(phone, s);
    }
    await this.save(phone, s);

    const groups = item.modifierGroups.filter((g) => g.modifiers.length > 0);
    const group = groups[s.draft.groupIndex];

    if (!group) {
      const unit = item.price + s.draft.selectedModifiers.reduce((t, m) => t + m.priceAdjustment, 0);
      const chosen = s.draft.selectedModifiers.map((m) => m.name).join(', ');
      await this.send(
        phone,
        s,
        buildButtons(
          phone,
          `🔢 How many *${item.name}*${chosen ? ` (${chosen})` : ''}?\n\nPKR ${pkr(unit)} each.`,
          [
            { id: 'qty_1', title: '1' },
            { id: 'qty_2', title: '2' },
            { id: 'qty_3', title: '3' },
          ],
          undefined,
          `Or type a number up to ${MAX_QUANTITY}.`,
        ),
      );
      return;
    }

    const picked = s.draft.selectedModifiers.filter((m) => m.groupId === group.id);
    const pickedIds = new Set(picked.map((m) => m.modifierId));
    const minChoices = Math.max(group.minChoices, group.required ? 1 : 0);
    const canFinish = picked.length >= minChoices;

    const extraRow = canFinish
      ? picked.length > 0
        ? { id: 'mod_done', title: '✅ Done', description: '' }
        : { id: 'mod_skip', title: '⏭️ No thanks', description: '' }
      : null;
    const options = group.modifiers.filter((m) => !pickedIds.has(m.id)).slice(0, extraRow ? 9 : 10);
    const rows = options.map((m) => ({
      id: `mod_${m.id}`,
      title: truncate(`${optionEmoji(m.name, group.name)} ${m.name}`, 24),
      description: m.priceAdjustment > 0 ? `+ PKR ${pkr(m.priceAdjustment)}` : '',
    }));
    if (extraRow) rows.push(extraRow);

    const rule =
      group.maxChoices > 1
        ? `Choose up to ${group.maxChoices}${minChoices > 0 ? ` (at least ${minChoices})` : ''}.`
        : minChoices > 0
          ? 'Please choose one.'
          : 'Optional.';
    const soFar = picked.length > 0 ? `\nSelected: ${picked.map((m) => m.name).join(', ')}` : '';

    // Up to 3 choices fit as tap buttons (like Delivery / Pickup); more need a list
    if (rows.length <= 3) {
      const prices = options.filter((m) => m.priceAdjustment > 0);
      const priceNote = prices.length ? `\n${prices.map((m) => `${optionEmoji(m.name, group.name)} ${m.name}: + PKR ${pkr(m.priceAdjustment)}`).join('\n')}` : '';
      await this.send(
        phone,
        s,
        buildButtons(
          phone,
          `*${item.name}*: ${group.name}\n${rule}${soFar}${priceNote}`,
          rows.map((r) => ({ id: r.id, title: truncate(r.title, 20) })),
        ),
      );
      return;
    }
    await this.send(
      phone,
      s,
      buildList(phone, `*${item.name}*: ${group.name}\n${rule}${soFar}`, [{ title: truncate(group.name, 24), rows }], 'Choose', truncate(group.name, 60)),
    );
  }

  /** ⚡ Buy now: one of this item with its standard options, straight to checkout */
  private async buyNow(phone: string, s: WaSession, itemId: string): Promise<void> {
    const item = await this.findMenuItem(s.branchId, itemId);
    if (!item) {
      await this.send(phone, s, buildText(phone, '😔 Sorry, that item is no longer available.'));
      return this.prompt(phone, s);
    }
    const selectedModifiers = standardOptions(item);
    addToCart(s.cart, {
      menuItemId: item.id,
      name: item.name,
      unitPrice: item.price,
      quantity: 1,
      selectedModifiers,
    });
    s.draft = undefined;
    const chosen = selectedModifiers.map((m) => m.name).join(', ');
    await this.send(phone, s, buildText(phone, `⚡ 1 × *${item.name}*${chosen ? ` (${chosen})` : ''} added. Taking you to checkout…`));
    return this.checkout(phone, s);
  }

  private async handleItemDetail(phone: string, s: WaSession, input: Input): Promise<void> {
    const item = s.draft ? await this.findMenuItem(s.branchId, s.draft.menuItemId) : null;
    if (!s.draft || !item) return this.askItemDetail(phone, s);

    const groups = item.modifierGroups.filter((g) => g.modifiers.length > 0);
    const group = groups[s.draft.groupIndex];

    // ── Quantity ──
    if (!group) {
      const qty = input.id?.startsWith('qty_') ? Number(input.id.slice(4)) : Number(input.text);
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY) {
        await this.send(phone, s, buildText(phone, `Please choose a quantity from 1 to ${MAX_QUANTITY}.`));
        return this.askItemDetail(phone, s);
      }
      addToCart(s.cart, {
        menuItemId: item.id,
        name: item.name,
        unitPrice: item.price,
        quantity: qty,
        selectedModifiers: s.draft.selectedModifiers,
      });
      s.draft = undefined;
      await this.send(phone, s, buildText(phone, `✅ ${qty} × *${item.name}* added to your cart!`));
      return this.showCart(phone, s);
    }

    // ── Option group ──
    const picked = s.draft.selectedModifiers.filter((m) => m.groupId === group.id);
    const minChoices = Math.max(group.minChoices, group.required ? 1 : 0);

    if (input.id === 'mod_skip' || input.id === 'mod_done') {
      if (picked.length < minChoices) return this.askItemDetail(phone, s);
      s.draft.groupIndex++;
      return this.askItemDetail(phone, s);
    }

    const modifierId = stripPrefix(input.id, 'mod_');
    const modifier = group.modifiers.find((m) => m.id === modifierId);
    if (!modifier || picked.some((m) => m.modifierId === modifier.id)) {
      return this.askItemDetail(phone, s);
    }

    s.draft.selectedModifiers.push({
      groupId: group.id,
      modifierId: modifier.id,
      name: modifier.name,
      priceAdjustment: modifier.priceAdjustment,
    });
    // Single-choice groups (or a full multi-choice group) move on automatically
    const remaining = group.modifiers.length - picked.length - 1;
    if (picked.length + 1 >= group.maxChoices || remaining === 0) s.draft.groupIndex++;
    return this.askItemDetail(phone, s);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 5 — Cart
  // ─────────────────────────────────────────────────────────────────────────────

  private async showCart(phone: string, s: WaSession): Promise<void> {
    if (s.cart.length === 0) {
      await this.send(phone, s, buildText(phone, "🛒 Your cart is empty. Let's add some items!"));
      return this.sendCategoryMenu(phone, s);
    }

    s.state = ConversationState.CART;
    await this.save(phone, s);

    const cartText =
      `🛒 *Your Cart*\n\n` +
      cartLines(s.cart).join('\n') +
      `\n\n────────────────\n*Subtotal: PKR ${pkr(cartSubtotal(s.cart))}*`;

    await this.send(
      phone,
      s,
      buildButtons(phone, cartText, [
        { id: 'cart_checkout', title: '✅ Checkout' },
        { id: 'cart_add', title: '➕ Add More' },
        { id: 'cart_clear', title: '🗑️ Clear Cart' },
      ]),
    );
  }

  private async handleCartAction(phone: string, s: WaSession, input: Input): Promise<void> {
    switch (input.id) {
      case 'cart_checkout':
        return this.checkout(phone, s);
      case 'cart_clear':
        s.cart = [];
        await this.send(phone, s, buildText(phone, "🗑️ Cart cleared! Let's start fresh."));
        return this.sendCategoryMenu(phone, s);
      default:
        return this.showCart(phone, s);
    }
  }

  private async checkout(phone: string, s: WaSession): Promise<void> {
    if (s.cart.length === 0) return this.showCart(phone, s);
    if (s.orderType === 'DELIVERY') return this.askAddress(phone, s);
    return this.askTip(phone, s);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 6 — Delivery address and zone check
  // ─────────────────────────────────────────────────────────────────────────────

  private async askAddress(phone: string, s: WaSession): Promise<void> {
    s.state = ConversationState.ADDRESS;
    await this.save(phone, s);

    const saved = await this.prisma.address.findMany({
      where: { customerId: s.customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      take: 9,
    });

    if (saved.length === 0) {
      await this.send(phone, s, buildLocationRequest(phone, '📍 Please share your delivery location so we can bring your order right to you!'));
      return;
    }

    const rows = saved.map((a) => ({
      id: `addr_${a.id}`,
      title: truncate(a.label, 24),
      description: truncate(a.address, 72),
    }));
    rows.push({ id: 'addr_new', title: '📍 New location', description: 'Share a pin on the map' });
    await this.send(
      phone,
      s,
      buildList(phone, '📍 Where should we deliver?', [{ title: 'Your addresses', rows }], 'Choose address'),
    );
  }

  private async handleAddress(phone: string, s: WaSession, input: Input): Promise<void> {
    if (input.id === 'type_pickup') {
      s.orderType = 'PICKUP';
      return this.askTip(phone, s);
    }
    if (input.id === 'addr_new') {
      await this.send(phone, s, buildLocationRequest(phone, '📍 Tap the button below to share your delivery location.'));
      return;
    }

    // A saved address
    const savedId = stripPrefix(input.id, 'addr_');
    if (savedId) {
      const address = await this.prisma.address.findFirst({ where: { id: savedId, customerId: s.customerId } });
      if (!address) return this.askAddress(phone, s);
      return this.applyAddress(phone, s, address.id, address.lat, address.lng, address.address);
    }

    // A new pin
    if (input.location) {
      const { latitude: lat, longitude: lng } = input.location;
      const label = input.location.name?.trim() || 'Pinned location';
      const text = input.location.address?.trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const isFirst = (await this.prisma.address.count({ where: { customerId: s.customerId } })) === 0;
      const address = await this.prisma.address.create({
        data: { customerId: s.customerId, label, lat, lng, address: text, isDefault: isFirst },
      });
      return this.applyAddress(phone, s, address.id, lat, lng, text);
    }

    return this.askAddress(phone, s);
  }

  /** Zone check + fee for the chosen address, then move on to the tip */
  private async applyAddress(phone: string, s: WaSession, addressId: string, lat: number, lng: number, label: string): Promise<void> {
    const [zones, branch] = await Promise.all([
      this.prisma.deliveryZone.findMany({ where: { branchId: s.branchId, isActive: true } }),
      this.prisma.branch.findUnique({ where: { id: s.branchId } }),
    ]);
    const subtotal = cartSubtotal(s.cart);
    const quote = quoteDelivery(zones as ZoneLike[], lat, lng, subtotal, { lat: branch?.lat ?? null, lng: branch?.lng ?? null });

    if (!quote.ok && quote.reason === 'OUT_OF_ZONE') {
      const reach = Math.max(0, ...zones.filter((z) => z.polygon == null).map((z) => z.maxDistance ?? 0));
      const distance =
        quote.distanceKm != null && reach > 0
          ? `\n\nThat pin is ${quote.distanceKm.toFixed(1)} km from us and we deliver up to ${reach} km.`
          : '';
      await this.send(
        phone,
        s,
        buildButtons(phone, `😔 Sorry, that location is outside our delivery area.${distance}\n\nYou can pick the order up from us instead, or send a different location.`, [
          { id: 'type_pickup', title: '🏃 Switch to Pickup' },
          { id: 'addr_new', title: '📍 Other location' },
        ]),
      );
      return;
    }
    if (!quote.ok) {
      await this.send(
        phone,
        s,
        buildButtons(
          phone,
          `🛒 The minimum order for delivery to ${quote.zone.name} is *PKR ${pkr(quote.minOrder)}*.\nYour cart is PKR ${pkr(subtotal)}. Add PKR ${pkr(quote.minOrder - subtotal)} more to continue.`,
          [
            { id: 'cart_add', title: '➕ Add More' },
            { id: 'type_pickup', title: '🏃 Switch to Pickup' },
          ],
        ),
      );
      return;
    }

    s.deliveryAddressId = addressId;
    s.deliveryFeePaisa = quote.fee;
    await this.send(
      phone,
      s,
      buildText(phone, `📍 Delivering to: ${label}\nDelivery fee: ${quote.fee > 0 ? `PKR ${pkr(quote.fee)}` : 'FREE'}`),
    );
    return this.askTip(phone, s);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step 7 — Tip and price breakdown
  // ─────────────────────────────────────────────────────────────────────────────

  private async askTip(phone: string, s: WaSession): Promise<void> {
    s.state = ConversationState.TIP;
    await this.save(phone, s);
    await this.send(phone, s, buildTipSelection(phone, cartSubtotal(s.cart)));
  }

  private async handleTip(phone: string, s: WaSession, input: Input): Promise<void> {
    const subtotal = cartSubtotal(s.cart);
    const custom = Number(input.text.replace(/^(pkr|rs\.?)\s*/, ''));

    if (input.id === 'tip_skip') {
      s.tipPaisa = 0;
    } else if (input.id === 'tip_5') {
      s.tipPaisa = Math.round(subtotal * 0.05);
    } else if (input.id === 'tip_10') {
      s.tipPaisa = Math.round(subtotal * 0.1);
    } else if (input.text && Number.isFinite(custom) && custom >= 0 && custom * 100 <= subtotal) {
      // Custom tip in PKR — convert to paisa
      s.tipPaisa = Math.round(custom * 100);
    } else {
      if (input.text) {
        await this.send(phone, s, buildText(phone, `Please tap a tip option, or type an amount up to PKR ${pkr(subtotal)}.`));
      }
      return this.askTip(phone, s);
    }

    return this.sendPaymentSummary(phone, s);
  }

  private async sendPaymentSummary(phone: string, s: WaSession): Promise<void> {
    const t = await this.totals(s);
    s.state = ConversationState.PAYMENT;
    await this.save(phone, s);

    const orderTypeLabel = s.orderType === 'DELIVERY' ? '🚗 Delivery' : '🏃 Pickup';
    const summary =
      `📋 *Order Summary* (${orderTypeLabel})\n\n` +
      cartLines(s.cart).join('\n') +
      `\n\n────────────────\n` +
      `Subtotal: PKR ${pkr(t.subtotal)}\n` +
      (t.tax > 0 ? `Tax: PKR ${pkr(t.tax)}\n` : '') +
      (s.orderType === 'DELIVERY' ? `Delivery fee: ${t.deliveryFee > 0 ? `PKR ${pkr(t.deliveryFee)}` : 'FREE'}\n` : '') +
      (t.tip > 0 ? `Tip: PKR ${pkr(t.tip)}\n` : '') +
      `*Total: PKR ${pkr(t.total)}*\n\n` +
      `Payment: Cash on ${s.orderType === 'DELIVERY' ? 'Delivery' : 'Pickup'}`;

    await this.send(
      phone,
      s,
      buildButtons(phone, summary, [
        { id: 'pay_cod', title: '✅ Confirm Order' },
        { id: 'pay_cancel', title: '❌ Cancel' },
      ]),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Steps 8–9 — COD confirmation and order placement
  // ─────────────────────────────────────────────────────────────────────────────

  private async handlePayment(phone: string, s: WaSession, input: Input): Promise<void> {
    if (input.id === 'pay_cod') return this.placeOrder(phone, s);
    if (input.id === 'pay_cancel') {
      this.resetOrder(s);
      await this.send(phone, s, buildText(phone, '❌ Order cancelled. We hope to see you again soon!'));
      return this.startGreeting(phone, s);
    }
    return this.sendPaymentSummary(phone, s);
  }

  private async placeOrder(phone: string, s: WaSession): Promise<void> {
    if (s.cart.length === 0) return this.showCart(phone, s);
    if (s.orderType === 'DELIVERY' && !s.deliveryAddressId) return this.askAddress(phone, s);

    // The menu may have changed since items were added — re-check before charging
    const changes = await this.refreshCart(s);
    if (changes.length > 0) {
      await this.send(phone, s, buildText(phone, `⚠️ Your cart was updated:\n${changes.join('\n')}`));
      if (s.cart.length === 0) return this.showCart(phone, s);
      // Delivery minimum and fee depend on the subtotal
      return s.orderType === 'DELIVERY' ? this.askAddress(phone, s) : this.sendPaymentSummary(phone, s);
    }

    try {
      const order = await this.orders.createOrder(
        {
          branchId: s.branchId,
          orderType: s.orderType ?? 'PICKUP',
          source: 'WHATSAPP',
          items: s.cart.map((i) => ({ ...i, notes: i.notes })),
          addressId: s.orderType === 'DELIVERY' ? s.deliveryAddressId : undefined,
          tip: s.tipPaisa,
          deliveryFee: s.orderType === 'DELIVERY' ? (s.deliveryFeePaisa ?? 0) : 0,
          paymentMethod: 'COD',
        },
        s.customerId,
      );
      this.logger.log(`WhatsApp order ${order.orderNumber} placed by ${phone}`);

      await this.send(phone, s, buildOrderReceived(phone, order.orderNumber, order.total));

      // Close this conversation; the next message starts a fresh one
      await this.prisma.conversation.update({
        where: { id: s.conversationId },
        data: { state: ConversationState.CONFIRMED, cartData: Prisma.DbNull },
      });
      await this.session.clearSession(phone);
    } catch (err: any) {
      this.logger.error(`Failed to create order for ${phone}: ${err?.message}`, err?.stack);
      await this.send(
        phone,
        s,
        buildButtons(phone, '❌ We could not place your order. Please try again, or talk to our staff.', [
          { id: 'pay_cod', title: '🔁 Try again' },
          { id: 'action_staff', title: '💬 Talk to Staff' },
        ]),
      );
    }
  }

  /** Re-price the cart from the live menu; drops unavailable items. Returns human-readable changes. */
  private async refreshCart(s: WaSession): Promise<string[]> {
    const menu = await this.menu.getFullMenu(s.branchId);
    const items = new Map(menu.flatMap((c) => c.items).map((i) => [i.id, i]));
    const changes: string[] = [];
    const next: CartItem[] = [];

    for (const line of s.cart) {
      const item = items.get(line.menuItemId);
      const mods = item?.modifierGroups.flatMap((g) => g.modifiers);
      const liveMods = line.selectedModifiers.map((m) => mods?.find((x) => x.id === m.modifierId));
      if (!item || liveMods.some((m) => !m)) {
        changes.push(`• ${line.name} is no longer available and was removed`);
        continue;
      }
      const updated: CartItem = {
        ...line,
        unitPrice: item.price,
        selectedModifiers: line.selectedModifiers.map((m, i) => ({ ...m, priceAdjustment: liveMods[i]!.priceAdjustment })),
      };
      if (unitTotal(updated) !== unitTotal(line)) {
        changes.push(`• ${line.name} is now PKR ${pkr(unitTotal(updated))} each (was PKR ${pkr(unitTotal(line))})`);
      }
      next.push(updated);
    }

    s.cart = next;
    return changes;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Other actions
  // ─────────────────────────────────────────────────────────────────────────────

  private async handover(phone: string, s: WaSession): Promise<void> {
    s.state = ConversationState.HUMAN_HANDOVER;
    await this.save(phone, s);
    await this.setHandledBy(s, 'HUMAN');
    await this.send(phone, s, buildText(phone, '👤 Connecting you to our staff... Someone will be with you shortly!\n\nWant to order instead? Type *menu* anytime.'));
  }

  private async sendTrackingInfo(phone: string, s: WaSession): Promise<void> {
    const lastOrder = await this.prisma.order.findFirst({
      where: { customerId: s.customerId },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastOrder) {
      await this.send(phone, s, buildText(phone, '📦 No previous orders found. Place your first order now!'));
      return;
    }

    const statusEmojis: Record<string, string> = {
      NEW: '🆕',
      ACCEPTED: '✅',
      PREPARING: '👨‍🍳',
      READY: '🎉',
      OUT_FOR_DELIVERY: '🚗',
      DELIVERED: '✅',
      PICKED_UP: '✅',
      CANCELLED: '❌',
      REFUNDED: '💸',
    };
    const emoji = statusEmojis[lastOrder.status] ?? '📦';
    await this.send(
      phone,
      s,
      buildText(
        phone,
        `📦 *Order ${lastOrder.orderNumber}*\n\nStatus: ${emoji} *${lastOrder.status.replace(/_/g, ' ')}*\n\nTotal: PKR ${pkr(lastOrder.total)}`,
      ),
    );
  }

  private async sendFallback(phone: string, s: WaSession): Promise<void> {
    await this.send(
      phone,
      s,
      buildButtons(phone, "🤔 I didn't understand that. Please use the options shown, send *menu* to start again, or talk to our team.", [
        { id: 'resume_continue', title: '▶️ Show options' },
        { id: 'action_staff', title: '💬 Talk to Staff' },
      ]),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Utility helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private send(phone: string, s: WaSession, payload: object) {
    return this.whatsapp.sendMessage(phone, payload, s.conversationId);
  }

  /** Persist the session to Redis and mirror state + cart onto the Conversation row */
  private async save(phone: string, s: WaSession): Promise<void> {
    await this.session.setSession(phone, s);
    await this.prisma.conversation.update({
      where: { id: s.conversationId },
      data: { state: s.state, cartData: s.cart as any, lastMessageAt: new Date() },
    });
  }

  private async setHandledBy(s: WaSession, handledBy: 'BOT' | 'HUMAN') {
    await this.prisma.conversation.update({ where: { id: s.conversationId }, data: { handledBy } });
  }

  private resetOrder(s: WaSession) {
    s.cart = [];
    s.draft = undefined;
    s.orderType = undefined;
    s.selectedCategoryId = undefined;
    s.fullMenuShown = undefined;
    s.deliveryAddressId = undefined;
    s.deliveryFeePaisa = undefined;
    s.tipPaisa = 0;
  }

  /** Same arithmetic as OrdersService.createOrder, so the summary matches the order */
  private async totals(s: WaSession) {
    const branch = await this.prisma.branch.findUnique({ where: { id: s.branchId }, include: { restaurant: true } });
    const subtotal = cartSubtotal(s.cart);
    const tax = Math.round((subtotal * (branch?.restaurant.taxPercent ?? 0)) / 10000);
    const deliveryFee = s.orderType === 'DELIVERY' ? (s.deliveryFeePaisa ?? 0) : 0;
    const tip = s.tipPaisa;
    return { subtotal, tax, deliveryFee, tip, total: subtotal + tax + deliveryFee + tip };
  }

  /** Item from the customer-facing menu (active, in stock, serving now) */
  private async findMenuItem(branchId: string, itemId: string): Promise<MenuItem | null> {
    const menu = await this.menu.getFullMenu(branchId);
    for (const c of menu) {
      const item = c.items.find((i) => i.id === itemId);
      if (item) return item;
    }
    return null;
  }

  /** Is the branch open now (restaurant timezone, overnight hours supported)? */
  private async checkBusinessHours(branchId: string): Promise<{ isOpen: boolean; opensAt?: string }> {
    const hours = await this.prisma.openingHour.findMany({ where: { branchId } });
    // Hours not configured yet: don't block ordering
    if (hours.length === 0) return { isOpen: true };

    const { day, time } = this.localNow();
    const byDay = new Map(hours.map((h) => [h.dayOfWeek, h]));
    const today = byDay.get(day);
    const yesterday = byDay.get((day + 6) % 7);

    const overnight = (h: { openTime: string; closeTime: string }) => h.closeTime <= h.openTime;
    const openToday =
      !!today && !today.isClosed &&
      (overnight(today) ? time >= today.openTime : time >= today.openTime && time < today.closeTime);
    const spillover = !!yesterday && !yesterday.isClosed && overnight(yesterday) && time < yesterday.closeTime;
    if (openToday || spillover) return { isOpen: true };

    // Next opening time, for the "we're closed" message
    if (today && !today.isClosed && time < today.openTime) return { isOpen: false, opensAt: today.openTime };
    for (let i = 1; i <= 7; i++) {
      const d = byDay.get((day + i) % 7);
      if (d && !d.isClosed) {
        return { isOpen: false, opensAt: `${d.openTime} ${i === 1 ? 'tomorrow' : `on ${DAY_NAMES[(day + i) % 7]}`}` };
      }
    }
    return { isOpen: false, opensAt: 'soon' };
  }

  /** Day of week (0=Sun) and "HH:MM" in the restaurant's timezone */
  private localNow(): { day: number; time: string } {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return { day, time: `${get('hour')}:${get('minute')}` };
  }

  private async getRestaurantName(branchId: string): Promise<string> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { restaurant: true },
    });
    return branch?.restaurant?.name ?? 'Restaurant';
  }

  /**
   * Branch for a new conversation. One WhatsApp number serves the whole restaurant;
   * until the multi-branch selector (Step 2) exists, use the first active branch.
   */
  private async resolveBranchId(_metadata: any): Promise<string> {
    const branch = await this.prisma.branch.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) throw new Error('No active branch configured');
    return branch.id;
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function parseInput(message: any): Input {
  const interactive = message?.type === 'interactive' ? message.interactive : null;
  const id: string | null =
    interactive?.button_reply?.id ??
    interactive?.list_reply?.id ??
    // Template quick-reply buttons arrive as type "button"
    (message?.type === 'button' ? (message.button?.payload ?? null) : null);
  const text = String(message?.text?.body ?? '').trim().toLowerCase().replace(/[!.?]+$/, '');
  const location = message?.type === 'location' && message.location ? message.location : null;
  return { id, text, location };
}

/**
 * One page of a WhatsApp list. When everything doesn't fit, the last row is
 * kept free for a "More" row; `next` is the following page, or null on the last one.
 */
function paginate<T>(all: T[], page: number, rowsAvailable: number): { slice: T[]; next: number | null } {
  if (all.length <= rowsAvailable) return { slice: all, next: null };
  const perPage = rowsAvailable - 1;
  const start = Math.min(page, Math.ceil(all.length / perPage) - 1) * perPage;
  const slice = all.slice(start, start + perPage);
  return { slice, next: start + perPage < all.length ? Math.floor(start / perPage) + 1 : null };
}

type MenuItemLike = {
  price: number;
  compareAtPrice?: number | null;
  modifierGroups: { id: string; name: string; required: boolean; minChoices: number; modifiers: { id: string; name: string; priceAdjustment: number }[] }[];
};

/** PKR saved on a deal (0 when it isn't one) */
function saving(item: { price: number; compareAtPrice?: number | null }): number {
  return item.compareAtPrice && item.compareAtPrice > item.price ? item.compareAtPrice - item.price : 0;
}

/** "PKR 750", or for a deal "~PKR 2,050~ *PKR 1,650* · save 400" (WhatsApp formatting optional) */
function priceText(item: { price: number; compareAtPrice?: number | null }, formatted = true): string {
  const off = saving(item);
  if (!off) return `PKR ${pkr(item.price)}`;
  return formatted
    ? `~PKR ${pkr(item.compareAtPrice!)}~ *PKR ${pkr(item.price)}* · 🔥 save ${pkr(off)}`
    : `PKR ${pkr(item.price)} (was ${pkr(item.compareAtPrice!)}, save ${pkr(off)})`;
}

function isDealCategory(name: string): boolean {
  return /deal|combo|offer|bundle|special/i.test(name);
}

/** Deals lead the menu, whatever their sort order */
function dealsFirst<T extends { name: string }>(categories: T[]): T[] {
  return [...categories.filter((c) => isDealCategory(c.name)), ...categories.filter((c) => !isDealCategory(c.name))];
}

/** Buy now's choices: the first options of each group that needs an answer, nothing optional */
function standardOptions(item: MenuItemLike): SelectedModifier[] {
  const picks: SelectedModifier[] = [];
  for (const g of item.modifierGroups) {
    const need = Math.max(g.minChoices, g.required ? 1 : 0);
    for (const m of g.modifiers.slice(0, need)) {
      picks.push({ groupId: g.id, modifierId: m.id, name: m.name, priceAdjustment: m.priceAdjustment });
    }
  }
  return picks;
}

function standardOptionsText(item: MenuItemLike): string {
  const picks = standardOptions(item);
  return picks.length ? picks.map((m) => m.name).join(', ') : 'no extras';
}

/** An icon for an option, from its name (and its group, e.g. "Spice level: Medium") */
function optionEmoji(name: string, groupName = ''): string {
  const n = name.toLowerCase();
  if (/spic|heat|chilli|chili/i.test(groupName) || /mild|medium|hot|spicy/.test(n)) {
    if (/extra|very|super/.test(n)) return '🌶️';
    if (/hot|spicy/.test(n)) return '🔥';
    if (/medium/.test(n)) return '🟠';
    if (/mild|no spice|plain/.test(n)) return '🟢';
  }
  if (/size|portion/i.test(groupName)) {
    if (/small|regular|single|half/.test(n)) return '🔹';
    if (/medium/.test(n)) return '🔷';
    if (/large|family|double|xl|full/.test(n)) return '🟦';
  }
  const map: [RegExp, string][] = [
    [/cheese/, '🧀'],
    [/bacon/, '🥓'],
    [/avocado/, '🥑'],
    [/egg/, '🍳'],
    [/mushroom/, '🍄'],
    [/onion/, '🧅'],
    [/jalape|chilli|chili|pepper/, '🌶️'],
    [/tomato|ketchup/, '🍅'],
    [/lettuce|salad|veg/, '🥬'],
    [/sauce|mayo|dip/, '🥫'],
    [/fries|chips|wedges/, '🍟'],
    [/coke|cola|pepsi|sprite|fanta|7up|soda|drink|juice/, '🥤'],
    [/water/, '💧'],
    [/chicken|zinger/, '🍗'],
    [/beef|patty|meat/, '🥩'],
    [/bread|bun|naan/, '🍞'],
    [/ice ?cream|dessert/, '🍨'],
    [/coffee|tea/, '☕'],
  ];
  return map.find(([re]) => re.test(n))?.[1] ?? '▫️';
}

/** WhatsApp fetches media itself, so only public https links work */
function isPublicImage(url: string | null | undefined): boolean {
  return !!url && /^https:\/\//.test(url);
}

/** A fitting emoji for a category name; the menu has no icon field */
function categoryEmoji(name: string): string {
  const n = name.toLowerCase();
  const map: [RegExp, string][] = [
    [/burger/, '🍔'],
    [/pizza/, '🍕'],
    [/drink|beverage|juice|shake|soda|cold/, '🥤'],
    [/coffee|tea|chai|hot drink/, '☕'],
    [/dessert|sweet|cake|ice ?cream/, '🍰'],
    [/fries|side|snack|starter|appetizer/, '🍟'],
    [/chicken|wing|broast/, '🍗'],
    [/bbq|grill|tikka|kabab|kebab/, '🍢'],
    [/karahi|handi|curry|salan/, '🍲'],
    [/biryani|rice|pulao/, '🍛'],
    [/sandwich|wrap|roll|shawarma/, '🌯'],
    [/pasta|noodle|chow/, '🍝'],
    [/salad/, '🥗'],
    [/soup/, '🥣'],
    [/naan|roti|bread|paratha/, '🫓'],
    [/breakfast|egg/, '🍳'],
    [/fish|seafood|prawn/, '🐟'],
    [/deal|combo|platter|family/, '🎁'],
    [/kid/, '🧒'],
  ];
  return map.find(([re]) => re.test(n))?.[1] ?? '🍽️';
}

function stripPrefix(id: string | null, prefix: string): string | null {
  return id?.startsWith(prefix) ? id.slice(prefix.length) : null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Paisa → "1,250" */
function pkr(paisa: number): string {
  return Math.round(paisa / 100).toLocaleString('en-PK');
}

function cartLines(cart: CartItem[]): string[] {
  return cart.map((item) => {
    const mods = item.selectedModifiers.length
      ? ` (${item.selectedModifiers.map((m) => m.name).join(', ')})`
      : '';
    return `• ${item.quantity} × ${item.name}${mods} = *PKR ${pkr(unitTotal(item) * item.quantity)}*`;
  });
}
