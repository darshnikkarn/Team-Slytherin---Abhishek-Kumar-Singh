# Chipper — an AI study planner that tells you the truth

**Team Slytherin**

Students receive syllabi, deadlines, attendance rules and exam dates across a
dozen places. Chipper ingests all of it and produces a weekly plan that fits
their *actual* free time — and rebuilds that plan when deadlines or progress
change.

The part that makes it different: **when the week does not fit, Chipper says so.**
Most planners quietly drop work or spread it thinner. Chipper computes whether a
feasible schedule exists at all, and when one doesn't, it says which items to
shed and what each will cost you.

| | |
|---|---|
| **Live app** | https://team-slytherin-abhishek-kumar-singh-i7hismg1c-slytherin3.vercel.app/login |
| **Live API** | https://team-slytherin-abhishek-kumar-singh-2.onrender.com/api/health |
| **API docs** | https://team-slytherin-abhishek-kumar-singh-2.onrender.com/docs |
| **Demo login** | `demo@student.edu` / `demo1234` |

> The API is on a free tier and sleeps after 15 minutes idle. The first request
> after a nap takes 30–60 seconds. Open `/api/health` once before demoing.

---

## The one design decision that matters

**The LLM never decides when you study.**

| Layer | Responsibility | How |
|---|---|---|
| `backend/app/ai/scheduler.py` | *When* — placement, constraints, feasibility | Deterministic. No network. 19 unit tests. |
| `backend/app/ai/syllabus_parser.py` | *What exists* — reading messy documents | Gemini + regex, cross-checked against each other |
| `backend/app/ai/planner_agent.py` | Orchestration and narration | Gemini, read-only over a finished plan |

Consequences:

- Class times, daily caps and deadlines **cannot** be hallucinated away.
- The plan is reproducible — same inputs, same output, every time.
- `GET /api/blocks/{id}/explain` returns the *actual arithmetic* the engine used,
  not a story written afterwards.
- Pull the API key and the product still works. It degrades; it doesn't break.

---

## How the scheduler decides

### Placement

Chronological greedy dispatch over free time. At each cursor position `t`:

```
a* = argmax_{a ∈ Eligible(t)}  Σ_k  w_k · f_k(a, t)
```

`Eligible(t)` enforces the hard constraints. The six factors `f_k` are
normalised to `[0,1]`; the weights `w_k` are the user's, editable in Settings and
returned with every plan.

| Factor | Measures |
|---|---|
| `deadline_pressure` | Feasibility ratio (below), blended 65/35 with time decay |
| `grade_impact` | `min(1, grade_weight / 25)` — saturating |
| `user_priority` | Per-course importance multiplier |
| `energy_match` | Task difficulty vs. the energy level of that time slot |
| `neglect` | Anti-starvation: `1 − e^(−days_since_touched / 5)` |
| `spacing` | Distributed practice for exams, momentum for project work |

Set `weight_deadline_pressure = 1` and the rest to `0` and the rule reduces to
earliest-deadline-first. There's a test that asserts exactly that.

### Feasibility — the interesting part

