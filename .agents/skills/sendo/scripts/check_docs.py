#!/usr/bin/env python3
# flake8: noqa: S002  (a CLI script; print is the output)
"""Guard the Sendo skill's documentation against silent drift.

Two failures have happened before, both invisible until someone acted on the
docs: the architecture diagram kept labelling metric attributes with names that
had been renamed, and query examples used bare boolean keys that match nothing
and return zero rather than erroring.

    .agents/skills/sendo/scripts/check_docs.py

Exits non-zero on any finding, so it can gate a hook or a CI job.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SKILL = Path(".agents/skills/sendo")

# Marker for a line that names a bad pattern deliberately.
ALLOW = "check-docs:allow"

# Bare attribute names that were renamed under experiment.*. Matched only where
# they read as a metric attribute, so ordinary prose about "the variant" is fine.
RENAMED = ("variant", "surface", "element", "rendered", "action")

CHECKS: list[tuple[str, re.Pattern[str], str]] = [
    (
        "bare attribute key in a query",
        re.compile(rf"(?<![\w.`])(?:{'|'.join(RENAMED)}):[a-z*<]"),
        "attributes are namespaced: use experiment.variant, experiment.action, ...",
    ),
    (
        "boolean queried without tags[]",
        re.compile(r"(?<!tags\[)experiment\.rendered:(?!\s)"),
        "booleans need tags[experiment.rendered,boolean]:true or they match nothing",
    ),
    (
        "snake_case action value",
        re.compile(r"cta_clicked"),
        "action values are kebab-case: cta-clicked",
    ),
]


def main() -> int:
    if not SKILL.exists():
        print(f"skill not found at {SKILL}; run from the repo root", file=sys.stderr)
        return 2

    findings = 0
    for path in sorted(SKILL.rglob("*.md")):
        for number, line in enumerate(path.read_text().splitlines(), 1):
            # Documentation about these patterns has to be able to name them.
            if ALLOW in line:
                continue
            for label, pattern, hint in CHECKS:
                if pattern.search(line):
                    print(f"{path}:{number}  {label}")
                    print(f"    {line.strip()[:88]}")
                    print(f"    -> {hint}")
                    findings += 1

    if findings:
        print(f"\n{findings} finding(s)")
        return 1
    print("skill docs consistent with the current taxonomy")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
