import { useMemo, useState } from "react";
import { BookOpen, CalendarDays, Clock, Plus, Trash2, UserCheck } from "lucide-react";
import { api, toDateStr } from "../services/api.js";
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
  Stat,
} from "../components/ui.jsx";
import { SLOT_KINDS, WEEKDAYS, fmtHours, titleCase } from "../utils/format.js";

const blankCourse = () => ({
  name: "",
  code: "",
  credits: 3,
  colour: "#6366f1",
  priority: 1,
  attendance_required_pct: 75,
  classes_held: 0,
  classes_attended: 0,
});

const blankSlot = () => ({
  title: "",
  course_id: "",
  kind: "lecture",
  day_of_week: 0,
  start_time: "09:00",
  end_time: "10:00",
  location: "",
});

export default function Timetable() {
  const toast = useToast();
  const [courseModal, setCourseModal] = useState(null);
  const [courseForm, setCourseForm] = useState(blankCourse);
  const [slotModal, setSlotModal] = useState(false);
  const [slotForm, setSlotForm] = useState(blankSlot);
  const [busy, setBusy] = useState(false);

  const courses = useApi(() => api.courses.list(), []);
  const slots = useApi(() => api.timetable.list(), []);
  const free = useApi(() => api.timetable.freeSlots(toDateStr(new Date()), 7), []);

  const courseById = useMemo(
    () => new Map((courses.data || []).map((c) => [c.id, c])),
    [courses.data]
  );

  const byDay = useMemo(() => {
    const g = Array.from({ length: 7 }, () => []);
    (slots.data || []).forEach((s) => g[s.day_of_week]?.push(s));
    g.forEach((d) => d.sort((a, b) => a.start_time.localeCompare(b.start_time)));
    return g;
  }, [slots.data]);

  const setC = (k) => (e) => setCourseForm((f) => ({ ...f, [k]: e.target.value }));
  const setS = (k) => (e) => setSlotForm((f) => ({ ...f, [k]: e.target.value }));

  async function saveCourse() {
    setBusy(true);
    try {
      const payload = {
        ...courseForm,
        credits: Number(courseForm.credits),
        priority: Number(courseForm.priority),
        attendance_required_pct: Number(courseForm.attendance_required_pct),
        classes_held: Number(courseForm.classes_held),
        classes_attended: Number(courseForm.classes_attended),
      };
      if (courseModal === "new") await api.courses.create(payload);
      else await api.courses.update(courseModal.id, payload);
      toast.success("Course saved.");
      setCourseModal(null);
      await courses.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function saveSlot() {
    setBusy(true);
    try {
      await api.timetable.create({
        ...slotForm,
        course_id: slotForm.course_id ? Number(slotForm.course_id) : null,
        day_of_week: Number(slotForm.day_of_week),
        start_time: `${slotForm.start_time}:00`,
        end_time: `${slotForm.end_time}:00`,
      });
      toast.success("Class added.");
      setSlotModal(false);
      setSlotForm(blankSlot());
      await Promise.all([slots.reload(), free.reload()]);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function removeSlot(s) {
    try {
      await api.timetable.remove(s.id);
      await Promise.all([slots.reload(), free.reload()]);
    } catch (e) {
      toast.error(e);
    }
  }

  async function removeCourse(c) {
    if (!window.confirm(`Delete "${c.name}"? Its classes and assignments go too.`)) return;
    try {
      await api.courses.remove(c.id);
      toast.info("Course deleted.");
      await Promise.all([courses.reload(), slots.reload(), free.reload()]);
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div className="space-y-4">
      {/* --------------------------- free capacity --------------------------- */}
      <Card
        title="Free capacity, next 7 days"
        subtitle="Exactly what the scheduler sees after classes, sleep and protected days are removed"
      >
        {free.loading && !free.data ? (
          <Loader />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Total free" value={fmtHours(free.data?.total_free_hours)} sub="schedulable" />
              <Stat
                label="Classes / week"
                value={(slots.data || []).length}
                sub={`${fmtHours(
                  (slots.data || []).reduce((a, s) => {
                    const [h1, m1] = s.start_time.split(":").map(Number);
                    const [h2, m2] = s.end_time.split(":").map(Number);
                    return a + (h2 * 60 + m2 - h1 * 60 - m1) / 60;
                  }, 0)
                )} of fixed time`}
              />
              <Stat label="Courses" value={(courses.data || []).length} />
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {Object.entries(free.data?.per_day_hours || {}).map(([d, h]) => (
                <div key={d} className="text-center">
                  <div className="mb-1 h-16 w-full rounded-md bg-ink-800/70 flex items-end overflow-hidden">
                    <div
                      className="w-full rounded-md bg-brand-500/70"
                      style={{ height: `${Math.min(100, (h / 14) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-ink-500">
                    {new Date(d).toLocaleDateString(undefined, { weekday: "short" })}
                  </p>
                  <p className="font-mono text-[10px] text-ink-400">{h}h</p>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* ------------------------------- courses ------------------------------- */}
      <Card
        title="Courses"
        subtitle="Priority scales how hard the agent fights for a course's time"
        action={
          <Button
            size="sm"
            icon={Plus}
            onClick={() => {
              setCourseForm(blankCourse());
              setCourseModal("new");
            }}
          >
            Add course
          </Button>
        }
      >
        <ErrorState error={courses.error} onRetry={courses.reload} />
        {(courses.data || []).length === 0 ? (
          <EmptyState icon={BookOpen} title="No courses yet" hint="Add your subjects first — classes and assignments hang off them." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(courses.data || []).map((c) => (
              <div key={c.id} className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: c.colour }}
                    />
                    <button
                      onClick={() => {
                        setCourseForm({ ...blankCourse(), ...c });
                        setCourseModal(c);
                      }}
                      className="min-w-0 truncate text-left text-sm text-ink-100 hover:text-brand-300"
                    >
                      {c.code ? `${c.code} · ` : ""}
                      {c.name}
                    </button>
                  </div>
                  <button
                    onClick={() => removeCourse(c)}
                    className="shrink-0 rounded p-1 text-ink-600 hover:bg-rose-600/20 hover:text-rose-300"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <p className="mt-1 text-[11px] text-ink-500">
                  priority ×{c.priority} · {c.credits} credits
                </p>

                {c.classes_held > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1 text-ink-500">
                        <UserCheck size={10} /> attendance
                      </span>
                      <span
                        className={`font-mono ${
                          c.attendance_at_risk ? "text-rose-300" : "text-emerald-300"
                        }`}
                      >
                        {c.attendance_pct?.toFixed(0)}% / {c.attendance_required_pct}%
                      </span>
                    </div>
                    <ProgressBar
                      value={c.attendance_pct || 0}
                      max={100}
                      tone={c.attendance_at_risk ? "rose" : "emerald"}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ------------------------------ timetable ------------------------------ */}
      <Card
        title="Weekly timetable"
        subtitle="Fixed commitments the planner must work around"
        action={
          <Button size="sm" icon={Plus} onClick={() => setSlotModal(true)}>
            Add class
          </Button>
        }
      >
        <ErrorState error={slots.error} onRetry={slots.reload} />
        {slots.loading && !slots.data ? (
          <Loader />
        ) : (slots.data || []).length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Timetable is empty"
            hint="Without it the agent will happily schedule study during your lectures."
            action={
              <Button icon={Plus} onClick={() => setSlotModal(true)}>
                Add your first class
              </Button>
            }
          />
        ) : (
          <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
            {byDay.map((day, i) => (
              <div key={i} className="min-w-0">
                <p className="mb-1.5 px-1 text-[11px] font-semibold text-ink-400">{WEEKDAYS[i]}</p>
                <div className="space-y-1.5">
                  {day.length === 0 && (
                    <p className="px-1 py-3 text-center text-[10px] text-ink-700">free</p>
                  )}
                  {day.map((s) => {
                    const c = courseById.get(s.course_id);
                    return (
                      <div
                        key={s.id}
                        className="group rounded-lg border border-ink-800 bg-ink-900/50 px-2 py-1.5"
                        style={c ? { borderLeft: `3px solid ${c.colour}` } : undefined}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-mono text-[10px] text-ink-400">
                            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                          </span>
                          <button
                            onClick={() => removeSlot(s)}
                            className="text-ink-700 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                        <p className="truncate text-[11px] text-ink-100">{s.title}</p>
                        <p className="truncate text-[10px] text-ink-600">
                          {titleCase(s.kind)}
                          {s.location ? ` · ${s.location}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ------------------------------- modals ------------------------------- */}
      <Modal
        open={Boolean(courseModal)}
        onClose={() => setCourseModal(null)}
        title={courseModal === "new" ? "New course" : "Edit course"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCourseModal(null)}>
              Cancel
            </Button>
            <Button onClick={saveCourse} loading={busy} disabled={!courseForm.name.trim()}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <input className="w-full" value={courseForm.name} onChange={setC("name")} />
          </Field>
          <Field label="Code">
            <input className="w-full" value={courseForm.code} onChange={setC("code")} placeholder="CS301" />
          </Field>
          <Field label="Credits">
            <input type="number" step="0.5" className="w-full" value={courseForm.credits} onChange={setC("credits")} />
          </Field>
          <Field label="Colour">
            <input type="color" className="h-9 w-full p-1" value={courseForm.colour} onChange={setC("colour")} />
          </Field>
          <Field label={`Priority ×${courseForm.priority}`} hint="0.5 deprioritise · 2 protect">
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              className="w-full accent-brand-500"
              value={courseForm.priority}
              onChange={setC("priority")}
            />
          </Field>
          <Field label="Attendance required (%)">
            <input
              type="number"
              className="w-full"
              value={courseForm.attendance_required_pct}
              onChange={setC("attendance_required_pct")}
            />
          </Field>
          <Field label="Classes held">
            <input type="number" className="w-full" value={courseForm.classes_held} onChange={setC("classes_held")} />
          </Field>
          <Field label="Classes attended" className="sm:col-span-2">
            <input
              type="number"
              className="w-full"
              value={courseForm.classes_attended}
              onChange={setC("classes_attended")}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={slotModal}
        onClose={() => setSlotModal(false)}
        title="Add a class"
        subtitle="Recurs weekly"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSlotModal(false)}>
              Cancel
            </Button>
            <Button onClick={saveSlot} loading={busy} disabled={!slotForm.title.trim()}>
              Add
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <input className="w-full" value={slotForm.title} onChange={setS("title")} placeholder="DSA Lecture" />
          </Field>
          <Field label="Course">
            <select className="w-full" value={slotForm.course_id} onChange={setS("course_id")}>
              <option value="">No course</option>
              {(courses.data || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kind">
            <select className="w-full" value={slotForm.kind} onChange={setS("kind")}>
              {SLOT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {titleCase(k)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Day" className="sm:col-span-2">
            <select className="w-full" value={slotForm.day_of_week} onChange={setS("day_of_week")}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start">
            <input type="time" className="w-full" value={slotForm.start_time} onChange={setS("start_time")} />
          </Field>
          <Field label="End">
            <input type="time" className="w-full" value={slotForm.end_time} onChange={setS("end_time")} />
          </Field>
          <Field label="Location" className="sm:col-span-2">
            <input className="w-full" value={slotForm.location} onChange={setS("location")} placeholder="LH-1" />
          </Field>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-500">
          <Clock size={12} className="mt-0.5 shrink-0" />
          A transition pad is added after every class automatically, so you are never scheduled to
          start studying the second a lecture ends.
        </p>
      </Modal>
    </div>
  );
}
