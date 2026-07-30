/**
 * API client for the Study Planner Agent backend.
 *
 * Base URL resolution
 * -------------------
 *  dev  : VITE_API_URL is blank -> requests go to "/api/..." and Vite proxies
 *         them to http://127.0.0.1:8000. Same-origin, so no CORS at all.
 *  prod : VITE_API_URL = "https://your-api.onrender.com" -> requests go to
 *         "https://your-api.onrender.com/api/...".
 *
 * Datetime contract
 * -----------------
 * The backend stores and returns *naive local* datetimes ("2026-08-03T14:30:00").
 * Sending `Date.toISOString()` would append "Z" and silently shift every block
 * by the UTC offset — a 5h30m error in IST. Always serialise with `toNaiveISO`.
 * Reading is safe: JS parses an offset-less date-time string as local time.
 */

const RAW_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
export const API_BASE = `${RAW_BASE}/api`;

const TOKEN_KEY = "spa_token";
const USER_KEY = "spa_user";

/* ------------------------------------------------------------------ token */
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  },
  setUser: (u) => localStorage.setItem(USER_KEY, JSON.stringify(u)),
};

/* ------------------------------------------------------------- datetimes */
const pad = (n) => String(n).padStart(2, "0");

/** Date -> "YYYY-MM-DDTHH:MM:SS" in local time (what the backend expects). */
export function toNaiveISO(d) {
  const x = d instanceof Date ? d : new Date(d);
  return (
    `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}` +
    `T${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`
  );
}

/** Date -> "YYYY-MM-DD". */
export function toDateStr(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/** Value for <input type="datetime-local"> (no seconds). */
export function toDatetimeLocal(d) {
  return toNaiveISO(d).slice(0, 16);
}

/* ------------------------------------------------------------------ core */
export class ApiError extends Error {
  constructor(status, detail, body) {
    super(typeof detail === "string" ? detail : "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.body = body;
  }
}

/** Fires when the server rejects our token, so AuthContext can log out. */
const UNAUTHORIZED_EVENT = "spa:unauthorized";
export const onUnauthorized = (fn) => {
  window.addEventListener(UNAUTHORIZED_EVENT, fn);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, fn);
};

function readDetail(body, status) {
  if (!body) return `HTTP ${status}`;
  const d = body.detail;
  if (typeof d === "string") return d;
  // FastAPI validation errors: [{loc:[...], msg:"...", type:"..."}]
  if (Array.isArray(d)) {
    return d
      .map((e) => {
        const field = Array.isArray(e.loc) ? e.loc.filter((p) => p !== "body").join(".") : "";
        return field ? `${field}: ${e.msg}` : e.msg;
      })
      .join("; ");
  }
  return `HTTP ${status}`;
}

async function request(path, { method = "GET", body, isForm = false, signal } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm && body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(
      0,
      `Cannot reach the API at ${API_BASE}. Is the backend running?`,
      null
    );
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && token) {
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(res.status, readDetail(parsed, res.status), parsed);
  }
  return parsed;
}

const qs = (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") sp.append(k, v);
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
};

const get = (p, params, opts) => request(`${p}${qs(params)}`, opts);
const post = (p, body, opts) => request(p, { method: "POST", body, ...opts });
const patch = (p, body) => request(p, { method: "PATCH", body });
const del = (p) => request(p, { method: "DELETE" });

