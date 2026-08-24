# Ember & Brew — Café Ordering & Operations Platform

A full-stack Node.js/Express/MongoDB app for a café: customers order online, the
kitchen sees a live prep board, riders manage deliveries, and admins run the
whole thing — with a built-in AI chatbot on every screen that can answer
questions and walk people through the UI.

## Portals

| Portal | URL | Who it's for |
|---|---|---|
| Storefront | `/` | Anyone — browse the menu, add to cart, check out |
| Customer account | `/customer` | Logged-in customers — order history, live tracking, complaints |
| Admin dashboard | `/admin` | Restaurant admin — orders, menu, riders, complaints, revenue |
| Kitchen display | `/kitchen` | Chef/kitchen staff — live ticket board |
| Delivery portal | `/delivery` | Delivery riders — assigned drop-offs, live map |

`/admin`, `/kitchen`, and `/delivery` all share one login page
(`/admin/login`) backed by the same `AdminUser` collection — the `role` field
(`admin` / `chef` / `delivery`) decides which dashboard you land on after
signing in.

## Features

- **Live menu & ordering** — menu loads from `GET /api/menu`; checkout calls
  `POST /api/orders`, which creates a real order (e.g. `EB-1041`) in MongoDB.
- **Real-time updates everywhere** — Socket.IO pushes new orders, status
  changes, and rider location straight to the kitchen board, delivery map,
  and customer tracking view with no polling/refresh needed.
- **Order lifecycle** — `received → preparing → ready → out-for-delivery →
  delivered/completed` (plus `cancelled`), driven by the kitchen and delivery
  portals and reflected live everywhere else.
- **Kitchen display** — a live ticket board grouped by station, with
  `Start Preparing → Ready For Service → BUMP — Served` per ticket, a
  `Bump All Ready` shortcut, and category filter pills.
- **Delivery portal** — shows each rider only their own assigned orders
  (`Out for Delivery` / `Delivered Today`), a live map, and a
  `✅ Mark as Delivered` action. Riders are pinned to one region (see
  `src/data/regions.js`) and auto-assigned orders placed in it.
- **Admin dashboard** — orders, menu management, delivery riders, complaints,
  and revenue/popular-dish stats, all JWT-protected.
- **Complaints** — customers can file complaints from their account; admins
  track and resolve them.
- **"Frequently Paired" upsell** — `GET /api/recommendations/:itemId` reads
  live co-occurrence counts stored on each menu item.
- **AI chatbot on every portal** — a floating chat widget (bottom-right)
  scoped to whoever is logged in:
  - **Customers** — menu/price/availability questions, their own order status
    and history, delivery regions, who's delivering their order.
  - **Chef** — what's next to cook, full prep queue, special instructions
    per order, kitchen busyness.
  - **Delivery riders** — their assigned deliveries, a specific order's
    address, how many they've delivered today — never another rider's data.
  - **Admin** — revenue, pending orders, popular dishes, rider status,
    complaints, region-scoped order lookups (e.g. "what was delivered in D
    Ground?").
  - **"How do I…?" questions are answered with real, numbered UI steps**
    (actual sidebar labels and button text for that portal — e.g. "how can I
    track my order?" walks the customer through the real *Track Order*
    button), not vague explanations.
  - When `ANTHROPIC_API_KEY` is set, the bot is powered by the Claude API
    (`src/Routes/chatbot.js`), grounded on live MongoDB data so it can't
    invent menu items, prices, or order info. **Without a key, it falls back
    automatically to a deterministic keyword-matching engine** — the bot
    never goes silent, it just gets a bit less flexible with phrasing.

## 1. Install dependencies

```bash
npm install
```

## 2. Set up MongoDB

You need a MongoDB instance — either:

- **Local**: install MongoDB Community Server and run it (`mongod`), or
- **Atlas** (free, no local install): create a free cluster at
  https://www.mongodb.com/cloud/atlas and grab its connection string.

Edit `.env` and set `MONGODB_URI` accordingly.

## 3. Configure `.env`

```env
PORT=3000
MONGODB_URI=your-mongodb-connection-string
JWT_SECRET=a-long-random-string        # never reuse an API key here
ANTHROPIC_API_KEY=                     # optional — see below
ANTHROPIC_CHATBOT_MODEL=claude-haiku-4-5-20251001
```

- `JWT_SECRET` signs login tokens for all four portals — must be a private,
  random string, not something reused elsewhere.
- `ANTHROPIC_API_KEY` powers the full natural-language chatbot. Get one at
  https://console.anthropic.com (**Plans & Billing → add credits** — this is
  a separate pay-as-you-go balance from a claude.ai subscription; a
  `"credit balance is too low"` error means that balance is empty, not that
  anything is misconfigured). Leave it blank to run on the rule-based
  fallback instead.

