#!/usr/bin/env node
/**
 * Check the WhatsApp Cloud API setup in .env against Meta — read-only unless --send is given.
 *
 *   pnpm --filter api wa:check
 *   pnpm --filter api wa:check -- --public https://my-domain.ngrok-free.app   # also test the public webhook URL
 *   pnpm --filter api wa:check -- --send 923001234567                        # send Meta's hello_world template
 */
const env = process.env;
const API = env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0';
const TOKEN = env.WHATSAPP_ACCESS_TOKEN ?? '';
const PHONE_ID = env.WHATSAPP_PHONE_NUMBER_ID ?? '';
const WABA_ID = env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '';
const VERIFY = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '';
const LOCAL_WEBHOOK = `http://localhost:${env.PORT ?? 3001}/v1/webhooks/whatsapp`;

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const publicUrl = arg('--public');
const sendTo = arg('--send');

const ok = (msg) => console.log(`  \x1b[32m✔\x1b[0m ${msg}`);
const bad = (msg) => console.log(`  \x1b[31m✘\x1b[0m ${msg}`);
const warn = (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`);
const head = (msg) => console.log(`\n\x1b[1m${msg}\x1b[0m`);
const isSet = (v) => !!v && !v.startsWith('your_');

async function graph(path, init = {}) {
  const res = await fetch(`${API}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body;
}

async function main() {
  head('1. .env values');
  const values = {
    WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
    WHATSAPP_BUSINESS_ACCOUNT_ID: WABA_ID,
    WHATSAPP_ACCESS_TOKEN: TOKEN,
    WHATSAPP_APP_SECRET: env.WHATSAPP_APP_SECRET,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: VERIFY,
  };
  for (const [k, v] of Object.entries(values)) (isSet(v) ? ok : bad)(`${k} ${isSet(v) ? 'is set' : 'is missing or a placeholder'}`);
  if (!isSet(TOKEN) || !isSet(PHONE_ID)) {
    console.log('\nSet the access token and phone number ID first.');
    return;
  }

  head('2. Access token');
  try {
    const me = await graph('me?fields=id,name');
    ok(`Valid — belongs to "${me.name}" (${me.id})`);
  } catch (e) {
    bad(`Rejected by Meta: ${e.message}`);
    return;
  }

  head('3. Phone number');
  try {
    const n = await graph(
      `${PHONE_ID}?fields=display_phone_number,verified_name,name_status,quality_rating,code_verification_status,platform_type`,
    );
    ok(`${n.display_phone_number} — display name "${n.verified_name}" (name status: ${n.name_status ?? 'n/a'})`);
    (n.quality_rating === 'GREEN' ? ok : warn)(`Quality rating: ${n.quality_rating}`);
    (n.platform_type === 'CLOUD_API' ? ok : bad)(
      `Platform: ${n.platform_type}${n.platform_type === 'CLOUD_API' ? '' : ' — register it (POST /{phone-number-id}/register with your PIN)'}`,
    );
    (n.code_verification_status === 'VERIFIED' ? ok : warn)(`Verification: ${n.code_verification_status}`);
  } catch (e) {
    bad(`Could not read the number: ${e.message}`);
  }

  if (isSet(WABA_ID)) {
    head('4. WhatsApp Business Account');
    try {
      const nums = await graph(`${WABA_ID}/phone_numbers?fields=display_phone_number,verified_name`);
      const list = nums.data ?? [];
      const ours = list.some((n) => n.id === PHONE_ID);
      (ours ? ok : bad)(`Our number ${ours ? 'is' : 'is NOT'} in account ${WABA_ID}`);
      if (list.length > 1) {
        warn(`This account holds ${list.length} numbers — webhooks for all of them reach every subscribed app:`);
        for (const n of list) console.log(`      ${n.id === PHONE_ID ? '→' : ' '} ${n.display_phone_number}  "${n.verified_name}"  (${n.id})`);
        console.log('      The API ignores messages for the other numbers, but their apps will still see ours.');
      }
    } catch (e) {
      bad(`Could not list numbers: ${e.message}`);
    }
    try {
      const subs = await graph(`${WABA_ID}/subscribed_apps`);
      const apps = (subs.data ?? []).map((a) => a.whatsapp_business_api_data ?? a);
      if (apps.length === 0) bad('No app is subscribed — run POST /{waba-id}/subscribed_apps with this token');
      else {
        ok(`Apps receiving this account's webhooks: ${apps.length}`);
        for (const a of apps) console.log(`      • ${a.name ?? '(unnamed)'} (${a.id})`);
        if (apps.length > 1) warn('More than one app gets these messages — make sure only the order system replies to this number.');
      }
    } catch (e) {
      bad(`Could not read subscribed apps: ${e.message}`);
    }
  }

  head('5. Webhook');
  const challenge = `check_${Date.now()}`;
  const verifyQs = `hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY)}&hub.challenge=${challenge}`;
  for (const [label, base] of [['Local API', LOCAL_WEBHOOK], ...(publicUrl ? [['Public URL', `${publicUrl.replace(/\/$/, '')}/v1/webhooks/whatsapp`]] : [])]) {
    try {
      const res = await fetch(`${base}?${verifyQs}`, { headers: { 'ngrok-skip-browser-warning': '1' } });
      const text = await res.text();
      (res.ok && text === challenge ? ok : bad)(`${label} (${base}): ${res.ok && text === challenge ? 'answers the verify challenge' : `HTTP ${res.status}`}`);
    } catch (e) {
      bad(`${label} (${base}): not reachable — ${e.message}`);
    }
  }
  if (!publicUrl) warn('Add --public https://<your-ngrok-domain> to test the address Meta will call');

  if (sendTo) {
    head(`6. Test send to ${sendTo}`);
    try {
      const r = await graph(`${PHONE_ID}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: sendTo,
          type: 'template',
          template: { name: 'hello_world', language: { code: 'en_US' } },
        }),
      });
      ok(`Sent (message id ${r.messages?.[0]?.id}). Check the phone.`);
    } catch (e) {
      bad(`Send failed: ${e.message}`);
    }
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
