# Sendo Experiments

Declare an in-product experiment as data: a registry entry in
[`experiments.tsx`](./experiments.tsx) plus a feature flag in
`src/sentry/features/temporary.py`. Assignment comes from Flagpole through
`sentry/utils/useExperiment`; this framework renders the element and emits the
metrics.

**Do not write metrics code for an experiment.** Every attribute is derived from
the registry entry by [`experimentMetrics.tsx`](./experimentMetrics.tsx), which
is the only place `Sentry.metrics.count` is called for experiments.

Full documentation, including how this relates to the platform's existing
exposure pipeline and what these numbers do and do not support, lives in the
`sendo` agent skill:

- `.agents/skills/sendo/SKILL.md` — add, conclude, and remove an experiment
- `.agents/skills/sendo/SPEC.md` — design rationale and known limitations
- `.agents/skills/sendo/references/platform.md` — Flagpole, gsApp, BigQuery
- `.agents/skills/sendo/references/metrics.md` — attribute taxonomy
- `.agents/skills/sendo/references/analysis.md` — reading results
- `.agents/skills/sendo/references/local-setup.md` — running it locally
