export interface WaTextMessage {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: 'text';
    text: {
        body: string;
        preview_url?: boolean;
    };
}
export interface WaButtonsMessage {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: 'interactive';
    interactive: {
        type: 'button';
        header?: {
            type: 'text';
            text: string;
        };
        body: {
            text: string;
        };
        footer?: {
            text: string;
        };
        action: {
            buttons: Array<{
                type: 'reply';
                reply: {
                    id: string;
                    title: string;
                };
            }>;
        };
    };
}
export interface WaListMessage {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: 'interactive';
    interactive: {
        type: 'list';
        header?: {
            type: 'text';
            text: string;
        };
        body: {
            text: string;
        };
        footer?: {
            text: string;
        };
        action: {
            button: string;
            sections: Array<{
                title: string;
                rows: Array<{
                    id: string;
                    title: string;
                    description?: string;
                }>;
            }>;
        };
    };
}
export interface WaLocationRequestMessage {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: 'interactive';
    interactive: {
        type: 'location_request_message';
        body: {
            text: string;
        };
        action: {
            name: 'send_location';
        };
    };
}
export interface WaTemplateMessage {
    messaging_product: 'whatsapp';
    to: string;
    type: 'template';
    template: {
        name: string;
        language: {
            code: string;
        };
        components?: Array<{
            type: 'header' | 'body' | 'button';
            parameters: Array<{
                type: 'text';
                text: string;
            }>;
            sub_type?: string;
            index?: string;
        }>;
    };
}
export type WaOutboundMessage = WaTextMessage | WaButtonsMessage | WaListMessage | WaLocationRequestMessage | WaTemplateMessage;
export declare function buildText(to: string, body: string): WaTextMessage;
export declare function buildButtons(to: string, body: string, buttons: Array<{
    id: string;
    title: string;
}>, header?: string, footer?: string): WaButtonsMessage;
export declare function buildList(to: string, body: string, sections: WaListMessage['interactive']['action']['sections'], buttonLabel?: string, header?: string, footer?: string): WaListMessage;
export declare function buildLocationRequest(to: string, text: string): WaLocationRequestMessage;
export declare function buildTemplate(to: string, templateName: string, languageCode: string, bodyParams?: string[]): WaTemplateMessage;
export declare function buildGreeting(to: string, restaurantName: string, customerName?: string, isOpen?: boolean, openingTime?: string): WaButtonsMessage | WaTextMessage;
export declare function buildOrderConfirmed(to: string, orderNumber: string, etaMinutes: number, total: number): WaTextMessage;
export declare function buildTipSelection(to: string, total: number): WaButtonsMessage;
//# sourceMappingURL=builders.d.ts.map