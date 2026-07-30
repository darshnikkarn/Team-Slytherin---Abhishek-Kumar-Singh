/**
 * Small shared primitives. Kept in one file on purpose: a hackathon repo with
 * eleven single-component files costs more to navigate than it saves.
 */
import { Loader2, X } from "lucide-react";
import { useEffect } from "react";

/* ------------------------------------------------------------------ Button */
const VARIANTS = {
  primary: "bg-brand-600 text-white hover:bg-brand-500 shadow-sm shadow-brand-900/40",
  secondary: "bg-ink-800 text-ink-100 hover:bg-ink-700 border border-ink-700",
  ghost: "text-ink-300 hover:text-ink-50 hover:bg-ink-800",
  danger: "bg-rose-600/90 text-white hover:bg-rose-500",
  success: "bg-emerald-600/90 text-white hover:bg-emerald-500",
  outline: "border border-ink-700 text-ink-200 hover:bg-ink-800",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  icon: Icon,
  className = "",
  ...rest
}) {
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3 py-2 text-sm", lg: "px-4 py-2.5 text-sm" };
  return (
    <button
      className={`btn ${VARIANTS[variant]} ${sizes[size]} ${className}`}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- Card */
export function Card({ title, subtitle, action, children, className = "", bodyClass = "" }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-ink-800 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={`card-pad ${bodyClass}`}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ States */
export function Loader({ label = "Loading…", className = "" }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-10 text-sm text-ink-400 ${className}`}>
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }) {
  return <div className={`skeleton ${className}`} />;
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {Icon && <Icon size={28} className="text-ink-600" />}
      <p className="text-sm font-medium text-ink-300">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-ink-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
      <p className="font-medium">Could not load this.</p>
      <p className="mt-1 text-xs text-rose-300/90">{error.message || String(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Badges */
export const RISK_STYLES = {
  on_track: { label: "On track", cls: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" },
  tight: { label: "Tight", cls: "bg-amber-500/15 text-amber-300 border border-amber-500/30" },
  at_risk: { label: "At risk", cls: "bg-orange-500/15 text-orange-300 border border-orange-500/30" },
  infeasible: { label: "Infeasible", cls: "bg-rose-500/15 text-rose-300 border border-rose-500/30" },
};

export function RiskBadge({ risk }) {
  const s = RISK_STYLES[risk] || RISK_STYLES.on_track;
  return <span className={`chip ${s.cls}`}>{s.label}</span>;
}

const STATUS_STYLES = {
  proposed: "bg-brand-500/15 text-brand-300 border border-brand-500/30",
  accepted: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  edited: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  rejected: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
  completed: "bg-emerald-600/20 text-emerald-200 border border-emerald-500/40",
  missed: "bg-rose-600/20 text-rose-200 border border-rose-500/40",
  skipped: "bg-ink-700 text-ink-300 border border-ink-600",
};

export function StatusBadge({ status }) {
  return (
    <span className={`chip ${STATUS_STYLES[status] || STATUS_STYLES.proposed}`}>
      {String(status).replace(/_/g, " ")}
    </span>
  );
}

/* -------------------------------------------------------------------- Bar */
export function ProgressBar({ value, max = 1, tone = "brand", className = "", showOverflow = true }) {
  const raw = max > 0 ? value / max : 0;
  const pct = Math.max(0, Math.min(1, raw)) * 100;
  const over = showOverflow && raw > 1;
  const tones = {
    brand: "bg-brand-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-ink-800 ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${over ? "bg-rose-500" : tones[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Modal */
export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8">
      <div
        className={`w-full ${widths[size]} animate-fade-in rounded-xl border border-ink-700 bg-ink-900 shadow-2xl`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-800 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-50">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-ink-500 transition hover:text-ink-200" aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-ink-800 px-5 py-3">{footer}</footer>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Field */
export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-ink-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-ink-500">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, sub, tone = "default" }) {
  const tones = {
    default: "text-ink-50",
    good: "text-emerald-300",
    warn: "text-amber-300",
    bad: "text-rose-300",
  };
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/50 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-500">{sub}</p>}
    </div>
  );
}
