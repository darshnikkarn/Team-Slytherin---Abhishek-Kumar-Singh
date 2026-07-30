# Study Planner Agent — Backend

An agent that ingests a timetable, assignments and goal preferences, produces a
realistic weekly plan with reminders and progress tracking, and **rebuilds the
plan when deadlines or progress change** — showing exactly what changed and why.

FastAPI · SQLAlchemy · SQLite (Postgres-swappable) · JWT · Google Gemini.

---

## Quick start

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

pip install -r requirements.txt
copy .env.example .env          # cp on macOS/Linux
python seed.py                  # demo@student.edu / demo1234
uvicorn app.main:app --reload
```

Interactive docs: <http://127.0.0.1:8000/docs>

**Verify it actually works** (no server, no key needed — do this first):

```bash
python tests/test_scheduler.py        # 19 engine tests   — stdlib only
python tests/test_syllabus_parser.py  # 14 parser tests   — needs dateutil only
python verify.py                      # ~65 assertions, full journey in-process
pytest -q                             # all of the above, if you prefer pytest
```

`verify.py` spins the app up against a throwaway SQLite file and walks
register → courses → timetable → syllabus ingest → plan → inspect rationale →
accept/reject → log progress → replan → read the diff, asserting on the
*content* of each response. It also re-checks the hard constraints on the
generated plan (no overlaps, nothing during a class, daily cap respected,
nothing past a deadline). If it passes, the backend is demo-ready.

Gemini is optional. With `GEMINI_API_KEY` unset the app runs the deterministic
scheduler and the rule-based syllabus parser, and every endpoint still returns
useful output. Get a free key at <https://aistudio.google.com/apikey>.

---

## The one design decision that matters

**The LLM never decides when you study.**

| Layer | Responsibility | Implementation |
|---|---|---|
| `app/ai/scheduler.py` | *When* — placement, constraints, feasibility | Deterministic. No network. Unit-tested. |
| `app/ai/syllabus_parser.py` | *What exists* — parsing messy documents | Gemini + regex, cross-checked |
| `app/ai/planner_agent.py` | Orchestration + narration | Gemini, read-only over the plan |

Consequences, all of which the judging criteria reward:

- Hard constraints (class times, daily caps, deadlines) **cannot** be
  hallucinated away.
- The plan is reproducible — same inputs, same output, every time.
- `GET /api/blocks/{id}/explain` returns the *actual arithmetic* used, not a
  post-hoc story generated after the fact.
- Pull the API key and the product still works.

---

## How the scheduler decides

### Placement

Chronological greedy dispatch over free time. At every cursor position `t`:

```
a* = argmax_{a ∈ Eligible(t)}  Σ_k  w_k · f_k(a, t)
```

`Eligible(t)` enforces the hard constraints; the six factors `f_k` are
normalised to `[0,1]`; the weights `w_k` are the user's, editable at
`PATCH /api/auth/preferences`, and returned with every plan.

| Factor | What it measures |
|---|---|
| `deadline_pressure` | Feasibility ratio (below) blended 65/35 with time decay |
| `grade_impact` | `min(1, grade_weight / 25)` — saturating |
| `user_priority` | Per-course importance multiplier |
| `energy_match` | Task difficulty vs. the energy level of that time slot |
| `neglect` | Anti-starvation: `1 − e^(−days_since_touched / 5)` |
| `spacing` | Distributed practice for exams, momentum for project work |

Set `weight_deadline_pressure = 1` and the rest to `0` and the rule reduces to
EDF. There is a test for that (`test_earlier_deadline_wins_when_only_pressure_matters`).

### Feasibility — the part most planners get wrong

The useful quantity is not "days until the deadline", it's **slack**, and the
correct slack is the cohort version from the classic single-machine feasibility
theorem (Jackson's rule / EDF). A set of tasks with deadlines is schedulable
iff, for every deadline `d`:

```
Σ_{b : d_b ≤ d} remaining_b   ≤   free_capacity(t, d)
```

We compute that ratio directly and call it `cohort_pressure`:

- `< 1` — everything due by `d` still fits
- `= 1` — zero slack; any slippage causes a miss
- `> 1` — **provably infeasible.** No schedule exists.

When it exceeds 1 the agent says so in the first sentence of the strategy note
and offers triage instead of quietly dropping work. Triage is a fractional-knapsack
argument: to maximise retained grade under an hours budget, shed in increasing
order of grade-per-hour. The API returns the shed list; **the user decides**.

### Hard constraints enforced

Day window · per-day hour ceiling · min/max block length · breaks · transition
pad after classes · protected days · per-assignment and per-exam daily caps ·
task dependencies · interleaving guard (max consecutive blocks per course,
overridden only when a course is provably behind) · deadline buffer (finish
early by default) · slack reserve (a % of each day left unallocated so one bad
day doesn't cascade).

### Learning from rejections

A rejected suggestion updates a bounded exponential-decay bias:

```
bias_k ← clip( bias_k·(1−η) + η·δ ,  −0.25, +0.15 )      η = 0.35
```

keyed on time-of-day, course or task type depending on the `reason_code`. The
bias is added straight to the priority score (whose factors sum to ≈1), so a
sustained pattern of rejections reshapes the plan while a genuinely urgent task
can still override a learned dislike. That asymmetry is deliberate.
Reset with `POST /api/auth/preferences/reset-learning`.

### Estimation calibration

Students underestimate effort. Once three assignments are finished the API
reports `estimation_bias = logged_hours / estimated_hours`, and any assignment
that overruns has its estimate grown rather than silently blowing the plan.

---

## Ingestion, and not trusting the model

`POST /api/ingest/text` and `/api/ingest/file` (PDF or text) both run **two**
extractors: Gemini and a regex/dateutil parser. Then:

1. Every item must carry `evidence` — the literal source substring. If the
   evidence doesn't occur in the document, confidence is capped at 0.55.
2. Every LLM deadline is checked against dates found verbatim in the source.
   Uncorroborated dates get `needs_review: true` and a warning.
3. Items the rule parser found but the model missed are merged back in.

A hallucinated due date is the single most damaging failure mode for this
product, so it is defended against explicitly. Use `/api/ingest/preview` for a
dry run so the UI can put a confirmation step between the model and the user's
real schedule.

---

## API contract (for the frontend)

Base URL `http://127.0.0.1:8000/api`. All routes except `/health`, `/auth/register`
and `/auth/login` need `Authorization: Bearer <token>`.

