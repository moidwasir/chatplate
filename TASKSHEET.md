# 🍽️ WhatsApp Restaurant Ordering System — Task Sheet

> **Project:** Safi Food & Beverage | **Started:** Oct 31, 2026 | **Target MVP Go-Live:** Week 18

---

## 📋 Phase 0 — Setup & Design
- [x] Read and review full development plan
- [x] Audit local environment (Node v24, pnpm v11, Docker)
- [ ] Meta Business Manager account creation & verification
- [ ] WhatsApp Business phone number registration
- [ ] Apply for WhatsApp Cloud API access
- [ ] Create message templates (order confirmed, out for delivery, delivered, review request)
- [ ] Collect menu data from restaurant (items, categories, prices, photos)
- [ ] UI/UX designs for Dashboard, POS, KDS (Figma or equivalent)
- [ ] Chat scripts in English and Urdu approved by owner

---

## 🏗️ Phase 1 — Foundation *(IN PROGRESS)*

### 1.1 Monorepo Scaffold
- [x] Initialize pnpm workspace with Turborepo
- [x] Create `apps/api` (NestJS + TypeScript)
- [x] Create `apps/dashboard` (Next.js 15 + Tailwind CSS)
- [x] Create `apps/pos` (Next.js PWA)
- [x] Create `apps/kds` (Next.js PWA)
- [x] Create `apps/rider` (Next.js mobile-first)
- [x] Create `packages/types` (shared types + Zod schemas)
- [x] Create `packages/ui` (shared React component library)
- [x] Create `packages/whatsapp` (message builders & template helpers)
- [x] Configure TypeScript, ESLint, Prettier across workspace
- [x] Set up Turborepo `turbo.json` pipeline

### 1.2 Infrastructure
- [x] `infra/docker-compose.yml` (PostgreSQL 16 + Redis 7 + Nginx)
- [x] Environment variable templates (`.env.example`)
- [x] GitHub Actions CI pipeline (lint → typecheck → test → build)
- [ ] Staging environment setup on Hostinger VPS
- [ ] Let's Encrypt SSL + Nginx config for subdomains

### 1.3 Database Schema (Prisma)
- [x] Prisma setup with PostgreSQL connection
- [x] Restaurant & Branches tables
- [x] Delivery zones & opening hours
- [x] Menu: categories, items, variants, modifier groups, modifiers, availability
- [x] Customers: customers, addresses, customer notes
- [x] Chat: conversations, messages, WhatsApp templates
- [x] Orders: orders, order_items, order_item_modifiers, order_status_history
- [x] Payments: payments, refunds, cash_shifts
- [x] Delivery: riders, deliveries
- [x] Kitchen: stations, kitchen_tickets
- [x] Stock: ingredients, recipes, stock_movements
- [x] Marketing: promo_codes, reviews
- [x] Staff: users, roles, permissions, audit_logs
- [x] Initial migrations + seed data

### 1.4 Auth & Roles (Backend)
- [x] JWT auth module (email + password for owner/manager)
- [x] PIN login for POS cashiers
- [x] Role-based guards (Owner, Manager, Cashier, Kitchen, Rider)
- [x] Refresh token rotation

### 1.5 Menu Service (Backend)
- [x] CRUD for categories, items, variants, modifiers
- [x] Sold-out flag toggle endpoint
- [x] Item scheduling (serving hours, hide outside hours)
- [x] Branch-specific pricing
- [x] Image upload to S3-compatible storage

### 1.6 Dashboard Shell (Frontend)
- [x] Auth layout with login page
- [x] Dashboard layout with sidebar navigation
- [x] Menu Manager screen (categories + items CRUD)
- [x] Live status indicators

---

## 💬 Phase 2 — WhatsApp Ordering Engine

### 2.1 WhatsApp Gateway (Backend)
- [ ] Webhook verification endpoint (GET challenge)
- [ ] Webhook receiver with Meta signature verification
- [ ] Idempotency check on wa_message_id
- [ ] Outgoing message sender with rate limiting
- [ ] Message delivery status tracking
- [ ] Business hours check middleware

### 2.2 Conversation State Machine
- [ ] Redis-backed session store (30-min idle, 24-hr cart survival)
- [ ] States: greeting → order_type → category → item → cart → address → tip → payment → confirmed
- [ ] State persistence and recovery (resume dropped sessions)
- [ ] Session handover to human agent flag