## 4. Seed the database

Creates the menu items and starter "pair count" data for recommendations:

```bash
npm run seed
```

## 5. Run the server

```bash
npm start
```

Then open http://localhost:3000 (or whatever `PORT` you set). Express serves
the frontend from `ember-and-brew/public` and the API from `/api/*` on the
same port, with Socket.IO attached to the same HTTP server for live updates.

### Default logins

On first connect to MongoDB, the server auto-creates one account per role if
it doesn't already exist (see `src/models/AdminUser.js`). **Change all of
these before going anywhere near production:**

| Role | Username | Password | Notes |
|---|---|---|---|
| Admin | `admin` | `ember2024` | Full dashboard access |
| Chef | `chef` | `chef123` | Kitchen display only |
| Delivery | `delivery` | `delivery123` | Pinned to the "Gulberg" region by default |

Customers register their own accounts from `/customer`.

## Project structure

```
server.js                    Express app, static routes, Socket.IO, DB connect
src/Routes/                  API endpoints (menu, orders, auth, chatbot, ...)
src/models/                  Mongoose schemas (Order, MenuItem, AdminUser, ...)
src/data/regions.js          Fixed list of delivery regions
src/seeds.js                 Menu + starter data seeder (npm run seed)
ember-and-brew/public/       Frontend — one folder per portal
  index.html / customer.*    Storefront + customer account
  admin/                     Admin dashboard
  kitchen/                   Kitchen display
  delivery/                  Delivery portal
  chatbot-widget.js          Shared chat widget, dropped into every portal
```

## Notes

### Customer order notifications

Order creation and every customer-facing status transition call
`src/services/notificationService.js`. Web push is opt-in at checkout and uses
Firebase Cloud Messaging; its browser token is stored with the order, so guest
checkout works too. Copy the Firebase variables from `.env.example` into the
deployment environment, including either the server credential variables or
`FIREBASE_SERVICE_ACCOUNT_JSON`.

WhatsApp is optional and uses Twilio when its `TWILIO_*` variables are
configured. Set `TWILIO_WHATSAPP_CONTENT_SID` to an approved template whose
variables `{{1}}` and `{{2}}` are the title and message body; this is required
for proactive WhatsApp updates outside the customer chat window.

- The order status flow is `received → preparing → ready → out-for-delivery
  → delivered → completed` (`cancelled` also exists in the schema).
- `npm run seed` wipes and re-inserts menu items (not orders or accounts).
- Delivery regions are defined in `src/data/regions.js` — only an admin can
  add new ones or reassign a rider's region.
- If you see `Socket connected: <id>` / `Socket disconnected: <id>` in the
  server logs, that's just Socket.IO logging each portal tab that opens or
  closes a live-update connection — normal, not an error.

  # 🚀 Deployment

The Restaurant Management System has been successfully deployed on **Vercel**.

## Live Application

Frontend + Backend (Full Application):

https://admin-restaurant-six.vercel.app

## Backend API

Menu API Endpoint:

https://admin-restaurant-six.vercel.app/api

## Deployment Details

* Frontend and backend are deployed together on the same Vercel project.
* All existing `/api/*` routes work correctly without additional CORS configuration.
* Deployment has been verified successfully.
* Both frontend and backend endpoints return HTTP 200 status codes.

The live application provides access to all major modules:

* Customer Portal
* Admin Dashboard
* Kitchen Management Portal
* Delivery Management Portal
* Restaurant API Services
