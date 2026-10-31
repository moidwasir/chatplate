import { z } from 'zod';
import { OrderType, PaymentMethod } from './enums';
export declare const PaisaSchema: z.ZodNumber;
export declare const ModifierSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    priceAdjustment: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    priceAdjustment: number;
}, {
    id: string;
    name: string;
    priceAdjustment: number;
}>;
export declare const ModifierGroupSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    required: z.ZodBoolean;
    minChoices: z.ZodNumber;
    maxChoices: z.ZodNumber;
    modifiers: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        priceAdjustment: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        priceAdjustment: number;
    }, {
        id: string;
        name: string;
        priceAdjustment: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    required: boolean;
    minChoices: number;
    maxChoices: number;
    modifiers: {
        id: string;
        name: string;
        priceAdjustment: number;
    }[];
}, {
    id: string;
    name: string;
    required: boolean;
    minChoices: number;
    maxChoices: number;
    modifiers: {
        id: string;
        name: string;
        priceAdjustment: number;
    }[];
}>;
export declare const MenuItemSchema: z.ZodObject<{
    id: z.ZodString;
    categoryId: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    price: z.ZodNumber;
    imageUrl: z.ZodOptional<z.ZodString>;
    isAvailable: z.ZodBoolean;
    prepStation: z.ZodOptional<z.ZodString>;
    modifierGroups: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        required: z.ZodBoolean;
        minChoices: z.ZodNumber;
        maxChoices: z.ZodNumber;
        modifiers: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            priceAdjustment: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            id: string;
            name: string;
            priceAdjustment: number;
        }, {
            id: string;
            name: string;
            priceAdjustment: number;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        required: boolean;
        minChoices: number;
        maxChoices: number;
        modifiers: {
            id: string;
            name: string;
            priceAdjustment: number;
        }[];
    }, {
        id: string;
        name: string;
        required: boolean;
        minChoices: number;
        maxChoices: number;
        modifiers: {
            id: string;
            name: string;
            priceAdjustment: number;
        }[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    isAvailable: boolean;
    categoryId: string;
    price: number;
    modifierGroups: {
        id: string;
        name: string;
        required: boolean;
        minChoices: number;
        maxChoices: number;
        modifiers: {
            id: string;
            name: string;
            priceAdjustment: number;
        }[];
    }[];
    description?: string | undefined;
    imageUrl?: string | undefined;
    prepStation?: string | undefined;
}, {
    id: string;
    name: string;
    isAvailable: boolean;
    categoryId: string;
    price: number;
    modifierGroups: {
        id: string;
        name: string;
        required: boolean;
        minChoices: number;
        maxChoices: number;
        modifiers: {
            id: string;
            name: string;
            priceAdjustment: number;
        }[];
    }[];
    description?: string | undefined;
    imageUrl?: string | undefined;
    prepStation?: string | undefined;
}>;
export declare const MenuCategorySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    sortOrder: z.ZodNumber;
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        categoryId: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        price: z.ZodNumber;
        imageUrl: z.ZodOptional<z.ZodString>;
        isAvailable: z.ZodBoolean;
        prepStation: z.ZodOptional<z.ZodString>;
        modifierGroups: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            required: z.ZodBoolean;
            minChoices: z.ZodNumber;
            maxChoices: z.ZodNumber;
            modifiers: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                priceAdjustment: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                id: string;
                name: string;
                priceAdjustment: number;
            }, {
                id: string;
                name: string;
                priceAdjustment: number;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            id: string;
            name: string;
            required: boolean;
            minChoices: number;
            maxChoices: number;
            modifiers: {
                id: string;
                name: string;
                priceAdjustment: number;
            }[];
        }, {
            id: string;
            name: string;
            required: boolean;
            minChoices: number;
            maxChoices: number;
            modifiers: {
                id: string;
                name: string;
                priceAdjustment: number;
            }[];
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        isAvailable: boolean;
        categoryId: string;
        price: number;
        modifierGroups: {
            id: string;
            name: string;
            required: boolean;
            minChoices: number;
            maxChoices: number;
            modifiers: {
                id: string;
                name: string;
                priceAdjustment: number;
            }[];
        }[];
        description?: string | undefined;
        imageUrl?: string | undefined;
        prepStation?: string | undefined;
    }, {
        id: string;
        name: string;
        isAvailable: boolean;
        categoryId: string;
        price: number;
        modifierGroups: {
            id: string;
            name: string;
            required: boolean;
            minChoices: number;
            maxChoices: number;
            modifiers: {
                id: string;
                name: string;
                priceAdjustment: number;
            }[];
        }[];
        description?: string | undefined;
        imageUrl?: string | undefined;
        prepStation?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    sortOrder: number;
    items: {
        id: string;
        name: string;
        isAvailable: boolean;
        categoryId: string;
        price: number;
        modifierGroups: {
            id: string;
            name: string;
            required: boolean;
            minChoices: number;
            maxChoices: number;
            modifiers: {
                id: string;
                name: string;
                priceAdjustment: number;
            }[];
        }[];
        description?: string | undefined;
        imageUrl?: string | undefined;
        prepStation?: string | undefined;
    }[];
}, {
    id: string;
    name: string;
    sortOrder: number;
    items: {
        id: string;
        name: string;
        isAvailable: boolean;
        categoryId: string;
        price: number;
        modifierGroups: {
            id: string;
            name: string;
            required: boolean;
            minChoices: number;
            maxChoices: number;
            modifiers: {
                id: string;
                name: string;
                priceAdjustment: number;
            }[];
        }[];
        description?: string | undefined;
        imageUrl?: string | undefined;
        prepStation?: string | undefined;
    }[];
}>;
export declare const CartItemSchema: z.ZodObject<{
    menuItemId: z.ZodString;
    name: z.ZodString;
    unitPrice: z.ZodNumber;
    quantity: z.ZodNumber;
    selectedModifiers: z.ZodArray<z.ZodObject<{
        groupId: z.ZodString;
        modifierId: z.ZodString;
        name: z.ZodString;
        priceAdjustment: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        groupId: string;
        priceAdjustment: number;
        modifierId: string;
    }, {
        name: string;
        groupId: string;
        priceAdjustment: number;
        modifierId: string;
    }>, "many">;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    menuItemId: string;
    unitPrice: number;
    quantity: number;
    selectedModifiers: {
        name: string;
        groupId: string;
        priceAdjustment: number;
        modifierId: string;
    }[];
    notes?: string | undefined;
}, {
    name: string;
    menuItemId: string;
    unitPrice: number;
    quantity: number;
    selectedModifiers: {
        name: string;
        groupId: string;
        priceAdjustment: number;
        modifierId: string;
    }[];
    notes?: string | undefined;
}>;
export declare const CartSchema: z.ZodObject<{
    customerId: z.ZodString;
    branchId: z.ZodString;
    orderType: z.ZodNativeEnum<typeof OrderType>;
    items: z.ZodArray<z.ZodObject<{
        menuItemId: z.ZodString;
        name: z.ZodString;
        unitPrice: z.ZodNumber;
        quantity: z.ZodNumber;
        selectedModifiers: z.ZodArray<z.ZodObject<{
            groupId: z.ZodString;
            modifierId: z.ZodString;
            name: z.ZodString;
            priceAdjustment: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            name: string;
            groupId: string;
            priceAdjustment: number;
            modifierId: string;
        }, {
            name: string;
            groupId: string;
            priceAdjustment: number;
            modifierId: string;
        }>, "many">;
        notes: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        menuItemId: string;
        unitPrice: number;
        quantity: number;
        selectedModifiers: {
            name: string;
            groupId: string;
            priceAdjustment: number;
            modifierId: string;
        }[];
        notes?: string | undefined;
    }, {
        name: string;
        menuItemId: string;
        unitPrice: number;
        quantity: number;
        selectedModifiers: {
            name: string;
            groupId: string;
            priceAdjustment: number;
            modifierId: string;
        }[];
        notes?: string | undefined;
    }>, "many">;
    promoCode: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    branchId: string;
    items: {
        name: string;
        menuItemId: string;
        unitPrice: number;
        quantity: number;
        selectedModifiers: {
            name: string;
            groupId: string;
            priceAdjustment: number;
            modifierId: string;
        }[];
        notes?: string | undefined;
    }[];
    customerId: string;
    orderType: OrderType;
    promoCode?: string | undefined;
}, {
    branchId: string;
    items: {
        name: string;
        menuItemId: string;
        unitPrice: number;
        quantity: number;
        selectedModifiers: {
            name: string;
            groupId: string;
            priceAdjustment: number;
            modifierId: string;
        }[];
        notes?: string | undefined;
    }[];
    customerId: string;
    orderType: OrderType;
    promoCode?: string | undefined;
}>;
export declare const PricingBreakdownSchema: z.ZodObject<{
    subtotal: z.ZodNumber;
    deliveryFee: z.ZodNumber;
    taxAmount: z.ZodNumber;
    discountAmount: z.ZodNumber;
    tip: z.ZodNumber;
    total: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    subtotal: number;
    deliveryFee: number;
    taxAmount: number;
    discountAmount: number;
    tip: number;
    total: number;
}, {
    subtotal: number;
    deliveryFee: number;
    taxAmount: number;
    discountAmount: number;
    tip: number;
    total: number;
}>;
export declare const CreateOrderSchema: z.ZodObject<{
    customerId: z.ZodString;
    branchId: z.ZodString;
    orderType: z.ZodNativeEnum<typeof OrderType>;
    items: z.ZodArray<z.ZodObject<{
        menuItemId: z.ZodString;
        name: z.ZodString;
        unitPrice: z.ZodNumber;
        quantity: z.ZodNumber;
        selectedModifiers: z.ZodArray<z.ZodObject<{
            groupId: z.ZodString;
            modifierId: z.ZodString;
            name: z.ZodString;
            priceAdjustment: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            name: string;
            groupId: string;
            priceAdjustment: number;
            modifierId: string;
        }, {
            name: string;
            groupId: string;
            priceAdjustment: number;
            modifierId: string;
        }>, "many">;
        notes: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        menuItemId: string;
        unitPrice: number;
        quantity: number;
        selectedModifiers: {
            name: string;
            groupId: string;
            priceAdjustment: number;
            modifierId: string;
        }[];
        notes?: string | undefined;
    }, {
        name: string;
        menuItemId: string;
        unitPrice: number;
        quantity: number;
        selectedModifiers: {
            name: string;
            groupId: string;
            priceAdjustment: number;
            modifierId: string;
        }[];
        notes?: string | undefined;
    }>, "many">;
    deliveryAddressId: z.ZodOptional<z.ZodString>;
    promoCode: z.ZodOptional<z.ZodString>;
    tip: z.ZodDefault<z.ZodNumber>;
    paymentMethod: z.ZodNativeEnum<typeof PaymentMethod>;
    notes: z.ZodOptional<z.ZodString>;
    source: z.ZodString;
}, "strip", z.ZodTypeAny, {
    branchId: string;
    items: {
        name: string;
        menuItemId: string;
        unitPrice: number;
        quantity: number;
        selectedModifiers: {
            name: string;
            groupId: string;
            priceAdjustment: number;
            modifierId: string;
        }[];
        notes?: string | undefined;
    }[];
    customerId: string;
    orderType: OrderType;
    tip: number;
    paymentMethod: PaymentMethod;
    source: string;
    promoCode?: string | undefined;
    notes?: string | undefined;
    deliveryAddressId?: string | undefined;
}, {
    branchId: string;
    items: {
        name: string;
        menuItemId: string;
        unitPrice: number;
        quantity: number;
        selectedModifiers: {
            name: string;
            groupId: string;
            priceAdjustment: number;
            modifierId: string;
        }[];
        notes?: string | undefined;
    }[];
    customerId: string;
    orderType: OrderType;
    paymentMethod: PaymentMethod;
    source: string;
    promoCode?: string | undefined;
    notes?: string | undefined;
    tip?: number | undefined;
    deliveryAddressId?: string | undefined;
}>;
export declare const WhatsAppLocationSchema: z.ZodObject<{
    latitude: z.ZodNumber;
    longitude: z.ZodNumber;
    name: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    latitude: number;
    longitude: number;
    address?: string | undefined;
    name?: string | undefined;
}, {
    latitude: number;
    longitude: number;
    address?: string | undefined;
    name?: string | undefined;
}>;
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
//# sourceMappingURL=schemas.d.ts.map