### Auth & preferences
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | → `{access_token, user}` |
| POST | `/auth/login` | → `{access_token, user}` |
| GET | `/auth/me` | |
| GET | `/auth/preferences` | all scheduler knobs |
| PATCH | `/auth/preferences` | partial; changing a weight changes the next plan |
| POST | `/auth/preferences/reset-learning` | clear learned biases |

### Courses & timetable
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/courses` | includes `attendance_pct`, `attendance_at_risk` |
| PATCH/DELETE | `/courses/{id}` | |
| GET | `/courses/{id}/attendance?remaining_classes=` | exact "classes you can still miss" |
| GET/POST | `/timetable` | |
| POST | `/timetable/bulk` | `{slots:[...], replace_existing:bool}` — import a week |
| PATCH/DELETE | `/timetable/{id}` | |
| GET | `/timetable/week?start=&days=` | recurrence already expanded onto real dates |
| GET | `/timetable/free-slots?days=` | **exactly what the scheduler sees** — best debug endpoint |
| GET/POST | `/calendar-exceptions` | one-off busy/free overrides (wedding, cancelled class) |

### Assignments
| Method | Path | Notes |
|---|---|---|
| GET | `/assignments?status=&course_id=&due_within_days=&include_done=` | |
| POST | `/assignments` | omit `estimated_hours` and the agent estimates it |
| POST | `/assignments/bulk` | |
| GET/PATCH/DELETE | `/assignments/{id}` | |
| POST | `/assignments/{id}/complete` | |
| POST | `/assignments/{id}/reestimate` | needs a Gemini key |

### Planning
| Method | Path | Notes |
|---|---|---|
| POST | `/plan/generate` | `{horizon_days, preserve_accepted, use_llm_narrative, focus_note}` |
| POST | `/plan/replan?reason=` | detects missed blocks first, keeps accepted ones |
| GET | `/plan/needs-replan` | cheap poll → `{needs_replan, reasons[], trigger}` |
| GET | `/plan/current` | `null` if none |
| GET | `/plan/history` · `/plan/{id}` | |
| GET | `/plan/{id}/diagnostics` | capacity, risks, triage, weights, constraints |
| GET | `/plan/{id}/revision` | the diff vs. the previous version |
| GET | `/plan/revisions/all` | |
| POST | `/plan/ask` | `{question}` grounded strictly in the user's own data |

### Blocks — accept / edit / reject
| Method | Path | Notes |
|---|---|---|
| GET | `/blocks?start=&days=&status=` · `/blocks/today` | |
| POST | `/blocks/{id}/decision` | `{action, reason_code, comment, new_start, new_end, lock}` |
| POST | `/blocks/bulk-decision` · `/blocks/accept-all` | |
| PATCH/DELETE | `/blocks/{id}` | drag-and-drop lands here |
| GET | `/blocks/{id}/explain?use_llm=` | factor table + narration |

`action` ∈ `accept · reject · edit · reschedule · complete · skip`.
`reason_code` ∈ `too_early · too_late · too_long · wrong_subject · clashes_with_life ·
too_hard_then · already_done` — this is what drives the learning loop, so send it.

### Progress, reminders, dashboard
| Method | Path | Notes |
|---|---|---|
| POST/GET | `/progress` | `{block_id or assignment_id, minutes_spent, completion_delta, focus_rating}` |
| GET | `/progress/summary` | adherence, streak, goal progress, estimation bias, at-risk |
| GET | `/progress/timeseries?days=` | planned vs actual per day — chart-ready |
| GET | `/reminders?within_hours=` | block starts, deadline T-24h/T-2h, risk alerts |
| POST | `/reminders/{id}/dismiss` | |
| GET | `/insights/dashboard` | **one call renders the whole Dashboard page** |

### Ingestion
| Method | Path | Notes |
|---|---|---|
| POST | `/ingest/text` | `{text, course_id, course_hint, auto_create}` |
| POST | `/ingest/file` | multipart PDF/txt |
| POST | `/ingest/preview` | extract without saving |

### Suggested frontend wiring

- **Dashboard** → `GET /insights/dashboard` (single call)
- **Timetable** → `GET /timetable/week`, `POST /timetable/bulk`
- **Assignments** → `GET/POST /assignments`, `POST /ingest/file`
- **Planner** → `POST /plan/generate`, `GET /blocks`, `POST /blocks/{id}/decision`,
  `GET /blocks/{id}/explain` in a "why?" popover
- **Progress** → `GET /progress/summary` + `/progress/timeseries`
- **Settings** → `GET/PATCH /auth/preferences` — surface the six objective
  weights as sliders and regenerate live; it demos extremely well

---

## Demo script (3 minutes, hits every judging criterion)

1. `python seed.py` — deliberately overcommitted week, one course already below
   its attendance threshold.
2. Paste a syllabus into `/ingest/text` → items appear with `evidence` and
   `needs_review` flags. *Transparency of inputs.*
3. `POST /plan/generate` → strategy note leads with the binding constraint.
   Open `/plan/{id}/diagnostics`: demand vs capacity, per-assignment
   `cohort_pressure`, triage list. *Planning quality.*
4. Click any block → `/blocks/{id}/explain`: six factors, weights,
   contributions summing to the score, constraints enforced, alternatives
   rejected. *Transparency of reasoning.*
5. Reject two evening blocks with `reason_code: clashes_with_life`, regenerate
   → evening blocks disappear. *Genuinely useful, not decorative.*
6. Add a surprise quiz due tomorrow → `POST /plan/replan` → `/plan/{id}/revision`
   shows exactly what moved and why; already-accepted blocks stayed put.
   *Updates when deadlines change.*

---

## Layout

```
backend/
├── app/
│   ├── main.py                  FastAPI app, CORS, health
│   ├── config.py                settings
│   ├── api/                     auth · timetable · assignment · planner · progress · ingest
│   ├── models/                  SQLAlchemy ORM + enums
│   ├── schemas/                 Pydantic request/response
│   ├── database/db.py           engine, session, init_db
│   ├── core/                    security (JWT/bcrypt), time/interval algebra
│   ├── ai/
│   │   ├── scheduler.py         ← the engine
│   │   ├── planner_agent.py     orchestration, diffs, reminders
│   │   ├── syllabus_parser.py   LLM + rule extraction, provenance checks
│   │   ├── llm_client.py        Gemini wrapper that never raises
│   │   └── prompt.py            all prompts, one file
│   └── services/                feedback learning, progress accounting
├── tests/test_scheduler.py      engine unit tests
├── verify.py                    full-journey self-check
├── seed.py                      demo data
└── requirements.txt
```

## Notes

- SQLite by default; set `DATABASE_URL=postgresql+psycopg://…` for Postgres.
  Tables are created at startup — for a hackathon that's the right call; add
  Alembic before anyone real uses this.
- All datetimes are naive local time. The scheduler normalises at the boundary;
  mixing aware and naive datetimes is the classic source of off-by-one-day bugs.
- Reminders are materialised rows the frontend polls. There's no push
  infrastructure — `fire_at` is there so a worker or a service worker can send
  them later.
