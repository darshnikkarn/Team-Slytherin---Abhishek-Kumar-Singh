import { format, formatDistanceToNowStrict, isToday, isTomorrow, parseISO } from "date-fns";

/** The backend sends offset-less local datetimes; `new Date` reads those as local. */
export const parseDT = (s) => (s instanceof Date ? s : parseISO(s));

export const fmtTime = (s) => format(parseDT(s), "HH:mm");
export const fmtDay = (s) => format(parseDT(s), "EEE d MMM");
export const fmtDateTime = (s) => format(parseDT(s), "EEE d MMM, HH:mm");
export const fmtWeekday = (s) => format(parseDT(s), "EEEE");
export const fmtShortDate = (s) => format(parseDT(s), "d MMM");

export function fmtRange(start, end) {
  return `${fmtTime(start)}–${fmtTime(end)}`;
}

export function fmtHours(h) {
  if (h === null || h === undefined || Number.isNaN(h)) return "—";
  const n = Number(h);
  if (n === 0) return "0h";
  if (n < 1) return `${Math.round(n * 60)}m`;
  const whole = Math.floor(n);
  const mins = Math.round((n - whole) * 60);
  return mins ? `${whole}h ${mins}m` : `${whole}h`;
}

export function fmtDeadline(s) {
  const d = parseDT(s);
  if (isToday(d)) return `Today ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `Tomorrow ${format(d, "HH:mm")}`;
  return format(d, "EEE d MMM, HH:mm");
}

export function relative(s) {
  try {
    return `${formatDistanceToNowStrict(parseDT(s), { addSuffix: true })}`;
  } catch {
    return "";
  }
}

export const pct = (v, digits = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${(Number(v) * 100).toFixed(digits)}%`;

export const titleCase = (s) =>
  String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const FACTOR_LABELS = {
  deadline_pressure: "Deadline pressure",
  grade_impact: "Grade impact",
  user_priority: "Your priority",
  energy_match: "Energy match",
  neglect: "Neglect",
  spacing: "Spacing",
};

export const BLOCK_TYPE_LABELS = {
  study: "Study",
  review: "Revision",
  exam_prep: "Exam prep",
  buffer: "Buffer",
  catchup: "Catch-up",
  fixed: "Fixed",
  break: "Break",
};

export const ASSIGNMENT_TYPES = [
  "homework",
  "project",
  "exam",
  "quiz",
  "reading",
  "lab_report",
  "presentation",
  "other",
];

export const SLOT_KINDS = ["lecture", "lab", "tutorial", "seminar", "fixed", "personal"];

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const REJECT_REASONS = [
  { value: "clashes_with_life", label: "Clashes with something else" },
  { value: "too_early", label: "Too early in the day" },
  { value: "too_late", label: "Too late in the day" },
  { value: "too_long", label: "Session is too long" },
  { value: "wrong_subject", label: "Wrong subject right now" },
  { value: "too_hard_then", label: "I can't do hard work then" },
  { value: "already_done", label: "Already finished this" },
];

/** Deterministic colour when the backend hasn't given us one. */
export function courseColour(c) {
  if (c?.colour) return c.colour;
  const palette = ["#6366f1", "#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#ef4444"];
  const key = String(c?.id ?? c?.name ?? "x");
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % palette.length;
  return palette[h];
}
