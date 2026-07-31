# Putting StockScope on your phone (deploy guide)

Goal: get StockScope onto your phone as a real app — own icon, full screen, its own notifications.

You don't install from an app store. StockScope is a website, but a modern phone can "Add to Home
Screen" and from then on it opens like any other app (no browser bar, works from the icon). The UI is
already built for a phone — full-screen, dark status bar, and it clears the notch and home-bar.

**There are two honest ways to run it. Pick based on what you need:**

| What | **A — Free, on your own phone** (Termux) | **B — ~$5/month cloud** (Railway) |
| --- | --- | --- |
| Cost | ₹0 | ~$5/mo |
| Use the app (search, charts, analysis) | ✅ Fully | ✅ Fully |
| Alerts while the app is **closed for days** | ⚠️ Only while Termux is running | ✅ 24/7, reliably |
| Setup | Install one app, run 3 commands | Push to GitHub, click through a host |
| Where your data lives | Only on your phone | On the server |

If you mainly want to **open the app and analyze stocks for free**, do **Option A**. If you want the
server to **watch your list and ping you even with the phone in your pocket for days**, that needs an
always-on machine — **Option B**. You can start with A and move to B later; nothing is wasted.

---

## Option A — Free: run it on your Android phone itself (Termux)

This runs the whole app *on your phone*. No cloud, no cost, nothing leaves the device. The catch is
honest and simple: **the app only serves while Termux is running.** Great for opening it whenever you
want to analyze a stock; not reliable for "notify me while I haven't opened it for three days" (Android
will eventually reclaim the process). For that, use Option B.

> iPhone note: this is **Android only** — iOS has no Termux equivalent. On iPhone, use Option B.

### 1. Install Termux (from F-Droid, **not** the Play Store)
The Play Store build is old and broken. Get it free from F-Droid:
<https://f-droid.org/en/packages/com.termux/> → Download → install (you'll allow "install from this
source" once).

