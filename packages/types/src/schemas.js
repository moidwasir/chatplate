"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppLocationSchema = exports.CreateOrderSchema = exports.PricingBreakdownSchema = exports.CartSchema = exports.CartItemSchema = exports.MenuCategorySchema = exports.MenuItemSchema = exports.ModifierGroupSchema = exports.ModifierSchema = exports.PaisaSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("./enums");
// ─── Money ───────────────────────────────────────────────────────────────────
// All amounts in paisa (integer). 1 PKR = 100 paisa
exports.PaisaSchema = zod_1.z.number().int().nonnegative();
// ─── Menu ────────────────────────────────────────────────────────────────────
exports.ModifierSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string(),
    priceAdjustment: exports.PaisaSchema, // can be 0
});
exports.ModifierGroupSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string(),
    required: zod_1.z.boolean(),
    minChoices: zod_1.z.number().int().min(0),
    maxChoices: zod_1.z.number().int().min(1),
    modifiers: zod_1.z.array(exports.ModifierSchema),
});
exports.MenuItemSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    categoryId: zod_1.z.string().uuid(),
    name: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    price: exports.PaisaSchema,
    imageUrl: zod_1.z.string().url().optional(),
    isAvailable: zod_1.z.boolean(),
    prepStation: zod_1.z.string().optional(),
    modifierGroups: zod_1.z.array(exports.ModifierGroupSchema),
});
exports.MenuCategorySchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string(),
    sortOrder: zod_1.z.number().int(),
    items: zod_1.z.array(exports.MenuItemSchema),
});
// ─── Cart ─────────────────────────────────────────────────────────────────────
exports.CartItemSchema = zod_1.z.object({
    menuItemId: zod_1.z.string().uuid(),
    name: zod_1.z.string(), // snapshot at add time
    unitPrice: exports.PaisaSchema, // snapshot
    quantity: zod_1.z.number().int().min(1),
    selectedModifiers: zod_1.z.array(zod_1.z.object({
        groupId: zod_1.z.string().uuid(),
        modifierId: zod_1.z.string().uuid(),
        name: zod_1.z.string(),
        priceAdjustment: exports.PaisaSchema,
    })),
    notes: zod_1.z.string().optional(),
});
exports.CartSchema = zod_1.z.object({
    customerId: zod_1.z.string().uuid(),
    branchId: zod_1.z.string().uuid(),
    orderType: zod_1.z.nativeEnum(enums_1.OrderType),
    items: zod_1.z.array(exports.CartItemSchema),
    promoCode: zod_1.z.string().optional(),
});
// ─── Pricing ─────────────────────────────────────────────────────────────────
exports.PricingBreakdownSchema = zod_1.z.object({
    subtotal: exports.PaisaSchema,
    deliveryFee: exports.PaisaSchema,
    taxAmount: exports.PaisaSchema,
    discountAmount: exports.PaisaSchema,
    tip: exports.PaisaSchema,
    total: exports.PaisaSchema,
});
// ─── Order ───────────────────────────────────────────────────────────────────
exports.CreateOrderSchema = zod_1.z.object({
    customerId: zod_1.z.string().uuid(),
    branchId: zod_1.z.string().uuid(),
    orderType: zod_1.z.nativeEnum(enums_1.OrderType),
    items: zod_1.z.array(exports.CartItemSchema),
    deliveryAddressId: zod_1.z.string().uuid().optional(),
    promoCode: zod_1.z.string().optional(),
    tip: exports.PaisaSchema.default(0),
    paymentMethod: zod_1.z.nativeEnum(enums_1.PaymentMethod),
    notes: zod_1.z.string().optional(),
    source: zod_1.z.string(), // OrderSource string
});
// ─── WhatsApp ─────────────────────────────────────────────────────────────────
exports.WhatsAppLocationSchema = zod_1.z.object({
    latitude: zod_1.z.number(),
    longitude: zod_1.z.number(),
    name: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
});
//# sourceMappingURL=schemas.js.map