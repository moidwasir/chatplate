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
    header?: { type: 'text'; text: string } | { type: 'image'; image: { link: string } };
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

export interface WaImageMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'image';
  image: { link: string; caption?: string };
}

/** Swipeable photo cards, each with its own quick-reply buttons (free-form; needs the 24 h window) */
export interface WaCarouselMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'carousel';
    body: { text: string };
    action: {
      cards: Array<{
        card_index: number;
        type: 'button';
        header: { type: 'image'; image: { link: string } };
        body: { text: string };
        action: { buttons: Array<{ type: 'quick_reply'; quick_reply: { id: string; title: string } }> };
      }>;
    };
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
  | WaImageMessage
  | WaCarouselMessage
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
  /** Text header, or `{ imageUrl }` for a photo above the message (public https link) */
  header?: string | { imageUrl: string },
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
      ...(header &&
        (typeof header === 'string'
          ? { header: { type: 'text' as const, text: header } }
          : { header: { type: 'image' as const, image: { link: header.imageUrl } } })),
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

/** WhatsApp carousels hold 2–10 cards */
export const CAROUSEL_MAX_CARDS = 10;

/**
 * Carousel of photo cards (e.g. menu items). Every card needs a public https image.
 * Card body is kept short; button titles are capped at 20 characters by WhatsApp.
 */
export function buildCarousel(
  to: string,
  body: string,
  cards: Array<{ imageUrl: string; text: string; buttons: Array<{ id: string; title: string }> }>,
): WaCarouselMessage {
  if (cards.length < 2 || cards.length > CAROUSEL_MAX_CARDS) {
    throw new Error(`WhatsApp carousels need 2–${CAROUSEL_MAX_CARDS} cards`);
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'carousel',
      body: { text: body },
      action: {
        cards: cards.map((c, i) => ({
          card_index: i,
          type: 'button' as const,
          header: { type: 'image' as const, image: { link: c.imageUrl } },
          body: { text: c.text.length > 160 ? `${c.text.slice(0, 159)}…` : c.text },
          action: {
            buttons: c.buttons.slice(0, 2).map((b) => ({
              type: 'quick_reply' as const,
              quick_reply: { id: b.id, title: b.title.slice(0, 20) },
            })),
          },
        })),
      },
    },
  };
}

/** Image by public URL — Meta fetches it, so it must be reachable from the internet */
export function buildImage(to: string, link: string, caption?: string): WaImageMessage {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: { link, ...(caption && { caption }) },
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
  isReturning = false,
): WaButtonsMessage | WaTextMessage {
  if (!isOpen) {
    return buildText(
      to,
      `🍽️ *${restaurantName}* is currently closed.\nWe open at ${openingTime}. Please message us then — we'd love to serve you! 🙏`,
    );
  }

  const greeting = customerName
    ? `${isReturning ? 'Welcome back' : 'Welcome'}, ${customerName}! 👋`
    : 'Welcome! 👋';
  // WhatsApp allows 3 buttons; staff are reached by typing "help" (see footer)
  return buildButtons(
    to,
    `${greeting}\n\nWhat can we get for you today?`,
    [
      { id: 'menu_full', title: '📋 View Menu' },
      { id: 'action_order', title: '🛒 Order Now' },
      { id: 'action_track', title: '📦 Track Order' },
    ],
    `🍽️ ${restaurantName}`,
    'Need help? Type "help" to talk to our staff',
  );
}

// ─── Order received builder ───────────────────────────────────────────────────
/** Sent when the customer places an order; "confirmed" only comes once staff accept it */
export function buildOrderReceived(
  to: string,
  orderNumber: string,
  total: number, // paisa
): WaTextMessage {
  const pkr = Math.round(total / 100).toLocaleString('en-PK');
  return buildText(
    to,
    `📥 *Order Received!*\n\n` +
      `Order #: *${orderNumber}*\n` +
      `Total: *PKR ${pkr}*\n\n` +
      `The restaurant will confirm it shortly. We'll message you at every step. Thank you! 🙏`,
  );
}

// ─── Tip builder ─────────────────────────────────────────────────────────────
export function buildTipSelection(
  to: string,
  total: number, // paisa
): WaButtonsMessage {
  const pkr = Math.round(total / 100).toLocaleString('en-PK');
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

