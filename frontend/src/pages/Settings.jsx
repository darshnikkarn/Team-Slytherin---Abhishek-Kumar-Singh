import { useEffect, useState } from "react";
import { Brain, RotateCcw, Save, Sparkles, Zap } from "lucide-react";
import { api } from "../services/api.js";
import { useApi } from "../hooks/useApi.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import { Button, Card, EmptyState, ErrorState, Field, Loader } from "../components/ui.jsx";
import { FACTOR_LABELS, WEEKDAYS, WEEKDAYS_SHORT } from "../utils/format.js";

const WEIGHT_KEYS = [
  "weight_deadline_pressure",
  "weight_grade_impact",
  "weight_user_priority",
  "weight_energy_match",
  "weight_neglect",
  "weight_spacing",
];

const WEIGHT_HELP = {
  weight_deadline_pressure:
    "How much the feasibility ratio drives ordering. At 1.0 with everything else at 0 this becomes earliest-deadline-first.",
  weight_grade_impact: "Favour assignments worth more of the final grade. Saturates at 25%.",
  weight_user_priority: "Respect the per-course priority multipliers you set on the Timetable page.",
  weight_energy_match: "Put hard work in your high-energy windows and easy work in the troughs.",
  weight_neglect: "Anti-starvation. Stops one task monopolising every slot for a week.",
  weight_spacing: "Distributed revision for exams; unbroken momentum for project work.",
};

