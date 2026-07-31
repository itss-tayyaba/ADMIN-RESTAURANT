# Ember & Brew — Full Stack (Node.js + Express + MongoDB)

This project already had a complete Node/Express/MongoDB backend (`server.js`, `src/Routes`,
`src/models`) sitting alongside the frontend — it just wasn't wired up. The frontend was
running entirely on hardcoded/mock data. It's now connected end-to-end:

- **Menu** — the page loads items and categories from `GET /api/menu` and
  `GET /api/menu/categories` instead of a hardcoded array.
- **Cart & Checkout** — placing an order calls `POST /api/orders`, which saves a real
  order document in MongoDB and returns an order number (e.g. `EB-1041`).
- **Order tracking** — the tracking page polls `GET /api/orders/:id` every 5 seconds, so it
  reflects real status changes made from the admin board (no more fake auto-progress timer).
- **Admin login** — `POST /api/auth/login` checks credentials against the `AdminUser`
  collection and returns a JWT, used to authorize the orders API.
- **Admin board** — fetches real orders via `GET /api/orders` (JWT-protected) and updates
  status via `PUT /api/orders/:id/status`.
- **"Frequently Paired" upsell** — now calls `GET /api/recommendations/:itemId`, which reads
  co-occurrence counts stored on each menu item in MongoDB, instead of a static lookup table.

## 1. Install dependencies

```bash
npm install
```

## 2. Set up MongoDB

You need a MongoDB instance — either:

- **Local**: install MongoDB Community Server and run it (`mongod`), or
- **Atlas** (free, no local install): create a free cluster at
  https://www.mongodb.com/cloud/atlas and grab its connection string.

Edit `.env` and set `MONGODB_URI` accordingly (a local default is already filled in).

## 3. Seed the database

This creates the 24 menu items, an admin user, and some starter "pair count" data so
recommendations work right away:

```bash
npm run seed
```

Admin login created: **username `admin`, password `ember2024`** — change this in
production.

## 4. Run the server

```bash
npm start
```

Then open http://localhost:3000 (or whatever `PORT` you set). The Express server serves
the frontend from `ember-and-brew/public` *and* the API from `/api/*` on the same port.

## Notes

- `JWT_SECRET` in `.env` should be changed to a long random string for anything beyond
  local testing.
- The order status flow is `received → preparing → ready → completed` (there's also a
  `cancelled` state in the schema, not currently exposed in the UI).
- If `npm run seed` is re-run, it wipes and re-inserts menu items and the admin user
  (not orders).