The useful quantity is not "days until the deadline", it's **slack** — and the
correct slack is the cohort version from the single-machine feasibility theorem
(Jackson's rule). A set of tasks with deadlines is schedulable iff, for every
deadline `d`:

```
Σ_{b : d_b ≤ d} remaining_b   ≤   usable_capacity(t, d)
```

We compute that ratio directly and call it `cohort_pressure`:

- **< 1** — everything due by `d` still fits
- **= 1** — zero slack; any slippage causes a miss
- **> 1** — **provably infeasible.** No schedule exists.

`usable_capacity` is *not* wall-clock free time. A week with 87 hours of gaps
between classes yields about 30 hours of study once a 5h/day ceiling and a 15%
slack reserve are applied. Dividing by the wrong number is how a planner ends up
claiming a week fits when it demonstrably doesn't.

When the ratio exceeds 1, Chipper says so in the first sentence of the strategy
note and offers triage — a fractional-knapsack argument: to maximise retained
grade under an hours budget, shed in increasing order of grade-per-hour. It
shows the shed list. **The user decides.**

### Hard constraints enforced

Day window · per-day hour ceiling · min/max block length · breaks · transition
pad after classes · protected days · per-assignment and per-exam daily caps ·
task dependencies · interleaving guard · deadline buffer · slack reserve.

### Learning from rejections

A rejected suggestion updates a bounded exponential-decay bias:

```
bias_k ← clip( bias_k·(1−η) + η·δ ,  −0.25, +0.15 )      η = 0.35
```

keyed on time-of-day, course or task type depending on the reason code. It's
added straight to the priority score, whose factors sum to ≈1 — so a sustained
pattern of rejections reshapes the plan, while a genuinely urgent task can still
override a learned dislike. That asymmetry is deliberate.

---

## Not trusting the model

`POST /api/ingest/text` and `/api/ingest/file` run **two** extractors — Gemini and
a regex/dateutil parser — then:

1. Every item must carry `evidence`: the literal source substring. If that text
   doesn't occur in the document, confidence is capped at 0.55.
2. Every LLM deadline is checked against dates found verbatim in the source.
   Uncorroborated dates get `needs_review: true` and a warning.
3. Items the rule parser found but the model missed are merged back in.

A hallucinated due date is the single most damaging failure mode for a planner,
so it's defended against explicitly rather than hoped away.

---

## The two screens to look at

**Planner → Why?** — opens `/api/blocks/{id}/explain` and renders the six
factors, each value × weight = contribution, plus a live check that the
contributions reconstruct the reported score. That check is the point: it is
what separates an explanation from a plausible story.

**Settings → objective weights** — push *deadline pressure* to 1.00, everything
else to 0.00, hit **Rebuild plan**, and the schedule collapses to
earliest-deadline-first. Thirty seconds, and nobody can call the knobs
decorative.

---

## Architecture

```
Browser (React + Vite)  ──HTTPS──▶  FastAPI  ──▶  PostgreSQL / SQLite
      Vercel                        Render
```

The browser never touches the database. Only the backend holds credentials.
Two environment variables wire the whole system: `VITE_API_URL` (frontend →
backend) and `DATABASE_URL` (backend → database).

```
backend/
├── app/
│   ├── ai/scheduler.py          ← the engine (deterministic)
│   ├── ai/planner_agent.py      orchestration, diffs, reminders
│   ├── ai/syllabus_parser.py    LLM + rule extraction, provenance checks
│   ├── ai/llm_client.py         Gemini wrapper that never raises
│   ├── api/                     auth · timetable · assignments · planner · progress · ingest
│   ├── models/                  SQLAlchemy ORM, JSONB on Postgres
│   └── services/                feedback learning, progress accounting, queries
├── tests/                       33 offline tests, no network needed
├── verify.py                    ~70-assertion end-to-end suite
└── seed.py                      deliberately overcommitted demo week

frontend/
└── src/
    ├── pages/                   Dashboard · Planner · Assignments · Timetable · Progress · Settings · Ask
    ├── components/WhyPanel.jsx  the transparency surface
    └── services/api.js          typed client for every endpoint
```

---

## Running locally

**Backend** (Python 3.12):

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env         # macOS/Linux: cp
python seed.py
uvicorn app.main:app --reload
```

**Frontend** (Node 18+), in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. No `.env` needed — Vite proxies `/api` to
`127.0.0.1:8000`, so the browser stays same-origin and CORS never applies.

A Gemini key is optional. Without it the deterministic engine and the rule-based
parser handle everything; you lose LLM-written strategy notes, nothing else.

### Tests

```bash
python tests/test_scheduler.py        # 19 engine tests — stdlib only
python tests/test_syllabus_parser.py  # 14 parser tests
python verify.py                      # full journey, in-process
```

`verify.py` walks register → ingest → plan → accept/reject → progress → replan
and re-checks the hard constraints on the generated plan: no overlaps, nothing
during a class, daily cap respected, nothing past a deadline.

---

## Deployment

| Service | Platform | Config |
|---|---|---|
| API | Render | Docker runtime, `./Dockerfile`, Root Directory blank |
| Frontend | Vercel | Root Directory `frontend`, `VITE_API_URL` set to the Render URL |

Environment variables on Render:

```
DATABASE_URL        Postgres URL, or omit for ephemeral SQLite
SECRET_KEY          40+ random characters
AUTO_CREATE_TABLES  true
SEED_ON_STARTUP     true    (free tier has no shell; seeds only if users table is empty)
CORS_ORIGINS        your Vercel URL
GEMINI_API_KEY      optional
```

Three things that look like bugs and aren't:

- **Cold starts.** Free Render sleeps after 15 minutes idle; first request takes
  30–60s.
- **`VITE_API_URL` is baked in at build time.** Changing it in Vercel does
  nothing until you redeploy.
- **Free Render disk is ephemeral.** SQLite is wiped on redeploy;
  `SEED_ON_STARTUP` re-seeds automatically.

---

## Tech

FastAPI · SQLAlchemy 2.0 · PostgreSQL · Pydantic v2 · JWT · Google Gemini ·
React 18 · Vite · Tailwind · Recharts · Docker

## Team

Team Slytherin — see `TEAM.md` for the work split.
