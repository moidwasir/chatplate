"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORDER_STATUS_TRANSITIONS = exports.DeliveryFeeType = exports.MessageDirection = exports.ConversationState = exports.Language = exports.UserRole = exports.PaymentStatus = exports.PaymentMethod = exports.OrderSource = exports.OrderType = exports.OrderStatus = void 0;
// Order status flow
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["NEW"] = "NEW";
    OrderStatus["ACCEPTED"] = "ACCEPTED";
    OrderStatus["PREPARING"] = "PREPARING";
    OrderStatus["READY"] = "READY";
    OrderStatus["OUT_FOR_DELIVERY"] = "OUT_FOR_DELIVERY";
    OrderStatus["DELIVERED"] = "DELIVERED";
    OrderStatus["PICKED_UP"] = "PICKED_UP";
    OrderStatus["CANCELLED"] = "CANCELLED";
    OrderStatus["REFUNDED"] = "REFUNDED";
})(OrderStatus || (exports.OrderStatus = OrderStatus = {}));
var OrderType;
(function (OrderType) {
    OrderType["DELIVERY"] = "DELIVERY";
    OrderType["PICKUP"] = "PICKUP";
    OrderType["DINE_IN"] = "DINE_IN";
})(OrderType || (exports.OrderType = OrderType = {}));
var OrderSource;
(function (OrderSource) {
    OrderSource["WHATSAPP"] = "WHATSAPP";
    OrderSource["POS"] = "POS";
    OrderSource["PHONE"] = "PHONE";
    OrderSource["DINE_IN"] = "DINE_IN";
})(OrderSource || (exports.OrderSource = OrderSource = {}));
var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["COD"] = "COD";
    PaymentMethod["JAZZCASH"] = "JAZZCASH";
    PaymentMethod["EASYPAISA"] = "EASYPAISA";
    PaymentMethod["CARD"] = "CARD";
    PaymentMethod["COUNTER"] = "COUNTER";
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "PENDING";
    PaymentStatus["PAID"] = "PAID";
    PaymentStatus["FAILED"] = "FAILED";
    PaymentStatus["REFUNDED"] = "REFUNDED";
    PaymentStatus["EXPIRED"] = "EXPIRED";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
var UserRole;
(function (UserRole) {
    UserRole["OWNER"] = "OWNER";
    UserRole["MANAGER"] = "MANAGER";
    UserRole["CASHIER"] = "CASHIER";
    UserRole["KITCHEN"] = "KITCHEN";
    UserRole["RIDER"] = "RIDER";
})(UserRole || (exports.UserRole = UserRole = {}));
var Language;
(function (Language) {
    Language["EN"] = "EN";
    Language["UR"] = "UR";
    Language["UR_ROMAN"] = "UR_ROMAN";
})(Language || (exports.Language = Language = {}));
var ConversationState;
(function (ConversationState) {
    ConversationState["GREETING"] = "GREETING";
    ConversationState["ORDER_TYPE"] = "ORDER_TYPE";
    ConversationState["MENU_CATEGORY"] = "MENU_CATEGORY";
    ConversationState["MENU_ITEM"] = "MENU_ITEM";
    ConversationState["ITEM_DETAIL"] = "ITEM_DETAIL";
    ConversationState["CART"] = "CART";
    ConversationState["ADDRESS"] = "ADDRESS";
    ConversationState["TIP"] = "TIP";
    ConversationState["PAYMENT"] = "PAYMENT";
    ConversationState["CONFIRMED"] = "CONFIRMED";
    ConversationState["HUMAN_HANDOVER"] = "HUMAN_HANDOVER";
})(ConversationState || (exports.ConversationState = ConversationState = {}));
var MessageDirection;
(function (MessageDirection) {
    MessageDirection["INBOUND"] = "INBOUND";
    MessageDirection["OUTBOUND"] = "OUTBOUND";
})(MessageDirection || (exports.MessageDirection = MessageDirection = {}));
var DeliveryFeeType;
(function (DeliveryFeeType) {
    DeliveryFeeType["FLAT"] = "FLAT";
    DeliveryFeeType["PER_KM"] = "PER_KM";
    DeliveryFeeType["FREE_ABOVE"] = "FREE_ABOVE";
})(DeliveryFeeType || (exports.DeliveryFeeType = DeliveryFeeType = {}));
// Allowed status transitions
exports.ORDER_STATUS_TRANSITIONS = {
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
//# sourceMappingURL=enums.js.map