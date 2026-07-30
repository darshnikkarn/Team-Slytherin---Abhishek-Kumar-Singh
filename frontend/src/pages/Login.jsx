import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import { Button, Field } from "../components/ui.jsx";
import { api, API_BASE } from "../services/api.js";

export default function Login() {
  const { login, register } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "demo@student.edu", password: "demo1234", name: "" });
  const [busy, setBusy] = useState(false);
  const [reachable, setReachable] = useState(null);

  useEffect(() => {
    api
      .health()
      .then((h) => setReachable(h))
      .catch(() => setReachable(false));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await login(form.email.trim(), form.password);
      else await register({ email: form.email.trim(), password: form.password, name: form.name });
      toast.success(mode === "login" ? "Welcome back." : "Account created.");
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white">
            <Sparkles size={20} />
          </div>
          <h1 className="text-lg font-semibold text-ink-50">Study Planner Agent</h1>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-500">
            Your timetable, deadlines and goals become a weekly plan that rebuilds itself when
            things change.
          </p>
        </div>

        <form onSubmit={submit} className="card card-pad space-y-3">
          <div className="mb-1 flex rounded-lg border border-ink-800 bg-ink-950 p-0.5 text-xs">
            {["login", "register"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-1.5 font-medium capitalize transition ${
                  mode === m ? "bg-ink-800 text-ink-50" : "text-ink-500 hover:text-ink-300"
                }`}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {mode === "register" && (
            <Field label="Name">
              <input className="w-full" value={form.name} onChange={set("name")} placeholder="Your name" />
            </Field>
          )}

          <Field label="Email">
            <input
              type="email"
              required
              className="w-full"
              value={form.email}
              onChange={set("email")}
              autoComplete="email"
            />
          </Field>

          <Field label="Password" hint={mode === "register" ? "At least 6 characters." : undefined}>
            <input
              type="password"
              required
              minLength={6}
              className="w-full"
              value={form.password}
              onChange={set("password")}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </Field>

          <Button type="submit" loading={busy} className="w-full" size="lg">
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>

          {mode === "login" && (
            <p className="text-center text-[11px] text-ink-500">
              Seeded demo account is pre-filled. Run <code className="text-ink-400">python seed.py</code>{" "}
              on the backend first.
            </p>
          )}
        </form>

        <div className="mt-4 text-center text-[11px]">
          {reachable === null && <span className="text-ink-600">Checking API…</span>}
          {reachable === false && (
            <span className="text-rose-400">
              Cannot reach the API at <code>{API_BASE}</code>. Start the backend, or set VITE_API_URL.
            </span>
          )}
          {reachable && reachable.status === "ok" && (
            <span className="text-ink-600">
              API ok · engine {reachable.engine_version} ·{" "}
              {reachable.llm?.configured ? "LLM on" : "LLM off (deterministic mode)"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