### 2. Install Node and git
Open Termux and run:
```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs git
```
Use `nodejs` (Termux's current build is Node 24) — **not** `nodejs-lts`. The app relies on Node's
built-in SQLite, which the current build has switched on and older ones don't. Check with `node -v`
(you want **v22 or newer**, ideally 24).

### 3. Get the code onto the phone
Easiest if you've pushed it to GitHub (see Option B, step 1 — the same repo works for both):
```bash
git clone https://github.com/YOUR-USERNAME/stockscope.git
cd stockscope
```
(No GitHub? You can also copy the project folder onto the phone and `cd` into it — but cloning is
simpler.)

### 4. Build and start it
```bash
npm install
npm run build
npm start
```
`npm install` and `npm run build` are the slow, heavy steps on a phone — give them a few minutes and
keep ~1.5 GB free. You only do them **once** (and again only when the code changes). When it prints
`Ready`, leave Termux open.

### 5. Keep Android from killing it
Before starting (or in a second Termux session), run:
```bash
termux-wake-lock
```
Then, in Android **Settings → Apps → Termux → Battery → Unrestricted**. This stops the system putting
the server to sleep the moment you switch away.

### 6. Open it and install to your home screen
1. Open **Chrome on the same phone** and go to **`http://localhost:3000`**.
   (`localhost` counts as secure, so install and notifications both work — no HTTPS needed here.)
2. Chrome **⋮ menu → Add to Home Screen** (or "Install app"). Open it from the new icon — full screen.
3. Open any stock → **Price alerts → Enable notifications → allow → Send test.**

### 7. Using it day to day
- To reopen after a reboot: launch **Termux**, then `cd stockscope && npm start`. No rebuild needed.
- After a code change: `git pull && npm install && npm run build && npm start`.
- The app icon on your home screen always points at the local server; it just needs Termux running.

**What Option A does and doesn't do — plainly:**
- ✅ Free, private (all on-device), and the full app works: search, charts, the auto-updating report,
  watchlist, backtests, the Special list.
- ✅ Alerts fire fine **while Termux is running** (wake-lock on).
- ⚠️ If you swipe Termux away, reboot, or Android reclaims it under memory pressure, the server stops
  and alerts pause until you reopen Termux and run `npm start` again.
- ℹ️ Prices are ~15 min delayed (Yahoo) — correct and sufficient for weeks-to-weeks trading.

If that "notify me even when I haven't opened it in days" reliability matters to you, that genuinely
needs an always-on machine — which is Option B.

---

## Option B — ~$5/month: always-on cloud so alerts reach you 24/7

Choose this if you want the server watching your list and pushing you **with the app fully closed, for
days**, on **iPhone or Android**.

### What the hosting needs (and why free tiers won't do)

Three hard requirements, because of how alerts work:

1. **HTTPS** — phone push notifications only work over `https://` (not plain `http://`).
2. **Always on** — a background job re-checks your watchlist every 15 minutes. If the server "sleeps"
   when idle, alerts stop. **This rules out free tiers** (Render Free, Vercel Hobby, etc. — they sleep
   or don't run a persistent background process).
3. **A persistent disk** — your watchlist, alerts, and login live in a small database file. Without a
   saved disk, a redeploy wipes them.

So you want a small **always-on container with a volume**. Realistic cost: **~$5/month**. That's the
honest price of "alerts reach my phone reliably." (Everything still runs free on your laptop for
testing — this is only for the phone.)

Recommended host: **Railway** (simplest). Alternatives that also work: **Fly.io**, **Render** (paid
"Starter" instance, not the free one).

---

## Step-by-step: Railway

### 1. Put the code on GitHub
Railway deploys from a GitHub repo.
- Create a free account at <https://github.com> if you don't have one.
- Make a new **private** repository (e.g. `stockscope`).
- Push this project to it. (Ask me — I can set up git and push it for you in one step.)

### 2. Create the Railway project
- Sign up at <https://railway.app> (log in with GitHub).
- **New Project → Deploy from GitHub repo → pick `stockscope`.**
- Railway auto-detects the `Dockerfile` in this project and starts building. No build config needed.

### 3. Add the persistent disk
- In your service → **Variables/Settings → Volumes → New Volume.**
- **Mount path:** `/data`  → Create. (The app is already set up to use `/data`.)

### 4. Set the environment variables
In the service → **Variables**, add these four (copy exactly):

```
STOCKSCOPE_DB_PATH=/data/stockscope.db
STOCKSCOPE_VAPID_PATH=/data/vapid.json
STOCKSCOPE_AUTH_PATH=/data/auth.json
NODE_ENV=production
```

That's it — the app generates its own notification keys and session secret into `/data` on first run,
and because `/data` is a saved disk, they survive every redeploy. **No keys to create by hand.**

### 5. Get your URL and deploy
- In **Settings → Networking → Generate Domain.** You'll get something like
  `https://stockscope-production.up.railway.app`.
- Railway redeploys automatically. Wait for "Success."

### 6. Use it on your phone
1. Open the `https://…` URL in your phone's browser.
2. **Add to Home Screen** (Share menu on iPhone; ⋮ menu on Android). Open it from the new icon.
3. Open any stock → **Price alerts → Enable notifications** → allow.
4. Add an alert (breakout / breaks stop / score / move %). **Send test** to confirm a push lands.
5. Done. Now the server watches your list every 15 minutes and pings you — app closed or not.

---

## Optional: turn on "Sign in with Google"

Only needed if you want your watchlist/alerts to follow you across devices. Skip it and the app works
fine on per-device identity.

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID → Web application.**
2. **Authorised redirect URI:** `https://YOUR-RAILWAY-URL/api/auth/callback/google`
3. Add three more Railway variables:
   ```
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   AUTH_URL=https://YOUR-RAILWAY-URL
   ```
4. Redeploy. The **Sign in** button now works.

---

## Notes & gotchas
- **iPhone push** needs iOS 16.4+ and the app **added to the Home Screen** (Safari won't push from a
  normal tab). Android/Chrome pushes from a tab too, but Home Screen is nicer.
- **First alert scan** runs ~30s after the server boots, then every 15 minutes
  (`ALERT_INTERVAL_MS` to change).
- **Data still ~15 min delayed** (Yahoo) — correct and sufficient for weeks-to-weeks trading.
- **Keep it cheap:** one small always-on instance is enough; you don't need scaling.
- If a redeploy ever seems to "forget" your data, check the **volume is still mounted at `/data`** and
  the three `STOCKSCOPE_*` variables are set.
