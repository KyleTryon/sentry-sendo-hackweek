# Metric And Attribute Taxonomy

Two metric names cover every Sendo experiment. Experiment identity lives in
attributes, not in the metric name, so that a new experiment needs no new metric
and every dashboard query generalizes.

**You never write these calls.** They are emitted by
`static/app/utils/experiments/experimentMetrics.tsx`, which derives every
attribute from the registry entry. This page documents what lands in Sentry so
you can query it — not an API to call.

## Naming

One rule covers every name in Sendo:

> **`.` separates hierarchy levels. `-` separates words within a level. `_` never
> appears.**

Dots and kebab are not alternatives — they compose. `experiment.arm.logs-cta` is
two namespace levels and one kebab-case identifier.

| Kind                 | Form                               | Example                       |
| -------------------- | ---------------------------------- | ----------------------------- |
| Metric names         | dotted, three levels               | `product.experiment.exposure` |
| Attribute keys       | namespaced under `experiment.`     | `experiment.variant`          |
| Scope attribute keys | namespaced under `experiment.arm.` | `experiment.arm.logs-cta`     |
| Experiment ids       | kebab-case                         | `logs-cta`                    |
| Element names        | kebab-case                         | `floating-cta`                |
| Action values        | kebab-case                         | `cta-clicked`                 |
| Surfaces             | dotted, from `AnalyticsArea`       | `explore.logs`                |
| Variants             | Flagpole's own strings             | `active`, `control`           |
| Feature flags        | `organizations:experiment-<id>`    | derived, never hand-written   |
| Env vars             | SCREAMING_SNAKE                    | `SENDO_LOCAL_FLAGPOLE`        |

**Attribute keys are namespaced deliberately.** Sentry attributes share one flat
namespace across every team emitting telemetry, and bare words like `action`,
`surface`, and `element` will collide. In a sample of 111 span attributes on a
live project, 97 were dot-namespaced and the bare ones were exactly the generic
ones (`type`, `url`). The cost is longer queries —
`experiment.id:logs-cta` rather than `experiment:logs-cta` — which is worth
paying once rather than renaming attributes after they carry data that matters.

**`experiment.arm.` is separate from `experiment.` on purpose.** The metric
fields are `experiment.id`, `experiment.variant`, and so on; the scope key is
per-experiment, `experiment.arm.logs-cta = active`. Without the extra level,
`experiment.<something>` would mean a field name in one place and an experiment
id in another.

Build these names with the helpers in `experiments.tsx` —
`experimentFeature()`, `experimentArmAttribute()`, `experimentDismissalKey()` —
rather than interpolating strings at call sites, so they cannot drift.

## `product.experiment.exposure`

Emitted once per component mount, for **every enrolled user in both arms**, when
they encounter the surface.

```ts
Sentry.metrics.count('product.experiment.exposure', 1, {
  attributes: {
    'experiment.id': 'logs-cta',
    'experiment.variant': 'active',
    'experiment.surface': 'explore.logs',
    'experiment.element': 'floating-cta',
    'experiment.rendered': true,
  },
});
```

`rendered` distinguishes "was enrolled and saw the element" from "was enrolled
and did not." It is `false` for control users, and for active-arm users who
previously dismissed the element. This is what lets one metric serve as both the
arm-comparison denominator (all exposures) and the CTR denominator
(`rendered:true`).

## `product.experiment.action`

Emitted on each interaction. Not deduplicated — a user who clicks twice produces
two events.

```ts
Sentry.metrics.count('product.experiment.action', 1, {
  attributes: {
    'experiment.id': 'logs-cta',
    'experiment.variant': 'active',
    'experiment.surface': 'explore.logs',
    'experiment.element': 'floating-cta',
    'experiment.action': 'cta-clicked',
  },
});
```

## Attributes

Every value below is a TypeScript string union. The compiler is the enforcement
mechanism — an unknown surface or action will not build.

| Attribute             | Values                        | Source                                      |
| --------------------- | ----------------------------- | ------------------------------------------- |
| `experiment.id`       | Registry keys (`logs-cta`, …) | Registry key                                |
| `experiment.variant`  | `control` \| `active`         | `experimentAssignment` from `useExperiment` |
| `experiment.surface`  | `explore.logs`, …             | Registry `surface`                          |
| `experiment.element`  | `floating-cta`, …             | Registry `element`                          |
| `experiment.rendered` | `true` \| `false`             | Computed (exposure only)                    |
| `experiment.action`   | `cta-clicked` \| `dismissed`  | Interaction (action only)                   |

`variant` comes from the platform hook, which reads
`organization.experiments[feature] ?? 'control'`. **Rendering is gated on
`inExperiment` instead**, which is features-based. When no Flagpole entity handler
is installed those two disagree: the element renders while `variant` reports
`control`. The framework warns in dev; `analysis.md` has the query-side check.

