import { useMemo, useState } from "react";
import {
  Ban,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  GitCompareArrows,
  Lock,
  Pencil,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { api, toDatetimeLocal, toNaiveISO, toDateStr } from "../services/api.js";
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
  StatusBadge,
} from "../components/ui.jsx";
import WhyPanel, { SlackHint } from "../components/WhyPanel.jsx";
import {
  BLOCK_TYPE_LABELS,
  REJECT_REASONS,
  WEEKDAYS_SHORT,
  fmtDateTime,
  fmtHours,
  fmtRange,
  parseDT,
  relative,
} from "../utils/format.js";

const mondayOf = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/* ------------------------------------------------------------------ block */
function BlockCard({ block, onWhy, onAccept, onReject, onEdit, busyId }) {
  const dead = block.status === "rejected";
  const done = block.status === "completed";
  const missed = block.status === "missed";
  const pending = block.status === "proposed";
  const busy = busyId === block.id;

  return (
    <div
      className={`group rounded-lg border px-2.5 py-2 transition ${
        dead
          ? "border-ink-800 bg-ink-900/20 opacity-45"
          : missed
          ? "border-rose-500/30 bg-rose-500/5"
          : done
          ? "border-emerald-500/30 bg-emerald-500/5"
          : pending
          ? "border-brand-500/30 bg-brand-500/[0.07] hover:border-brand-500/60"
          : "border-ink-700 bg-ink-900/60 hover:border-ink-600"
      }`}
      style={
        block.course_colour && !dead
          ? { borderLeft: `3px solid ${block.course_colour}` }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="font-mono text-[10px] text-ink-400">{fmtRange(block.start, block.end)}</span>
        <div className="flex items-center gap-1">
          {block.locked && <Lock size={9} className="text-ink-500" />}
          <span className="font-mono text-[10px] text-ink-500">{fmtHours(block.hours)}</span>
        </div>
      </div>

      <p className={`mt-0.5 text-xs leading-snug ${dead ? "line-through" : "text-ink-100"}`}>
        {block.title}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={block.status} />
        {block.block_type !== "study" && (
          <span className="chip border border-ink-700 bg-ink-800 text-ink-400">
            {BLOCK_TYPE_LABELS[block.block_type] || block.block_type}
          </span>
        )}
      </div>

      {block.rationale?.headline && !dead && (
        <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-ink-500">
          {block.rationale.headline}
        </p>
      )}
      <div className="mt-1">
        <SlackHint rationale={block.rationale} />
      </div>

      {!dead && !done && (
        <div className="mt-2 flex flex-wrap gap-1 opacity-70 transition group-hover:opacity-100">
          <button
            onClick={() => onWhy(block.id)}
            title="Why is this here?"
            className="rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400 transition hover:border-brand-500/60 hover:text-brand-300"
          >
            Why?
          </button>
          {pending && (
            <button
              disabled={busy}
              onClick={() => onAccept(block)}
              title="Accept"
              className="rounded border border-emerald-600/40 px-1.5 py-0.5 text-[10px] text-emerald-300 transition hover:bg-emerald-600/20 disabled:opacity-40"
            >
              <Check size={10} className="inline" /> Accept
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => onEdit(block)}
            title="Move this block"
            className="rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400 transition hover:border-sky-500/60 hover:text-sky-300 disabled:opacity-40"
          >
            <Pencil size={10} className="inline" /> Move
          </button>
          <button
            disabled={busy}
            onClick={() => onReject(block)}
            title="Reject"
            className="rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400 transition hover:border-rose-500/60 hover:text-rose-300 disabled:opacity-40"
          >
            <Ban size={10} className="inline" /> Reject
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- page */
export default function Planner() {
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [whyId, setWhyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [editing, setEditing] = useState(null);
  const [reason, setReason] = useState("clashes_with_life");
  const [comment, setComment] = useState("");
  const [newStart, setNewStart] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [focusNote, setFocusNote] = useState("");
  const [horizon, setHorizon] = useState(7);
  const [showDiff, setShowDiff] = useState(false);

  const startStr = toDateStr(weekStart);

  const plan = useApi(() => api.plan.current(), []);
  const blocks = useApi(() => api.blocks.list({ start: startStr, days: 7 }), [startStr]);
  const classes = useApi(() => api.timetable.week(startStr, 7), [startStr]);
  const check = useApi(() => api.plan.needsReplan(), []);
  const revision = useApi(
    () => (plan.data?.id ? api.plan.revision(plan.data.id) : Promise.resolve(null)),
    [plan.data?.id]
  );

  const reloadAll = async () => {
    await Promise.all([plan.reload(), blocks.reload(), check.reload(), revision.reload()]);
  };

  const days = useMemo(() => {
    const list = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const byDay = new Map(list.map((d) => [toDateStr(d), { date: d, blocks: [], classes: [] }]));
    (blocks.data || []).forEach((b) => {
      const k = toDateStr(parseDT(b.start));
      if (byDay.has(k)) byDay.get(k).blocks.push(b);
    });
    (classes.data?.week || []).forEach((d) => {
      if (byDay.has(d.date)) byDay.get(d.date).classes = d.items;
    });
    byDay.forEach((v) => v.blocks.sort((a, b) => a.start.localeCompare(b.start)));
    return [...byDay.values()];
  }, [blocks.data, classes.data, weekStart]);

  const proposed = (blocks.data || []).filter((b) => b.status === "proposed");
  const totalHours = (blocks.data || [])
    .filter((b) => b.status !== "rejected")
    .reduce((a, b) => a + b.hours, 0);

  /* ------------------------------------------------------------ actions */
  async function generate() {
    setBusy(true);
    try {
      const p = await api.plan.generate({ horizon_days: horizon, focus_note: focusNote });
      toast.success(`Plan v${p.version} ready — ${p.blocks.length} blocks.`);
      setFocusNote("");
      await reloadAll();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function replan() {
    setBusy(true);
    try {
      const p = await api.plan.replan(focusNote || "From planner", horizon);
      toast.success(`Replanned to v${p.version}. Accepted blocks were kept.`);
      await reloadAll();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function acceptAll() {
    setBusy(true);
    try {
      const r = await api.blocks.acceptAll();
      toast.success(`Accepted ${r.length} block(s).`);
      await reloadAll();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function accept(block) {
    setBusyId(block.id);
    try {
      await api.blocks.decide(block.id, { action: "accept" });
      await blocks.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject() {
    const block = rejecting;
    setBusyId(block.id);
    try {
      await api.blocks.decide(block.id, { action: "reject", reason_code: reason, comment });
      toast.info("Noted — the agent will weight that slot down next time.");
      setRejecting(null);
      setComment("");
      await Promise.all([blocks.reload(), check.reload()]);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmEdit() {
    const block = editing;
    setBusyId(block.id);
    try {
      await api.blocks.decide(block.id, {
        action: "reschedule",
        reason_code: "too_early",
        new_start: toNaiveISO(new Date(newStart)),
      });
      toast.success("Moved and locked — replans will leave it alone.");
      setEditing(null);
      await Promise.all([blocks.reload(), check.reload()]);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyId(null);
    }
  }

  const loading = plan.loading && !plan.data;

  return (
    <div className="space-y-4">
      {/* ------------------------------- controls ------------------------------- */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Steer this plan (optional)" className="min-w-[16rem] flex-1">
            <input
              className="w-full"
              placeholder="e.g. go light on Thursday · weekends off · morning only"
              value={focusNote}
              onChange={(e) => setFocusNote(e.target.value)}
            />
          </Field>
          <Field label="Horizon">
            <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              {[3, 5, 7, 10, 14].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={generate} loading={busy} icon={Sparkles}>
              Generate
            </Button>
            <Button variant="secondary" onClick={replan} loading={busy} icon={RefreshCw}>
              Replan
            </Button>
            <Button
              variant="success"
              onClick={acceptAll}
              loading={busy}
              icon={CheckCheck}
              disabled={proposed.length === 0}
            >
              Accept all ({proposed.length})
            </Button>
          </div>
        </div>

        {check.data?.needs_replan && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <span className="font-medium">Out of date:</span> {check.data.reasons.join(" · ")}
          </div>
        )}

        {plan.data && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-800 pt-3 text-[11px] text-ink-500">
            <span>
              Plan <span className="text-ink-300">v{plan.data.version}</span> · {relative(plan.data.generated_at)}
            </span>
            <span>engine {plan.data.engine_version}</span>
            <span>trigger {plan.data.trigger.replace(/_/g, " ")}</span>
            <span className="text-ink-300">{fmtHours(totalHours)} scheduled this week</span>
            {revision.data && (
              <button
                onClick={() => setShowDiff(true)}
                className="flex items-center gap-1 text-brand-400 hover:text-brand-300"
              >
                <GitCompareArrows size={12} /> What changed?
              </button>
            )}
          </div>
        )}
      </Card>

      {plan.data?.strategy_note && (
        <Card title="Strategy">
          <p className="text-sm leading-relaxed text-ink-200">{plan.data.strategy_note}</p>
        </Card>
      )}

      {/* ------------------------------- week grid ------------------------------ */}
      <Card
        title="Week"
        subtitle="Study blocks sit around your fixed classes"
        action={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              icon={ChevronLeft}
            />
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(mondayOf(new Date()))}>
              Today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              icon={ChevronRight}
            />
          </div>
        }
      >
        <ErrorState error={blocks.error} onRetry={blocks.reload} />
        {loading || blocks.loading ? (
          <Loader label="Building your week…" />
        ) : (blocks.data || []).length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No blocks this week"
            hint="Generate a plan, or move to a week that has one."
            action={
              <Button onClick={generate} loading={busy} icon={Sparkles}>
                Generate a plan
              </Button>
            }
          />
        ) : (
          <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
            {days.map(({ date, blocks: bs, classes: cs }) => {
              const isToday = toDateStr(date) === toDateStr(new Date());
              const dayHours = bs.filter((b) => b.status !== "rejected").reduce((a, b) => a + b.hours, 0);
              return (
                <div key={toDateStr(date)} className="min-w-0">
                  <div
                    className={`mb-1.5 flex items-baseline justify-between rounded-md px-1.5 py-1 ${
                      isToday ? "bg-brand-600/15 text-brand-200" : "text-ink-400"
                    }`}
                  >
                    <span className="text-[11px] font-semibold">
                      {WEEKDAYS_SHORT[(date.getDay() + 6) % 7]} {date.getDate()}
                    </span>
                    <span className="font-mono text-[10px] text-ink-500">
                      {dayHours > 0 ? fmtHours(dayHours) : "—"}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {cs.map((c) => (
                      <div
                        key={`c${c.slot_id}-${c.start}`}
                        className="rounded-md border border-dashed border-ink-800 bg-ink-900/20 px-2 py-1"
                        title={`${c.kind}${c.location ? ` · ${c.location}` : ""}`}
                      >
                        <p className="font-mono text-[10px] text-ink-600">{fmtRange(c.start, c.end)}</p>
                        <p className="truncate text-[10px] text-ink-500">{c.title}</p>
                      </div>
                    ))}

                    {bs.map((b) => (
                      <BlockCard
                        key={b.id}
                        block={b}
                        busyId={busyId}
                        onWhy={setWhyId}
                        onAccept={accept}
                        onReject={(blk) => {
                          setRejecting(blk);
                          setReason("clashes_with_life");
                          setComment("");
                        }}
                        onEdit={(blk) => {
                          setEditing(blk);
                          setNewStart(toDatetimeLocal(parseDT(blk.start)));
                        }}
                      />
                    ))}

                    {bs.length === 0 && cs.length === 0 && (
                      <p className="px-1 py-3 text-center text-[10px] text-ink-700">free</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ------------------------------- modals ------------------------------- */}
      <WhyPanel blockId={whyId} open={Boolean(whyId)} onClose={() => setWhyId(null)} />

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject this block"
        subtitle={rejecting ? rejecting.title : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmReject} loading={busyId === rejecting?.id}>
              Reject
            </Button>
          </>
        }
      >
        <p className="mb-3 text-xs leading-relaxed text-ink-400">
          The reason matters. It becomes a negative weight on that time-of-day or course, so the
          next plan proposes fewer blocks like this one.
        </p>
        <Field label="Why?">
          <select className="w-full" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REJECT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note (optional)" className="mt-3">
          <textarea
            rows={2}
            className="w-full"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything you want to remember later"
          />
        </Field>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Move this block"
        subtitle={editing ? editing.title : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={confirmEdit} loading={busyId === editing?.id}>
              Move &amp; lock
            </Button>
          </>
        }
      >
        <Field
          label="New start time"
          hint="Duration is preserved. Moved blocks are locked, so future replans work around them."
        >
          <input
            type="datetime-local"
            className="w-full"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={showDiff}
        onClose={() => setShowDiff(false)}
        size="lg"
        title="What changed in the last replan"
        subtitle={revision.data?.summary}
      >
        {!revision.data ? (
          <EmptyState icon={GitCompareArrows} title="No revision recorded yet" />
        ) : (
          <div className="space-y-4">
            <p className="rounded-lg border border-ink-800 bg-ink-900/50 px-3 py-2 text-xs text-ink-300">
              <span className="text-ink-500">Trigger:</span>{" "}
              {revision.data.trigger.replace(/_/g, " ")}
              {revision.data.trigger_detail ? ` — ${revision.data.trigger_detail}` : ""}
            </p>
            {[
              ["added", "Added", "text-emerald-300"],
              ["removed", "Removed", "text-rose-300"],
              ["moved", "Moved", "text-sky-300"],
              ["resized", "Resized", "text-amber-300"],
            ].map(([key, label, cls]) => {
              const items = revision.data.changes?.[key] || [];
              if (items.length === 0) return null;
              return (
                <div key={key}>
                  <h4 className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${cls}`}>
                    {label} ({items.length})
                  </h4>
                  <ul className="space-y-1">
                    {items.map((it, i) => (
                      <li
                        key={i}
                        className="rounded-md border border-ink-800 bg-ink-900/40 px-2.5 py-1.5 text-[11px]"
                      >
                        <span className="text-ink-100">{it.title}</span>
                        <span className="ml-1 font-mono text-ink-500">
                          {key === "moved"
                            ? `${fmtDateTime(it.from)} → ${fmtDateTime(it.to)} (${
                                it.shift_hours > 0 ? "+" : ""
                              }${it.shift_hours}h)`
                            : key === "resized"
                            ? `${it.from_hours}h → ${it.to_hours}h`
                            : `${fmtDateTime(it.start)}–${fmtRange(it.start, it.end).split("–")[1]}`}
                        </span>
                        {it.why && <p className="mt-0.5 text-ink-500">{it.why}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
