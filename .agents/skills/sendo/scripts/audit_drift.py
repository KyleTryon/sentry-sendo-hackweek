#!/usr/bin/env python3
# flake8: noqa: S002  (a CLI script; print is the output)
"""Cross-check the registry, the feature flags, and the mounts.

An experiment is spread across three places and any one can go missing. Two of
the three failure modes are silent, so this is worth running before trusting
that an experiment is live. Run from the repo root:

    .agents/skills/sendo/scripts/audit_drift.py

Exits non-zero when drift is found, so it can gate a script or a CI job.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REGISTRY = Path("static/app/utils/experiments/experiments.tsx")
FLAGS = Path("src/sentry/features/temporary.py")
FRONTEND = Path("static/app")

REGISTRY_RE = re.compile(r"export const EXPERIMENTS = \{(.*?)\}\s*satisfies", re.DOTALL)
FLAG_RE = re.compile(r'organizations:experiment-([a-z0-9-]+)"')
MOUNT_RE = re.compile(r'<ExperimentSurface\s+surface="([^"]+)"')


def registry_entries(path: Path) -> dict[str, str]:
    """Map experiment id -> surface."""
    match = REGISTRY_RE.search(path.read_text())
    if match is None:
        raise SystemExit(f"could not find EXPERIMENTS in {path}; has it been restructured?")
    body = match.group(1)
    return {
        entry.group(1): (re.search(r"surface:\s*'([^']+)'", entry.group(2)) or ["", "?"])[1]
        for entry in re.finditer(r"'([^']+)':\s*\{(.*?)\n  \},", body + "\n  },", re.DOTALL)
    }


def mounted_surfaces(root: Path) -> set[str]:
    found: set[str] = set()
    for path in root.rglob("*.tsx"):
        if path.name.endswith(".spec.tsx"):
            continue
        found.update(MOUNT_RE.findall(path.read_text()))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY)
    parser.add_argument("--flags", type=Path, default=FLAGS)
    parser.add_argument("--frontend", type=Path, default=FRONTEND)
    args = parser.parse_args()

    missing = [p for p in (args.registry, args.flags, args.frontend) if not p.exists()]
    if missing:
        for path in missing:
            print(f"not found: {path}", file=sys.stderr)
        print(
            "\nThe registry and the flags land in separate pull requests. Run this from a\n"
            "checkout where both exist, or pass --registry/--flags explicitly.",
            file=sys.stderr,
        )
        return 2

    entries = registry_entries(args.registry)
    flags = set(FLAG_RE.findall(args.flags.read_text()))
    mounts = mounted_surfaces(args.frontend)

    problems = []
    for experiment in sorted(set(entries) - flags):
        problems.append(f"registry entry with no flag: {experiment} — never activates")
    for flag in sorted(flags - set(entries)):
        problems.append(f"flag with no registry entry: {flag} — dead line in temporary.py")
    for experiment, surface in sorted(entries.items()):
        if surface not in mounts:
            problems.append(
                f"{experiment} targets '{surface}' but no page mounts <ExperimentSurface>"
            )

    print(f"registry: {len(entries)}  flags: {len(flags)}  mounted surfaces: {len(mounts)}\n")
    if not problems:
        print("no drift")
        return 0
    for problem in problems:
        print(f"DRIFT  {problem}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
