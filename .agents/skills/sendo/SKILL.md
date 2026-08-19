---
name: sendo
description: Create, run, analyze, and retire in-product experiments and guides using Sendo — Sentry's internal experiment loop built on Flagpole assignment and Application Metrics. Use when adding an in-product CTA, banner, guide, or nudge to a page, when setting up A/B assignment for a UI surface, when instrumenting exposure or interaction tracking for an experiment, when reading experiment results, or when concluding and cleaning up an experiment. Trigger on "add an experiment", "run an A/B test", "add a CTA to this page", "show a banner to some orgs", "in-product guide", "experiment results", "CTR for the experiment", "conclude the experiment", "remove the experiment", "Sendo".
---

# Sendo Experiments

Declare an experiment as data. Flagpole assigns, the platform's `useExperiment`
hook resolves and reports exposure, and the Sendo framework renders and measures.

Read `references/SPEC.md` for the design rationale and the honest limits of what this
measures. Read `references/platform.md` before changing anything about
assignment — Sentry has more than one experimentation system and they do not all
mean the same thing by "exposure".

**Every experiment is default-off. Never add rollout configuration to the
`sentry-options-automator` repo.**

## Routing

| Request                                                  | Go to                                                 |
| -------------------------------------------------------- | ----------------------------------------------------- |
| Add an experiment                                        | [Start here](#start-here-what-is-being-tested)        |
| Instrument a page so experiments can run on it           | [Instrument a new surface](#instrument-a-new-surface) |
| Change what an experiment looks like                     | [The element catalog](#the-element-catalog)           |
| Read results, compute CTR                                | `references/analysis.md`                              |
| Build a dashboard for an experiment                      | `references/dashboards.md`                            |
| Answer a question about what is running                  | `references/recipes.md`                               |
| Run it locally                                           | `references/local-setup.md`                           |
| Turn an experiment off or delete it                      | [Conclude and remove](#conclude-and-remove)           |
| Understand the metric attributes                         | `references/metrics.md`                               |
| Understand how this relates to Flagpole, gsApp, BigQuery | `references/platform.md`                              |
| Target which organizations are eligible                  | `references/platform.md` (Segmentation)               |
| See the whole experiment lifecycle                       | `references/SPEC.md` (Lifecycle)                      |

## Assignment Is Read, Never Computed

Sendo does not resolve assignment itself. It calls the platform hook:

```ts
const {inExperiment, experimentAssignment} = useExperiment({
  feature: `experiment-${id}`,
  reportExposure: definition.status === 'active',
});
```

Two values, two different jobs, and they come from different places:

| Value                  | Source                                    | Sendo uses it for                  |
| ---------------------- | ----------------------------------------- | ---------------------------------- |
| `inExperiment`         | `organization.features.includes(feature)` | Whether to render                  |
| `experimentAssignment` | `organization.experiments[feature]`       | The `experiment.variant` attribute |

This split is deliberate on the platform's side — see
`static/gsApp/overrides/useExperiment.tsx`, which gates `inExperiment` on
features so `SENTRY_FEATURES`, `self.feature()`, and `devlocal.py` all work
without experiment-specific setup. Sendo matches it rather than diverging.

`organization.experiments` is populated by `get_experiment_assignments()`:

| `organization.experiments['experiment-<id>']` | Meaning       |
| --------------------------------------------- | ------------- |
| key absent                                    | Not enrolled  |
| `'control'`                                   | Control arm   |
| `'active'`                                    | Treatment arm |

Never derive an arm from a hash, a random number, or a user property. If
assignment looks wrong, the fix is in Flagpole config, not in frontend code.

**The one state to watch for:** `inExperiment === true` with
`experimentAssignment !== 'active'` means the element rendered off a raw feature
flag while no Flagpole assignment existed — the entity handler is absent. The
framework logs a dev warning for exactly this. Metrics emitted in that state
report `variant: control` for a rendered treatment element and are unusable. See
`references/local-setup.md`.

## Start Here: What Is Being Tested

"Add an experiment" is not enough to act on. Establish these first, because each
one lands in a specific field and guessing produces an experiment that measures
nothing useful:

| Question                   | Where the answer goes                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Which page?                | `surface`, taken from the page's `AnalyticsArea` name                                                       |
| What is the hypothesis?    | Nowhere in code — it belongs in the dashboard description, and it decides whether the result means anything |
| What does the element say? | `content` — heading, body, CTA label, CTA target                                                            |
| Which element?             | `element`, from [the catalog](#the-element-catalog)                                                         |
| What counts as success?    | The metric you will read afterwards                                                                         |

That last one deserves pushing on. Sendo measures **exposure and interaction** —
whether the element was shown, and whether it was clicked or dismissed. It does
not measure whether anyone went on to do the thing. If the answer is "we want to
know whether more organizations set up logs", say plainly that this gives you a
click-through rate and not an adoption number, and that closing the gap needs
outcome instrumentation that does not exist yet. See Known Limitations in
`references/SPEC.md`.

Also ask whether they want a dashboard. It is the step people skip, and
`references/dashboards.md` has a template that takes two substitutions.

## Before Any Change: Read The Registry

**Never create an experiment without checking the registry first.**

`references/recipes.md` has a one-command listing, plus a drift audit that
cross-checks the registry against the flags and the mounts.

```bash
cat static/app/utils/experiments/experiments.tsx
```

The registry ships **empty** — experiments are added when they are run and
removed when they conclude, so a populated registry is the exception rather
than the norm.

One surface runs at most one active experiment at a time. If the target surface
already has an active experiment, stop and ask the user whether to conclude the
existing one first — do not stack two experiments on one surface, because their
exposures become uninterpretable.

## Add An Experiment

**No page currently mounts `<ExperimentSurface>`.** Until one does, every
experiment is a four-edit job:

| #   | Edit                   | File                                           | Tree      |
| --- | ---------------------- | ---------------------------------------------- | --------- |
| 1   | Registry entry         | `static/app/utils/experiments/experiments.tsx` | `static/` |
| 2   | Feature flag           | `src/sentry/features/temporary.py`             | `src/`    |
| 3   | `Surface` union member | `static/app/utils/experiments/types.tsx`       | `static/` |
| 4   | Mount                  | the page component                             | `static/` |

Edits 1, 3, and 4 go in one pull request; edit 2 goes in another, because
`static/` and `src/` are not atomically deployed and CI rejects a PR spanning
both.

Once a surface is instrumented, a second experiment on that same surface is
edits 1 and 2 only — that is the path this design exists to make cheap, and it
arrives with the second experiment rather than the first.

### 1. Registry entry — `static/app/utils/experiments/experiments.tsx`

Add an entry to `EXPERIMENTS` — do not replace the file, the helpers below the
registry are part of it:

```ts
'logs-cta': {
  surface: 'explore.logs',
  element: 'floating-cta',
  status: 'active',
  content: () => ({
    heading: t('Send your first logs'),
    body: t('Search and filter logs alongside your traces and errors.'),
    ctaLabel: t('Set up logs'),
    ctaTarget: '/settings/projects/',
  }),
},
```

The registry ships empty, so the **first** entry also needs the import that was
removed when the last experiment was torn out:

```ts
import {t} from 'sentry/locale';
```

`content` is a function, not an object, so `t()` runs at render rather than at
module load — the locale is not initialized when the registry module is first
evaluated.

Naming rules for the experiment id:

| Rule                               | Example                         |
| ---------------------------------- | ------------------------------- |
| `kebab-case`, no `experiment` word | `logs-cta`, not `logs-cta-test` |
| Short — it becomes a flag name     | `logs-cta`                      |
| Names the thing being tested       | `logs-cta`, `trace-view-nudge`  |

### 2. Feature flag — `src/sentry/features/temporary.py`

One flag per experiment, derived from the id. Keep it alphabetical:

```python
manager.add("organizations:experiment-logs-cta", OrganizationFeature, FeatureHandlerStrategy.FLAGPOLE, api_expose=True)
```

**`api_expose=True` is required, not optional.** The two halves of an experiment
arrive by different routes, and only one of them ignores `api_expose`:

| Value                      | Route                                                      | Needs `api_expose`? |
| -------------------------- | ---------------------------------------------------------- | ------------------- |
| `organization.experiments` | `get_experiment_assignments()`                             | No                  |
| `organization.features`    | `features.all(api_expose_only=True)` in the org serializer | **Yes**             |

`useExperiment` gates `inExperiment` — the render decision — on
`organization.features`. With `api_expose=False` the flag never reaches that list
(`src/sentry/api/serializers/models/organization.py:459`), so `inExperiment` is
permanently false and the element never renders, in any environment.

All four experiment flags shipping today use `api_expose=True`; see
`onboarding-scm-experiment` and its siblings in `temporary.py`.

Registering the flag does **not** enable it anywhere. Flagpole rollout config
lives in the separate `sentry-options-automator` repo; with no entry there the
backing option defaults to `{}` and the flag evaluates to `False`. Default-off is
structural, not a convention.

Turning it into a real experiment additionally requires `experiment_mode: simple`
in that repo's Flagpole config. That repo is deliberately outside this skill: it
is where rollout decisions are made and reviewed, and nothing here should be
changing it on someone's behalf.

**This file is backend (`src/`). It must be a separate PR from any `static/`
change — CI enforces this, because frontend and backend are not atomically
deployed. `static/gsApp/` counts as frontend.**

### 3. Surface union — `static/app/utils/experiments/types.tsx`

`Surface` is a closed union, so a new surface has to be added before the registry
entry will type-check:

```ts
export type Surface = 'explore.logs' | 'issue-details';
```

Take the name from the `AnalyticsArea` the page already publishes — see
[Instrument a new surface](#instrument-a-new-surface).

### 4. Mount — unless the surface already has one

```bash
grep -rn '<ExperimentSurface' static/app --include='*.tsx' | grep -v '\.spec\.'
```

Empty output means the page needs the mount; see
[Instrument a new surface](#instrument-a-new-surface). If the target page already
has it, skip this step.

### What you must NOT write

Do not write any metrics code. The framework derives every attribute from the
registry and emits exposure and interaction events for you. Hand-written
`Sentry.metrics.count` calls for an experiment are a bug — they will drift from
the taxonomy and break analysis.

Do not call `useExperiment` directly from a page to branch on an experiment. That
bypasses the registry, and with it the attribute derivation that makes the
metrics trustworthy.

## Instrument A New Surface

1. Add the surface to the `Surface` union in
   `static/app/utils/experiments/types.tsx`.

   **Surface names are not invented.** Use the name the page already publishes
   through `<AnalyticsArea name="...">` (`static/app/components/analyticsArea.tsx`).
   The logs page declares `explore.logs` at
   `static/app/views/explore/logs/content.tsx:60`, so that is the surface name.
   Publishing the area is not the same as being instrumented — no page
   currently mounts `<ExperimentSurface>`, so the first experiment on any
   surface also adds the mount.
   If the page has no `AnalyticsArea`, add one first — it is the existing
   convention for naming a region of the UI, and reusing it keeps Sendo's
   `experiment.surface` attribute joinable with ordinary analytics.

   The framework asserts in dev that `useAnalyticsArea()` agrees with the declared
   surface. Note it only warns: `AnalyticsArea` nests, so an inner area can
   legitimately be longer than the surface name.

2. Mount the dispatcher inside the page's `AnalyticsArea`, above the main content:

```tsx
<ExperimentSurface surface="explore.logs" />
```

It renders `null` for unenrolled users, control users, and dismissed elements —
so it is safe to mount unconditionally. Elements are `position: fixed`, so the
mount adds no layout box and cannot shift the page.

## The Element Catalog

Experiments select an element; they do not ship bespoke UI.

| Element        | Use when                                         | Status  |
| -------------- | ------------------------------------------------ | ------- |
| `floating-cta` | A dismissible nudge that should not shift layout | Built   |
| `page-banner`  | An inline banner that participates in layout     | Planned |

Adding a new element:

1. Create `static/app/utils/experiments/elements/<name>.tsx` accepting the shared
   `ExperimentElementProps` (`content`, `onCtaClick`, `onDismiss`).
2. Add it to the `ElementName` union in `types.tsx` and to `ELEMENTS` in
   `experimentSurface.tsx`. The union is named `ElementName` rather than
   `Element` to avoid shadowing the DOM global.
3. The element calls `onCtaClick` and `onDismiss` and nothing else — it must not
   emit metrics or read assignment itself.

Build elements from `@sentry/scraps` primitives (`Flex`, `Stack`, `Text`,
`Heading`) per `static/AGENTS.md`, not hand-rolled styled components.

## Conclude And Remove

Two stages, deliberately separate.

**Conclude** — stop showing it, keep the record:

```ts
status: 'concluded',
```

The element stops rendering and metrics stop emitting. Historical metric data is
untouched and remains queryable. Do this the moment a decision is made.

Note that this is a frontend deploy, not an instant kill. A true kill switch is a
PR to `sentry-options-automator` disabling the flag, which also has to deploy.

**Remove** — delete it, once results are recorded somewhere durable.

Start by finding every artifact, so none is left behind:

```bash
.agents/skills/sendo/scripts/end_experiment.py <experiment> --org <org>
```

It reports all four and performs none of the source edits — regexing
TypeScript and Python is how you get a broken build:

1. Delete the registry entry.
2. Delete the flag from `temporary.py` (separate backend PR).
3. If the surface now has no experiments, remove the `<ExperimentSurface>` mount.
4. Delete the experiment's dashboard, once its numbers are written down
   somewhere durable. Add `--delete-dashboard --yes` to have the script do it.
5. Run `pnpm run typecheck` — TypeScript surfaces every stale reference.

Deleting the dashboard does not delete the metrics. It deletes the only place
anyone was reading them, which is why step 4 comes after recording results.

Removing the registry entry also stops the `experiment.arm.<id>` scope attribute,
since it is only set while the surface mounts. Nothing else needs unsetting.

Do not leave concluded experiments in the registry indefinitely. They carry the
same complexity tax as stale feature flags, which `temporary.py` exists to warn
about.

## Non-Negotiable Constraints

- Default-off everywhere. No `sentry-options-automator` changes, no customer
  rollout.
- Assignment is read through `useExperiment`, never recomputed.
- Exposure fires for control too, or the arms are not comparable.
- Metric attributes are bounded string unions — no URLs, no copy, no org slugs,
  no free text. See `references/metrics.md`.
- Copy and links live in registry `content`, never in attributes.
- Never present a difference between arms as significant. There is no
  statistical machinery here — no significance test, no confidence interval, no
  power calculation. See Known Limitations in `references/SPEC.md`.
- Never describe Sendo's exposure count and the platform's `experiment.exposure`
  count as measuring the same thing. See `references/platform.md`.

## Key Files

| Path                                                    | Contains                          |
| ------------------------------------------------------- | --------------------------------- |
| `static/app/utils/experiments/experiments.tsx`          | The registry — start here         |
| `static/app/utils/experiments/types.tsx`                | Ids, surfaces, elements, attrs    |
| `static/app/utils/experiments/useExperimentSurface.tsx` | Sendo's hook — composes the below |
| `static/app/utils/experiments/experimentMetrics.tsx`    | The only place metrics emit       |
| `static/app/utils/experiments/elements/`                | Element catalog                   |
| `static/app/utils/useExperiment.tsx`                    | Platform hook + OSS fallback      |
| `static/gsApp/overrides/useExperiment.tsx`              | SaaS implementation               |
| `static/app/components/analyticsArea.tsx`               | Surface naming convention         |
| `src/sentry/features/temporary.py`                      | Flag registration                 |
| `src/sentry/features/manager.py:449`                    | `get_experiment_assignments()`    |
| `src/flagpole/__init__.py:81`                           | `ExperimentMode`                  |
| `src/flagpole/conditions.py:364`                        | `in_rollout()` — bucketing        |