## What Must Never Become An Attribute

Attribute cardinality is a cost paid by every query, forever, and high-cardinality
attributes are effectively impossible to remove once written.

Never attach:

- **Copy or headings.** They live in registry `content`. Copy changes over an
  experiment's life; attributes must not.
- **URLs or CTA targets.** Unbounded, and they leak routing details into metrics.
- **Organization slugs, ids, names, or user emails.** Customer-identifying data
  does not belong in metrics — see the Customer Information rule in `AGENTS.md`.
- **Timestamps, counters, or session ids.** Use the metric's own timestamp.

If you find yourself wanting a new attribute, first check whether it has a
bounded value set of roughly a dozen or fewer. If not, it is not an attribute.

## What The SDK Adds On Its Own

**The list above governs what Sendo attaches. It is not what arrives in Sentry.**
The SDK decorates every metric with global attributes, verified from a real
envelope captured in the browser:

| Attribute                               | Example                              |
| --------------------------------------- | ------------------------------------ |
| `user.id`, `user.email`                 | `1`, `admin@sentry.io`               |
| `organization`, `organization.slug`     | `'1'`, `sentry`                      |
| `sentry.release`, `sentry.environment`  | `frontend@…`, `development`          |
| `sentry.sdk.name`, `sentry.sdk.version` | `sentry.javascript.react`, `10.69.0` |

Two consequences, and neither is Sendo's to fix unilaterally:

1. **User email and organization slug are on every metric.** They are exactly the
   unbounded, customer-identifying values this page tells you not to add. Removing
   them means changing the SDK's global scope in `initializeSdk.tsx`, which
   affects all product telemetry, not just experiments. Raise it as a decision
   rather than assuming the "never" list above is doing the work.
2. **Per-user and per-organization analysis is possible after all.** `user.id` and
   `organization` make unique-user and unique-org funnels available, which the
   original design assumed were out of reach. See `analysis.md`.

## The Arm Is Also On The SDK Scope

`useExperimentSurface` puts the assignment on the scope for enrolled organizations:

```ts
Sentry.getCurrentScope().setAttribute(`experiment.arm.${experiment}`, variant);
```

So `experiment.arm.logs-cta: active` rides along on **spans, logs, and metrics** from
that user — not just Sendo's own two metrics. That is what makes guardrail
analysis possible: you can compare pageload and interaction latency between arms,
because the spans carry the arm.

Three consequences worth knowing:

- **It does not reach error events.** Attributes apply to spans, logs, and
  metrics; errors carry _tags_. Splitting error rate by arm would need
  `Sentry.setTag` as well, which the framework deliberately does not do. Guardrail
  dashboards can compare latency between arms but not error rate.
- **It is keyed per experiment**, so concurrent experiments do not overwrite each
  other — which matters given the shared-bucketing caveat in `platform.md`.
- **It does not self-remove.** The attribute persists for the isolation scope's
  life and stops appearing only when the experiment concludes and the surface
  stops mounting. Removing an experiment removes it.

Use `getCurrentScope().setAttribute` rather than the top-level
`Sentry.setAttribute`. It matches `actionCreators/organization.tsx`, and the
top-level form is not interceptable by `jest.spyOn` — the bundler inlines the
named import, so tests silently observe zero calls.

## Relationship To The Platform's Exposure Record

`product.experiment.exposure` is deliberately named distinctly from
`experiment.exposure`, the platform's analytics event. **They are different
records and will not agree.**

|             | `experiment.exposure` (platform)                                               | `product.experiment.exposure` (Sendo) |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| Written by  | `static/gsApp/overrides/useExperiment.tsx`                                     | `experimentMetrics.tsx`               |
| Destination | `analytics.events_denormalized` → BigQuery                                     | Application Metrics                   |
| Fires when  | enrolled only                                                                  | enrolled, both arms                   |
| Dedup       | module `Set` keyed `slug:feature:assignment` — survives client-side navigation | per component mount                   |
| Means       | user _encountered_ the experiment                                              | element _render decision_             |

Sendo does not suppress the platform record. Both fire; each answers a different
question. See `platform.md`.

## Relationship To `trackAnalytics`

Sendo metrics are deliberately **not** Amplitude analytics events. They are
Application Metrics, aggregated counters queried in Metrics Explorer.

Use Sendo metrics for experiment exposure and interaction. Use `trackAnalytics`
(see the `analytics` skill) for ordinary product instrumentation. An experiment's
downstream _outcome_ is usually already a `trackAnalytics` event — which is why
outcome analysis currently requires joining two systems by hand, and is listed as
a known limitation in `SPEC.md`.
