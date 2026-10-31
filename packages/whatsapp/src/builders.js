"use strict";
// WhatsApp Cloud API message payload builders
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildText = buildText;
exports.buildButtons = buildButtons;
exports.buildList = buildList;
exports.buildLocationRequest = buildLocationRequest;
exports.buildTemplate = buildTemplate;
exports.buildGreeting = buildGreeting;
exports.buildOrderConfirmed = buildOrderConfirmed;
exports.buildTipSelection = buildTipSelection;
// ─── Builders ─────────────────────────────────────────────────────────────────
function buildText(to, body) {
    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body },
    };
}
function buildButtons(to, body, buttons, header, footer) {
    if (buttons.length > 3)
        throw new Error('WhatsApp supports max 3 reply buttons');
    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
            type: 'button',
            ...(header && { header: { type: 'text', text: header } }),
            body: { text: body },
            ...(footer && { footer: { text: footer } }),
            action: {
                buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
            },
        },
    };
}
function buildList(to, body, sections, buttonLabel = 'View options', header, footer) {
    const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);
    if (totalRows > 10)
        throw new Error('WhatsApp list messages support max 10 rows total');
    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
            type: 'list',
            ...(header && { header: { type: 'text', text: header } }),
            body: { text: body },
            ...(footer && { footer: { text: footer } }),
            action: {
                button: buttonLabel,
                sections,
            },
        },
    };
}
function buildLocationRequest(to, text) {
    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
            type: 'location_request_message',
            body: { text },
            action: { name: 'send_location' },
        },
    };
}
function buildTemplate(to, templateName, languageCode, bodyParams = []) {
    return {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
            name: templateName,
            language: { code: languageCode },
            ...(bodyParams.length > 0 && {
                components: [
                    {
                        type: 'body',
                        parameters: bodyParams.map((p) => ({ type: 'text', text: p })),
                    },
                ],
            }),
        },
    };
}
// ─── Greeting builder ─────────────────────────────────────────────────────────
function buildGreeting(to, restaurantName, customerName, isOpen = true, openingTime) {
    if (!isOpen) {
        return buildText(to, `🍽️ *${restaurantName}* is currently closed.\nWe open at ${openingTime}. Please message us then — we'd love to serve you! 🙏`);
    }
    const greeting = customerName ? `Welcome back, ${customerName}! 👋` : 'Welcome! 👋';
    return buildButtons(to, `${greeting}\n\n*${restaurantName}* — what can we get for you today?`, [
        { id: 'action_order', title: '🛒 Order Now' },
        { id: 'action_track', title: '📦 Track Order' },
        { id: 'action_staff', title: '💬 Talk to Staff' },
    ], restaurantName);
}
// ─── Order confirmation builder ───────────────────────────────────────────────
function buildOrderConfirmed(to, orderNumber, etaMinutes, total) {
    const pkr = (total / 100).toLocaleString('en-PK');
    return buildText(to, `✅ *Order Confirmed!*\n\n` +
        `Order #: *${orderNumber}*\n` +
        `Total: *PKR ${pkr}*\n` +
        `Estimated time: *${etaMinutes} minutes*\n\n` +
        `We'll send you updates as your order progresses. Thank you! 🙏`);
}
// ─── Tip builder ─────────────────────────────────────────────────────────────
function buildTipSelection(to, total) {
    const pkr = (total / 100).toLocaleString('en-PK');
    const tip5 = Math.round(total * 0.05 / 100);
    const tip10 = Math.round(total * 0.10 / 100);
    return buildButtons(to, `💰 *Would you like to add a tip?*\n\nYour order total: *PKR ${pkr}*\n\n` +
        `Tips go to the rider/staff — 100% of your tip reaches them.`, [
        { id: 'tip_skip', title: 'No tip' },
        { id: `tip_5`, title: `5% — PKR ${tip5}` },
        { id: `tip_10`, title: `10% — PKR ${tip10}` },
    ], undefined, 'Or reply with a custom amount to tip.');
}
//# sourceMappingURL=builders.js.map