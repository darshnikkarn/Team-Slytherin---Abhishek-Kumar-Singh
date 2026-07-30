import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BellRing,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";
import { fmtDateTime } from "../utils/format.js";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/planner", label: "Planner", icon: Sparkles },
  { to: "/assignments", label: "Assignments", icon: ClipboardList },
  { to: "/timetable", label: "Timetable", icon: CalendarDays },
  { to: "/progress", label: "Progress", icon: TrendingUp },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function Reminders() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);

  const load = () =>
    api.reminders
      .list(72)
      .then((r) => setItems(Array.isArray(r) ? r : []))
      .catch(() => setItems([]));

  useEffect(() => {
    load();
    const id = setInterval(load, 120000);
    return () => clearInterval(id);
  }, []);

  const urgent = items.filter((r) => r.severity !== "info").length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
        aria-label="Reminders"
      >
        <BellRing size={17} />
        {items.length > 0 && (
          <span
            className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
              urgent ? "bg-rose-500" : "bg-brand-500"
            }`}
          >
            {items.length > 9 ? "9+" : items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 animate-fade-in rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
            <div className="border-b border-ink-800 px-4 py-2.5 text-xs font-semibold text-ink-200">
              Reminders
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-ink-500">Nothing pending.</p>
              )}
              {items.map((r) => (
                <div key={r.id} className="border-b border-ink-800/60 px-4 py-2.5 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-xs font-medium ${
                        r.severity === "critical"
                          ? "text-rose-300"
                          : r.severity === "warning"
                          ? "text-amber-300"
                          : "text-ink-200"
                      }`}
                    >
                      {r.title}
                    </p>
                    <button
                      onClick={() =>
                        api.reminders
                          .dismiss(r.id)
                          .then(() => setItems((xs) => xs.filter((x) => x.id !== r.id)))
                      }
                      className="shrink-0 text-ink-600 hover:text-ink-300"
                      aria-label="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {r.body && <p className="mt-0.5 text-[11px] leading-snug text-ink-500">{r.body}</p>}
                  <p className="mt-1 font-mono text-[10px] text-ink-600">{fmtDateTime(r.fire_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function MainLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const nav = (
    <nav className="space-y-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-brand-600/15 text-brand-200 ring-1 ring-inset ring-brand-500/30"
                : "text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            }`
          }
        >
          <Icon size={16} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full">
      {/* desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900/40 p-4 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-1">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            <Sparkles size={16} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink-50">Study Planner</p>
            <p className="text-[10px] uppercase tracking-wider text-ink-500">Agent</p>
          </div>
        </div>
        {nav}
        <div className="mt-auto space-y-2 border-t border-ink-800 pt-3">
          <p className="truncate px-1 text-xs text-ink-400">{user?.name || user?.email}</p>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-400 transition hover:bg-ink-800 hover:text-rose-300"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-ink-800 bg-ink-900 p-4">
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-50">Study Planner</p>
              <button onClick={() => setMobileOpen(false)} className="text-ink-400">
                <X size={18} />
              </button>
            </div>
            {nav}
            <button
              onClick={logout}
              className="mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-400 hover:text-rose-300"
            >
              <LogOut size={15} /> Sign out
            </button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-ink-800 bg-ink-950/80 px-4 py-2.5 backdrop-blur sm:px-6">
          <button
            className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <h1 className="truncate text-sm font-semibold text-ink-200">
            {NAV.find((n) => (n.end ? n.to === location.pathname : location.pathname.startsWith(n.to)))
              ?.label || "Study Planner"}
          </h1>
          <Reminders />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
