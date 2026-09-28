# 🌱 FARM-IQ — Farmer Friendly Agriculture App

A simple, beautiful, production-ready full-stack app for small farmers.
Track crops, check **soil fertility**, **scan plant photos** with the camera, and get
**AI advice in English / हिन्दी / తెలుగు** — on any phone.

> **Security first:** every secret key lives **only** in `server/.env`.
> The browser bundle (`client/`) never contains an API key. `.env` is git-ignored.

---

## ✨ What it does

| Area | Details |
|---|---|
| **Auth** | Email + password, hashed with **bcrypt**, JWT session saved in the browser → stays logged in across refresh and works cross-device |
| **Farm records (CRUD)** | Add / see / edit / delete your own crops, soil notes, pests, irrigation, expenses. Search + filter, photo attach, expected yield, area |
| **Soil fertility** | Enter soil-test values (pH, EC, N, P, K, organic carbon) → fertility score 0-100, per-nutrient rating, and an exact **urea / DAP / MOP kg plan** for your crop and acreage, plus organic-first advice |
| **Crop scan** | Live camera (`getUserMedia`) or photo upload → Gemini reads the leaf photo and gives a 5-bullet diagnosis and 48-hour action |
| **AI assistant** | `POST /api/ai/generate` — 6 modes: ask anything, action plan, fertiliser plan, pest help, selling help, crop calendar. Answers in the farmer's language |
| **Multilingual** | English, Hindi, Telugu UI + AI replies; language saved to the profile |
| **Dashboard** | Totals, area, expected yield, at-risk count, category chart, recent records, tips |
| **UI** | Light theme `#F8FAFC`, white cards, glassmorphism, soft shadows, big touch targets, bottom nav on phones, side nav on desktop |

---

## 🧱 Stack

```
farmiq/
├── client/                 # React + Vite + Tailwind  (what users see)
│   ├── src/pages/          # Landing, Login, Signup, Dashboard, Records, Assistant, Soil, Scan, Profile
│   ├── src/components/     # Layout shell, UI kit (icons, modal, toasts, charts)
│   ├── src/context/        # AuthContext (session)
│   ├── src/lib/api.js      # the ONLY place that talks to the backend
│   └── vercel.json         # SPA rewrite + /api proxy to Render
├── server/                 # Node + Express  (the brain — all secrets here)
│   ├── src/routes/         # auth.js, items.js, ai.js, soil.js
│   ├── src/middleware/     # JWT auth, validation
│   ├── src/lib/supabase.js # service_role client (server only)
│   ├── db/schema.sql       # tables + indexes + RLS policies
│   └── scripts/            # bootstrap-db.js, verify-db.js, smoke-test.js
├── render.yaml             # one-click backend blueprint
└── .gitignore              # hides .env, node_modules, dist
```

* **Frontend:** React 18, Vite, Tailwind CSS, React Router
* **Backend:** Node 18+, Express, bcryptjs, jsonwebtoken, express-rate-limit
* **Database:** Supabase (Postgres) with Row Level Security
* **AI:** Google Gemini — called **from the backend only**

---

## 🚀 Run it locally

```bash
# 1. backend
cd server
cp .env.example .env      # fill in Supabase + Gemini keys
npm install
npm run db:setup          # creates all tables + RLS automatically
npm run db:verify         # proves tables, RLS and anon-key blocking work
npm start                 # http://localhost:5000

# 2. frontend (new terminal)
cd client
cp .env.example .env      # leave VITE_API_BASE_URL empty for local dev
npm install
npm run dev               # http://localhost:5173  (proxies /api → :5000)
```

Test the whole API end to end (signup → CRUD → AI → isolation → cleanup):

```bash
cd server && npm run smoke
```

---

## 🔑 Environment variables

### `server/.env` (SECRET — never committed)

| Key | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | same page → `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → `service_role` key |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database → Connection string → password (needed once, to create tables) |
| `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey |
| `JWT_SECRET` | any long random string |
| `CLIENT_URL` | frontend URL, used for CORS (comma-separated for many) |

### `client/.env` (PUBLIC — safe to ship)

| Key | Value |
|---|---|
| `VITE_API_BASE_URL` | backend URL e.g. `https://farmiq-api.onrender.com` (leave empty in dev) |

---

## 🗄️ Database (created automatically)

