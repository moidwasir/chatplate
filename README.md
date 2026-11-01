# 🍽️ ChatPlate

*Your restaurant, on WhatsApp.* A WhatsApp ordering system for restaurants: customers order by chat, staff manage orders on a live dashboard.

> **First client:** Safi Food & Beverage (Safi Restaurant)  
> **Architecture:** Modular Monolith (NestJS + Socket.IO + Next.js + PostgreSQL + Redis)  
> **Task Sheet:** See [TASKSHEET.md](./TASKSHEET.md) for full roadmap, live progress & sprint deliverables.  
> **Current Status:** See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for what's built, how to run it, API reference & known issues.

---

## 📁 Repository Structure

```
├── TASKSHEET.md             # 📋 Full project roadmap & live task tracking
├── apps/
│   ├── api/                 # ⚙️ NestJS backend (REST, WebSockets, BullMQ, Prisma)
│   ├── dashboard/           # 📊 Management Dashboard (Next.js 15, Tailwind CSS)
│   ├── pos/                 # 💳 Point of Sale PWA (Cashier terminal)
│   ├── kds/                 # 👨‍🍳 Kitchen Display System (Full-screen kiosk)
│   └── rider/               # 🛵 Rider mobile web interface
├── packages/
│   ├── types/               # 🧩 Shared domain models, Zod schemas, Socket events
│   ├── ui/                  # 🎨 Shared React component library
│   └── whatsapp/            # 💬 WhatsApp Cloud API message builders
└── infra/
    ├── docker-compose.yml   # 🐳 PostgreSQL 16 (Port 5433) + Redis 7 (Port 6379)
    └── nginx/               # 🌐 Reverse proxy configuration
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js**: v20+ (v24 tested)
- **pnpm**: v11+
- **Docker Desktop**: running

### 2. Start Services (PostgreSQL + Redis)
```bash
docker compose -f infra/docker-compose.yml up -d postgres redis
```

### 3. Run Migrations & Seed
```bash
pnpm --filter @safi/api prisma migrate dev
pnpm --filter @safi/api prisma db seed
```

### 4. Start Backend API
```bash
cd apps/api
pnpm dev
# API running at http://localhost:3001
# Health: http://localhost:3001/v1/health
# Menu: http://localhost:3001/v1/menu?branchId=seed-branch-001
```

---

## 📌 Development Plan & Documentation
- **Task Sheet**: [`TASKSHEET.md`](./TASKSHEET.md)
- **Original Plan**: `WhatsApp Restaurant Ordering System – Full Development Plan.md`

