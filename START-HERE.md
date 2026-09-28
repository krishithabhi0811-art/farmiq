# 🌱 FARM-IQ — START HERE

Your app is **built, deployed and tested**. Everything below is live right now.

---

## 🔗 Your three links

| What | Link |
|---|---|
| **Your app (share this with farmers)** | **https://farmiq-flax.vercel.app** |
| Backend health check | https://farmiq-api-y3sj.onrender.com/api/health |
| Code repository | https://github.com/krishithabhi0811-art/farmiq |

Open the app link on your phone → tap **Create account** → you're in. 🎉

> **These links never change.** Every future fix or feature is shipped **to the same two
> addresses** — you never have to re-share a new link with farmers. To check which version
> you are looking at: open the app → **Profile** → the small line at the bottom
> (`FARM-IQ · build <commit> · <time>`).

---

## ✅ What was tested before handing over

* **40 automated end-to-end tests** pass against the live deployment (signup, login,
  wrong password rejected, session works, create/read/update/delete records, data really
  persists in Postgres, user A can never see or delete user B's data, soil maths, saved
  soil tests, AI chat, AI summary, AI in Hindi/Telugu, camera-scan input validation,
  and the whole field-camera flow: device key issued → camera uploads a photo → farmer
  sees it → AI reads it → delete).
* **Database:** 6 tables created for you automatically (`profiles`, `items`, `soil_tests`,
  `ai_messages`, `cameras`, `camera_photos`), Row Level Security ON, 21 policies.
  Proven: the public anon key can read **0 rows** — nobody can peek at your farmers' data
  or at your camera keys.