`npm run db:setup` connects with the database password and applies `server/db/schema.sql`:
enables `uuid-ossp`, creates `profiles`, `items`, `soil_tests`, `ai_messages`, indexes,
an `updated_at` trigger, **enables RLS on every table** and creates the policies:

* users can `SELECT` / `UPDATE` **only their own profile**
* users can `SELECT` / `INSERT` / `UPDATE` / `DELETE` **only their own items and soil tests**

The backend uses the `service_role` key and scopes every query by the logged-in `user_id`,
so a leaked anon key can read **nothing** — `npm run db:verify` proves it.

---

## 🌐 API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | status + which integrations are configured |
| POST | `/api/auth/signup` | create account (bcrypt) |
| POST | `/api/auth/login` | log in → JWT |
| GET | `/api/auth/me` | session check (works cross-device) |
| PATCH | `/api/auth/me` | update profile / change password |
| GET/POST | `/api/items` | list (search, filter, paginate) / create |
| GET/PATCH/DELETE | `/api/items/:id` | read / update / delete one (own only) |
| GET | `/api/items/stats/summary` | dashboard totals |
| POST | `/api/ai/generate` | **Gemini** — chat, plan, summary, photo |
| POST | `/api/ai/scan` | photo → crop diagnosis |
| POST | `/api/ai/summarize` | summarize a record and save it back |
| GET | `/api/soil/crops` | crop nutrient requirement table |
| POST | `/api/soil/fertility` | fertility score + fertiliser plan |
| GET/POST/DELETE | `/api/soil/tests[/:id]` | saved soil tests |
| POST | `/api/soil/plan` | AI worded plan for a saved test |

---

## ☁️ Deploy

**Backend → Render**
1. New + → **Blueprint** → pick this repo (`render.yaml` is read automatically), **or**
   New + → Web Service → root directory `server`, build `npm install`, start `npm start`.
2. Add env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_DB_PASSWORD`, `GEMINI_API_KEY`, `JWT_SECRET`, `CLIENT_URL`.
3. Health check path: `/api/health`.

**Frontend → Vercel**
1. Import this repo, **root directory = `client`**, framework **Vite**.
2. Env var: `VITE_API_BASE_URL = https://<your-render-service>.onrender.com`
3. Deploy. `vercel.json` already rewrites all routes to `index.html` for the SPA.

**After both are live**
* Put the Vercel URL into the backend's `CLIENT_URL` (fixes CORS — the server also
  allows any `*.vercel.app` preview automatically).
* Run `npm run smoke -- https://<your-render-service>.onrender.com` to prove production works.

---

## 🛡️ Safety notes

* Passwords: bcrypt (10 rounds) — plain text is never stored or logged.
* Secrets: only in `server/.env`, never sent to the client, never in the repo.
* Rate limits: 60 auth attempts / 15 min, 20 AI requests / min.
* Every `/api/items`, `/api/soil` and `/api/ai` route requires a valid session token.
* AI output is advisory — the UI tells farmers to confirm chemical doses locally.

*Made for farmers. 🌾*

---

## 🤖 Deploy scripts (what was actually used to ship this)

Both scripts are idempotent — run them again any time you change something.

```bash
# backend → Render   (creates/updates the web service + env vars)
cd server
set -a && . ./.env && set +a
RENDER_API_KEY=rnd_… CLIENT_URL=https://your-app.vercel.app node scripts/deploy-render.js

# frontend → Vercel  (builds client/dist and uploads it as a production deployment)
cd ../client
npm run build
VERCEL_TOKEN=vcp_… API_URL=https://your-service.onrender.com node scripts/deploy-vercel.js
```

**Why the frontend is uploaded as a pre-built bundle:** this Vercel account has no
GitHub integration installed, so a git-linked build isn't possible. Instead the built
`dist/` is uploaded and a `vercel.json` proxies `/api/*` to the Render backend — which
also means the browser only ever talks to its own origin, so there is no CORS at all.

**Live URLs**

| | |
|---|---|
| Frontend | https://farmiq-flax.vercel.app |
| Backend  | https://farmiq-api-y3sj.onrender.com/api/health |
| Repo     | https://github.com/krishithabhi0811-art/farmiq |

> Render's free tier sleeps after ~15 minutes of no traffic; the first request after
> that can take 30-60 seconds to wake up. Everything after that is instant.
