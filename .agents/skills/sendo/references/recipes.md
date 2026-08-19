# Recipes

Runnable answers to the questions that come up repeatedly. Every command here
was run against this repo and, where it queries Sentry, against live data.

Three of these read the registry, the flag list, and the mounts together. Those
live in different files, so run them from a checkout where all three exist.

## List every experiment

```bash
.agents/skills/sendo/scripts/list_experiments.py
```

```
STATUS     ID                   SURFACE              ELEMENT
active     logs-cta             explore.logs         floating-cta
concluded  trace-nudge          explore.traces       page-banner

1 active, 1 concluded
```

Prints `registry is empty` when nothing is declared, which is the normal state
between experiments. `concluded` entries render nothing and emit nothing; they
exist so historical data stays interpretable and should be removed once results
are recorded somewhere durable — see the removal procedure in `SKILL.md`.

## Audit for drift

An experiment is spread across a registry entry, a feature flag, and a mount. Any
one can go missing, and two of the three failure modes are silent.

```bash
.agents/skills/sendo/scripts/audit_drift.py
```

Exits non-zero when it finds anything, so it can gate a script or a CI job:

```
DRIFT  registry entry with no flag: trace-nudge — never activates
DRIFT  flag with no registry entry: ghost-flag — dead line in temporary.py
DRIFT  trace-nudge targets 'explore.traces' but no page mounts <ExperimentSurface>
```

Why each matters:

- **Registry entry, no flag** — never activates, and looks identical to nobody
  being enrolled.
- **Flag, no registry entry** — a dead line in `temporary.py`, and a flag that
  can be rolled out with nothing behind it.
- **Entry targeting an unmounted surface** — renders nothing anywhere.

The registry and the flags land in separate pull requests, so run this from a
checkout containing both, or pass `--registry` and `--flags`.

`SPEC.md` explains why this is a script rather than a test: the registry is
TypeScript and the flag is Python, so a pytest would have to parse `.tsx`. On
demand is the right shape, and this covers the mount case a test would not reach.

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

```bash
SENTRY_TOKEN=... .agents/skills/sendo/scripts/experiment_results.sh \
  <org> <project-id> <experiment> [period]
```

```
logs-cta over 7d

  A  impressions (rendered)   22
  B  cta-clicked              5
  C  dismissed                3
  D  total exposures          29

  CTR             22.7%
  dismissal rate  13.6%
```

It also runs the first sanity check from `analysis.md` for you: if any control-arm
exposure reports `rendered:true`, the element drew for organizations that should
not have seen it, and the script exits non-zero rather than printing a number you
should not trust.

Read `analysis.md` before believing the rest. `org:read` is sufficient.

## End an experiment

An experiment leaves traces in four places, and the dashboard is the one people
forget — it keeps showing a number nobody is maintaining.

```bash
SENTRY_TOKEN=... .agents/skills/sendo/scripts/end_experiment.py <experiment> --org <org>
```

```
Ending experiment: logs-cta

1. Registry entry
     static/app/utils/experiments/experiments.tsx:2  'logs-cta': {
2. Feature flag (separate backend PR)
     src/sentry/features/temporary.py:1  manager.add("organizations:experiment-logs-cta", ...)
3. Mount for surface 'explore.logs'
     static/app/views/explore/logs/content.tsx:2
     remove only if no other experiment targets this surface
4. Dashboard
     #9633813  Sendo · logs-cta
       https://sentry.io/organizations/<org>/dashboard/9633813/
```

It reports the three source edits rather than performing them. Rewriting
TypeScript and Python by regex is how you get a broken build, and the mount in
particular needs judgement: remove it only if no other experiment targets that
surface.

The dashboard it will delete for you, because that is the step that gets skipped:

```bash
SENTRY_TOKEN=... .agents/skills/sendo/scripts/end_experiment.py <experiment> \
  --org <org> --delete-dashboard --yes
```

Without `--yes` it names what it would delete and stops. **Record the results
first.** Deleting the dashboard does not delete the metrics — they stay queryable
under `experiment.id:<experiment>` — but it removes the only place anyone was
reading them, and nothing else will reconstruct the layout.

Concluding is different from removing. Setting `status: 'concluded'` stops the
element rendering and stops metric emission while leaving history intact; do that
the moment a decision is made. Removal comes later, once the numbers live
somewhere durable. `SKILL.md` has both procedures.

## Check the docs for drift

The skill describes attribute names, query syntax, and a diagram that all
reference code. Twice they have gone stale silently — the architecture diagram
kept labelling attributes with pre-namespace names, and query examples used bare
boolean keys that match nothing and return zero rather than erroring. Both look
correct until someone runs a query and gets an empty result.

```bash
.agents/skills/sendo/scripts/check_docs.py
```

A line that must name one of these patterns deliberately can opt out with an
inline `check-docs:allow` comment — this file uses one just above.

It runs automatically on any change under `.agents/skills/sendo/*.md` via the
`sendo-skill-docs` pre-commit hook, and exits non-zero on a finding.

It checks three things, all of which have actually happened:

- a bare attribute name used as a query key, when they are namespaced under
  `experiment.`
- `experiment.rendered` queried without `tags[...,boolean]`, which silently
  matches nothing
- the snake_case click action, from before values became kebab-case <!-- check-docs:allow -->

It cannot check the mermaid diagrams, which need a real parser. To validate
those, install `mermaid` in a scratch directory and call `mermaid.parse()` with
jsdom globals — full rendering needs a browser and fails under jsdom, but parse
validation catches syntax errors.

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
