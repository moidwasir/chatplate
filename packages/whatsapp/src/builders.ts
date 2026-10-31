// WhatsApp Cloud API message payload builders
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages

// ─── Core types ───────────────────────────────────────────────────────────────
export interface WaTextMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text';
  text: { body: string; preview_url?: boolean };
}

export interface WaButtonsMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'button';
    header?: { type: 'text'; text: string };
    body: { text: string };
    footer?: { text: string };
    action: {
      buttons: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
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
    header?: { type: 'text'; text: string };
    body: { text: string };
    footer?: { text: string };
    action: {
      button: string; // "View options"
      sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string; description?: string }>;
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
    body: { text: string };
    action: { name: 'send_location' };
  };
}

export interface WaTemplateMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components?: Array<{
      type: 'header' | 'body' | 'button';
      parameters: Array<{ type: 'text'; text: string }>;
      sub_type?: string;
      index?: string;
    }>;
  };
}

export type WaOutboundMessage =
  | WaTextMessage
  | WaButtonsMessage
  | WaListMessage
  | WaLocationRequestMessage
  | WaTemplateMessage;

// ─── Builders ─────────────────────────────────────────────────────────────────
export function buildText(to: string, body: string): WaTextMessage {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body },
  };
}

export function buildButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
  header?: string,
  footer?: string,
): WaButtonsMessage {
  if (buttons.length > 3) throw new Error('WhatsApp supports max 3 reply buttons');
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

export function buildList(
  to: string,
  body: string,
  sections: WaListMessage['interactive']['action']['sections'],
  buttonLabel = 'View options',
  header?: string,
  footer?: string,
): WaListMessage {
  const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);
  if (totalRows > 10) throw new Error('WhatsApp list messages support max 10 rows total');
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

export function buildLocationRequest(to: string, text: string): WaLocationRequestMessage {
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

export function buildTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[] = [],
): WaTemplateMessage {
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
export function buildGreeting(
  to: string,
  restaurantName: string,
  customerName?: string,
  isOpen = true,
  openingTime?: string,
): WaButtonsMessage | WaTextMessage {
  if (!isOpen) {
    return buildText(
      to,
      `🍽️ *${restaurantName}* is currently closed.\nWe open at ${openingTime}. Please message us then — we'd love to serve you! 🙏`,
    );
  }

  const greeting = customerName ? `Welcome back, ${customerName}! 👋` : 'Welcome! 👋';
  return buildButtons(
    to,
    `${greeting}\n\n*${restaurantName}* — what can we get for you today?`,
    [
      { id: 'action_order', title: '🛒 Order Now' },
      { id: 'action_track', title: '📦 Track Order' },
      { id: 'action_staff', title: '💬 Talk to Staff' },
    ],
    restaurantName,
  );
}

// ─── Order confirmation builder ───────────────────────────────────────────────
export function buildOrderConfirmed(
  to: string,
  orderNumber: string,
  etaMinutes: number,
  total: number, // paisa
): WaTextMessage {
  const pkr = (total / 100).toLocaleString('en-PK');
  return buildText(
    to,
    `✅ *Order Confirmed!*\n\n` +
      `Order #: *${orderNumber}*\n` +
      `Total: *PKR ${pkr}*\n` +
      `Estimated time: *${etaMinutes} minutes*\n\n` +
      `We'll send you updates as your order progresses. Thank you! 🙏`,
  );
}

// ─── Tip builder ─────────────────────────────────────────────────────────────
export function buildTipSelection(
  to: string,
  total: number, // paisa
): WaButtonsMessage {
  const pkr = (total / 100).toLocaleString('en-PK');
  const tip5 = Math.round(total * 0.05 / 100);
  const tip10 = Math.round(total * 0.10 / 100);
  return buildButtons(
    to,
    `💰 *Would you like to add a tip?*\n\nYour order total: *PKR ${pkr}*\n\n` +
      `Tips go to the rider/staff — 100% of your tip reaches them.`,
    [
      { id: 'tip_skip', title: 'No tip' },
      { id: `tip_5`, title: `5% — PKR ${tip5}` },
      { id: `tip_10`, title: `10% — PKR ${tip10}` },
    ],
    undefined,
    'Or reply with a custom amount to tip.',
  );
}
