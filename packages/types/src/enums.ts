// Order status flow
export enum OrderStatus {
  NEW = 'NEW',
  ACCEPTED = 'ACCEPTED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  PICKED_UP = 'PICKED_UP',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum OrderType {
  DELIVERY = 'DELIVERY',
  PICKUP = 'PICKUP',
  DINE_IN = 'DINE_IN',
}

export enum OrderSource {
  WHATSAPP = 'WHATSAPP',
  POS = 'POS',
  PHONE = 'PHONE',
  DINE_IN = 'DINE_IN',
}

export enum PaymentMethod {
  COD = 'COD',
  JAZZCASH = 'JAZZCASH',
  EASYPAISA = 'EASYPAISA',
  CARD = 'CARD',
  COUNTER = 'COUNTER',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  EXPIRED = 'EXPIRED',
}

export enum UserRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  KITCHEN = 'KITCHEN',
  RIDER = 'RIDER',
}

export enum Language {
  EN = 'EN',
  UR = 'UR',
  UR_ROMAN = 'UR_ROMAN',
}

export enum ConversationState {
  GREETING = 'GREETING',
  ORDER_TYPE = 'ORDER_TYPE',
  MENU_CATEGORY = 'MENU_CATEGORY',
  MENU_ITEM = 'MENU_ITEM',
  ITEM_DETAIL = 'ITEM_DETAIL',
  CART = 'CART',
  ADDRESS = 'ADDRESS',
  TIP = 'TIP',
  PAYMENT = 'PAYMENT',
  CONFIRMED = 'CONFIRMED',
  HUMAN_HANDOVER = 'HUMAN_HANDOVER',
}

export enum MessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum DeliveryFeeType {
  FLAT = 'FLAT',
  PER_KM = 'PER_KM',
  FREE_ABOVE = 'FREE_ABOVE',
}

// Allowed status transitions
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.NEW]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY],
  [OrderStatus.READY]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.PICKED_UP],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
  [OrderStatus.PICKED_UP]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [OrderStatus.REFUNDED],
  [OrderStatus.REFUNDED]: [],
};
