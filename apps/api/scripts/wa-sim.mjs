#!/usr/bin/env node
/**
 * Local WhatsApp chat simulator — chat with the bot from your terminal.
 *
 * Posts Meta-shaped webhook payloads to the running API and prints the bot's
 * replies (read back from the messages table, since dev outbox mode never
 * sends them to Meta). Requires the API running WITHOUT WHATSAPP_APP_SECRET.
 *
 *   pnpm --filter api wa:sim                     # default customer 923001234567
 *   pnpm --filter api wa:sim -- 923009998888 "Sara"
 *
 * At the prompt: type a number to tap a button/list row, "l" to share a
 * location inside the seeded delivery zone, "l <lat> <lng>" for a custom pin,
 * "q" to quit — anything else is sent as a text message.
 *
 * Messages the bot sends on its own (order accepted, out for delivery, …) pop up
 * while you wait at the prompt, so you can drive an order from the dashboard.
 */
import readline from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const API = process.env.WA_SIM_API ?? `http://localhost:${process.env.PORT ?? 3001}/v1/webhooks/whatsapp`;
const phone = process.argv[2] ?? '923001234567';
const name = process.argv[3] ?? 'Test Ali';
const DEFAULT_PIN = { latitude: 31.5204, longitude: 74.3587 }; // inside seeded City Zone

const QUIET_MS = 1500; // stop waiting once the bot has been silent this long
const MAX_WAIT_MS = 15000;

const prisma = new PrismaClient();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

/** Choices offered by the bot's latest reply (all its messages together): [{ id, title, kind }] */
let choices = [];
let wantsLocation = false;

