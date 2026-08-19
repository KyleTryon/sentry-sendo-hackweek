#!/usr/bin/env python3
# flake8: noqa: S002  (a CLI script; print is the output)
"""Find every artifact belonging to an experiment, so none is left behind.

An experiment leaves traces in four places: the registry, the feature flag, the
mount, and its dashboard. The first three are source edits this reports rather
than performs — editing TypeScript and Python by regex is how you get a broken
build. The dashboard is an API object, and deleting it by hand is the step
people skip.

    .agents/skills/sendo/scripts/end_experiment.py <experiment>
    .agents/skills/sendo/scripts/end_experiment.py <experiment> --org <org> --delete-dashboard

Reports only unless --delete-dashboard is passed, and asks before deleting.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

REGISTRY = Path("static/app/utils/experiments/experiments.tsx")
FLAGS = Path("src/sentry/features/temporary.py")
FRONTEND = Path("static/app")
HOST = os.environ.get("SENTRY_HOST", "https://us.sentry.io")


def grep(path: Path, pattern: str) -> list[tuple[int, str]]:
    if not path.exists():
        return []
    return [
        (n, line.strip())
        for n, line in enumerate(path.read_text().splitlines(), 1)
        if re.search(pattern, line)
    ]


def find_mounts(root: Path, surface: str | None) -> list[str]:
    if not root.exists() or surface is None:
        return []
    hits = []
    for path in sorted(root.rglob("*.tsx")):
        if path.name.endswith(".spec.tsx"):
            continue
        for n, line in enumerate(path.read_text().splitlines(), 1):
            if f'<ExperimentSurface surface="{surface}"' in line:
                hits.append(f"{path}:{n}")
    return hits


def surface_of(experiment: str) -> str | None:
    if not REGISTRY.exists():
        return None
    match = re.search(
        rf"'{re.escape(experiment)}':\s*\{{(.*?)\n  \}},", REGISTRY.read_text(), re.DOTALL
    )
    if match is None:
        return None
    surface = re.search(r"surface:\s*'([^']+)'", match.group(1))
    return surface.group(1) if surface else None


def api(path: str, token: str, method: str = "GET") -> object:
    request = urllib.request.Request(f"{HOST}{path}", method=method)
    request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        raise SystemExit(f"{method} {path} failed: {error.code} {error.reason}") from error


def find_dashboards(org: str, experiment: str, token: str) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode({"per_page": 100})
    boards = api(f"/api/0/organizations/{org}/dashboards/?{query}", token)
    assert isinstance(boards, list)
    return [b for b in boards if experiment in (b.get("title") or "")]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("experiment")
    parser.add_argument("--org", help="Sentry org slug; enables the dashboard check")
    parser.add_argument("--delete-dashboard", action="store_true")
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    args = parser.parse_args()

    exp = args.experiment
    print(f"Ending experiment: {exp}\n")

    surface = surface_of(exp)
    registry_hits = grep(REGISTRY, rf"'{re.escape(exp)}'")
    flag_hits = grep(FLAGS, rf"experiment-{re.escape(exp)}\b")
    mounts = find_mounts(FRONTEND, surface)

    print("1. Registry entry")
    for n, line in registry_hits:
        print(f"     {REGISTRY}:{n}  {line[:70]}")
    if not registry_hits:
        print("     none found")

    print("2. Feature flag (separate backend PR)")
    for n, line in flag_hits:
        print(f"     {FLAGS}:{n}  {line[:70]}")
    if not flag_hits:
        print("     none found")

    print(f"3. Mount for surface '{surface or 'unknown'}'")
    for hit in mounts:
        print(f"     {hit}")
    if mounts:
        print("     remove only if no other experiment targets this surface")
    else:
        print("     none found")

    dashboards: list[dict[str, Any]] = []
    print("4. Dashboard")
    if not args.org:
        print("     skipped — pass --org to check")
    else:
        token = os.environ.get("SENTRY_TOKEN")
        if not token:
            print("     skipped — set SENTRY_TOKEN")
        else:
            dashboards = find_dashboards(args.org, exp, token)
            for board in dashboards:
                print(f"     #{board['id']}  {board['title']}")
                print(
                    f"       {HOST.replace('us.', '')}/organizations/{args.org}/dashboard/{board['id']}/"
                )
            if not dashboards:
                print("     none matching")

    print("\nBefore deleting anything, record the results somewhere durable —")
    print("deleting the dashboard does not delete the metrics, but it does delete")
    print("the only place anyone was reading them.")

    if args.delete_dashboard and dashboards:
        token = os.environ["SENTRY_TOKEN"]
        if not args.yes:
            print(f"\nDelete {len(dashboards)} dashboard(s)? Re-run with --yes to confirm.")
            return 0
        for board in dashboards:
            api(f"/api/0/organizations/{args.org}/dashboards/{board['id']}/", token, "DELETE")
            print(f"deleted dashboard #{board['id']}")

    if registry_hits or flag_hits:
        print("\nAfter editing, run: pnpm run typecheck")
        print("TypeScript surfaces every stale reference to a removed experiment.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
