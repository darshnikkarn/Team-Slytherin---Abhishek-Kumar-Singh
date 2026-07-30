import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { api, toDatetimeLocal, toNaiveISO } from "../services/api.js";
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
} from "../components/ui.jsx";
import { ASSIGNMENT_TYPES, fmtDeadline, fmtHours, titleCase } from "../utils/format.js";

const blankForm = () => ({
  title: "",
  course_id: "",
  type: "homework",
  deadline: toDatetimeLocal(new Date(Date.now() + 3 * 86400000)),
  estimated_hours: "",
  difficulty: 3,
  grade_weight: 10,
  description: "",
});

export default function Assignments() {
  const toast = useToast();
  const fileRef = useRef(null);

  const [showDone, setShowDone] = useState(false);
  const [courseFilter, setCourseFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);

  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestText, setIngestText] = useState("");
  const [ingestCourse, setIngestCourse] = useState("");
  const [ingestResult, setIngestResult] = useState(null);
  const [ingesting, setIngesting] = useState(false);

  const courses = useApi(() => api.courses.list(), []);
  const list = useApi(
    () => api.assignments.list({ include_done: showDone, course_id: courseFilter || undefined }),
    [showDone, courseFilter]
  );

  const courseName = useMemo(() => {
    const m = new Map((courses.data || []).map((c) => [c.id, c]));
    return (id) => m.get(id)?.name || "—";
  }, [courses.data]);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "number" ? e.target.value : e.target.value }));

  function openNew() {
    setForm(blankForm());
    setEditing("new");
  }

  function openEdit(a) {
    setForm({
      title: a.title,
      course_id: a.course_id || "",
      type: a.type,
      deadline: toDatetimeLocal(new Date(a.deadline)),
      estimated_hours: a.estimated_hours,
      difficulty: a.difficulty,
      grade_weight: a.grade_weight,
      description: a.description || "",
    });
    setEditing(a);
  }

  async function save() {
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        course_id: form.course_id ? Number(form.course_id) : null,
        type: form.type,
        deadline: toNaiveISO(new Date(form.deadline)),
        difficulty: Number(form.difficulty),
        grade_weight: Number(form.grade_weight),
        description: form.description,
      };
      if (form.estimated_hours !== "" && form.estimated_hours !== null)
        payload.estimated_hours = Number(form.estimated_hours);

      if (editing === "new") {
        await api.assignments.create(payload);
        toast.success(
          payload.estimated_hours
            ? "Assignment added."
            : "Assignment added — the agent estimated the effort for you."
        );
      } else {
        await api.assignments.update(editing.id, payload);
        toast.success("Assignment updated.");
      }
      setEditing(null);
      await list.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove(a) {
    if (!window.confirm(`Delete "${a.title}"?`)) return;
    try {
      await api.assignments.remove(a.id);
      toast.info("Deleted.");
      await list.reload();
    } catch (e) {
      toast.error(e);
    }
  }

  async function complete(a) {
    try {
      await api.assignments.complete(a.id);
      toast.success(`"${a.title}" marked done.`);
      await list.reload();
    } catch (e) {
      toast.error(e);
    }
  }

  /* --------------------------------------------------------- ingestion */
  async function ingestFile(file) {
    if (!file) return;
    setIngesting(true);
    setIngestResult(null);
    try {
      const r = await api.ingest.file(file, {
        courseId: ingestCourse ? Number(ingestCourse) : undefined,
        autoCreate: true,
      });
      setIngestResult(r);
      toast.success(`Extracted ${r.extracted.length} item(s), created ${r.created_assignment_ids.length}.`);
      await list.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setIngesting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function previewText() {
    if (!ingestText.trim()) return;
    setIngesting(true);
    setIngestResult(null);
    try {
      setIngestResult(await api.ingest.preview({ text: ingestText, course_id: ingestCourse ? Number(ingestCourse) : null }));
    } catch (e) {
      toast.error(e);
    } finally {
      setIngesting(false);
    }
  }

  async function commitText() {
    setIngesting(true);
    try {
      const r = await api.ingest.text({
        text: ingestText,
        course_id: ingestCourse ? Number(ingestCourse) : null,
        auto_create: true,
      });
      setIngestResult(r);
      toast.success(`Created ${r.created_assignment_ids.length} assignment(s).`);
      setIngestText("");
      await list.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setIngesting(false);
    }
  }

  const rows = list.data || [];

  return (
    <div className="space-y-4">
      <Card
        title="Assignments"
        subtitle={`${rows.length} shown · ${fmtHours(rows.reduce((a, r) => a + r.remaining_hours, 0))} of work outstanding`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={Upload} onClick={() => setIngestOpen(true)}>
              Import syllabus
            </Button>
            <Button size="sm" icon={Plus} onClick={openNew}>
              New
            </Button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
            <option value="">All courses</option>
            {(courses.data || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ` : ""}
                {c.name}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-400">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Show completed
          </label>
        </div>

        <ErrorState error={list.error} onRetry={list.reload} />

        {list.loading && !list.data ? (
          <Loader />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            hint="Add one manually, or drop in a syllabus PDF and let the agent extract the deadlines."
            action={
              <div className="flex gap-2">
                <Button onClick={openNew} icon={Plus}>
                  Add one
                </Button>
                <Button variant="outline" onClick={() => setIngestOpen(true)} icon={Upload}>
                  Import syllabus
                </Button>
              </div>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-ink-500">
                <tr className="border-b border-ink-800">
                  <th className="pb-2 pr-3 font-medium">Title</th>
                  <th className="pb-2 pr-3 font-medium">Course</th>
                  <th className="pb-2 pr-3 font-medium">Due</th>
                  <th className="pb-2 pr-3 font-medium">Effort</th>
                  <th className="pb-2 pr-3 font-medium">Weight</th>
                  <th className="pb-2 pr-3 font-medium">Progress</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800/70">
                {rows.map((a) => {
                  const overdue = new Date(a.deadline) < new Date();
                  const flagged = a.source_meta?.needs_review;
                  return (
                    <tr key={a.id} className="align-middle hover:bg-ink-900/40">
                      <td className="py-2.5 pr-3">
                        <button
                          onClick={() => openEdit(a)}
                          className="text-left text-ink-100 hover:text-brand-300"
                        >
                          {a.title}
                        </button>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="chip border border-ink-700 bg-ink-800 text-ink-400">
                            {titleCase(a.type)}
                          </span>
                          {a.source !== "manual" && (
                            <span className="chip border border-brand-500/30 bg-brand-500/10 text-brand-300">
                              from {a.source}
                            </span>
                          )}
                          {flagged && (
                            <span
                              className="chip border border-amber-500/40 bg-amber-500/10 text-amber-300"
                              title={a.source_meta?.evidence}
                            >
                              <AlertTriangle size={9} /> check this
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-ink-400">{courseName(a.course_id)}</td>
                      <td className={`py-2.5 pr-3 ${overdue ? "text-rose-300" : "text-ink-300"}`}>
                        {fmtDeadline(a.deadline)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-ink-400">
                        {fmtHours(a.remaining_hours)}
                        <span className="text-ink-600"> / {fmtHours(a.estimated_hours)}</span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-ink-400">{a.grade_weight}%</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={a.completion_pct} max={100} className="w-16" />
                          <span className="font-mono text-[10px] text-ink-500">
                            {a.completion_pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => complete(a)}
                            title="Mark done"
                            className="rounded p-1 text-ink-500 transition hover:bg-emerald-600/20 hover:text-emerald-300"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                          <button
                            onClick={() => remove(a)}
                            title="Delete"
                            className="rounded p-1 text-ink-500 transition hover:bg-rose-600/20 hover:text-rose-300"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ------------------------------ edit modal ------------------------------ */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New assignment" : "Edit assignment"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy} disabled={!form.title.trim()}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <input className="w-full" value={form.title} onChange={set("title")} />
          </Field>
          <Field label="Course">
            <select className="w-full" value={form.course_id} onChange={set("course_id")}>
              <option value="">No course</option>
              {(courses.data || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select className="w-full" value={form.type} onChange={set("type")}>
              {ASSIGNMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Deadline" className="sm:col-span-2">
            <input type="datetime-local" className="w-full" value={form.deadline} onChange={set("deadline")} />
          </Field>
          <Field
            label="Estimated hours"
            hint="Leave blank and the agent estimates it from the title and type."
          >
            <input
              type="number"
              step="0.25"
              min="0.25"
              className="w-full"
              value={form.estimated_hours}
              onChange={set("estimated_hours")}
              placeholder="auto"
            />
          </Field>
          <Field label="Grade weight (%)">
            <input
              type="number"
              min="0"
              max="100"
              className="w-full"
              value={form.grade_weight}
              onChange={set("grade_weight")}
            />
          </Field>
          <Field
            label={`Difficulty: ${form.difficulty}/5`}
            hint="Harder work is placed in your higher-energy windows."
            className="sm:col-span-2"
          >
            <input
              type="range"
              min="1"
              max="5"
              className="w-full accent-brand-500"
              value={form.difficulty}
              onChange={set("difficulty")}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea rows={2} className="w-full" value={form.description} onChange={set("description")} />
          </Field>
        </div>
      </Modal>

      {/* ----------------------------- ingest modal ----------------------------- */}
      <Modal
        open={ingestOpen}
        onClose={() => {
          setIngestOpen(false);
          setIngestResult(null);
        }}
        size="lg"
        title="Import from a syllabus"
        subtitle="Upload a PDF, or paste anything — an LMS dump, an email, a WhatsApp forward"
      >
        <div className="space-y-4">
          <Field label="Attach these to a course (optional)">
            <select className="w-full" value={ingestCourse} onChange={(e) => setIngestCourse(e.target.value)}>
              <option value="">No course</option>
              {(courses.data || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              ingestFile(e.dataTransfer.files?.[0]);
            }}
            className="grid cursor-pointer place-items-center gap-1 rounded-xl border-2 border-dashed border-ink-700 py-7 text-center transition hover:border-brand-500/50"
            onClick={() => fileRef.current?.click()}
          >
            <FileText size={22} className="text-ink-600" />
            <p className="text-xs text-ink-300">Drop a PDF here, or click to browse</p>
            <p className="text-[10px] text-ink-600">PDF or plain text, up to 8 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,text/plain,application/pdf"
              className="hidden"
              onChange={(e) => ingestFile(e.target.files?.[0])}
            />
          </div>

          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-ink-600">
            <div className="h-px flex-1 bg-ink-800" /> or paste <div className="h-px flex-1 bg-ink-800" />
          </div>

          <Field label="Paste text">
            <textarea
              rows={5}
              className="w-full font-mono text-[11px]"
              value={ingestText}
              onChange={(e) => setIngestText(e.target.value)}
              placeholder={"Assignment 1: due 12 Aug 2026, worth 10%\nMidterm exam on 18 Aug 2026 - 25%"}
            />
          </Field>

          <div className="flex gap-2">
            <Button variant="outline" onClick={previewText} loading={ingesting} disabled={!ingestText.trim()} icon={Wand2}>
              Preview (saves nothing)
            </Button>
            <Button onClick={commitText} loading={ingesting} disabled={!ingestText.trim()} icon={Sparkles}>
              Extract &amp; add
            </Button>
          </div>

          {ingesting && <Loader label="Reading the document…" />}

          {ingestResult && (
            <div className="space-y-2">
              <p className="text-xs text-ink-400">
                <span className="text-ink-200">{ingestResult.extracted.length}</span> item(s) found via{" "}
                <span className="font-mono text-ink-300">{ingestResult.method}</span>
                {ingestResult.created_assignment_ids.length > 0 &&
                  ` · ${ingestResult.created_assignment_ids.length} added`}
              </p>

              {ingestResult.warnings?.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                  {ingestResult.warnings.map((w, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-amber-300/90">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}

              <div className="overflow-x-auto rounded-lg border border-ink-800">
                <table className="w-full min-w-[36rem] text-left text-[11px]">
                  <thead className="bg-ink-900/60 text-[10px] uppercase tracking-wide text-ink-500">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Title</th>
                      <th className="px-2 py-1.5 font-medium">Type</th>
                      <th className="px-2 py-1.5 font-medium">Deadline</th>
                      <th className="px-2 py-1.5 font-medium">Effort</th>
                      <th className="px-2 py-1.5 font-medium">Weight</th>
                      <th className="px-2 py-1.5 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-800/70">
                    {ingestResult.extracted.map((it, i) => (
                      <tr key={i} className={it.needs_review ? "bg-amber-500/[0.04]" : ""}>
                        <td className="px-2 py-1.5">
                          <p className="text-ink-100">{it.title}</p>
                          {it.evidence && (
                            <p
                              className="mt-0.5 truncate font-mono text-[10px] text-ink-600"
                              title={it.evidence}
                            >
                              “{it.evidence}”
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-ink-400">{titleCase(it.type)}</td>
                        <td className="px-2 py-1.5 text-ink-300">
                          {it.deadline ? fmtDeadline(it.deadline) : (
                            <span className="text-amber-400">{it.deadline_text || "unknown"}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-ink-400">
                          {it.estimated_hours ? `${it.estimated_hours}h` : "—"}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-ink-400">
                          {it.grade_weight != null ? `${it.grade_weight}%` : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`font-mono ${
                              it.confidence >= 0.75
                                ? "text-emerald-400"
                                : it.confidence >= 0.6
                                ? "text-amber-400"
                                : "text-rose-400"
                            }`}
                          >
                            {(it.confidence * 100).toFixed(0)}%
                          </span>
                          {it.needs_review && (
                            <span className="ml-1 text-[9px] uppercase text-amber-400">check</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] leading-relaxed text-ink-600">
                Every row carries the exact source text that justifies it. Anything the parser could
                not corroborate against a date literally present in the document is flagged, rather
                than quietly trusted.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
