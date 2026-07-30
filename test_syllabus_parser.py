"""Tests for the rule-based syllabus extractor — the no-API-key path.

    pytest -q      (or)     python tests/test_syllabus_parser.py

Only `python-dateutil` is needed; the LLM client is stubbed out, so these run
offline and prove the ingestion demo works with no key configured.
"""
from __future__ import annotations

import os
import sys
import types
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Stub the LLM client so importing the parser needs no settings/network.
sys.modules.setdefault(
    "app.ai.llm_client", types.SimpleNamespace(generate_json=lambda *a, **k: None)
)

from app.ai.syllabus_parser import (  # noqa: E402
    attach_time,
    classify,
    clean_title,
    find_date_strings,
    heuristic_extract,
    parse_date_string,
)

TODAY = datetime(2026, 7, 30)

DOC = """
CS301 Data Structures & Algorithms - Autumn 2026

Assignment 1: Graph traversal problem set, due 12 Aug 2026, worth 10%
Assignment 2 (Segment trees) - deadline 21/08/2026, 15 marks
Midterm Exam on August 18, 2026 at 9am - 25%
Lab report 3 submission by 5 Sep 2026, 5 hours of work expected
Term project due 2026-10-15, 30%
Reading: CLRS chapters 22-24 before 14 Aug
Group presentation scheduled 28 Aug 2026 (15%)
Quiz 2 on 9/9/2026
Final exam: 20 Dec 2026, 40 percent
Office hours: Tuesdays 3-5pm, room 204.
Grading scale: A 90-100, B 80-89.
Textbook: Cormen et al., 3rd edition.
"""


def items():
    return heuristic_extract(DOC, TODAY)


# ------------------------------------------------------------- primitives
def test_date_formats_all_recognised():
    for s in ["2026-10-15", "12 Aug 2026", "August 18, 2026", "21/08/2026", "14 Aug"]:
        assert find_date_strings(s), f"missed {s}"
        assert parse_date_string(s, TODAY) is not None, f"could not parse {s}"


def test_bare_dates_roll_forward_to_the_future():
    d = parse_date_string("14 Jan", TODAY)          # Jan already passed in 2026
    assert d is not None and d >= TODAY


def test_time_defaults_to_end_of_day_but_honours_an_explicit_one():
    base = datetime(2026, 8, 18)
    assert attach_time(base, "due 18 Aug").hour == 23
    assert attach_time(base, "Exam on 18 Aug at 9am").hour == 9
    assert attach_time(base, "submit by 5 pm").hour == 17


def test_type_classification():
    assert classify("Midterm Exam on ...")[0] == "exam"
    assert classify("Quiz 2 on ...")[0] == "quiz"
    assert classify("Term project due ...")[0] == "project"
    assert classify("Lab report 3 ...")[0] == "lab_report"
    assert classify("Group presentation ...")[0] == "presentation"
    assert classify("Reading: chapters 22-24")[0] == "reading"
    assert classify("Assignment 1: problem set")[0] == "homework"


def test_title_is_stripped_of_parsed_metadata():
    t = clean_title(
        "Assignment 1: Graph traversal problem set, due 12 Aug 2026, worth 10%", "12 Aug 2026"
    )
    assert t == "Assignment 1: Graph traversal problem set", t


def test_percent_at_end_of_string_is_removed():
    # Regression: a trailing \b after '%' never matches, so weights leaked.
    assert "%" not in clean_title("Midterm Exam on August 18, 2026 - 25%", "August 18, 2026")
    assert "%" not in clean_title("Group presentation 28 Aug 2026 (15%)", "28 Aug 2026")


# ------------------------------------------------------------- extraction
def test_finds_every_deliverable():
    got = {i["type"] for i in items()}
    assert {"exam", "quiz", "project", "presentation", "reading", "lab_report", "homework"} <= got


def test_boilerplate_is_ignored():
    titles = " ".join(i["title"].lower() for i in items())
    for junk in ("office hour", "grading scale", "textbook", "cormen"):
        assert junk not in titles, f"'{junk}' leaked in as a deliverable"


def test_no_duplicates_from_the_line_merge_pass():
    ts = [i["title"].lower() for i in items()]
    assert len(ts) == len(set(ts)), ts


def test_metadata_never_leaks_into_titles():
    for i in items():
        low = i["title"].lower()
        for junk in ("%", "worth", "marks", "percent", "hours of work"):
            assert junk not in low, f"'{junk}' in title: {i['title']}"


def test_weights_and_hours_are_parsed_into_fields():
    by_title = {i["title"]: i for i in items()}
    assert by_title["Midterm Exam"]["grade_weight"] == 25.0
    assert by_title["Term project"]["grade_weight"] == 30.0
    assert by_title["Final exam"]["grade_weight"] == 40.0
    assert by_title["Lab report 3 submission"]["estimated_hours"] == 5.0


def test_everything_is_dated_in_the_future_and_sorted():
    got = items()
    assert all(i["deadline"] >= TODAY for i in got)
    assert got == sorted(got, key=lambda i: i["deadline"])


def test_every_item_carries_provenance_and_a_review_flag():
    for i in items():
        assert i["evidence"], "no evidence substring"
        assert i["evidence"] in DOC or i["evidence"][:60] in DOC
        assert 0.0 <= i["confidence"] <= 1.0
        assert isinstance(i["needs_review"], bool)
        # low confidence or a missing weight must be flagged for confirmation
        if i["confidence"] < 0.75 or i["grade_weight"] is None:
            assert i["needs_review"]


def test_empty_and_dateless_input_is_safe():
    assert heuristic_extract("", TODAY) == []
    assert heuristic_extract("no dates in here at all, just prose", TODAY) == []


if __name__ == "__main__":
    fns = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for name, fn in fns:
        try:
            fn()
            print(f"  [ok]   {name}")
        except AssertionError as exc:
            failed += 1
            print(f"  [FAIL] {name}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"  [ERR]  {name}: {type(exc).__name__}: {exc}")
    print(f"\n  {len(fns) - failed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
