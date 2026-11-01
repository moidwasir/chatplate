# 📊 Project Status — ChatPlate

> **Product:** ChatPlate, WhatsApp ordering for restaurants (*Your restaurant, on WhatsApp*)
> **First client:** Safi Food & Beverage (restaurant data in the database is still "Safi Restaurant")
> **Last updated:** Nov 1, 2026 (Phase 2 session)
> **Current phase:** Phase 2 (WhatsApp engine): customers order by chat (COD), staff accept and progress orders on the dashboard, and the customer gets a WhatsApp message at every step. Phase 1 leftovers still open
> **Roadmap / checkboxes:** [TASKSHEET.md](./TASKSHEET.md)

This file is rewritten at the end of every work session so it always describes the **whole** system as it stands. It is not a changelog.
What's being worked on *right now* is in the "🔨 Now working on" section at the top of [TASKSHEET.md](./TASKSHEET.md).

---

## 1. At a glance

| Area | State |
|---|---|
| Monorepo (pnpm + Turborepo) | ✅ Working |
| Database (PostgreSQL 16 + Prisma, 34 models) | ✅ Migrated & seeded |
| Auth: email/password, POS PIN, roles, refresh rotation | ✅ Done & tested |
| Menu API: full create/edit/delete, options, serving hours, photos | ✅ Done & tested |
| Dashboard: login, sidebar, live overview, Menu Manager, Orders management (board + filtered list + order panel with progress) | ✅ Done |
| WhatsApp webhook | ✅ Verification + signature check (app secret, raw body) + dedupe |
| WhatsApp ordering engine (Phase 2) | ✅ Full chat journey → COD order; 🟡 a few gaps (see §6b) |
| Orders API | 🟡 Read + validated status changes (race-safe, delivery vs pickup steps, reason to cancel, prep time); orders are created by the WhatsApp bot (POS creation in Phase 3) |
| Order status notifications to customers | ✅ Free-form WhatsApp message on every status change (queued, retried). 🟡 Templates still needed for messages sent >24 h after the customer's last message |
| Real-time (Socket.IO) | 🟡 Dashboard shares one connection; new-order chime + pop-up, pages refresh live; no auth yet |
| POS / KDS / Rider apps | ❌ Not created yet |

---

## 2. Running it locally

**Prerequisites:** Node 20+, pnpm, Docker.

```bash
# 1. Start Postgres (port 5433) + Redis (6379)
pnpm docker:up

# 2. Install
pnpm install

# 3. Database — the Prisma CLI needs the root .env loaded
cd apps/api
set -a && . ../../.env && set +a
npx prisma migrate deploy
npx tsx prisma/seed.ts          # `prisma db seed` is not configured yet

# 3b. Build the shared packages if you changed them (the API imports their dist/)
(cd ../../packages/types && npx tsc) && (cd ../../packages/whatsapp && npx tsc)

# 4. API (http://localhost:3001, Swagger at /docs)
npx nest build && node dist/main.js

# 5. Dashboard (http://localhost:3000), in another terminal
cd apps/dashboard
npx next dev -p 3000
```

The dashboard calls `NEXT_PUBLIC_API_URL` (default `http://localhost:3001/v1`).
To point it at another port: `NEXT_PUBLIC_API_URL=http://localhost:3011/v1 npx next dev -p 3000`.

### Testing the WhatsApp bot locally

While `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` are unset or still `your_…` placeholders, the API runs in **dev outbox** mode: replies are written to the API log as `[dev outbox] → <phone>: …` (and saved in the `Message` table) instead of being sent to Meta. Without `WHATSAPP_APP_SECRET`, signature checks are skipped outside production.

**Easiest: the terminal chat simulator.** With the API running, in another terminal:

```bash
cd apps/api && pnpm wa:sim                      # customer 923001234567 "Test Ali"
pnpm wa:sim 923009998888 "Sara"                 # a different customer
```

