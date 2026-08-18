# Recipes

Runnable answers to the questions that come up repeatedly. Every command here
was run against this repo and, where it queries Sentry, against live data.

Three of these read the registry, the flag list, and the mounts together. Those
live in different files, so run them from a checkout where all three exist.

## List every experiment

The registry is the source of truth for what exists and what state it is in.

```bash
python3 - static/app/utils/experiments/experiments.tsx <<'PY'
import re, sys
src = open(sys.argv[1]).read()
body = re.search(r"export const EXPERIMENTS = \{(.*?)\n\} satisfies", src, re.S)
if not body or not body.group(1).strip():
    print("registry is empty"); raise SystemExit
for m in re.finditer(r"'([^']+)':\s*\{(.*?)\n  \},", body.group(1) + "\n  },", re.S):
    eid, blk = m.group(1), m.group(2)
    f = lambda k: (re.search(rf"{k}:\s*'([^']+)'", blk) or [None, "?"])[1]
    print(f"{f('status'):10} {eid:16} {f('surface'):18} {f('element')}")
PY
```

```
active     logs-cta         explore.logs       floating-cta
concluded  trace-nudge      explore.traces     page-banner
```

`concluded` entries render nothing and emit nothing. They are kept only so
historical data stays interpretable, and should be removed once results are
recorded somewhere durable — see the removal procedure in `SKILL.md`.

## Audit for drift

An experiment is spread across a registry entry, a feature flag, and a mount. Any
one of them can go missing, and two of the three failure modes are silent.

```bash
python3 - <<'PY'
import re, pathlib
reg_src = pathlib.Path('static/app/utils/experiments/experiments.tsx').read_text()
body = re.search(r"EXPERIMENTS = \{(.*?)\n\} satisfies", reg_src, re.S).group(1)
reg = re.findall(r"'([a-z0-9-]+)':\s*\{", body)
surfaces = dict(re.findall(r"'([a-z0-9-]+)':\s*\{[^}]*?surface:\s*'([^']+)'", body, re.S))
flags = re.findall(r'organizations:experiment-([a-z0-9-]+)"',
                   pathlib.Path('src/sentry/features/temporary.py').read_text())
mounts = set()
for p in pathlib.Path('static/app').rglob('*.tsx'):
    if p.name.endswith('.spec.tsx'):
        continue
    mounts.update(re.findall(r'<ExperimentSurface\s+surface="([^"]+)"', p.read_text()))

for e in sorted(set(reg) - set(flags)):
    print(f"DRIFT  registry entry with no flag: {e} — never activates")
for f in sorted(set(flags) - set(reg)):
    print(f"DRIFT  flag with no registry entry: {f} — dead line in temporary.py")
for e, s in sorted(surfaces.items()):
    if s not in mounts:
        print(f"DRIFT  {e} targets '{s}' but no page mounts <ExperimentSurface>")
print("no drift" if not (set(reg) ^ set(flags)) and all(s in mounts for s in surfaces.values()) else "")
PY
```

Both directions matter, and neither fails loudly:

- **Registry entry, no flag** — the experiment never activates. Fails safe, and
  looks identical to nobody being enrolled.
- **Flag, no registry entry** — a dead line in `temporary.py`, and a flag that
  can be rolled out to organizations with nothing behind it.
- **Entry targeting an unmounted surface** — renders nothing anywhere.

`SPEC.md` explains why this is a recipe rather than a test: the registry is
TypeScript and the flag is Python, so a pytest would have to parse `.tsx`.
On-demand is the right shape for a check like this.

## Which surfaces are instrumented

Answers "can I add an experiment here without touching component code?"

```bash
grep -rn '<ExperimentSurface' static/app --include='*.tsx' | grep -v '\.spec\.'
```

No output means no page mounts the dispatcher, so the first experiment on any
surface also adds the mount. Publishing an `AnalyticsArea` name is **not** the
same as being instrumented.

## What is actually emitting

The registry says what _should_ run. This says what _is_ running, which is not
always the same — a rollout can be live for an experiment somebody removed
locally, or metrics can arrive with attributes missing.

```bash
curl -s -G -H "Authorization: Bearer $SENTRY_TOKEN" \
  "https://us.sentry.io/api/0/organizations/<org>/events/" \
  --data-urlencode "dataset=tracemetrics" \
  --data-urlencode "field=experiment.id" \
  --data-urlencode "field=sum(value,product.experiment.exposure,counter,none)" \
  --data-urlencode "query=metric.name:product.experiment.exposure" \
  --data-urlencode "sort=-sum(value,product.experiment.exposure,counter,none)" \
  --data-urlencode "statsPeriod=7d" --data-urlencode "project=<project-id>"
```

A row with `"experiment.id": null` is the interesting one: metrics are arriving
without the attribute the framework is supposed to derive. That means either
something is emitting `product.experiment.*` outside the framework, or the data
predates a rename. Either way the rows are unusable for analysis.

## Results for one experiment

The A/B/C/D figures from `analysis.md`, as one loop. Substitute `<experiment>`.

```bash
BASE="experiment.id:<experiment>"
EXP='sum(value,product.experiment.exposure,counter,none)'
ACT='sum(value,product.experiment.action,counter,none)'
n() {
  curl -s -G -H "Authorization: Bearer $SENTRY_TOKEN" \
    "https://us.sentry.io/api/0/organizations/<org>/events/" \
    --data-urlencode "dataset=tracemetrics" --data-urlencode "field=count(value)" \
    --data-urlencode "query=$1" --data-urlencode "statsPeriod=7d" \
    --data-urlencode "project=<project-id>" \
  | python3 -c "import sys,json;r=json.load(sys.stdin).get('data',[]);print(int(r[0]['count(value)']) if r else 0)"
}
A=$(n "metric.name:product.experiment.exposure $BASE tags[experiment.rendered,boolean]:true")
B=$(n "metric.name:product.experiment.action $BASE experiment.action:cta-clicked")
C=$(n "metric.name:product.experiment.action $BASE experiment.action:dismissed")
D=$(n "metric.name:product.experiment.exposure $BASE")
echo "A impressions=$A  B clicks=$B  C dismissals=$C  D exposures=$D"
python3 -c "print(f'CTR {100*$B/$A:.1f}%  dismissal {100*$C/$A:.1f}%') if $A else print('no impressions yet')"
```

Read `analysis.md` before believing any of it. In particular: control's **A**
must be zero, and any row with `experiment.variant:control` _and_
`tags[experiment.rendered,boolean]:true` means the window is unusable.

## Which arm is an organization in

For a local organization, without waiting for telemetry:

```bash
SENDO_LOCAL_FLAGPOLE=1 sentry django shell -c "
from sentry import features
from sentry.models.organization import Organization
org = Organization.objects.get(slug='<slug>')
print('assignments:', features.get_experiment_assignments(org))
print('features   :', [f for f in ['organizations:experiment-<experiment>'] if features.has(f, org)])
"
```

If `assignments` is empty but the flag is on, the entity handler is not loaded —
see `local-setup.md`. That combination emits metrics reporting the control arm
for a treatment element, and the framework warns about it in development.

To find the bucket that produced an assignment, see the bucket lookup in
`local-setup.md`. It is a SHA1 of `organization_id`, not the id.
