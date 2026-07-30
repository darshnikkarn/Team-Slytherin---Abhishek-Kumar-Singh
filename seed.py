"""Seed a realistic, deliberately *overcommitted* demo week.

Run:  python seed.py            (wipes and reseeds studyplanner.db)

The data is tuned so the engine has something interesting to say: a 20h project
and a midterm collide, total demand slightly exceeds capacity, and one course is
already below its attendance threshold. A plan that comes back "everything is
fine" on this data would be lying, which makes it a good demo.

Login:  demo@student.edu / demo1234
"""
from __future__ import annotations

import os
from datetime import datetime, time, timedelta

from sqlalchemy import select

from app.core.security import hash_password
from app.database.db import Base, SessionLocal, engine, init_db
from app.models import (
    Assignment,
    AssignmentStatus,
    AssignmentType,
    CalendarException,
    Course,
    ProgressLog,
    SlotKind,
    SourceKind,
    StudyPreference,
    TimetableSlot,
    User,
)

EMAIL = "demo@student.edu"
PASSWORD = "demo1234"


def reset() -> None:
    Base.metadata.drop_all(bind=engine)
    init_db()


def run() -> None:
    reset()
    db = SessionLocal()
    now = datetime.now()
    monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    user = User(
        email=EMAIL,
        hashed_password=hash_password(PASSWORD),
        name="Demo Student",
        timezone="Asia/Kolkata",
    )
    db.add(user)
    db.flush()

    db.add(
        StudyPreference(
            user_id=user.id,
            day_start=time(8, 0),
            day_end=time(23, 0),
            max_daily_study_hours=5.0,
            weekly_goal_hours=26.0,
            min_block_minutes=45,
            max_block_minutes=90,
            break_minutes=15,
            transition_minutes=15,
            interleave_subjects=True,
            max_consecutive_blocks_same_course=2,
            deadline_buffer_days=1.0,
            slack_fraction=0.15,
            energy_windows=[
                {"start": "07:30", "end": "12:30", "level": 0.95},
                {"start": "12:30", "end": "14:00", "level": 0.40},
                {"start": "14:00", "end": "17:30", "level": 0.75},
                {"start": "17:30", "end": "19:30", "level": 0.55},
                {"start": "19:30", "end": "22:30", "level": 0.80},
            ],
            protected_days=[6],  # Sundays off
            learned_biases={},
        )
    )

    courses = {}
    for code, name, credits, colour, prio, held, attended, req in [
        ("CS301", "Data Structures & Algorithms", 4, "#6366f1", 1.4, 24, 21, 75),
        ("CS305", "Operating Systems", 4, "#0ea5e9", 1.0, 22, 14, 75),   # attendance risk
        ("MA201", "Probability & Statistics", 3, "#f59e0b", 1.2, 20, 18, 75),
        ("HS101", "Technical Communication", 2, "#10b981", 0.7, 12, 11, 70),
    ]:
        c = Course(
            user_id=user.id,
            code=code,
            name=name,
            credits=credits,
            colour=colour,
            priority=prio,
            attendance_required_pct=req,
            classes_held=held,
            classes_attended=attended,
            target_grade="A",
        )
        db.add(c)
        db.flush()
        courses[code] = c

    # ---- weekly timetable (0=Mon) ------------------------------------
    tt = [
        (0, "CS301", "DSA Lecture", SlotKind.LECTURE, time(9, 0), time(10, 0), "LH-1"),
        (0, "CS305", "OS Lecture", SlotKind.LECTURE, time(10, 15), time(11, 15), "LH-2"),
        (0, "MA201", "Probability Lecture", SlotKind.LECTURE, time(14, 0), time(15, 0), "LH-4"),
        (1, "CS301", "DSA Tutorial", SlotKind.TUTORIAL, time(9, 0), time(10, 0), "T-3"),
        (1, "CS305", "OS Lab", SlotKind.LAB, time(14, 0), time(17, 0), "Lab-B"),
        (2, "CS301", "DSA Lecture", SlotKind.LECTURE, time(9, 0), time(10, 0), "LH-1"),
        (2, "MA201", "Probability Tutorial", SlotKind.TUTORIAL, time(11, 30), time(12, 30), "T-1"),
        (2, "HS101", "Tech Comm", SlotKind.SEMINAR, time(15, 0), time(16, 30), "S-2"),
        (3, "CS305", "OS Lecture", SlotKind.LECTURE, time(10, 15), time(11, 15), "LH-2"),
        (3, "MA201", "Probability Lecture", SlotKind.LECTURE, time(14, 0), time(15, 0), "LH-4"),
        (3, None, "Part-time job", SlotKind.FIXED, time(18, 0), time(21, 0), "Remote"),
        (4, "CS301", "DSA Lab", SlotKind.LAB, time(9, 0), time(12, 0), "Lab-A"),
        (4, "HS101", "Tech Comm", SlotKind.SEMINAR, time(15, 0), time(16, 30), "S-2"),
        (5, None, "Football", SlotKind.PERSONAL, time(17, 0), time(19, 0), "Ground"),
    ]
    for dow, code, title, kind, s, e, loc in tt:
        db.add(
            TimetableSlot(
                user_id=user.id,
                course_id=courses[code].id if code else None,
                title=title,
                kind=kind.value,
                day_of_week=dow,
                start_time=s,
                end_time=e,
                location=loc,
                attendance_counts=kind in {SlotKind.LECTURE, SlotKind.LAB, SlotKind.TUTORIAL},
            )
        )

    # ---- the workload -------------------------------------------------
    A = AssignmentType
    items = [
        ("CS301", "Graph algorithms problem set 4", A.HOMEWORK, 3, 5.0, 4, 10.0, 1.5),
        ("CS301", "Segment tree implementation", A.PROJECT, 6, 8.0, 4, 15.0, 0.0),
        ("CS305", "Midterm exam", A.EXAM, 8, 12.0, 5, 25.0, 2.0),
        ("CS305", "Scheduler simulation lab report", A.LAB_REPORT, 4, 5.0, 3, 10.0, 0.0),
        ("MA201", "Markov chains assignment", A.HOMEWORK, 2, 4.0, 4, 10.0, 0.5),
        ("MA201", "Quiz 3 (hypothesis testing)", A.QUIZ, 5, 3.0, 3, 8.0, 0.0),
        ("HS101", "Group presentation: technical writing", A.PRESENTATION, 7, 6.0, 2, 15.0, 1.0),
        ("CS301", "Term project — distributed KV store", A.PROJECT, 19, 20.0, 5, 30.0, 3.0),
        ("HS101", "Reading: Chapters 4–6", A.READING, 9, 2.5, 2, 5.0, 0.0),
    ]
    created = {}
    for code, title, atype, days, est, diff, weight, done in items:
        deadline = (now + timedelta(days=days)).replace(hour=23, minute=59, second=0, microsecond=0)
        if atype == A.EXAM:
            deadline = deadline.replace(hour=9, minute=0)
        a = Assignment(
            user_id=user.id,
            course_id=courses[code].id,
            title=title,
            description=f"Seeded demo item for {code}.",
            type=atype.value,
            status=(
                AssignmentStatus.IN_PROGRESS.value if done > 0 else AssignmentStatus.NOT_STARTED.value
            ),
            deadline=deadline,
            estimated_hours=est,
            completed_hours=done,
            difficulty=diff,
            grade_weight=weight,
            source=SourceKind.MANUAL.value,
            last_worked_at=(now - timedelta(days=2)) if done > 0 else None,
        )
        db.add(a)
        db.flush()
        created[title] = a

    # The term project depends on the segment tree work being done first.
    created["Term project — distributed KV store"].depends_on = []

    # ---- a real-life interruption -------------------------------------
    db.add(
        CalendarException(
            user_id=user.id,
            title="Cousin's wedding",
            start=(monday + timedelta(days=5)).replace(hour=10),
            end=(monday + timedelta(days=5)).replace(hour=22),
            is_busy=True,
            note="Whole Saturday gone.",
        )
    )

    # ---- some history so adherence/streak/calibration are non-trivial --
    for d, mins, aid_title in [
        (3, 90, "Graph algorithms problem set 4"),
        (2, 120, "Term project — distributed KV store"),
        (2, 60, "Markov chains assignment"),
        (1, 90, "Group presentation: technical writing"),
    ]:
        db.add(
            ProgressLog(
                user_id=user.id,
                assignment_id=created[aid_title].id,
                minutes_spent=mins,
                completion_delta=0.0,
                focus_rating=4,
                note="seeded session",
                logged_at=now - timedelta(days=d),
            )
        )

    db.commit()

    total = sum(a.remaining_hours for a in db.scalars(select(Assignment)).all())
    print("=" * 66)
    print(f"  Seeded {EMAIL} / {PASSWORD}")
    print(f"  {len(courses)} courses, {len(tt)} timetable slots, {len(items)} assignments")
    print(f"  Outstanding effort: {total:.1f}h")
    print("=" * 66)
    print("  uvicorn app.main:app --reload   ->  http://127.0.0.1:8000/docs")
    db.close()


if __name__ == "__main__":
    run()
