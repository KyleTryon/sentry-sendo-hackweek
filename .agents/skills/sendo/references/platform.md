# The Experimentation Platform Around Sendo

Read this before changing anything about assignment or exposure. Sentry has more
than one experimentation system, they do not all mean the same thing by
"exposure", and Sendo adds a third record on top.

## The Two Existing Systems

### 1. Flagpole-native — the product-integrated path

This is what actually gates product behavior today.

1. An org-scoped Flagpole feature in `sentry-options-automator`'s
   `options/default/flagpole.yaml` is marked `experiment_mode: simple`.
2. Flagpole evaluates ordinary segment conditions and percentage rollout.
   `experiment_mode` does not alter matching — it interprets `true` as `active`
   and `false` as `control` (`src/flagpole/__init__.py:81`).
3. Assignment is deterministic but **not** a function of the raw org id.
   `EvaluationContext.__generate_id` SHA1-hashes the context's _identity fields_
   — `organization_id` for org-scoped flags — and reads that digest as a big
   integer. Bucketing is then `context.id % 100 <= rollout`
   (`src/flagpole/conditions.py:364`). Organization 1 hashes to bucket 57, not 1,
   so you cannot predict an org's arm by eye.
4. `get_experiment_assignments()` (`src/sentry/features/manager.py:449`) puts the
   result on the org payload as `experiments`.
5. The frontend reads it through `useExperiment` and reports exposure when the
   user actually encounters a variant.
6. Exposure emits `experiment.exposure` via `analytics.record()` into
   `analytics.events_denormalized`, and sets an Amplitude org group property.
   Redis dedup avoids repeated writes.
7. An ETL builds an organization-experiment fact table from those events, bounded
   by `ab_testing.experiment_config.start_date` when present, otherwise 180 days.

Only `simple` mode exists: two arms, org scope. Multi-arm and user-level
experimentation are not implemented.

Live flags with `experiment_mode` on `main` at the time of writing:
`onboarding-scm-experiment`, `onboarding-scm-messaging-experiment`,
`onboarding-scm-project-creation-experiment`.

### 2. The BI A/B tool — experiment management and statistics

An internal form/admin portal writes to the `super-big-data.ab_testing` BigQuery
dataset:

| Table                      | Contains                            |
| -------------------------- | ----------------------------------- |
| `experiment_config`        | Definitions, dates, filters, status |
| `experiment_assignments`   | One row per org and assignment      |
| `experiment_org_selection` | Cohort filters / snapshot           |
| `experiment_metrics`       | Metric definitions                  |
| `experiment_events`        | Daily conversion data               |
| `experiment_results`       | Statistical outputs                 |

It supports experiment setup, power calculations, approval, deterministic org
assignment, and statistical analysis. A manual "Flagpole" action generates
treatment-slug YAML for `sentry-options-automator`.

**Assignment authority is split.** Internal docs describe continuous enrollment →
product gating as an unresolved integration. The BI tool's cohorts are not
automatically authoritative in the product; Flagpole's hash rollout is.

Schema trap: `experiment_assignments` uses column `assignment`, while
`experiment_results` uses `variant`.

Note `experiment_events` was empty at the time of writing — outcome measurement is
missing platform-wide, not just in Sendo.

## What Is And Is Not In This Repo

The frontend is complete here. Only getsentry's **Python** is missing.

| Piece                                            | Where                                         | Here?                          |
| ------------------------------------------------ | --------------------------------------------- | ------------------------------ |
| Bucketing — `segment.in_rollout()`               | `src/flagpole/conditions.py`                  | ✅ tested in `tests/flagpole/` |
| Segment matching — `Feature.match()`             | `src/flagpole/__init__.py`                    | ✅ tested                      |
| `ExperimentMode.SIMPLE.get_assignment()`         | `src/flagpole/__init__.py`                    | ✅ tested                      |
| Context builder                                  | `src/sentry/features/flagpole_context.py:114` | ✅                             |
| OSS hook + override seam                         | `static/app/utils/useExperiment.tsx`          | ✅                             |
| **SaaS `useExperiment` override**                | `static/gsApp/overrides/useExperiment.tsx`    | **✅**                         |
| `add_entity_handler()` API                       | `src/sentry/features/manager.py:232`          | ✅                             |
| **A production entity handler**                  | getsentry Python                              | ❌                             |
| A development entity handler                     | `sentry/features/dev_flagpole_handler.py`     | ✅ `SENDO_LOCAL_FLAGPOLE=1`    |
| **`/organizations/{slug}/experiment-exposure/`** | getsentry Python                              | ❌                             |
| **Subscription/billing context properties**      | getsentry Python                              | ❌                             |

`src/getsentry` does not exist here. `src/sentry/features/handler.py` notes that
FeatureHandlers are "generally only implemented in `getsentry.features`", and
`manager.py:460` names `FlagpoleFeatureHandler in getsentry`. Without it, the base
`get_experiment_assignments()` returns `{}`.

**But `static/gsApp/` is here** — 412 tracked files, aliased to `getsentry` in
`rspack.config.ts:509` and `tsconfig.json:57`. Earlier drafts of this design
assumed the whole SaaS layer was out of reach. It is not; only the Python is.