* **Secrets:** the live browser bundle was downloaded and scanned — no API keys, no
  database keys, no tokens found. They live only in `server/.env` (and in Render's env vars).
* **CORS:** only your Vercel domain (and any `*.vercel.app`) may call the API. Verified.
* **Camera scan:** tested with a real leaf photo → AI returned a proper diagnosis in ~12s.

---

## 🧭 How to use the app

| Screen | What it does |
|---|---|
| **Dashboard** | Totals for records, acres, expected yield, what needs attention |
| **My Farm** | Add / edit / delete your crops, soil tests, pests, irrigation, expenses. Search and filter. Attach a photo. Tap **AI summary** to get a summary saved onto that record |
| **Ask AI** | Chat in simple words. Choose a mode: ask anything, action plan, fertiliser plan, pest help, selling help, crop calendar. Ask in English, हिन्दी or తెలుగు — it answers in the same language |
| **Soil Health** | Type your soil test numbers (pH, EC, N, P, K, organic carbon) → fertility score + exactly how much urea / DAP / MOP to use for your crop and acreage, plus cheap organic-first advice. One tap gives an AI explanation. Save tests to compare over seasons |
| **Crop Scan** | Opens the phone camera → snap a leaf → AI tells you what is wrong and what to do in 48 hours |
| **Camera (field cameras)** | Connect a camera that stays in your field (or an old phone in *camera mode*). It uploads photos on a timer by itself; you open them here: gallery, timelapse playback, and an **AI reading** of any photo |
| **Profile** | Change name, village, land size, language and password |

**Language:** tap the globe icon (top right) any time.

---

## 📷 Put a camera in your field (5 minutes)

1. In the app open **Camera** → tab **My cameras** → **Add camera** (name it *North field*).
   The app then shows you the **camera ID** and a **camera key** (starts with `fqcam_`) —
   that key is what lets the camera upload without anyone logging in.
2. Pick the way that suits you:
   * **Old Android phone (₹0)** — open the phone's browser, log in once, tap the camera card →
     **Camera mode**, choose the interval, and leave the phone in the field on charge.
     It keeps taking and uploading photos by itself (the screen stays awake).
   * **ESP32-CAM board (₹300–500)** — flash the ready-made sketch from
     [`docs/FIELD-CAMERA.md`](docs/FIELD-CAMERA.md) and it runs 24×7 on a battery/solar.
   * **Raspberry Pi / IP camera** — the same guide has a cron + Python script and a plain
     `curl` recipe (one line, no coding).
3. Press **Test connection** in the app to see it work, then open the camera card any time to
   browse the photos. Tap a photo → **AI reading** to have Gemini explain the field.

Full step-by-step with wiring, battery notes and what to do when a photo doesn't arrive:
**[`docs/FIELD-CAMERA.md`](docs/FIELD-CAMERA.md)**.

---

## 🔐 Keep these secret

These are in `server/.env` and in Render's environment variables. **Never** paste them into
the frontend, into GitHub, or into a chat.

* Supabase `service_role` key (full database access)
* Supabase access token `sbp_…`
* Gemini API key `AQ.…`
* `JWT_SECRET` (it signs everyone's login session)
* GitHub / Render / Vercel tokens

If you ever think one leaked, rotate it: Supabase → Settings → API (reset service key),
aistudio.google.com (new key), and GitHub/Vercel/Render settings (revoke + new token).

The frontend only knows one thing: the address of its own backend. That's why it's safe.

---

## 🛠️ How to change something and ship it

One command does everything — commit, push, backend, frontend, tests — and keeps the
**same URLs**:

```bash
cd ~/farmiq
bash ship.sh "what I changed"
```

What it does, in order:

1. **GitHub** — commits and pushes the code.
2. **Backend (Render)** — triggers a deploy and waits until it is live at
   `https://farmiq-api-y3sj.onrender.com`.
3. **Frontend (Vercel)** — rebuilds and uploads, then **pins the stable address
   `farmiq-flax.vercel.app` to the new build** (that pinning is what makes the URL
   permanent) and verifies the live site is really serving the newest bundle.
4. **Tests** — runs the 40 live end-to-end tests and prints the result.

At the end you get a short summary with the two URLs and the commit that is live.
Your tokens live in `.deploy.env` (git-ignored, never pushed).

The same steps by hand, if you ever prefer them:

```bash
cd ~/farmiq && git add -A && git commit -m "my change" && git push

cd server && set -a && . ./.env && set +a && . ./.deploy.env 2>/dev/null; set +a
RENDER_API_KEY=$RENDER_API_KEY node scripts/deploy-render.js     # service settings

cd ../client && npm run build && VERCEL_TOKEN=$VERCEL_TOKEN API_URL=https://farmiq-api-y3sj.onrender.com npm run deploy
```

> **Why the URL is stable:** the Vercel deploy script assigns the domain
> `farmiq-flax.vercel.app` to every new production deployment (step 3 above) and then
> downloads the live page to confirm it serves the new bundle. On Render the service
> URL is permanent by design. If you ever connect GitHub inside Vercel, automatic
> builds will also keep the same domain — no new links either way.

## ⏰ One thing to know about Render's free plan

The backend **sleeps after ~15 minutes** with no visitors. The next visit takes about
30–60 seconds to wake it up (the app shows a friendly "server may be waking up" message
instead of logging you out). After that it's instant. If that ever annoys you, Render's
paid tier ($7/mo) keeps it always-on.

---

## 🧱 What's inside (for your own reference)

```
farmiq/
├── client/     ← what farmers see: React + Vite + Tailwind (light theme, glassmorphism,
│                 bottom nav on phones, camera, 3 languages)
└── server/     ← the brain: Express API + Supabase + Gemini. ALL keys live here.
     ├── src/routes/    auth · items (CRUD) · ai · soil · cameras
     ├── src/lib/       supabase.js · gemini.js (multi-model fallback, never leaves a farmer waiting)
     ├── db/schema.sql  tables + RLS  (applied for you already)
     └── scripts/       db:setup · db:verify · smoke · deploy-render
```

Test everything any time — it's safe (it creates its own throwaway users and deletes them):

```bash
cd server && npm run smoke -- https://farmiq-api-y3sj.onrender.com
npm run db:verify
```

*Made for farmers. 🌾*