It shows each bot reply as a chat bubble, with buttons and list rows numbered. Type a number to tap one, `l` to share a pin inside the seeded delivery zone (`l <lat> <lng>` for your own pin), `q` to quit, or anything else to send it as text. It reads replies back from the `Message` table ([apps/api/scripts/wa-sim.mjs](apps/api/scripts/wa-sim.mjs)). Messages the bot sends on its own pop up as "🔔 New message" while you wait at the prompt, so you can place an order in the simulator, accept and progress it on the dashboard's **Orders** page, and watch the customer's updates arrive.

By hand: simulate a customer by POSTing a Meta-shaped payload to `/v1/webhooks/whatsapp`:

```bash
curl -X POST localhost:3001/v1/webhooks/whatsapp -H 'Content-Type: application/json' -d '{
  "entry":[{"changes":[{"value":{
    "contacts":[{"wa_id":"923001112233","profile":{"name":"Ali"}}],
    "messages":[{"from":"923001112233","id":"wamid.test.1","type":"text","text":{"body":"hi"}}]}}]}]}'
```

Button taps are `"type":"interactive","interactive":{"button_reply":{"id":"action_order"}}` (lists use `list_reply`), and a pin is `"type":"location","location":{"latitude":31.52,"longitude":74.35}`. Every message needs a new `id`.

The seed branch opens 11:00–23:30 Pakistan time and is closed on Tuesdays. To test outside those hours, start the API with e.g. `RESTAURANT_TIMEZONE=America/Los_Angeles`.

### Hosted on Vercel (production)

| What | Where |
|---|---|
| Dashboard | https://chatplate-dashboard.vercel.app (project `chatplate-dashboard`, root `apps/dashboard`) |
| API | https://chatplate-api.vercel.app/v1 (project `chatplate-api`, root `apps/api`, entry `apps/api/api/index.js` → `src/serverless.ts`) |
| WhatsApp callback URL | `https://chatplate-api.vercel.app/v1/webhooks/whatsapp` |
| Postgres | Neon `chatplate-db` (Vercel Marketplace); migrations run in `apps/api/scripts/vercel-build.sh` over `DATABASE_URL_UNPOOLED`; runtime uses `POSTGRES_PRISMA_URL` |
| Redis | Upstash `chatplate-redis`, **pending** marketplace terms acceptance (needed for WhatsApp chat sessions) |
| Photos | Vercel Blob `chatplate-photos` (`BLOB_READ_WRITE_TOKEN`), public https URLs |