/* ================================================================== API */
export const api = {
  health: () => request("/health"),

  /* ---------------------------------------------------------- auth */
  auth: {
    register: (payload) => post("/auth/register", payload),
    login: (email, password) => post("/auth/login", { email, password }),
    me: () => get("/auth/me"),
    getPreferences: () => get("/auth/preferences"),
    updatePreferences: (patchBody) => patch("/auth/preferences", patchBody),
    resetLearning: () => post("/auth/preferences/reset-learning"),
  },

  /* ------------------------------------------------------- courses */
  courses: {
    list: () => get("/courses"),
    create: (payload) => post("/courses", payload),
    update: (id, payload) => patch(`/courses/${id}`, payload),
    remove: (id) => del(`/courses/${id}`),
    attendance: (id, remainingClasses = 12) =>
      get(`/courses/${id}/attendance`, { remaining_classes: remainingClasses }),
  },

  /* ----------------------------------------------------- timetable */
  timetable: {
    list: () => get("/timetable"),
    create: (payload) => post("/timetable", payload),
    bulk: (slots, replaceExisting = false) =>
      post("/timetable/bulk", { slots, replace_existing: replaceExisting }),
    update: (id, payload) => patch(`/timetable/${id}`, payload),
    remove: (id) => del(`/timetable/${id}`),
    week: (start, days = 7) => get("/timetable/week", { start, days }),
    freeSlots: (start, days = 7) => get("/timetable/free-slots", { start, days }),
  },

  exceptions: {
    list: () => get("/calendar-exceptions"),
    create: (payload) => post("/calendar-exceptions", payload),
    remove: (id) => del(`/calendar-exceptions/${id}`),
  },

  /* --------------------------------------------------- assignments */
  assignments: {
    list: (params) => get("/assignments", params),
    create: (payload) => post("/assignments", payload),
    bulk: (items) => post("/assignments/bulk", items),
    get: (id) => get(`/assignments/${id}`),
    update: (id, payload) => patch(`/assignments/${id}`, payload),
    remove: (id) => del(`/assignments/${id}`),
    complete: (id) => post(`/assignments/${id}/complete`),
    reestimate: (id) => post(`/assignments/${id}/reestimate`),
  },

  /* ---------------------------------------------------------- plan */
  plan: {
    generate: (payload = {}) =>
      post("/plan/generate", {
        horizon_days: 7,
        preserve_accepted: true,
        use_llm_narrative: true,
        trigger: "manual",
        focus_note: "",
        ...payload,
      }),
    replan: (reason = "", horizonDays = 7) =>
      post(`/plan/replan${qs({ reason, horizon_days: horizonDays })}`),
    needsReplan: () => get("/plan/needs-replan"),
    current: () => get("/plan/current"),
    history: (limit = 20) => get("/plan/history", { limit }),
    byId: (id) => get(`/plan/${id}`),
    diagnostics: (id) => get(`/plan/${id}/diagnostics`),
    revision: (id) => get(`/plan/${id}/revision`),
    allRevisions: (limit = 20) => get("/plan/revisions/all", { limit }),
    ask: (question) => post("/plan/ask", { question }),
  },

  /* -------------------------------------------------------- blocks */
  blocks: {
    list: (params) => get("/blocks", params),
    today: () => get("/blocks/today"),
    decide: (id, decision) => post(`/blocks/${id}/decision`, decision),
    bulkDecide: (blockIds, action, reasonCode = "") =>
      post("/blocks/bulk-decision", {
        block_ids: blockIds,
        action,
        reason_code: reasonCode,
      }),
    acceptAll: () => post("/blocks/accept-all"),
    patch: (id, payload) => patch(`/blocks/${id}`, payload),
    remove: (id) => del(`/blocks/${id}`),
    explain: (id, useLlm = true) => get(`/blocks/${id}/explain`, { use_llm: useLlm }),
  },

  /* ------------------------------------------------------ progress */
  progress: {
    log: (payload) => post("/progress", payload),
    list: (params) => get("/progress", params),
    remove: (id) => del(`/progress/${id}`),
    summary: (windowDays = 7) => get("/progress/summary", { window_days: windowDays }),
    timeseries: (days = 28) => get("/progress/timeseries", { days }),
  },

  reminders: {
    list: (withinHours = 48) => get("/reminders", { within_hours: withinHours }),
    dismiss: (id) => post(`/reminders/${id}/dismiss`),
  },

  insights: {
    dashboard: () => get("/insights/dashboard"),
  },

  /* -------------------------------------------------------- ingest */
  ingest: {
    text: (payload) => post("/ingest/text", { auto_create: true, ...payload }),
    preview: (payload) => post("/ingest/preview", { auto_create: false, ...payload }),
    file: (file, { courseId, courseHint = "", autoCreate = true } = {}) => {
      const fd = new FormData();
      fd.append("file", file);
      if (courseId) fd.append("course_id", String(courseId));
      fd.append("course_hint", courseHint);
      fd.append("auto_create", String(autoCreate));
      return post("/ingest/file", fd, { isForm: true });
    },
  },
};

export default api;
