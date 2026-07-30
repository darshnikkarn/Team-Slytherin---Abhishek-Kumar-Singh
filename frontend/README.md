# Study Planner Agent — Frontend

React + Vite + Tailwind. Talks to the FastAPI backend in `../backend`.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Sign in with the seeded demo account
(`demo@student.edu` / `demo1234`) after running `python seed.py` in the backend.

**You do not need a `.env` for local development.** `vite.config.js` proxies
`/api` to `http://127.0.0.1:8000`, so the browser sees a same-origin request and
CORS never enters the picture. Start the backend first:

```bash
cd ../backend && uvicorn app.main:app --reload
```

The login screen pings `/api/health` and tells you plainly if the backend is
unreachable, so you never have to guess whether it's a code problem or a
"forgot to start the server" problem.

## Pages

| Route | What it does |
|---|---|
| `/` | Dashboard — one call to `/insights/dashboard`: today's blocks, deadlines, capacity vs demand, risk table, triage, attendance flags, progress |
| `/planner` | Week grid with study blocks laid around your real classes. Accept / reject / move each suggestion, "Accept all", replan, and a **Why?** panel per block |
| `/assignments` | Assignment CRUD + syllabus import (PDF drop or paste) with a confirmation table showing evidence, confidence and needs-review flags |
| `/timetable` | Courses (priority, attendance) and the weekly class grid, plus the free-capacity bar chart the scheduler actually sees |
| `/progress` | Planned vs actual chart, adherence, streak, estimation calibration, per-course time, at-risk list |
| `/settings` | The six objective-weight sliders, availability, block shape, and the biases the agent has learned from your rejections |

## The two screens that win the judging

**Planner → Why?** Opens `/api/blocks/{id}/explain` and renders the actual
arithmetic: each of the six factors, its normalised value, the weight applied,
and the contribution — plus a live check that the contributions sum to the
reported score. That check is the point. It is what separates an explanation
from a plausible story generated after the fact.

**Settings → weights.** Push *deadline pressure* to 1.00, everything else to
0.00, hit **Rebuild plan**, and the schedule collapses to earliest-deadline-first.
Thirty seconds, and nobody can claim the knobs are decorative.

## Deploying to Vercel

Deploy the **backend to Render first** — you need its URL.

1. Push the repo to GitHub.
2. Vercel → **Add New → Project** → import the repo.
   - **Root Directory:** `frontend`
   - Framework preset, build command and output directory are picked up from
     `vercel.json`. Leave them.
3. **Environment Variables** → add:

   | Name | Value |
   |---|---|
   | `VITE_API_URL` | `https://your-api.onrender.com` — no trailing slash, no `/api` |

4. Deploy.
5. Go back to Render and set `CORS_ORIGINS` to your Vercel URL
   (e.g. `https://study-planner-agent.vercel.app`), then redeploy the backend.
   `CORS_ORIGIN_REGEX` in `render.yaml` already covers Vercel preview URLs, whose
   subdomain changes on every push.

### Two things that will bite you

- **`VITE_API_URL` is baked in at build time**, not read at runtime. Changing it
  in the Vercel dashboard does nothing until you **redeploy**.
- **Render's free tier sleeps after ~15 minutes idle** and takes 30–60s to wake.
  The first request after a nap looks exactly like a broken deployment. Before
  demoing, open `https://your-api.onrender.com/api/health` once, or point a free
  uptime pinger (cron-job.org) at it every 10 minutes.

## Notes

- **Datetimes.** The backend stores naive local times. `toISOString()` would
  append `Z` and shift every block by the UTC offset — 5h30m in IST, which
  silently corrupts an entire plan. `src/services/api.js` exports `toNaiveISO`
  and everything that writes a datetime goes through it.
- **No client cache.** `useApi` refetches after every mutation. With a handful
  of screens, a cache buys little and creates a way for the UI to disagree with
  the server — the last thing you want in an app that argues about time.
- **401 handling.** Any expired-token response fires a global event; `AuthContext`
  catches it, clears the token and returns you to the login screen, rather than
  leaving a half-authenticated UI.