export default function Settings() {
  const toast = useToast();
  const { user } = useAuth();
  const prefs = useApi(() => api.auth.getPreferences(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (prefs.data) setForm({ ...prefs.data });
  }, [prefs.data]);

  if (prefs.loading && !form) return <Loader label="Loading preferences…" />;
  if (prefs.error) return <ErrorState error={prefs.error} onRetry={prefs.reload} />;
  if (!form) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k) => (e) => set(k, Number(e.target.value));

  const weightSum = WEIGHT_KEYS.reduce((a, k) => a + Number(form[k] || 0), 0);

  function toggleDay(i) {
    const cur = new Set(form.protected_days || []);
    cur.has(i) ? cur.delete(i) : cur.add(i);
    set("protected_days", [...cur].sort());
  }

  async function save() {
    setBusy(true);
    try {
      const payload = {
        day_start: form.day_start,
        day_end: form.day_end,
        max_daily_study_hours: Number(form.max_daily_study_hours),
        weekly_goal_hours: Number(form.weekly_goal_hours),
        min_block_minutes: Number(form.min_block_minutes),
        max_block_minutes: Number(form.max_block_minutes),
        break_minutes: Number(form.break_minutes),
        transition_minutes: Number(form.transition_minutes),
        interleave_subjects: Boolean(form.interleave_subjects),
        max_consecutive_blocks_same_course: Number(form.max_consecutive_blocks_same_course),
        deadline_buffer_days: Number(form.deadline_buffer_days),
        slack_fraction: Number(form.slack_fraction),
        protected_days: form.protected_days || [],
      };
      WEIGHT_KEYS.forEach((k) => {
        payload[k] = Number(form[k]);
      });
      await api.auth.updatePreferences(payload);
      toast.success("Saved. Regenerate the plan to see the effect.");
      await prefs.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const p = await api.plan.generate({ horizon_days: 7, preserve_accepted: false });
      toast.success(`Rebuilt from scratch — plan v${p.version}, ${p.blocks.length} blocks.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function resetLearning() {
    if (!window.confirm("Forget everything learned from your accepts and rejects?")) return;
    try {
      await api.auth.resetLearning();
      toast.info("Learned biases cleared.");
      await prefs.reload();
    } catch (e) {
      toast.error(e);
    }
  }

  const biases = Object.entries(form.learned_biases || {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-500">
          Signed in as <span className="text-ink-300">{user?.email}</span>. Every value here is a real
          constraint or objective weight — change one and the next plan changes.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={regenerate} loading={busy} icon={Sparkles}>
            Rebuild plan
          </Button>
          <Button onClick={save} loading={busy} icon={Save}>
            Save
          </Button>
        </div>
      </div>

      {/* --------------------------- objective weights --------------------------- */}
      <Card
        title="What the agent optimises for"
        subtitle={`Six factors, each normalised to [0,1], combined linearly. Current sum: ${weightSum.toFixed(2)}`}
      >
        <div className="space-y-4">
          {WEIGHT_KEYS.map((k) => {
            const factor = k.replace("weight_", "");
            const v = Number(form[k]);
            const share = weightSum > 0 ? v / weightSum : 0;
            return (
              <div key={k}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium text-ink-200">
                    {FACTOR_LABELS[factor] || factor}
                  </span>
                  <span className="font-mono text-[11px] text-ink-400">
                    {v.toFixed(2)}{" "}
                    <span className="text-ink-600">({(share * 100).toFixed(0)}% of total)</span>
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={v}
                  onChange={num(k)}
                  className="mt-1.5 w-full accent-brand-500"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{WEIGHT_HELP[k]}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-4 rounded-lg border border-ink-800 bg-ink-900/50 px-3 py-2 text-[11px] leading-relaxed text-ink-400">
          Only the <em>ratios</em> matter — the scores are compared against each other, not against a
          threshold. Push deadline pressure to 1.0 and the rest to 0, hit <strong>Rebuild plan</strong>,
          and the schedule collapses to earliest-deadline-first. That is the fastest way to convince
          yourself these are real knobs and not decoration.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------ availability ------------------------------ */}
        <Card title="When you're available" subtitle="Hard bounds — nothing is ever scheduled outside them">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Day starts">
              <input
                type="time"
                className="w-full"
                value={String(form.day_start).slice(0, 5)}
                onChange={(e) => set("day_start", `${e.target.value}:00`)}
              />
            </Field>
            <Field label="Day ends">
              <input
                type="time"
                className="w-full"
                value={String(form.day_end).slice(0, 5)}
                onChange={(e) => set("day_end", `${e.target.value}:00`)}
              />
            </Field>
            <Field label={`Max study per day: ${form.max_daily_study_hours}h`} className="sm:col-span-2">
              <input
                type="range"
                min="1"
                max="12"
                step="0.5"
                className="w-full accent-brand-500"
                value={form.max_daily_study_hours}
                onChange={num("max_daily_study_hours")}
              />
            </Field>
            <Field label={`Weekly goal: ${form.weekly_goal_hours}h`} className="sm:col-span-2">
              <input
                type="range"
                min="5"
                max="60"
                step="1"
                className="w-full accent-brand-500"
                value={form.weekly_goal_hours}
                onChange={num("weekly_goal_hours")}
              />
            </Field>
          </div>

          <Field label="Days off" hint="Kept completely free of study." className="mt-3">
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS_SHORT.map((d, i) => {
                const on = (form.protected_days || []).includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition ${
                      on
                        ? "border-brand-500/50 bg-brand-600/20 text-brand-200"
                        : "border-ink-700 text-ink-400 hover:border-ink-600"
                    }`}
                    title={WEEKDAYS[i]}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
        </Card>

        {/* ------------------------------ session shape ------------------------------ */}
        <Card title="How you like to work" subtitle="Block sizes, breaks and switching">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Min block: ${form.min_block_minutes} min`}>
              <input
                type="range"
                min="15"
                max="120"
                step="5"
                className="w-full accent-brand-500"
                value={form.min_block_minutes}
                onChange={num("min_block_minutes")}
              />
            </Field>
            <Field label={`Max block: ${form.max_block_minutes} min`}>
              <input
                type="range"
                min="30"
                max="180"
                step="5"
                className="w-full accent-brand-500"
                value={form.max_block_minutes}
                onChange={num("max_block_minutes")}
              />
            </Field>
            <Field label={`Break between blocks: ${form.break_minutes} min`}>
              <input
                type="range"
                min="0"
                max="45"
                step="5"
                className="w-full accent-brand-500"
                value={form.break_minutes}
                onChange={num("break_minutes")}
              />
            </Field>
            <Field label={`Pad after a class: ${form.transition_minutes} min`}>
              <input
                type="range"
                min="0"
                max="60"
                step="5"
                className="w-full accent-brand-500"
                value={form.transition_minutes}
                onChange={num("transition_minutes")}
              />
            </Field>
            <Field
              label={`Finish ${form.deadline_buffer_days} day(s) early`}
              hint="Deadlines are targets, not finish lines."
            >
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                className="w-full accent-brand-500"
                value={form.deadline_buffer_days}
                onChange={num("deadline_buffer_days")}
              />
            </Field>
            <Field
              label={`Slack reserve: ${(form.slack_fraction * 100).toFixed(0)}%`}
              hint="Unallocated time so one bad day doesn't cascade."
            >
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.05"
                className="w-full accent-brand-500"
                value={form.slack_fraction}
                onChange={num("slack_fraction")}
              />
            </Field>
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2.5">
            <input
              type="checkbox"
              checked={Boolean(form.interleave_subjects)}
              onChange={(e) => set("interleave_subjects", e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5"
            />
            <span>
              <span className="block text-xs font-medium text-ink-200">Interleave subjects</span>
              <span className="block text-[11px] leading-relaxed text-ink-500">
                Cap consecutive blocks on one course at{" "}
                {form.max_consecutive_blocks_same_course}. Interleaving helps retention; the cap is
                overridden automatically when a course is provably behind.
              </span>
            </span>
          </label>
          {form.interleave_subjects && (
            <Field label={`Max consecutive blocks: ${form.max_consecutive_blocks_same_course}`} className="mt-3">
              <input
                type="range"
                min="1"
                max="6"
                className="w-full accent-brand-500"
                value={form.max_consecutive_blocks_same_course}
                onChange={num("max_consecutive_blocks_same_course")}
              />
            </Field>
          )}
        </Card>
      </div>

      {/* ------------------------------ learned biases ------------------------------ */}
      <Card
        title="What the agent has learned about you"
        subtitle="Built from your accepts and rejects, added directly to the priority score"
        action={
          biases.length > 0 && (
            <Button variant="outline" size="sm" icon={RotateCcw} onClick={resetLearning}>
              Reset
            </Button>
          )
        }
      >
        {biases.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="Nothing learned yet"
            hint="Reject a few suggestions with a reason and they'll show up here as negative weights on that time of day or course."
          />
        ) : (
          <>
            <ul className="space-y-2">
              {biases.map(([key, value]) => {
                const negative = value < 0;
                const magnitude = Math.min(1, Math.abs(value) / 0.25);
                const [scope, what] = key.split(":");
                return (
                  <li key={key} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-xs text-ink-300">
                      {scope === "tod" ? what : scope === "course" ? `course #${what}` : key}
                    </span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-800">
                      <div
                        className={`absolute top-0 h-full ${negative ? "bg-rose-500" : "bg-emerald-500"}`}
                        style={{
                          width: `${magnitude * 50}%`,
                          [negative ? "right" : "left"]: "50%",
                        }}
                      />
                      <div className="absolute left-1/2 top-0 h-full w-px bg-ink-600" />
                    </div>
                    <span
                      className={`w-14 shrink-0 text-right font-mono text-[11px] ${
                        negative ? "text-rose-300" : "text-emerald-300"
                      }`}
                    >
                      {value > 0 ? "+" : ""}
                      {value.toFixed(3)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-500">
              <Zap size={12} className="mt-0.5 shrink-0 text-amber-400" />
              Bounded to [−0.25, +0.15] against factor weights summing to about 1. A learned dislike
              suppresses a slot without ever being able to veto genuinely urgent work — that
              asymmetry is deliberate.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
