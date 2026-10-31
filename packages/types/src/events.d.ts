export interface OrderCreatedEvent {
    event: 'order.created';
    payload: {
        orderId: string;
        orderNumber: string;
        branchId: string;
        source: string;
        orderType: string;
        status: string;
        customerName: string;
        total: number;
        items: Array<{
            name: string;
            quantity: number;
            notes?: string;
        }>;
        createdAt: string;
    };
}
export interface OrderUpdatedEvent {
    event: 'order.updated';
    payload: {
        orderId: string;
        orderNumber: string;
        branchId: string;
        previousStatus: string;
        status: string;
        updatedAt: string;
        updatedBy?: string;
    };
}
export interface ItemSoldOutEvent {
    event: 'item.sold_out';
    payload: {
        itemId: string;
        name: string;
        branchId: string;
        soldOut: boolean;
    };
}
export interface TicketCreatedEvent {
    event: 'ticket.created';
    payload: {
        ticketId: string;
        orderId: string;
        orderNumber: string;
        stationId: string;
        stationName: string;
        branchId: string;
        items: Array<{
            name: string;
            quantity: number;
            modifiers: string[];
            notes?: string;
            hasAllergyNote: boolean;
        }>;
        orderType: string;
        source: string;
        firedAt: string;
    };
}
export interface RiderLocationEvent {
    event: 'rider.location';
    payload: {
        riderId: string;
        deliveryId: string;
        orderId: string;
        lat: number;
        lng: number;
        updatedAt: string;
    };
}
export interface KdsHeartbeatEvent {
    event: 'kds.heartbeat';
    payload: {
        branchId: string;
        stationId: string;
        timestamp: string;
    };
}
export type SocketEvent = OrderCreatedEvent | OrderUpdatedEvent | ItemSoldOutEvent | TicketCreatedEvent | RiderLocationEvent | KdsHeartbeatEvent;
//# sourceMappingURL=events.d.ts.map