### 2.3 Customer Journey — All 9 Steps
- [ ] Step 1: Greeting (name lookup, hours check, menu/track/staff buttons)
- [ ] Step 2: Delivery vs Pickup selection (+ branch selector if multi-branch)
- [ ] Step 3: Category list → item list (with photo, description, price)
- [ ] Step 4: Item detail (size, add-ons, spice level, notes, quantity)
- [ ] Step 5: Cart summary (add more, edit, checkout + upsell drinks/sides)
- [ ] Step 6: Location pin request → geocode → address confirm → delivery zone check
- [ ] Step 7: Price breakdown (subtotal, delivery fee, tax, discount, total) + tip selection
- [ ] Step 8: COD confirmation flow (online payment link flow to be enabled later)
- [ ] Step 9: Order confirmation with number + ETA + live status updates

### 2.4 Customer Features
- [ ] Returning customer recognition (name, reorder last order, favourites)
- [ ] Saved addresses per customer (Home, Office)
- [ ] Session reminder message (30-min idle warning)
- [ ] Free-text fallback → help reply + "Talk to staff" button
- [ ] Language selection (English / Urdu Roman / Urdu Script) stored on customer

---

## 💳 Phase 3 — Payments & Order Engine

### 3.1 Order Service
- [ ] Order creation from WhatsApp (COD)
- [ ] Order creation from POS (walk-in, phone, dine-in)
- [ ] Status state machine: New → Accepted → Preparing → Ready → Out for Delivery → Delivered / Picked up
- [ ] Cancel and Refund transitions with allowed-state enforcement
- [ ] Status change audit log (who, when, old, new)
- [ ] WebSocket event emission on every status change

### 3.2 Payment Service
- [ ] Payment provider interface (create, confirm, refund) — plug-in architecture
- [ ] COD provider module
- [ ] Payment link generation (placeholder for JazzCash/Easypaisa/Card)
- [ ] Payment gateway webhook handler (with idempotency)
- [ ] 15-minute payment link expiry + auto-cancel
- [ ] Refund flow from dashboard

### 3.3 WhatsApp Notifications (Templates)
- [ ] Order accepted with ETA template
- [ ] Preparing template
- [ ] Out for delivery (with rider name + call link) template
- [ ] Delivered + rate your order + add tip template
- [ ] Cancelled with reason template
- [ ] SMS fallback for critical notifications

---

## 🖥️ Phase 4 — POS & KDS

### 4.1 POS App
- [ ] Touch-friendly menu grid with search
- [ ] Modifier/note entry on item add
- [ ] Hold and recall orders
- [ ] Incoming WhatsApp orders appear in same queue (with badge)
- [ ] Split bill, discounts (manager approval), service charge, tax, tip entry
- [ ] Multiple payment methods in one bill
- [ ] Refund flow
- [ ] Cash management: open/close shift, cash in/out, Z-report
- [ ] PIN login per cashier
- [ ] Offline mode: cached menu, queued orders, sync on reconnect
- [ ] Receipt and kitchen ticket printing (ESC/POS via print agent)

### 4.2 KDS App
- [ ] Full-screen ticket board: New → Preparing → Ready columns
- [ ] New order sound alert + WebSocket reconnect on drop
- [ ] Card colour by age (green/amber/red vs prep time target)
- [ ] Tap to start preparing, tap to mark ready
- [ ] Per-item mark-done
- [ ] Station filtering (grill, fry, bar, dessert)
- [ ] Expediter screen (full order + station progress)
- [ ] Allergy/special-request highlight in bold colour
- [ ] Sold-out button → immediate WhatsApp menu hide
- [ ] Recall bumped tickets (10-min window)
- [ ] Busy mode: raise quoted prep time for incoming WhatsApp orders
- [ ] 15-second heartbeat → "KDS offline" dashboard alert

### 4.3 Print Agent
- [ ] Lightweight Node.js print agent on local kitchen PC
- [ ] ESC/POS formatting for kitchen tickets and customer receipts
- [ ] Fallback print if KDS misses acknowledgement within 30s
- [ ] Reprint from order history

### 4.4 Real-time Service (Backend)
- [ ] Socket.IO rooms per branch and per station
- [ ] Events: order.created, order.updated, item.sold_out, ticket.created, rider.location
- [ ] KDS heartbeat monitoring + manager alert on miss

---

## 🛵 Phase 5 — Delivery, Reports & Inventory

### 5.1 Delivery Service
- [ ] Delivery zone polygon editor in dashboard (map)
- [ ] Zone-in / out-of-zone check on customer pin
- [ ] Fee rules (flat, per-km, free above basket value)
- [ ] ETA = kitchen prep time + Distance Matrix drive time
- [ ] Rider assignment from dashboard
- [ ] Rider mobile page (address, map button, call customer, Delivered/Cash collected)
- [ ] Cash-per-rider settlement