Which frontend loads is a config switch: `static/app/index.tsx:79` skips the gsApp
import entirely when `sentryMode === 'SELF_HOSTED'`, and
`src/sentry/conf/server.py:766` defaults to exactly that. See
`references/local-setup.md`.

## Where Sendo Sits

Sendo does not replace either system. It adds a declaration layer above Flagpole
assignment, and a measurement plane beside the BigQuery pipeline.

| Concern                         | Owner                   |
| ------------------------------- | ----------------------- |
| Who is eligible, who gets what  | Flagpole                |
| Encounter record → BigQuery     | `useExperiment` / gsApp |
| Amplitude arm labeling          | gsApp                   |
| **Which element renders where** | **Sendo registry**      |
| **Render + interaction counts** | **Sendo metrics**       |
| Statistics                      | Nobody, for now         |

Sendo's exposure metric is a _render_ record. The platform's `experiment.exposure`
is an _encounter_ record. See the three-exposure-records table in `SPEC.md`.

## Segmentation

Bucketing decides _how many_ organizations get the treatment. Segmentation decides
_which ones are eligible in the first place_, and it runs first.

A flag holds an ordered list of segments. Each has conditions and its own rollout:

```yaml
segments:
  - name: early adopters, fully on
    rollout: 100
    conditions:
      - property: organization_is-early-adopter
        operator: equals
        value: true
  - name: everyone else, half
    rollout: 50
    conditions: []
```

### First match wins, and it is final

`Feature.match()` walks the segments in order, and **the first one whose
conditions match decides the outcome** — it returns that segment's
`in_rollout(...)` and never looks at the rest (`src/flagpole/__init__.py:133`).

Two consequences that bite:

- **Order matters.** A segment with `conditions: []` matches everyone, so
  anything below it is unreachable. Put narrow segments first.
- **`rollout: 0` is a kill switch, not a skip.** A matching segment with zero
  rollout returns `False` and stops evaluation, so it disables the feature for
  that population _even if a later segment would have matched_. The code says so
  explicitly (`src/flagpole/conditions.py`). That is how you carve an exclusion
  out of a broad rollout.

### Operators

`in`, `not_in`, `contains`, `not_contains`, `equals`, `not_equals`, `matches`,
`not_matches` — see `ConditionOperatorKind` in `src/flagpole/conditions.py`.

### Properties you can actually segment on

This is the short list, and it is shorter than people expect. Verified by
building a real context in this repo:

| Property                        | Notes                                    |
| ------------------------------- | ---------------------------------------- |
| `organization_id`               | Also the bucketing input                 |
| `organization_slug`             |                                          |
| `organization_name`             |                                          |
| `organization_is-early-adopter` | Note the underscore-then-hyphen spelling |
| `user_id`                       |                                          |
| `user_is-staff`                 |                                          |
| `user_is-superuser`             |                                          |

**There is no plan, subscription, org age, or usage property here.** Those come
from getsentry's context builder, which is not in this repo — so an experiment
targeting "organizations on the Business plan" or "organizations created in the
last 30 days" cannot be expressed or tested locally, only in production. If a
proposal depends on that kind of targeting, confirm the property exists before
promising the segment.

To check what a given organization would produce:

```bash
SENDO_LOCAL_FLAGPOLE=1 sentry django shell -c "
from sentry.features.flagpole_context import get_sentry_flagpole_context_builder, SentryContextData
from sentry.models.organization import Organization
org = Organization.objects.get(slug='<slug>')
print(sorted(get_sentry_flagpole_context_builder().build(SentryContextData(organization=org)).to_dict()))
"
```

### Segmentation and arms are different things

A segment decides eligibility. The rollout inside it decides the arm. An
organization outside every segment is **not enrolled** — it never appears in
`organization.experiments`, emits nothing, and is not part of the control arm.
Control means "eligible, and Flagpole assigned the control side", which is why
`analysis.md` insists both arms produce exposure.

## The Bucketing Caveat

`in_rollout()` hashes nothing but the org id:

```python
def in_rollout(self, context: EvaluationContext) -> bool:
    if self.rollout == 0:
        return False
    if self.rollout is not None and self.rollout < 100:
        return context.id % 100 <= self.rollout
    return True
```

Two consequences:

- **The feature name is not in the hash.** Two flags with identical conditions and
  rollout percentage select the _same_ organizations. Concurrent experiments at
  the same rollout are perfectly confounded. Changing this globally would reshuffle
  ordinary feature flags, so a fix needs experiment-specific bucketing or
  versioning.
- **The comparison is inclusive.** `rollout: 50` matches buckets 0 through 50 —
  51 of 100, not 50. Arms are 51/49.

Neither is Sendo's to fix. Both must be stated when presenting arm balance.

## The Clean End State

One system owns assignment. The experiment key enters the bucketing hash. Exposure
semantics are preserved end to end. One canonical assignment/exposure model feeds
BigQuery and Amplitude, and outcomes are instrumented for both arms.
