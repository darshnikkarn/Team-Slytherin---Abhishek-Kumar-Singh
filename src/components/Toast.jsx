import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

const ToastContext = createContext(null);

const STYLES = {
  success: { icon: CheckCircle2, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" },
  error: { icon: XCircle, cls: "border-rose-500/40 bg-rose-500/10 text-rose-200" },
  warning: { icon: AlertTriangle, cls: "border-amber-500/40 bg-amber-500/10 text-amber-200" },
  info: { icon: Info, cls: "border-brand-500/40 bg-brand-500/10 text-brand-200" },
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (message, kind = "info", ttl = 5000) => {
      const id = Math.random().toString(36).slice(2);
      setItems((xs) => [...xs, { id, message, kind }]);
      if (ttl) setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (m) => push(m, "success"),
      error: (m) => push(typeof m === "string" ? m : m?.message || "Something went wrong", "error", 8000),
      warning: (m) => push(m, "warning", 7000),
      info: (m) => push(m, "info"),
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => {
          const { icon: Icon, cls } = STYLES[t.kind] || STYLES.info;
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex animate-fade-in items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-xl backdrop-blur ${cls}`}
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 opacity-60 transition hover:opacity-100"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