### 5.2 Reports
- [ ] Sales by day, hour, item
- [ ] Average order value, top items
- [ ] Tips by rider/staff (payout transparency)
- [ ] Payment method breakdown
- [ ] Cancellations report
- [ ] Repeat-customer rate
- [ ] CSV and PDF export
- [ ] Daily sales summary sent to owner (WhatsApp or email each night)

### 5.3 Inventory
- [ ] Ingredients, recipes (per-sale deduction)
- [ ] Low-stock alerts on dashboard and daily summary
- [ ] Wastage log
- [ ] Supplier purchase entries

### 5.4 Promotions
- [ ] Promo code CRUD (rules, usage limits)
- [ ] Free delivery thresholds
- [ ] Happy-hour pricing
- [ ] Broadcast messages to opted-in customers

---

## 🔐 Phase 6 — Testing, Security & Pilot

### 6.1 Security Hardening
- [ ] Meta webhook signature verification
- [ ] Payment webhook signature verification
- [ ] Secrets manager integration (no secrets in repo)
- [ ] WhatsApp + gateway token rotation plan
- [ ] Rate limiting per phone number (bot abuse prevention)
- [ ] COD fake-order blocklist + first-order phone confirmation
- [ ] Customer data privacy: opt-in consent, delete-my-data endpoint
- [ ] Encrypt DB + backups at rest, hash PINs/passwords

### 6.2 Testing
- [ ] Unit tests: pricing, tax, tip, discount, delivery fee, status transitions
- [ ] Integration tests: webhook handling, duplicate messages, payment flows, queue retries
- [ ] End-to-end tests: WhatsApp → KDS → Delivered (per order type and payment method)
- [ ] Load tests: 10× peak simultaneous chats and orders, WebSocket reconnect storms
- [ ] Offline tests: POS and KDS with network cut and restored
- [ ] UAT: Staff dummy service run, 20–30 friends-and-family test orders

---

## 🚀 Phase 7 — Launch & Support

### 7.1 Pre-Launch Checklist
- [ ] Meta Business verified, WhatsApp number live, display name approved
- [ ] All message templates approved by Meta
- [ ] COD flow tested end-to-end, online payment switch present but OFF
- [ ] Menu, prices, photos, tax, delivery zones loaded and owner-checked
- [ ] Printers, KDS screens, POS terminals installed and tested in kitchen
- [ ] Staff trained, role logins created
- [ ] Backups, monitoring (Sentry, Grafana, uptime) and alerts verified
- [ ] Privacy notice and opt-in text approved
- [ ] Rollback plan and on-call contact for first 2 weeks

### 7.2 Launch Day
- [ ] QR codes and posters printed and placed
- [ ] Soft launch monitoring (live orders dashboard open all day)
- [ ] Daily stand-up for 2 weeks post-launch
- [ ] Handover documentation delivered to owner

---

## 📦 Phase 2 Backlog (Post-Launch)
- [ ] Dine-in table QR ordering (WhatsApp flow with table number prefilled)
- [ ] Loyalty points and referral codes
- [ ] Live rider GPS tracking
- [ ] Multi-branch roll-out
- [ ] Supplier purchase orders
- [ ] WhatsApp broadcast campaigns
- [ ] Customer-facing order tracking web page
- [ ] Accounting software integration
- [ ] Analytics dashboard with forecasting
- [ ] JazzCash / Easypaisa / card payment methods (switch on)

---

## 🛠️ Tech Stack Reference

| Layer | Choice |
|---|---|
| Backend | NestJS + TypeScript |
| API Style | REST + Socket.IO |
| Database | PostgreSQL 16 |
| Cache / Queues | Redis 7 + BullMQ |
| ORM | Prisma |
| Frontend | Next.js 15 + TypeScript + Tailwind CSS |
| PWA | Service Worker + Cache API |
| Maps | Google Maps Platform |
| Storage | S3-compatible bucket + CDN |
| Payments | COD → JazzCash / Easypaisa / card (plug-in) |
| Printing | ESC/POS via local print agent |
| Hosting | Hostinger VPS + Docker Compose |
| Monitoring | Sentry + Grafana/Prometheus |

---

*Last updated: Nov 1, 2026 — Phase 1 Foundation LIVE. Database migrated & seeded, API running on port 3001, WhatsApp webhook verification tested & passing.*
