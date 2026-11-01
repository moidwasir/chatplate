import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ConversationState } from '@safi/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectedModifier {
  groupId: string;
  modifierId: string;
  name: string;
  priceAdjustment: number;
}

export interface CartItem {
  menuItemId: string;
  name: string;
  unitPrice: number; // paisa, before modifiers
  quantity: number;
  selectedModifiers: SelectedModifier[];
  notes?: string;
}

/** The item the customer is configuring right now (Step 4: options → quantity) */
export interface ItemDraft {
  menuItemId: string;
  /** Index into the item's modifier groups; equal to the group count once we're asking quantity */
  groupIndex: number;
  selectedModifiers: SelectedModifier[];
}

export interface WaSession {
  customerId: string;
  conversationId: string;
  branchId: string;
  state: ConversationState;
  orderType?: 'DELIVERY' | 'PICKUP';
  cart: CartItem[];
  selectedCategoryId?: string;
  /** The formatted full menu has been sent during this order */
  fullMenuShown?: boolean;
  draft?: ItemDraft;
  promoCode?: string;
  deliveryAddressId?: string;
  deliveryFeePaisa?: number;
  tipPaisa: number;
  language: 'EN' | 'UR' | 'UR_ROMAN';
  lastActivityAt: number; // Date.now()
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_KEY_PREFIX = 'wa:session:';
/** Session (and cart) survives 24 hours without activity */
const SESSION_TTL = 24 * 60 * 60;
/** After 30 minutes idle the customer is asked whether to continue or start over */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private redis!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.redis = new Redis(url, { lazyConnect: true });
    this.redis.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    this.logger.log(`SessionService using Redis at ${url}`);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  // ─── Key helper ─────────────────────────────────────────────────────────────

  private key(phone: string): string {
    return `${SESSION_KEY_PREFIX}${phone}`;
  }

  // ─── Core CRUD ──────────────────────────────────────────────────────────────

  async getSession(phone: string): Promise<WaSession | null> {
    const raw = await this.redis.get(this.key(phone));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WaSession;
    } catch {
      this.logger.warn(`Corrupt session for ${phone}, discarding`);
      await this.redis.del(this.key(phone));
      return null;
    }
  }

  async setSession(phone: string, session: WaSession): Promise<void> {
    session.lastActivityAt = Date.now();
    await this.redis.setex(this.key(phone), SESSION_TTL, JSON.stringify(session));
  }

  async clearSession(phone: string): Promise<void> {
    await this.redis.del(this.key(phone));
  }
}

// ─── Cart helpers (pure — the engine saves the session afterwards) ──────────

/** Same item with the same options is merged into one line */
export function addToCart(cart: CartItem[], item: CartItem): void {
  const sig = modifierSignature(item.selectedModifiers);
  const existing = cart.find(
    (c) => c.menuItemId === item.menuItemId && modifierSignature(c.selectedModifiers) === sig,
  );
  if (existing) {
    existing.quantity += item.quantity;
  } else {
    cart.push(item);
  }
}

/** Price of one unit including its options, in paisa */
export function unitTotal(item: CartItem): number {
  return item.unitPrice + item.selectedModifiers.reduce((s, m) => s + m.priceAdjustment, 0);
}

export function cartSubtotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + unitTotal(item) * item.quantity, 0);
}

function modifierSignature(mods: SelectedModifier[]): string {
  return mods.map((m) => m.modifierId).sort().join(',');
}