async function post(message) {
  const body = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'dev',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: 'dev', phone_number_id: 'dev' },
          contacts: [{ profile: { name }, wa_id: phone }],
          messages: [{
            from: phone,
            id: `wamid.sim.${randomUUID()}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            ...message,
          }],
        },
      }],
    }],
  };
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const hint = res.status === 401 ? ' (WHATSAPP_APP_SECRET is set — unset it for local simulation)' : '';
    throw new Error(`Webhook returned ${res.status}${hint}: ${await res.text()}`);
  }
}

/** Outbound messages already shown, so overlapping polls never print one twice */
const seen = new Set();
let cursor = new Date();
let collecting = false;

/** Bot messages to this customer that haven't been shown yet, oldest first */
async function fetchNew() {
  const msgs = await prisma.message.findMany({
    where: {
      direction: 'OUTBOUND',
      createdAt: { gte: cursor },
      conversation: { customer: { phone } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const fresh = msgs.filter((m) => !seen.has(m.id));
  for (const m of fresh) {
    seen.add(m.id);
    cursor = m.createdAt;
  }
  return fresh;
}

/** Wait for the bot's replies to this send and print them */
async function collectReplies() {
  collecting = true;
  try {
    const start = Date.now();
    let lastSeen = Date.now();
    let printed = 0;
    while (Date.now() - start < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, 300));
      for (const m of await fetchNew()) {
        render(m.content);
        lastSeen = Date.now();
        printed++;
      }
      if (printed > 0 && Date.now() - lastSeen > QUIET_MS) return;
      if (printed === 0 && Date.now() - start > 8000) break;
    }
    if (printed === 0) {
      console.log(c.red('  (no reply — is the API running, and Redis up for the queue? Check the API log.)'));
    }
  } finally {
    collecting = false;
  }
}

/** Messages the customer didn't ask for (e.g. "Order confirmed" when staff accept on the dashboard) */
function watchForUpdates() {
  setInterval(async () => {
    if (collecting) return;
    try {
      const fresh = await fetchNew();
      if (fresh.length === 0) return;
      process.stdout.write('\r\x1b[K'); // clear the half-typed prompt line
      console.log(c.yellow('  🔔 New message'));
      for (const m of fresh) render(m.content);
      printChoices();
      process.stdout.write(`${c.cyan('You:')} ${rl.line}`);
    } catch {
      // DB hiccup — try again next tick
    }
  }, 1000).unref();
}

function render(p) {
  const bubble = (text) => console.log(c.green(text.split('\n').map((l) => `  │ ${l}`).join('\n')));
  console.log(c.green('  ┌ Bot'));
  if (p.type === 'text') {
    bubble(p.text?.body ?? '');
  } else if (p.type === 'image') {
    bubble(`[image] ${p.image?.link ?? ''}${p.image?.caption ? `\n${p.image.caption}` : ''}`);
  } else if (p.type === 'template') {
    bubble(`[template] ${p.template?.name} ${JSON.stringify(p.template?.components ?? [])}`);
  } else if (p.type === 'interactive') {
    const i = p.interactive ?? {};
    if (i.header?.text) bubble(`*${i.header.text}*`);
    if (i.header?.image?.link) bubble(c.dim(`[photo] ${i.header.image.link}`));
    bubble(i.body?.text ?? '');
    if (i.footer?.text) bubble(c.dim(i.footer.text));
    if (i.type === 'button') {
      choices.push(...(i.action?.buttons ?? []).map((b) => ({ id: b.reply.id, title: b.reply.title, kind: 'button_reply' })));
    } else if (i.type === 'list') {
      for (const sec of i.action?.sections ?? []) {
        if (sec.title) choices.push({ heading: sec.title });
        for (const r of sec.rows ?? []) {
          choices.push({ id: r.id, title: r.title, description: r.description, kind: 'list_reply' });
        }
      }
      bubble(c.dim(`[list button: ${i.action?.button ?? 'Select'}]`));
    } else if (i.type === 'carousel') {
      for (const card of i.action?.cards ?? []) {
        bubble(c.dim(`  ┄ card ${card.card_index + 1} ┄ [photo] ${card.header?.image?.link ?? ''}`));
        bubble(`  ${(card.body?.text ?? '').split('\n').join('\n  ')}`);
        for (const b of card.action?.buttons ?? []) {
          choices.push({ id: b.quick_reply.id, title: `${b.quick_reply.title}  (${(card.body?.text ?? '').split('\n')[0]})`, kind: 'button_reply' });
        }
      }
    } else if (i.type === 'location_request_message') {
      wantsLocation = true;
      bubble(c.dim('[📍 Send location] — type "l" to share a pin'));
    }
  } else {
    bubble(JSON.stringify(p));
  }
  console.log(c.green('  └'));
}

function printChoices() {
  let n = 0;
  for (const ch of choices) {
    if (ch.heading) {
      console.log(c.dim(`    — ${ch.heading} —`));
      continue;
    }
    ch.n = ++n;
    console.log(`    ${c.cyan(`[${n}]`)} ${ch.title}${ch.description ? c.dim(`  ${ch.description}`) : ''}`);
  }
}

async function main() {
  console.log(c.yellow(`WhatsApp simulator — you are ${name} (${phone}) → ${API}`));
  console.log(c.dim('Number = tap option · l = share location · q = quit · anything else = text\n'));

  watchForUpdates();

  // Fresh session prompt
  let input = 'hi';
  console.log(`${c.cyan('You:')} hi`);
  for (;;) {
    const prev = choices;
    choices = [];
    wantsLocation = false;

    const pick = /^\d+$/.test(input) ? prev.find((ch) => ch.n === Number(input)) : null;
    const loc = input.match(/^l(?:\s+(-?[\d.]+)[\s,]+(-?[\d.]+))?$/i);

    try {
      if (pick) {
        await post({
          type: 'interactive',
          interactive: { type: pick.kind, [pick.kind]: { id: pick.id, title: pick.title } },
        });
      } else if (loc) {
        const pin = loc[1] ? { latitude: Number(loc[1]), longitude: Number(loc[2]) } : DEFAULT_PIN;
        await post({ type: 'location', location: { ...pin, name: 'Home', address: 'Simulated pin' } });
      } else {
        await post({ type: 'text', text: { body: input } });
      }
      await collectReplies();
    } catch (err) {
      console.log(c.red(`  ${err.message}`));
      choices = prev;
    }

    printChoices();
    do input = (await rl.question(`${c.cyan('You:')} `)).trim(); while (!input);
    if (input.toLowerCase() === 'q') break;
  }
  rl.close();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
