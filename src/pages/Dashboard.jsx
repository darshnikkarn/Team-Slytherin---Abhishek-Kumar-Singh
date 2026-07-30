import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Flame,
  Gauge,
  ListChecks,
  RefreshCw,
  Scissors,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { api } from "../services/api.js";
import { useApi } from "../hooks/useApi.js";
import { useToast } from "../components/Toast.jsx";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Loader,
  ProgressBar,
  RiskBadge,
  Stat,
  StatusBadge,
} from "../components/ui.jsx";
import WhyPanel from "../components/WhyPanel.jsx";
import { fmtDeadline, fmtHours, fmtRange, pct, relative } from "../utils/format.js";

export default function Dashboard() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.insights.dashboard(), []);
  const { data: replanCheck, reload: recheck } = useApi(() => api.plan.needsReplan(), []);
  const [whyId, setWhyId] = useState(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      await api.plan.generate({ horizon_days: 7 });
      toast.success("Plan generated.");
      await Promise.all([reload(), recheck()]);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function replan() {
    setBusy(true);
    try {
      const p = await api.plan.replan("From dashboard");
      toast.success(`Replanned — now on version ${p.version}.`);
      await Promise.all([reload(), recheck()]);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Loader label="Loading your week…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const cap = data.capacity || {};
  const prog = data.progress || {};
  const hasDeficit = (cap.deficit_hours ?? 0) > 0.05;

  if (!data.has_plan) {
    return (
      <Card>
        <EmptyState
          icon={Sparkles}
          title="No plan yet"
          hint="Add your timetable and assignments, then generate a plan. The agent will fit the work into your actual free time and tell you if it doesn't fit."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={generate} loading={busy} icon={Sparkles}>
                Generate my plan
              </Button>
              <Link to="/assignments">
                <Button variant="outline">Add assignments</Button>
              </Link>
            </div>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ---------- replan banner ---------- */}
      {replanCheck?.needs_replan && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-200">
              <RefreshCw size={14} /> Your plan is out of date
            </p>
            <ul className="mt-1 space-y-0.5">
              {replanCheck.reasons.map((r, i) => (
                <li key={i} className="text-xs text-amber-300/90">
                  · {r}
                </li>
              ))}
            </ul>
          </div>
          <Button onClick={replan} loading={busy} icon={RefreshCw}>
            Replan around it
          </Button>
        </div>
      )}

      {/* ---------- strategy note ---------- */}
      <Card
        title="This week's strategy"
        subtitle={`Plan v${data.plan_version} · generated ${relative(data.generated_at)}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={replan} loading={busy} icon={RefreshCw}>
              Replan
            </Button>
            <Link to="/planner">
              <Button size="sm" icon={Sparkles}>
                Open planner
              </Button>
            </Link>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-ink-200">{data.strategy_note}</p>
      </Card>

      {/* ---------- capacity ---------- */}
      <Card
        title="Capacity"
        subtitle="Work due this horizon against the study time you actually have"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Demanded" value={fmtHours(cap.demanded_hours)} sub="due in this horizon" />
          <Stat label="Usable" value={fmtHours(cap.usable_hours)} sub="after caps & slack reserve" />
          <Stat
            label="Scheduled"
            value={fmtHours(cap.scheduled_hours)}
            sub={`${pct(cap.utilisation)} of usable`}
          />
          <Stat
            label="Deficit"
            value={fmtHours(cap.deficit_hours)}
            tone={hasDeficit ? "bad" : "good"}
            sub={hasDeficit ? "does not fit" : "everything fits"}
          />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[11px] text-ink-500">
            <span>Demand vs usable capacity</span>
            <span className="font-mono">
              {fmtHours(cap.demanded_hours)} / {fmtHours(cap.usable_hours)}
            </span>
          </div>
          <ProgressBar value={cap.demanded_hours || 0} max={cap.usable_hours || 1} />
          {hasDeficit && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-300">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {fmtHours(cap.deficit_hours)} of work has nowhere to go. No schedule exists that
              finishes everything — see triage below.
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------- today ---------- */}
        <Card
          className="lg:col-span-2"
          title="Today"
          subtitle={`${data.today.blocks.length} block(s) · ${fmtHours(data.today.planned_hours)} planned`}
        >
          {data.today.blocks.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing scheduled today"
              hint="Either you're ahead, or today is protected in your preferences."
            />
          ) : (
            <ul className="space-y-2">
              {data.today.blocks.map((b) => (
                <li
                  key={b.id}
                  className="flex items-start gap-3 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2.5"
                >
                  <div className="w-20 shrink-0 pt-0.5 font-mono text-xs text-ink-400">
                    {fmtRange(b.start, b.end)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm text-ink-100">{b.title}</p>
                      <StatusBadge status={b.status} />
                    </div>
                    {b.why && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-500">
                        {b.why}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setWhyId(b.id)}
                    className="shrink-0 rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400 transition hover:border-brand-500/50 hover:text-brand-300"
                  >
                    Why?
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------- progress ---------- */}
        <Card title="Progress" subtitle="Last 7 days">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="Adherence"
                value={pct(prog.adherence)}
                tone={prog.adherence >= 0.7 ? "good" : prog.adherence >= 0.4 ? "warn" : "bad"}
                sub="of past blocks done"
              />
              <Stat
                label="Streak"
                value={`${prog.streak_days ?? 0}d`}
                sub={prog.streak_days > 0 ? "keep it" : "start today"}
              />
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-[11px] text-ink-500">
                <span className="flex items-center gap-1">
                  <Gauge size={12} /> Weekly goal
                </span>
                <span className="font-mono">
                  {fmtHours(prog.hours_logged)} / {fmtHours(prog.weekly_goal_hours)}
                </span>
              </div>
              <ProgressBar
                value={prog.hours_logged || 0}
                max={prog.weekly_goal_hours || 1}
                tone="emerald"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Done", prog.blocks_completed, "text-emerald-300"],
                ["Missed", prog.blocks_missed, "text-rose-300"],
                ["Pending", prog.blocks_pending, "text-ink-300"],
              ].map(([label, v, cls]) => (
                <div key={label} className="rounded-lg bg-ink-900/60 py-2">
                  <p className={`text-base font-semibold tabular-nums ${cls}`}>{v ?? 0}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-600">{label}</p>
                </div>
              ))}
            </div>
            {prog.estimation_bias != null && (
              <p className="flex items-start gap-1.5 rounded-lg bg-ink-900/60 px-2.5 py-2 text-[11px] leading-relaxed text-ink-400">
                <Flame size={12} className="mt-0.5 shrink-0 text-amber-400" />
                Your work takes <span className="font-mono text-ink-200">
                  {prog.estimation_bias.toFixed(2)}×
                </span>{" "}
                your estimates. Future capacity maths accounts for this.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------- deadlines ---------- */}
        <Card title="Upcoming deadlines" subtitle="Nearest first">
          {data.upcoming_deadlines.length === 0 ? (
            <EmptyState icon={ListChecks} title="Nothing due" hint="Add assignments to see them here." />
          ) : (
            <ul className="space-y-2">
              {data.upcoming_deadlines.map((a) => {
                const urgent = a.days_left < 2;
                return (
                  <li key={a.id} className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink-100">{a.title}</p>
                        <p className="text-[11px] text-ink-500">{a.course || "No course"}</p>
                      </div>
                      <span
                        className={`shrink-0 font-mono text-[11px] ${
                          urgent ? "text-rose-300" : "text-ink-400"
                        }`}
                      >
                        <CalendarClock size={11} className="mr-1 inline" />
                        {fmtDeadline(a.deadline)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar
                        value={a.completion_pct}
                        max={100}
                        tone={urgent ? "rose" : "brand"}
                        className="flex-1"
                      />
                      <span className="w-24 shrink-0 text-right font-mono text-[10px] text-ink-500">
                        {a.completion_pct.toFixed(0)}% · {fmtHours(a.hours_left)} left
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ---------- risk + triage ---------- */}
        <Card title="Risk" subtitle="Anything not comfortably on track">
          {data.risks.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Everything is on track" />
          ) : (
            <ul className="space-y-2">
              {data.risks.map((r) => (
                <li key={r.assignment_id} className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm text-ink-100">{r.title}</p>
                    <RiskBadge risk={r.risk} />
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-ink-500">
                    pressure {Number(r.pressure).toFixed(2)} · slack {fmtHours(r.slack_hours)} ·
                    short {fmtHours(r.shortfall_hours)}
                  </p>
                  {r.recommendation && (
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{r.recommendation}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {data.triage?.length > 0 && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-200">
                <Scissors size={13} /> Triage — what to shed
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
                Ordered by lowest grade-per-hour, so each hour you drop costs the least grade. Your
                call, not the agent's.
              </p>
              <ul className="mt-2 space-y-1.5">
                {data.triage.map((t) => (
                  <li key={t.assignment_id} className="text-[11px] text-ink-300">
                    <span className="font-medium text-ink-100">{t.title}</span> —{" "}
                    {t.action.replace(/_/g, " ")}, frees {fmtHours(t.hours_recovered)}, risks{" "}
                    {t.grade_at_stake}% of the grade
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* ---------- attendance ---------- */}
      {data.attendance_flags?.length > 0 && (
        <Card title="Attendance" subtitle="Below the required threshold">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.attendance_flags.map((c) => (
              <li
                key={c.course_id}
                className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2"
              >
                <span className="flex items-center gap-1.5 truncate text-xs text-ink-200">
                  <UserCheck size={13} className="text-amber-400" />
                  {c.course}
                </span>
                <span className="shrink-0 font-mono text-xs text-amber-300">
                  {c.current_pct}% / {c.required_pct}%
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <WhyPanel blockId={whyId} open={Boolean(whyId)} onClose={() => setWhyId(null)} />
    </div>
  );
}
