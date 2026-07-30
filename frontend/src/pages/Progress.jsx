import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Flame, Plus, Timer, TrendingUp } from "lucide-react";
import { api } from "../services/api.js";
import { useApi } from "../hooks/useApi.js";
import { useToast } from "../components/Toast.jsx";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loader,
  Modal,
  ProgressBar,
  RiskBadge,
  Stat,
} from "../components/ui.jsx";
import { fmtHours, fmtShortDate, pct, relative } from "../utils/format.js";

const COLOURS = ["#6366f1", "#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#ef4444"];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-[11px] shadow-xl">
      <p className="mb-1 font-medium text-ink-200">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-mono">{Number(p.value).toFixed(1)}h</span>
        </p>
      ))}
    </div>
  );
}

export default function Progress() {
  const toast = useToast();
  const [days, setDays] = useState(28);
  const [logOpen, setLogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    assignment_id: "",
    minutes_spent: 60,
    completion_delta: 0,
    focus_rating: 4,
    note: "",
  });

  const summary = useApi(() => api.progress.summary(7), []);
  const series = useApi(() => api.progress.timeseries(days), [days]);
  const logs = useApi(() => api.progress.list({ days: 14 }), []);
  const assignments = useApi(() => api.assignments.list(), []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submitLog() {
    setBusy(true);
    try {
      await api.progress.log({
        assignment_id: form.assignment_id ? Number(form.assignment_id) : null,
        minutes_spent: Number(form.minutes_spent),
        completion_delta: Number(form.completion_delta) / 100,
        focus_rating: Number(form.focus_rating),
        note: form.note,
      });
      toast.success("Logged. Your plan's capacity maths just got more accurate.");
      setLogOpen(false);
      setForm({ ...form, minutes_spent: 60, completion_delta: 0, note: "" });
      await Promise.all([summary.reload(), series.reload(), logs.reload(), assignments.reload()]);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  const s = summary.data;
  const chartData = (series.data?.series || []).map((d) => ({
    date: fmtShortDate(`${d.date}T00:00:00`),
    Planned: d.planned_hours,
    Actual: d.actual_hours,
  }));

  const courseData = Object.entries(s?.per_course_hours || {}).map(([name, hours]) => ({
    name,
    hours,
  }));

  const bias = s?.estimation_bias;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-500">
          Adherence, calibration and where the hours actually went.
        </p>
        <Button icon={Plus} onClick={() => setLogOpen(true)}>
          Log a session
        </Button>
      </div>

      {summary.loading && !s ? (
        <Loader />
      ) : (
        <>
          <ErrorState error={summary.error} onRetry={summary.reload} />

          {s && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Adherence"
                value={pct(s.adherence)}
                tone={s.adherence >= 0.7 ? "good" : s.adherence >= 0.4 ? "warn" : "bad"}
                sub="of past blocks completed"
              />
              <Stat label="Logged (7d)" value={fmtHours(s.hours_logged)} sub={`of ${fmtHours(s.hours_planned)} planned`} />
              <Stat
                label="Weekly goal"
                value={pct(s.goal_progress)}
                tone={s.goal_progress >= 1 ? "good" : s.goal_progress >= 0.6 ? "warn" : "bad"}
                sub={`target ${fmtHours(s.weekly_goal_hours)}`}
              />
              <Stat label="Streak" value={`${s.streak_days}d`} sub="consecutive study days" />
            </div>
          )}

          {/* --------------------------- calibration --------------------------- */}
          {bias != null && (
            <Card title="Estimation calibration">
              <div className="flex flex-wrap items-center gap-4">
                <div className="shrink-0">
                  <p className="font-mono text-3xl font-semibold text-ink-50">{bias.toFixed(2)}×</p>
                  <p className="text-[11px] text-ink-500">logged ÷ estimated</p>
                </div>
                <p className="min-w-[16rem] flex-1 text-xs leading-relaxed text-ink-400">
                  {bias > 1.15
                    ? `Your work takes ${((bias - 1) * 100).toFixed(0)}% longer than you predict. That is normal — almost everyone underestimates. The planner inflates future estimates by this factor, so the capacity report stops lying to you.`
                    : bias < 0.85
                    ? `You finish faster than you predict, by ${((1 - bias) * 100).toFixed(0)}%. Your estimates are pessimistic, which wastes capacity you could be using.`
                    : "Your estimates are well calibrated. The capacity numbers can be trusted at face value."}
                </p>
              </div>
            </Card>
          )}

          {/* --------------------------- planned vs actual --------------------------- */}
          <Card
            title="Planned vs actual"
            subtitle="The gap is what the replan engine reacts to"
            action={
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-xs">
                {[14, 28, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            }
          >
            {chartData.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No data yet" hint="Log a session or generate a plan." />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" vertical={false} />
                    <XAxis dataKey="date" stroke="#66738f" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#66738f" fontSize={10} tickLine={false} axisLine={false} unit="h" />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff08" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Planned" fill="#4338ca" radius={[3, 3, 0, 0]} maxBarSize={22} />
                    <Line
                      type="monotone"
                      dataKey="Actual"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            {series.data?.totals && (
              <p className="mt-2 text-center font-mono text-[11px] text-ink-500">
                planned {series.data.totals.planned}h · actual {series.data.totals.actual}h
              </p>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* --------------------------- per course --------------------------- */}
            <Card title="Where the time went" subtitle="Last 7 days">
              {courseData.length === 0 ? (
                <EmptyState icon={Timer} title="No sessions logged" />
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={courseData} layout="vertical" margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" horizontal={false} />
                      <XAxis type="number" stroke="#66738f" fontSize={10} unit="h" axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        stroke="#66738f"
                        fontSize={10}
                        width={100}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff08" }} />
                      <Bar dataKey="hours" name="Hours" radius={[0, 3, 3, 0]} maxBarSize={20}>
                        {courseData.map((_, i) => (
                          <Cell key={i} fill={COLOURS[i % COLOURS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* --------------------------- at risk --------------------------- */}
            <Card title="Needs attention" subtitle="From the active plan's diagnostics">
              {!s?.at_risk?.length ? (
                <EmptyState icon={Flame} title="Nothing is at risk" hint="Everything has slack." />
              ) : (
                <ul className="space-y-2">
                  {s.at_risk.map((r) => (
                    <li key={r.assignment_id} className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm text-ink-100">{r.title}</p>
                        <RiskBadge risk={r.risk} />
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <ProgressBar
                          value={Math.min(r.pressure, 1.5)}
                          max={1.5}
                          tone={r.pressure >= 1 ? "rose" : r.pressure >= 0.8 ? "amber" : "brand"}
                          className="flex-1"
                        />
                        <span className="w-28 shrink-0 text-right font-mono text-[10px] text-ink-500">
                          pressure {Number(r.pressure).toFixed(2)}
                        </span>
                      </div>
                      {r.recommendation && (
                        <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{r.recommendation}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* --------------------------- recent log --------------------------- */}
          <Card title="Recent sessions" subtitle="Last 14 days">
            {(logs.data || []).length === 0 ? (
              <EmptyState icon={Timer} title="Nothing logged yet" hint="Logging is what makes replanning meaningful." />
            ) : (
              <ul className="divide-y divide-ink-800/70">
                {(logs.data || []).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-ink-200">{l.note || "Study session"}</p>
                      <p className="text-[10px] text-ink-600">{relative(l.logged_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-xs text-ink-300">{fmtHours(l.minutes_spent / 60)}</p>
                      {l.focus_rating && (
                        <p className="text-[10px] text-ink-600">focus {l.focus_rating}/5</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {/* ------------------------------ log modal ------------------------------ */}
      <Modal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title="Log a study session"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitLog} loading={busy} disabled={!form.assignment_id}>
              Log it
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Assignment">
            <select className="w-full" value={form.assignment_id} onChange={set("assignment_id")}>
              <option value="">Select…</option>
              {(assignments.data || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({fmtHours(a.remaining_hours)} left)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Minutes spent">
            <input type="number" min="1" max="1440" className="w-full" value={form.minutes_spent} onChange={set("minutes_spent")} />
          </Field>
          <Field
            label={`How much closer to done? +${form.completion_delta}%`}
            hint="Your own sense of progress overrides the clock — you know how done it is better than the timer does."
          >
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              className="w-full accent-brand-500"
              value={form.completion_delta}
              onChange={set("completion_delta")}
            />
          </Field>
          <Field label={`Focus: ${form.focus_rating}/5`}>
            <input
              type="range"
              min="1"
              max="5"
              className="w-full accent-brand-500"
              value={form.focus_rating}
              onChange={set("focus_rating")}
            />
          </Field>
          <Field label="Note (optional)">
            <input className="w-full" value={form.note} onChange={set("note")} placeholder="What did you get through?" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
