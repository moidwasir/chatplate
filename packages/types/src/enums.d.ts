export declare enum OrderStatus {
    NEW = "NEW",
    ACCEPTED = "ACCEPTED",
    PREPARING = "PREPARING",
    READY = "READY",
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
    DELIVERED = "DELIVERED",
    PICKED_UP = "PICKED_UP",
    CANCELLED = "CANCELLED",
    REFUNDED = "REFUNDED"
}
export declare enum OrderType {
    DELIVERY = "DELIVERY",
    PICKUP = "PICKUP",
    DINE_IN = "DINE_IN"
}
export declare enum OrderSource {
    WHATSAPP = "WHATSAPP",
    POS = "POS",
    PHONE = "PHONE",
    DINE_IN = "DINE_IN"
}
export declare enum PaymentMethod {
    COD = "COD",
    JAZZCASH = "JAZZCASH",
    EASYPAISA = "EASYPAISA",
    CARD = "CARD",
    COUNTER = "COUNTER"
}
export declare enum PaymentStatus {
    PENDING = "PENDING",
    PAID = "PAID",
    FAILED = "FAILED",
    REFUNDED = "REFUNDED",
    EXPIRED = "EXPIRED"
}
export declare enum UserRole {
    OWNER = "OWNER",
    MANAGER = "MANAGER",
    CASHIER = "CASHIER",
    KITCHEN = "KITCHEN",
    RIDER = "RIDER"
}
export declare enum Language {
    EN = "EN",
    UR = "UR",
    UR_ROMAN = "UR_ROMAN"
}
export declare enum ConversationState {
    GREETING = "GREETING",
    ORDER_TYPE = "ORDER_TYPE",
    MENU_CATEGORY = "MENU_CATEGORY",
    MENU_ITEM = "MENU_ITEM",
    ITEM_DETAIL = "ITEM_DETAIL",
    CART = "CART",
    ADDRESS = "ADDRESS",
    TIP = "TIP",
    PAYMENT = "PAYMENT",
    CONFIRMED = "CONFIRMED",
    HUMAN_HANDOVER = "HUMAN_HANDOVER"
}
export declare enum MessageDirection {
    INBOUND = "INBOUND",
    OUTBOUND = "OUTBOUND"
}
export declare enum DeliveryFeeType {
    FLAT = "FLAT",
    PER_KM = "PER_KM",
    FREE_ABOVE = "FREE_ABOVE"
}
export declare const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]>;
//# sourceMappingURL=enums.d.ts.map