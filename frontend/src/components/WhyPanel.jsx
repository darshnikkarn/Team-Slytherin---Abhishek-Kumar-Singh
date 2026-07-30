/**
 * The transparency surface.
 *
 * The backend stores, for every block, the six normalised factors, the weight
 * applied to each, and the resulting contribution. This panel renders that
 * arithmetic verbatim — including the check that the contributions actually
 * sum to the reported score. That check is the point: it is what separates a
 * real explanation from a plausible-sounding story generated after the fact.
 */
import { useEffect, useState } from "react";
import { Ban, Check, Scale, Sparkles } from "lucide-react";
import { api } from "../services/api.js";
import { FACTOR_LABELS, fmtHours, titleCase } from "../utils/format.js";
import { Loader, Modal, ErrorState } from "./ui.jsx";

function FactorRow({ f, maxContribution }) {
  const share = maxContribution > 0 ? Math.max(0, f.contribution) / maxContribution : 0;
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-ink-200">
          {FACTOR_LABELS[f.name] || titleCase(f.name)}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-ink-400">
          {f.value.toFixed(2)} × {f.weight.toFixed(2)} ={" "}
          <span className="text-ink-100">{f.contribution.toFixed(3)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${share * 100}%` }}
        />
      </div>
      {f.explanation && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">{f.explanation}</p>
      )}
    </div>
  );
}

export default function WhyPanel({ blockId, open, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !blockId) return undefined;
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    api.blocks
      .explain(blockId, true)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, blockId]);

  const factors = data?.factors ?? [];
  const sum = factors.reduce((a, f) => a + (f.contribution || 0), 0);
  const maxC = Math.max(0.0001, ...factors.map((f) => Math.abs(f.contribution || 0)));
  const reconstructs = Math.abs(sum - (data?.score ?? 0)) < 0.02;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Why is this block here?"
      subtitle={data ? `${data.title} · ${data.when}` : undefined}
    >
      {loading && <Loader label="Reading the engine's reasoning…" />}
      <ErrorState error={error} />

      {data && !loading && (
        <div className="space-y-5">
          <p className="rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2.5 text-sm leading-relaxed text-brand-100">
            {data.headline || data.narrative}
          </p>

          {data.narrative && data.narrative !== data.headline && (
            <div className="flex gap-2 text-xs leading-relaxed text-ink-300">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-ink-500" />
              <p>{data.narrative}</p>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                <Scale size={13} /> Score breakdown
              </h4>
              <span className="font-mono text-[11px] text-ink-400">
                total <span className="text-ink-100">{(data.score ?? 0).toFixed(3)}</span>
              </span>
            </div>
            <div className="divide-y divide-ink-800 rounded-lg border border-ink-800 bg-ink-900/40 px-3">
              {factors.map((f) => (
                <FactorRow key={f.name} f={f} maxContribution={maxC} />
              ))}
            </div>
            <p
              className={`mt-1.5 font-mono text-[11px] ${
                reconstructs ? "text-emerald-400/80" : "text-amber-400/90"
              }`}
            >
              {reconstructs ? "✓" : "!"} contributions sum to {sum.toFixed(3)} — the reported score
              {reconstructs ? "" : " (mismatch)"}
            </p>
          </div>

          {data.constraints_applied?.length > 0 && (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                <Check size={13} /> Constraints enforced
              </h4>
              <ul className="space-y-1">
                {data.constraints_applied.map((c, i) => (
                  <li key={i} className="flex gap-2 text-xs text-ink-300">
                    <span className="text-emerald-500">✓</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.alternatives_rejected?.length > 0 && (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                <Ban size={13} /> What lost this slot
              </h4>
              <ul className="space-y-1.5">
                {data.alternatives_rejected.map((a, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-ink-800 bg-ink-900/40 px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-ink-200">{a.title}</span>
                    <span className="text-ink-500"> — {a.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Compact inline version used inside a block card, no network call. */
export function InlineRationale({ rationale }) {
  if (!rationale?.headline) return null;
  return (
    <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-ink-500">
      {rationale.headline}
    </p>
  );
}

export function SlackHint({ rationale }) {
  const slack = rationale?.slack_hours_at_schedule_time;
  const pressure = rationale?.cohort_pressure;
  if (slack === undefined || slack === null) return null;
  const bad = pressure >= 1;
  return (
    <span className={`font-mono text-[10px] ${bad ? "text-rose-400" : "text-ink-500"}`}>
      slack {fmtHours(slack)} · pressure {Number(pressure ?? 0).toFixed(2)}
    </span>
  );
}
