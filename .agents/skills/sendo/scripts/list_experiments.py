#!/usr/bin/env python3
# flake8: noqa: S002  (a CLI script; print is the output)
"""List every Sendo experiment in the registry, with its status and surface.

The registry is the source of truth for what exists. Run from the repo root:

    .agents/skills/sendo/scripts/list_experiments.py
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

DEFAULT_REGISTRY = Path("static/app/utils/experiments/experiments.tsx")

ENTRY_RE = re.compile(r"'([^']+)':\s*\{(.*?)\n  \},", re.DOTALL)
# Matches both the populated multi-line form and the empty `{} satisfies` form.
REGISTRY_RE = re.compile(r"export const EXPERIMENTS = \{(.*?)\}\s*satisfies", re.DOTALL)


def registry_body(source: str) -> str | None:
    match = REGISTRY_RE.search(source)
    return match.group(1) if match else None


def parse(source: str) -> list[dict[str, str]]:
    body = registry_body(source)
    if body is None or not body.strip():
        return []

    def field(block: str, key: str) -> str:
        match = re.search(rf"{key}:\s*'([^']+)'", block)
        return match.group(1) if match else "?"

    # The trailing separator lets the entry pattern match the final entry too.
    return [
        {
            "id": entry.group(1),
            "status": field(entry.group(2), "status"),
            "surface": field(entry.group(2), "surface"),
            "element": field(entry.group(2), "element"),
        }
        for entry in ENTRY_RE.finditer(body + "\n  },")
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    args = parser.parse_args()

    if not args.registry.exists():
        print(f"registry not found: {args.registry}", file=sys.stderr)
        print("Run from the repo root, or pass --registry.", file=sys.stderr)
        return 1

    source = args.registry.read_text()
    if registry_body(source) is None:
        print(f"could not find EXPERIMENTS in {args.registry}", file=sys.stderr)
        print("The registry may have been restructured.", file=sys.stderr)
        return 1

    experiments = parse(source)
    if not experiments:
        print("registry is empty — no experiments are declared")
        return 0

    print(f"{'STATUS':<10} {'ID':<20} {'SURFACE':<20} ELEMENT")
    for exp in sorted(experiments, key=lambda e: (e["status"] != "active", e["id"])):
        print(f"{exp['status']:<10} {exp['id']:<20} {exp['surface']:<20} {exp['element']}")

    active = sum(1 for e in experiments if e["status"] == "active")
    print(f"\n{active} active, {len(experiments) - active} concluded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
