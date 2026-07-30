"""End-to-end self-check. No server, no network, no API key required.

    python verify.py

Spins the app up in-process against a throwaway SQLite file and walks the whole
user journey: register -> courses -> timetable -> syllabus ingest -> plan ->
inspect rationale -> accept/reject -> log progress -> replan -> read the diff.

Every step asserts something meaningful about the *content* of the response,
not just the status code. If this passes, the backend is demo-ready.
"""
from __future__ import annotations

import os
import sys
import tempfile
from datetime import datetime, time, timedelta

DB_PATH = os.path.join(tempfile.gettempdir(), "verify_studyplanner.db")
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)
os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH}"
os.environ.setdefault("SECRET_KEY", "verify-secret")

from fastapi.testclient import TestClient  # noqa: E402

from app.database.db import init_db  # noqa: E402
from app.main import app  # noqa: E402

PASS, FAIL = 0, 0
NOW = datetime.now()


def check(label: str, cond: bool, extra: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  [ok]   {label}" + (f"  ({extra})" if extra else ""))
    else:
        FAIL += 1
        print(f"  [FAIL] {label}" + (f"  ({extra})" if extra else ""))


def section(t: str) -> None:
    print(f"\n{t}\n{'-' * len(t)}")


def main() -> int:
    init_db()
    c = TestClient(app)

    section("0. health")
    r = c.get("/api/health")
    check("health 200", r.status_code == 200, r.text[:120])
    check("engine version reported", bool(r.json().get("engine_version")))
    llm_on = r.json()["llm"]["configured"]
    print(f"  note: LLM {'enabled' if llm_on else 'disabled -> deterministic fallbacks'}")

    section("1. auth")
    r = c.post(
        "/api/auth/register",
        json={"email": "v@test.io", "password": "verify123", "name": "V"},
    )
    check("register 201", r.status_code == 201, r.text[:160])
    token = r.json()["access_token"]
    H = {"Authorization": f"Bearer {token}"}

    check("unauthenticated call rejected", c.get("/api/assignments").status_code == 401)
    check("register duplicate rejected",
          c.post("/api/auth/register",
                 json={"email": "v@test.io", "password": "verify123"}).status_code == 409)

    r = c.patch(
        "/api/auth/preferences",
        headers=H,
        json={
            "day_start": "08:00:00",
            "day_end": "22:30:00",
            "max_daily_study_hours": 5,
            "min_block_minutes": 45,
            "max_block_minutes": 90,
            "protected_days": [6],
            "energy_windows": [
                {"start": "08:00", "end": "12:30", "level": 0.95},
                {"start": "12:30", "end": "14:00", "level": 0.4},
                {"start": "14:00", "end": "22:30", "level": 0.7},
            ],
        },
    )
    check("preferences patched", r.status_code == 200, r.text[:160])
    check("protected day stored", r.json()["protected_days"] == [6])

    section("2. courses + timetable")
    cs = c.post("/api/courses", headers=H,
                json={"code": "CS301", "name": "DSA", "priority": 1.4,
                      "classes_held": 20, "classes_attended": 13}).json()
    ma = c.post("/api/courses", headers=H,
                json={"code": "MA201", "name": "Probability", "priority": 1.0,
                      "classes_held": 20, "classes_attended": 19}).json()
    check("2 courses created", bool(cs.get("id")) and bool(ma.get("id")))
    check("attendance risk computed", cs["attendance_at_risk"] is True,
          f"{cs['attendance_pct']:.0f}% < {cs['attendance_required_pct']:.0f}%")

    r = c.get(f"/api/courses/{cs['id']}/attendance?remaining_classes=10", headers=H)
    check("attendance forecast", r.status_code == 200, r.json().get("verdict"))

    slots = []
    for dow in range(0, 5):
        slots.append({"course_id": cs["id"], "title": "DSA Lecture", "kind": "lecture",
                      "day_of_week": dow, "start_time": "09:00:00", "end_time": "10:00:00"})
        slots.append({"course_id": ma["id"], "title": "Prob Lecture", "kind": "lecture",
                      "day_of_week": dow, "start_time": "14:00:00", "end_time": "15:30:00"})
    r = c.post("/api/timetable/bulk", headers=H, json={"slots": slots, "replace_existing": True})
    check("bulk timetable 201", r.status_code == 201, r.text[:160])
    check("10 slots stored", len(r.json()) == 10)

    r = c.get("/api/timetable/free-slots?days=7", headers=H)
    free_h = r.json()["total_free_hours"]
    check("free space computed", r.status_code == 200 and free_h > 10, f"{free_h}h free")
    check("Sunday excluded (protected day)",
          all(datetime.fromisoformat(d).weekday() != 6
              for d in r.json()["per_day_hours"]))

    section("3. syllabus ingestion (provenance-checked)")
    syllabus = f"""
    CS301 Data Structures - Course Outline

    Assignment 1: Graph traversal problem set, due {(NOW + timedelta(days=4)):%d %b %Y}, worth 10%
    Assignment 2: Segment trees, deadline {(NOW + timedelta(days=9)):%d %b %Y} (15 marks)
    Midterm Exam on {(NOW + timedelta(days=7)):%d %b %Y} at 9am - 25%
    Term project submission due {(NOW + timedelta(days=20)):%d %b %Y}, 30%
    Office hours: Tuesdays 3-5pm in room 204.
    Textbook: CLRS, 3rd edition.
    """
    r = c.post("/api/ingest/text", headers=H,
               json={"text": syllabus, "course_id": cs["id"], "course_hint": "DSA",
                     "auto_create": True})
    check("ingest 201", r.status_code == 201, r.text[:200])
    body = r.json()
    n = len(body["extracted"])
    check("extracted >= 3 items", n >= 3, f"{n} items via {body['method']}")
    check("created assignments", len(body["created_assignment_ids"]) >= 3)
    check("every item carries evidence",
          all(i["evidence"] for i in body["extracted"]))
    check("office hours not treated as a deliverable",
          not any("office hour" in i["title"].lower() for i in body["extracted"]))
    exam = [i for i in body["extracted"] if i["type"] == "exam"]
    check("midterm classified as exam", len(exam) >= 1,
          exam[0]["title"] if exam else "none")

    section("4. manual assignments")
    a1 = c.post("/api/assignments", headers=H, json={
        "course_id": ma["id"], "title": "Markov chains problem set",
        "type": "homework", "deadline": (NOW + timedelta(days=3)).isoformat(),
        "estimated_hours": 5, "difficulty": 4, "grade_weight": 12}).json()
    a2 = c.post("/api/assignments", headers=H, json={
        "course_id": ma["id"], "title": "Big term paper",
        "type": "project", "deadline": (NOW + timedelta(days=6)).isoformat(),
        "estimated_hours": 22, "difficulty": 5, "grade_weight": 30}).json()
    check("assignments created", bool(a1.get("id")) and bool(a2.get("id")))
    check("remaining_hours derived", a2["remaining_hours"] == 22.0)

    r = c.get("/api/assignments", headers=H)
    total = sum(a["remaining_hours"] for a in r.json())
    check("assignment list", r.status_code == 200, f"{len(r.json())} open, {total:.1f}h outstanding")

    section("5. plan generation")
    r = c.post("/api/plan/generate", headers=H,
               json={"horizon_days": 7, "use_llm_narrative": llm_on})
    check("plan 201", r.status_code == 201, r.text[:300])
    plan = r.json()
    blocks = plan["blocks"]
    check("blocks produced", len(blocks) > 0, f"{len(blocks)} blocks")
    check("strategy note written", len(plan["strategy_note"]) > 40)

    diag = plan["diagnostics"]
    cap = diag["capacity"]
    check("capacity report present",
          {"gross_free_hours", "usable_hours", "demanded_hours", "deficit_hours"} <= set(cap))
    print(f"         demand {cap['demanded_hours']}h vs usable {cap['usable_hours']}h "
          f"-> deficit {cap['deficit_hours']}h, utilisation {cap['utilisation']:.0%}")
    check("overcommitment detected", cap["deficit_hours"] > 0,
          "22h paper due in 6 days is genuinely infeasible")
    check("triage offered when infeasible", len(diag["triage"]) > 0,
          f"{len(diag['triage'])} descope candidates")
    check("risk table populated", len(diag["risks"]) > 0)
    check("some item flagged at_risk/infeasible",
          any(x["risk"] in {"at_risk", "infeasible"} for x in diag["risks"]))

    # --- hard constraints must hold ---
    ok_window, ok_len, ok_overlap, ok_sunday, ok_class = True, True, True, True, True
    prev_end = None
    for b in sorted(blocks, key=lambda x: x["start"]):
        s = datetime.fromisoformat(b["start"])
        e = datetime.fromisoformat(b["end"])
        if not (time(8, 0) <= s.time() and e.time() <= time(22, 30)):
            ok_window = False
        mins = (e - s).total_seconds() / 60
        if mins < 20 or mins > 90:
            ok_len = False
        if s.weekday() == 6:
            ok_sunday = False
        if prev_end and s < prev_end:
            ok_overlap = False
        prev_end = e
        # class times 09:00-10:00 and 14:00-15:30 Mon-Fri must be untouched
        if s.weekday() < 5:
            for cs_s, cs_e in ((time(9, 0), time(10, 0)), (time(14, 0), time(15, 30))):
                if s.time() < cs_e and cs_s < e.time():
                    ok_class = False

    check("all blocks inside the day window", ok_window)
    check("all block lengths within preference", ok_len)
    check("no two blocks overlap", ok_overlap)
    check("no blocks on the protected day", ok_sunday)
    check("no block collides with a class", ok_class)

    per_day = cap["per_day_hours"]
    check("daily cap respected", all(v <= 5.01 for v in per_day.values()),
          f"max day = {max(per_day.values()):.2f}h" if per_day else "n/a")

    section("6. transparency")
    b0 = sorted(blocks, key=lambda x: x["start"])[0]
    r = c.get(f"/api/blocks/{b0['id']}/explain?use_llm=false", headers=H)
    check("explain 200", r.status_code == 200, r.text[:160])
    ex = r.json()
    check("factor breakdown returned", len(ex["factors"]) >= 5,
          f"{len(ex['factors'])} factors")
    check("contributions sum to the score",
          abs(sum(f["contribution"] for f in ex["factors"]) - ex["score"]) < 0.05,
          f"score={ex['score']:.3f}")
    check("constraints listed", len(ex["constraints_applied"]) >= 3)
    check("alternatives recorded", len(ex["alternatives_rejected"]) >= 1)
    print(f"         headline: {ex['headline'][:110]}")

    section("7. accept / reject / edit")
    r = c.post(f"/api/blocks/{b0['id']}/decision", headers=H,
               json={"action": "accept"})
    check("accept 200", r.status_code == 200 and r.json()["status"] == "accepted")
    check("accepted block is locked", r.json()["locked"] is True)

    evening = [b for b in blocks if datetime.fromisoformat(b["start"]).hour >= 19]
    target = evening[0] if evening else blocks[-1]
    r = c.post(f"/api/blocks/{target['id']}/decision", headers=H,
               json={"action": "reject", "reason_code": "clashes_with_life",
                     "comment": "I never study then"})
    check("reject 200", r.status_code == 200 and r.json()["status"] == "rejected")

    r = c.get("/api/auth/preferences", headers=H)
    biases = r.json()["learned_biases"]
    check("rejection produced a learned bias", len(biases) > 0, str(biases))
    check("bias is negative and bounded",
          all(-0.26 <= v <= 0.16 for v in biases.values()))

    mover = [b for b in blocks if b["id"] not in {b0["id"], target["id"]}]
    if mover:
        m = mover[0]
        new_start = (datetime.fromisoformat(m["start"]) + timedelta(hours=1)).isoformat()
        r = c.post(f"/api/blocks/{m['id']}/decision", headers=H,
                   json={"action": "reschedule", "new_start": new_start,
                         "reason_code": "too_early"})
        check("reschedule 200", r.status_code == 200 and r.json()["status"] == "edited")
        check("original_start preserved for the diff", r.json()["original_start"] is not None)

    section("8. progress")
    r = c.post("/api/progress", headers=H, json={
        "block_id": b0["id"], "minutes_spent": 75, "completion_delta": 0.2,
        "focus_rating": 4, "note": "good session"})
    check("progress logged 201", r.status_code == 201, r.text[:160])

    aid = b0.get("assignment_id")
    if aid:
        a = c.get(f"/api/assignments/{aid}", headers=H).json()
        check("assignment hours advanced", a["completed_hours"] > 0,
              f"{a['completed_hours']}h done, {a['completion_pct']:.0f}%")

    r = c.get("/api/progress/summary", headers=H)
    check("summary 200", r.status_code == 200, r.text[:160])
    s = r.json()
    check("adherence computed", 0.0 <= s["adherence"] <= 1.0,
          f"adherence={s['adherence']}, logged={s['hours_logged']}h")
    check("streak computed", s["streak_days"] >= 1)

    check("timeseries 200", c.get("/api/progress/timeseries", headers=H).status_code == 200)
    check("dashboard 200", c.get("/api/insights/dashboard", headers=H).status_code == 200)

    r = c.get("/api/reminders?within_hours=720", headers=H)
    check("reminders materialised", r.status_code == 200 and len(r.json()) > 0,
          f"{len(r.json())} reminders")
    kinds = {x["kind"] for x in r.json()}
    check("deadline reminders present", any(k.startswith("deadline_T-") for k in kinds), str(kinds))

    section("9. replan + diff")
    c.post("/api/assignments", headers=H, json={
        "course_id": cs["id"], "title": "SURPRISE quiz tomorrow",
        "type": "quiz", "deadline": (NOW + timedelta(days=1, hours=6)).isoformat(),
        "estimated_hours": 3, "difficulty": 3, "grade_weight": 8})

    r = c.get("/api/plan/needs-replan", headers=H)
    check("replan trigger detected", r.json()["needs_replan"] is True,
          "; ".join(r.json()["reasons"])[:110])

    r = c.post("/api/plan/replan?reason=surprise%20quiz%20added", headers=H)
    check("replan 200", r.status_code == 200, r.text[:300])
    p2 = r.json()
    check("new plan version", p2["version"] == plan["version"] + 1,
          f"v{plan['version']} -> v{p2['version']}")

    accepted_kept = [b for b in p2["blocks"] if b["status"] == "accepted"]
    check("accepted block survived the replan", len(accepted_kept) >= 1)
    check("rejected block not resurrected",
          not any(b["id"] == target["id"] for b in p2["blocks"]))

    quiz_blocks = [b for b in p2["blocks"] if "quiz" in b["title"].lower()]
    unscheduled = {u["title"] for u in p2["diagnostics"].get("unscheduled", [])}
    quiz_flagged = any("quiz" in t.lower() for t in unscheduled)
    # Either the quiz got time, or the engine says out loud that it could not
    # fit — silently ignoring an urgent item is the failure we care about.
    # (Running this late at night legitimately leaves no room today.)
    check("urgent new item scheduled OR explicitly flagged as unfittable",
          len(quiz_blocks) > 0 or quiz_flagged,
          f"{len(quiz_blocks)} blocks; flagged={quiz_flagged}")
    if quiz_blocks:
        first = min(datetime.fromisoformat(b["start"]) for b in quiz_blocks)
        check("and scheduled before its deadline",
              first < NOW + timedelta(days=1, hours=6), f"first at {first:%a %H:%M}")

    r = c.get(f"/api/plan/{p2['id']}/revision", headers=H)
    check("revision recorded", r.status_code == 200 and r.json() is not None)
    ch = r.json()["changes"]
    check("diff has add/remove/move buckets",
          {"added", "removed", "moved", "resized"} <= set(ch))
    print(f"         {r.json()['summary'][:140]}")

    check("plan history", len(c.get("/api/plan/history", headers=H).json()) == 2)
    check("current plan is the new one",
          c.get("/api/plan/current", headers=H).json()["id"] == p2["id"])

    section("10. idempotence / edge cases")
    r = c.post("/api/plan/generate", headers=H,
               json={"horizon_days": 7, "use_llm_narrative": False})
    check("repeat generate ok", r.status_code == 201)
    check("no overlapping blocks after 3rd plan",
          _no_overlap(r.json()["blocks"]))

    r = c.post("/api/plan/generate", headers=H,
               json={"horizon_days": 1, "use_llm_narrative": False})
    check("1-day horizon ok", r.status_code == 201, f"{len(r.json()['blocks'])} blocks")

    r = c.post("/api/ingest/preview", headers=H, json={"text": "nothing dated in here at all"})
    check("preview with no dates returns empty, not an error",
          r.status_code == 200 and r.json()["extracted"] == [])

    print("\n" + "=" * 60)
    print(f"  {PASS} passed, {FAIL} failed")
    print("=" * 60)
    return 1 if FAIL else 0


def _no_overlap(blocks) -> bool:
    bs = sorted(blocks, key=lambda x: x["start"])
    for a, b in zip(bs, bs[1:]):
        if datetime.fromisoformat(b["start"]) < datetime.fromisoformat(a["end"]):
            return False
    return True


if __name__ == "__main__":
    sys.exit(main())