How it differs from the local server: no Bull queue (webhooks and status updates are handled within the request; a per-customer Redis lock keeps one customer's messages in order), no Socket.IO (the dashboard polls `GET /orders/changes` every 4 s; the Socket.IO gateway still runs locally for future KDS/POS). Production was seeded with a generated owner password and cashier PIN (`SEED_OWNER_PASSWORD`, `SEED_CASHIER_PIN`), not the dev defaults. Deploy from the **repo root** with `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` from `apps/*/.vercel/project.json` (deploying from the app folder uploads only that folder). `.vercelignore` keeps `.env` and build output out of uploads.

### Connecting the real WhatsApp number

Plan: reuse **+92 304 5945496** (already in the Mavon business portfolio, previously JobsChance's test number, display name still "JobsChance", limit 250 customers/24 h). After filling the WhatsApp values in `.env`, run:

```bash
cd apps/api && pnpm wa:check                                         # token, number, registration, which apps get its webhooks, local webhook
pnpm wa:check --public https://<ngrok-domain>                        # also the public webhook URL Meta calls
pnpm wa:check --send 923XXXXXXXXX                                    # send Meta's hello_world template to a phone
```

The API only handles webhooks addressed to `WHATSAPP_PHONE_NUMBER_ID` (other numbers in the same business account are ignored), so sharing an account with JobsChance can't make the bot answer JobsChance chats.

### Test logins (from the seed)

| Who | How | Credentials |
|---|---|---|
| Owner | Dashboard / `POST /v1/auth/login` | `owner@safi.pk` / `changeme123` |
| Cashier | `POST /v1/auth/pin-login` | branch `seed-branch-001`, PIN `1234` |

⚠️ Change these before any shared or staging deployment.

---

## 3. Architecture

```
apps/
  api/          NestJS 10 — REST (/v1), Socket.IO, Prisma, Bull
  dashboard/    Next.js 15 (App Router) + Tailwind 3 + zustand
packages/
  types/        Shared enums, Zod schemas, socket event types
  ui/           Shared React components (Badge, Card, Button, OrderStatusBadge, cn)
  whatsapp/     WhatsApp Cloud API message builders (text, buttons, list, image, location request, template)
infra/          docker-compose (Postgres, Redis, Nginx), init.sql, nginx conf
```

**Money:** always stored as integer **paisa** (Rs 450 = `45000`). The dashboard converts to and from rupees.
**WhatsApp flow:** Meta → `POST /webhooks/whatsapp` (signature check) → Bull queue `whatsapp-inbound` (deduped by message id) → `WhatsAppProcessor` → `ConversationEngine` (state machine, session in Redis) → `WhatsAppService.sendMessage` (rate-limited, every message saved) and `OrdersService.createOrder`.
**Time:** opening hours and serving hours use the restaurant's timezone (`RESTAURANT_TIMEZONE`, default `Asia/Karachi`), not the server clock.

---

## 4. Authentication & permissions

- **Every API route requires a Bearer token** unless marked `@Public()`. Public routes: `GET /health`, `GET /menu`, `/webhooks/whatsapp` (protected by Meta's signature instead), and the login/refresh/logout endpoints.
- **Access token:** a JWT valid for 15 min, carrying `sub`, `role` and `branchIds`.
- **Refresh token:** an opaque `<id>.<secret>` value valid for 7 days. Only its sha256 hash is stored, in the `RefreshToken` table. Each refresh **rotates** it. **Re-using an old token revokes the whole login session** (theft protection).
- **Email login** works for OWNER and MANAGER only. Everyone else uses a **PIN** (4–6 digits, max 5 attempts per minute).
- **Roles:** `@Roles(...)` on routes. **Branch scoping:** non-owners can only touch branches they're assigned to (`assertBranchAccess`).
- The dashboard keeps the access token in memory and the refresh token in `localStorage` (move it to an httpOnly cookie before go-live). A 401 triggers one automatic refresh, then sends the user to login.

| Role | Can do |
|---|---|
| OWNER | Everything, all branches |
| MANAGER | Dashboard + menu editing for assigned branches |
| KITCHEN | Mark items sold out / in stock |
| CASHIER, RIDER | Read orders, change order status (their branches) |

---

## 5. API reference (prefix `/v1`)

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → `{ accessToken, refreshToken, expiresIn }` |
| POST | `/auth/pin-login` | `{ branchId, pin }` |
| POST | `/auth/refresh` | `{ refreshToken }` → new pair (old one revoked) |
| POST | `/auth/logout` | `{ refreshToken }` → 204 |
| GET | `/auth/me` | Current user + branches |

### Menu (editing: OWNER/MANAGER)
| Method | Path | Notes |
|---|---|---|
| GET | `/menu?branchId=` | **Public.** Customer view: active, in stock, inside serving hours |
| GET | `/menu/admin?branchId=` | Everything, incl. hidden & sold-out |
| POST / PATCH / DELETE | `/menu/categories[/:id]` | Delete is refused while the category still has items |
| POST / PATCH / DELETE | `/menu/items[/:id]` | Delete **hides** the item if it appears on past orders. Price changes are written to `AuditLog` |
| PATCH | `/menu/items/:id/availability` | `{ soldOut }`; also allowed for KITCHEN |
| POST | `/menu/items/:id/image` | multipart field `image`; JPEG/PNG/WebP, ≤ 5 MB |
| POST | `/menu/items/:id/modifier-groups` | Option group (Size, Add-ons…), `required`, `min/maxChoices` |
| PATCH / DELETE | `/menu/modifier-groups/:id` | |
| POST | `/menu/modifier-groups/:id/modifiers` | Option with `priceAdjustment` (paisa) |
| PATCH / DELETE | `/menu/modifiers/:id` | Delete marks the option unavailable if it appears on past orders |

Serving hours are `"HH:MM"`. Set both or neither. Overnight windows such as `22:00–02:00` work.

### Orders
| Method | Path | Notes |
|---|---|---|
| GET | `/orders?branchId=&status=&orderType=&from=&to=&q=&page=&pageSize=` | Branch-scoped, paged (`pageSize` ≤ 200, default 50). `status` takes a comma list; `q` matches order number, customer name or phone (`0300…`/`+92…` both work). Returns `{ items, total, page, pageSize }` |
| GET | `/orders/stats?branchId=&from=&to=` | `{ counts: { STATUS: n }, total, sales, averageOrder }`; sales exclude cancelled/refunded |
| GET | `/orders/:id` | Full order with `statusHistory[].changedByName` (staff name, or "Customer (WhatsApp)") |
| PATCH | `/orders/:id/status` | `{ status, reason?, estimatedMinutes? }` (validated DTO). Enforces allowed transitions; Out for delivery / Delivered only for delivery orders, Picked up only for pickup; `reason` required to cancel; `estimatedMinutes` (5–180) saved on accept. Two simultaneous changes → the second gets 409. WhatsApp orders queue an `order-status` job that messages the customer. `changedBy` comes from the token |

### Other
`GET /health` · `GET /webhooks/whatsapp` (Meta verify challenge) · `POST /webhooks/whatsapp` (messages + delivery statuses; 401 on a bad signature, 5xx if the queue is down so Meta retries) · Swagger UI at `/docs` (non-production) · uploaded files at `/uploads/*` (local storage mode)

---

## 6. Dashboard

| Screen | What it does |
|---|---|
| `/login` | Owner/manager sign-in |
| `/` Overview | Orders today, sales today, active orders, menu item and sold-out counts, 10 most recent orders with progress bars (click to open). Updates live |
| `/orders` Orders management | **Left panel:** search (order #, name, phone), views with live counts (Live board · All · New · Accepted · Preparing · Ready · Out for delivery · Completed · Cancelled; New is highlighted when waiting), date (Today / Yesterday / 7 / 30 days / All / pick a day), type (Delivery / Pickup), and a summary (orders, sales, average order, cancelled). **Live board:** every open order in three scrolling columns, compact cards with item summary, progress bar and Accept/Reject or next-step button; new orders waiting 5+ min turn red. **List views:** table with progress bars, 50 per page. Filters are in the URL (bookmarkable, Back works) |
| Order panel | Click any order (board, list or Overview) → right-hand panel: step-by-step progress with times, actions, customer (call, open WhatsApp chat, map link), items with options and prices, totals, payment, history with who did each step. Updates live |
| `/menu` Menu Manager | Categories (add/rename/hide/reorder/delete); items (price, Urdu name, description, serving hours, visibility, in-stock toggle, photo); option groups and options with extra prices |
| Top bar | Branch switcher (multi-branch users), **API** and **Live updates** status dots, 🔔 new-order sound toggle, sign out. Every page plays a chime and shows a pop-up for a new order (sound works after the first click on the page, a browser rule) |
| Sidebar | Chats, Customers, Delivery, Reports, Settings are shown as "Soon" with their phase |

---

## 6b. WhatsApp ordering bot

**Customer journey** (all in [conversation.engine.ts](apps/api/src/modules/whatsapp/conversation.engine.ts)):

| Step | What happens |
|---|---|
| 1. Greeting | Uses the WhatsApp profile name ("Welcome" for new customers, "Welcome back" for returning ones). If closed, says when it opens next. Buttons: View Menu · Order Now · Track Order (WhatsApp allows 3); the footer says to type "help" for staff |
| 2. Order type | Delivery or Pickup (opening hours are checked again here) |
| 3. Menu | The first time in an order, the **full menu** is sent as one formatted message (category emoji headings, items, prices, short descriptions, "Customisable" marker; split into several messages past ~3,800 chars). Then a category list ("🍔 Burgers · 3 items · from PKR 750") with a **📋 Full menu** row → item list. Long menus page with "➡️ More categories / More items". **Photo cards:** when every item in a category has a public `https` photo, items arrive as a swipeable WhatsApp **carousel** (2–10 cards per page, each with **➕ Add**), followed by Categories / More items / View cart buttons; a one-item category with a photo gets a single photo message with Add. Falls back to the text list if WhatsApp refuses. Photos upload to Vercel Blob in production |
| 4. Item | One question per option group (required / optional / multi-choice up to `maxChoices`), then quantity (buttons 1–3, or type up to 20) |
| 5. Cart | Lines with options and totals · Checkout · Add More · Clear. Same item + same options are merged |
| 6. Address | Saved addresses offered as a list, or a new pin (saved, first one becomes default). Zone check (polygon), fee (flat / per-km / free above), minimum order. Outside the zone → offer Pickup |
| 7. Tip + summary | No tip / 5% / 10% / typed amount (up to the subtotal). Summary shows subtotal, 17% tax, delivery fee, tip, total, calculated exactly as the order will be |
| 8. Confirm | Cart is re-checked against the live menu (removed items / price changes are reported and the customer re-confirms) and the order is created as COD with payment PENDING |
| 9. Received | "📥 Order Received": order number and total, "the restaurant will confirm it shortly". The `order.created` socket event reaches the dashboard |
| 10. Status updates | Sent when staff move the order ([order-notifier.ts](apps/api/src/modules/whatsapp/order-notifier.ts)): ✅ Confirmed (with the prep time) · 👨‍🍳 Preparing · 📦 Ready (delivery) / 🎉 Ready for pickup at *branch* · 🛵 On the way · ✅ Delivered / Collected · ❌ Cancelled with the reason. Queued on the WhatsApp queue, 5 retries; saved on the customer's latest conversation |

**Works from any step:** `hi`/`hello`/`salam`/`menu`/`start` → main menu (cart kept) · "show me the menu", "full menu", "price list" → full menu, then back to where they were · `help`/`staff` → Talk to Staff · `cancel`/`stop` → empty cart · Talk to Staff → bot goes silent and the conversation is marked `handledBy = HUMAN` (bot resumes after 30 min of silence) · anything unrecognised → help reply with "Show options" and "Talk to Staff".

**Sessions:** Redis key `wa:session:<phone>`, kept 24 h. After 30 min idle with items in the cart the customer is asked "Continue / Start over". State and cart are mirrored to the `Conversation` row; every inbound and outbound message is stored in `Message`.

**Known gaps:** branch selector (always uses the first active branch); no free-text ordering ("1 chicken burger and a coke"); no free-text item notes; no "edit a cart line"; no upsell; no Urdu text yet; status updates are free-form messages, so they only reach the customer within 24 h of their last message (Meta rule). Approved templates are needed for anything later.

---

## 7. Configuration (`.env` at repo root)

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Postgres (`localhost:5433` in Docker) |
| `REDIS_URL` | Bull queues |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Access tokens (default 15m) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime (default 7d). `JWT_REFRESH_SECRET` is no longer used |
| `FRONTEND_URL` | CORS allow-list (comma-separated) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_URL` | Photo storage. If unset or placeholder, files go to `apps/api/uploads/` |
| `API_PUBLIC_URL` | Base URL for locally stored uploads |
| `RESTAURANT_TIMEZONE` | Opening-hours and serving-hours clock (default `Asia/Karachi`) |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Sending messages. Placeholder values → dev outbox (log only) |
| `WHATSAPP_APP_SECRET` | Webhook signature check. **Required in production** (webhooks are rejected without it) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Meta's one-time webhook verification |
| `WHATSAPP_API_URL` | Graph API base (default `https://graph.facebook.com/v21.0`) |
| `WHATSAPP_MAX_SENDS_PER_SECOND` | Outgoing rate limit (default 20) |
| `NEXT_PUBLIC_API_URL` | Dashboard → API base URL |

---

## 8. Known issues & risks

| # | Issue | Impact | Fix planned |
|---|---|---|---|
| 1 | Outgoing rate limit is per API process, not shared via Redis | Running several API instances multiplies the send rate | When scaling beyond one instance |
| 2 | Socket.IO accepts unauthenticated clients, CORS `*` | Anyone could join a branch room | Phase 4.4 |
| 3 | PIN uniqueness per branch isn't enforced | Two staff with the same PIN → first match logs in | When staff management is built |
| 4 | Refresh token in `localStorage` | Exposed to XSS | Move to an httpOnly cookie before go-live |
| 5 | `prisma db seed` isn't configured | Seed must be run with `npx tsx prisma/seed.ts` | Add a `prisma.seed` entry |
| 6 | No ESLint config; no automated tests (Jest isn't installed) | `lint`/`test` scripts don't run | Phase 1 cleanup / Phase 6 |
| 7 | Order numbers come from `count + 1` | Two orders at the same moment can collide; the second customer gets "could not place your order — Try again" | Phase 3, Order Service |
| 8 | Two browser tabs refreshing at the same moment can trip reuse detection | User gets logged out | Acceptable for now; revisit with cookie-based refresh |
| 9 | Item photos in local-storage mode are `http://localhost` URLs | Meta can't fetch them, so the bot only sends photos stored on S3 (`https://`) | Configure S3 before go-live |
| 10 | `packages/*/src` contain stale committed `.js`/`.d.ts` build files | Confusing; the real build output is `dist/` | Delete them in a cleanup commit |
| 11 | Dev database holds test data: orders `ORD-000001`–`ORD-000004`, customers `92333999000x`, `923001234567`, `923009990001`, `923009990002` | Shows up on the dashboard | Delete, or re-seed, whenever convenient |
| 12 | Delivered / picked-up COD orders keep payment **PENDING** | Cash collected isn't recorded anywhere yet | Rider app / cash-up screen (Phase 3–5) |
| 13 | Status messages are free-form text | Meta rejects them more than 24 h after the customer's last message | Approved templates (Phase 3.3) |

---

## 9. Database changes

- **Phase 1:** new model `RefreshToken` (migration `20261031204614_auth_refresh_tokens`). Seed also creates **Demo Cashier** (`+923000000001`, PIN `1234`).
- **Phase 2 (this session):** no schema changes. The bot uses the existing `Conversation`, `Message`, `Address`, `DeliveryZone` and `OpeningHour` models.
- **Behaviour change:** COD payments are now created as **PENDING** (they were PAID). Counter (POS) sales are still PAID.
- **Order statuses:** no schema change. `estimatedMinutes` is now set by staff when accepting.

---

## 10. Verified

- **Auth (16 checks on a live instance):**
  - Login works with a correct password and fails with a wrong one.
  - Requests without a token, or with a bad one, are rejected (401).
  - Refresh rotates the token; re-using an old token is caught and ends the session.
  - Logout works; refreshing after logout fails.
  - PIN login works, and brute force is blocked after 5 tries (429).
  - Cashiers are blocked from other branches and from owner/manager actions (403).
- **Menu:**
  - Create, edit and delete work for categories, items, option groups and options.
  - An item with only one of the two serving times is rejected; overnight hours show correctly at 01:57 Karachi time.
  - Bad option limits are rejected (min can't be above max).
  - Photo upload works and is served back; a non-image file is rejected.
  - A category with items can't be deleted (409).
  - Cashiers can't edit the menu (403).
  - Price edits are written to the audit log.
- **Dashboard:**
  - TypeScript compiles with no errors.
  - `/login`, `/` and `/menu` all load.
  - Tailwind CSS is being generated.
  - The live-updates socket connects to the API.
- **WhatsApp bot (simulated webhooks against a live API, dev outbox):**
  - The full delivery order works: options (single and multi-choice), quantity, merging, an out-of-zone pin (rejected, Pickup offered), an in-zone pin (saved, PKR 80 fee), invalid tip text, a 10% tip. The order in the DB matches the summary (subtotal 2,060 + tax 350.2 + fee 80 + tip 206 = 2,696.2).
  - A pickup order works, with no delivery fee and "Cash on Pickup".
  - The closed message works (09:15 Sunday, opens 11:00).
  - New customers get "Welcome", returning ones "Welcome back".
  - The same message delivered twice is answered once.
  - `cancel` works; Talk to Staff silences the bot and sets `handledBy = HUMAN`.
  - After 31 min idle, "Continue / Start over" appears and Continue restores the cart.
  - Signature check: valid → 200, wrong → 401, missing → 401 (body with unusual spacing, proving the raw bytes are hashed).
- **Order status flow (simulator as the customer, status changes via the API, Nov 1):**
  - Pickup order ORD-000004: the bot replied "Order Received", then Accept (45 min) → Preparing → Ready → Picked up. Each step reached the simulator as a WhatsApp message, with the 45 min prep time and the branch name.
  - Blocked with 400: skipping steps (NEW → OUT_FOR_DELIVERY), cancelling without a reason, accepting twice, and "Out for delivery" on a pickup order.
  - API and dashboard TypeScript compile; `/orders` and `/` load (200).
- **Orders management + menu (Nov 1, part 3):**
  - API: list paging (2 per page → total 4), status list, type filter, date range, search by name and by `0300…` phone, `pageSize` > 200 rejected, stats per status with sales and average, history with staff names.
  - Bot (simulator): new greeting buttons and footer; View Menu → formatted full menu → delivery/pickup question; category rows with emoji and "from PKR"; "show me your full menu" typed mid-order; `help` → staff.
  - Dashboard TypeScript compiles; `/orders`, `/orders?view=all&range=7d` and `/` load (200).
- **Not yet verified:**
  - Clicking through the dashboard in a real browser end to end (board, list, filters, order panel, chime, pop-up).
  - Menu paging with a real-sized menu (seed has 2 items).
  - The cancel/reject message and the delivery-order messages (On the way, Delivered) in a live run.
  - Sending to the real Meta API (needs credentials).

---

## 11. Next steps

1. **Finish Phase 2:**
   - returning-customer "Reorder last order";
   - cart line edit + upsell;
   - item notes;
   - category paging;
   - language choice + Urdu copy;
   - branch selector.
2. **Phase 3 start:**
   - safe order numbers (issue #7);
   - approved WhatsApp templates for status updates sent after the 24 h window;
   - record COD cash as collected when an order is delivered (issue #12);
   - assign a rider from the order panel.
3. **WhatsApp menu with photos (like the reference screenshots):**
   - set up S3 so item photos have public `https://` links (needed for any photo on WhatsApp);
   - swipeable photo cards with an "Add" button: Meta's free-form interactive carousel isn't clearly documented yet (only template carousels are), so build and test it once a real Meta number is connected; alternatively a Meta catalog (multi-product message, native cart);
4. **AI ordering:** understand free text like "I want a chicken burger and a coke" and fill the cart (LLM + menu matching), falling back to the buttons.
5. **Phase 1 leftovers:**
   - scaffold `apps/pos`, `apps/kds`, `apps/rider`;
   - ESLint config;
   - staging VPS + SSL (needs Hostinger access).
6. **Waiting on the restaurant:**
   - Meta Business verification and WhatsApp number (then we can test with real messages);
   - message templates;
   - menu data and photos.
