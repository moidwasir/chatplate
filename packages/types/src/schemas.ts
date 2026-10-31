import { z } from 'zod';
import { OrderType, PaymentMethod } from './enums';

// ─── Money ───────────────────────────────────────────────────────────────────
// All amounts in paisa (integer). 1 PKR = 100 paisa
export const PaisaSchema = z.number().int().nonnegative();

// ─── Menu ────────────────────────────────────────────────────────────────────
export const ModifierSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  priceAdjustment: PaisaSchema, // can be 0
});

export const ModifierGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  required: z.boolean(),
  minChoices: z.number().int().min(0),
  maxChoices: z.number().int().min(1),
  modifiers: z.array(ModifierSchema),
});

export const MenuItemSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  price: PaisaSchema,
  imageUrl: z.string().url().optional(),
  isAvailable: z.boolean(),
  prepStation: z.string().optional(),
  modifierGroups: z.array(ModifierGroupSchema),
});

export const MenuCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  items: z.array(MenuItemSchema),
});

// ─── Cart ─────────────────────────────────────────────────────────────────────
export const CartItemSchema = z.object({
  menuItemId: z.string().uuid(),
  name: z.string(), // snapshot at add time
  unitPrice: PaisaSchema, // snapshot
  quantity: z.number().int().min(1),
  selectedModifiers: z.array(
    z.object({
      groupId: z.string().uuid(),
      modifierId: z.string().uuid(),
      name: z.string(),
      priceAdjustment: PaisaSchema,
    }),
  ),
  notes: z.string().optional(),
});

export const CartSchema = z.object({
  customerId: z.string().uuid(),
  branchId: z.string().uuid(),
  orderType: z.nativeEnum(OrderType),
  items: z.array(CartItemSchema),
  promoCode: z.string().optional(),
});

// ─── Pricing ─────────────────────────────────────────────────────────────────
export const PricingBreakdownSchema = z.object({
  subtotal: PaisaSchema,
  deliveryFee: PaisaSchema,
  taxAmount: PaisaSchema,
  discountAmount: PaisaSchema,
  tip: PaisaSchema,
  total: PaisaSchema,
});

// ─── Order ───────────────────────────────────────────────────────────────────
export const CreateOrderSchema = z.object({
  customerId: z.string().uuid(),
  branchId: z.string().uuid(),
  orderType: z.nativeEnum(OrderType),
  items: z.array(CartItemSchema),
  deliveryAddressId: z.string().uuid().optional(),
  promoCode: z.string().optional(),
  tip: PaisaSchema.default(0),
  paymentMethod: z.nativeEnum(PaymentMethod),
  notes: z.string().optional(),
  source: z.string(), // OrderSource string
});

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
export const WhatsAppLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  name: z.string().optional(),
  address: z.string().optional(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type Paisa = z.infer<typeof PaisaSchema>;
export type Modifier = z.infer<typeof ModifierSchema>;
export type ModifierGroup = z.infer<typeof ModifierGroupSchema>;
export type MenuItem = z.infer<typeof MenuItemSchema>;
export type MenuCategory = z.infer<typeof MenuCategorySchema>;
export type CartItem = z.infer<typeof CartItemSchema>;
export type Cart = z.infer<typeof CartSchema>;
export type PricingBreakdown = z.infer<typeof PricingBreakdownSchema>;
export type CreateOrder = z.infer<typeof CreateOrderSchema>;
export type WhatsAppLocation = z.infer<typeof WhatsAppLocationSchema>;
