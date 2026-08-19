# Running An Experiment Locally

Three things must be configured: which frontend loads, which arm your local org
lands in, and where the metrics go.

There is **no client-side assignment shim**. An earlier draft of this design had
one — a fallback that treated "feature flag present" as `active`. It was removed
because it was a second assignment system, and because the platform hook already
covers the case. Assignment is always read, never synthesized.

## 1. Which Frontend Loads

`static/app/index.tsx:79` skips the gsApp import entirely when
`sentryMode === 'SELF_HOSTED'`, and `src/sentry/conf/server.py:766` defaults
`SENTRY_MODE = SentryMode.SELF_HOSTED`. A stock devserver therefore runs
`useNoopExperiment`, not the real override.

To exercise the production path, set in `~/.sentry/sentry.conf.py`:

```python
from sentry.conf.types.sentry_config import SentryMode

SENTRY_MODE = SentryMode.SAAS
```

Without it, framework work is still fully testable — you are just not running
what production runs.

## 2. Getting The Element To Render

`useExperiment` gates `inExperiment` on `organization.features`, deliberately, so
that local tooling works. The cheapest demo therefore needs no Flagpole handler at
all. In `~/.sentry/sentry.conf.py` — never in a checked-in file:

```python
SENTRY_FEATURES["organizations:experiment-<your-experiment>"] = True
```

Restart the devserver. Verify the flag reached the frontend from the browser
console — it arrives **without** the `organizations:` prefix:

```js
window.__initialData?.features;
```

The element renders.

> **The trap.** `organization.experiments` is still `{}`, so
> `experimentAssignment` falls through to `'control'`. Sendo will report
> `variant: control` for a rendered treatment element, and the framework logs a
> dev warning saying so. This is good enough to demo the UI and to check layout.
> **It is not good enough to demo or collect data.** See the first sanity check in
> `analysis.md`.

## 3. Getting Real Assignment

Real assignment needs an entity handler, because `get_experiment_assignments()`
delegates to one and the base implementation returns `{}`.

```bash
SENDO_LOCAL_FLAGPOLE=1 pnpm run dev
```

This registers `sentry/features/dev_flagpole_handler.py`, which reads
`src/sentry/features/dev_flagpole.yaml`, builds context with
`get_sentry_flagpole_context_builder()`
(`src/sentry/features/flagpole_context.py:114`), and runs the real
`Feature.match()` and `ExperimentMode.SIMPLE.get_assignment()`.
`organization.experiments` is populated, `variant` becomes correct, and changing
the rollout percentage in the YAML moves organizations between arms.

**It is not a second assignment system.** The evaluation path is the one
production uses; only the config source differs. Production reads
`sentry-options-automator`; this reads a checked-in file in the same `options:`
layout, so the same file works with:

```bash
.venv/bin/python -m flagpole.flagpole_eval --flagpole-file src/sentry/features/dev_flagpole.yaml --flag-name organizations:experiment-<your-experiment> --context '{"organization_id": 1}'
```

Segments decide who is eligible before bucketing decides the arm. The list is
ordered and the first match wins, so a segment with `conditions: []` matches
everyone and shadows anything below it — see the Segmentation section in
`platform.md`, which also lists the seven properties you can actually target.

To move yourself between arms, edit `rollout` in that file: `0` puts every
organization in control, `100` puts every organization in the active arm.
Flagpole buckets on `context.id % 100` with an inclusive comparison, so `50` is
51/49, not 50/50.

**Your org's bucket is a hash, not its id.** `context.id` is a SHA1 of the
identity fields, so organization 1 lands in bucket 57. To find yours and pick a
rollout that actually splits:

```bash
SENDO_LOCAL_FLAGPOLE=1 sentry django shell -c "
from sentry.features.flagpole_context import get_sentry_flagpole_context_builder, SentryContextData
from sentry.models.organization import Organization
org = Organization.objects.get(slug='sentry')
print('bucket:', get_sentry_flagpole_context_builder().build(SentryContextData(organization=org)).id % 100)
"
```

A rollout above that number puts you in the active arm; at or below it, control.

**Safety.** The handler is off unless `SENDO_LOCAL_FLAGPOLE=1`, and it refuses to
overwrite an already-registered handler: `add_entity_handler()`
(`src/sentry/features/manager.py:232`) assigns a single slot, so last
registration wins, and a dev handler must never load where getsentry's would.
Both properties are covered by `tests/sentry/features/test_dev_flagpole_handler.py`.

One implementation note if you touch it: `sentry.features` is imported before the
Django app registry is ready, so the handler defers every Django-touching import
(`flagpole_context` and the feature base classes) out of module scope. Moving them
back to the top will break startup with `AppRegistryNotReady`.

| Config                                     | Renders | `experiment.variant` | Usable data |
| ------------------------------------------ | ------- | -------------------- | ----------- |
| Nothing                                    | No      | —                    | —           |
| `SENTRY_FEATURES` only                     | Yes     | `control`            | **No**      |
| `SENDO_LOCAL_FLAGPOLE=1`, rollout matches  | Yes     | `active`             | Yes         |
| `SENDO_LOCAL_FLAGPOLE=1`, rollout excludes | No      | `control`            | Yes         |

**Do not add rollout configuration to `sentry-options-automator`.** Local
overrides only, for the duration of the POC.

## 4. A Known Local Failure

`/organizations/{slug}/experiment-exposure/` is a getsentry Python endpoint and
does not exist in this repo. With `reportExposure: true`, gsApp's override fires a
POST that 404s.

It is a `useMutation` with `retry: false`, so nothing breaks — but expect a
console error and a failed request in the network tab. **Sendo's own metrics are
unaffected.** In tests, stub it with `MockApiClient`; see
`static/gsApp/overrides/useExperiment.spec.tsx` for the existing pattern.

## 5. Pointing Metrics At A Safe Test Project

Frontend metrics go wherever the frontend SDK's DSN points. Send them to a
scratch project you own — not to the project the dev environment defaults to,
and never to a production Sentry project.

**Full devserver** (`pnpm run dev`) — the DSN comes from the backend config
(`src/sentry/web/client_config.py:117` reads `settings.SENTRY_FRONTEND_DSN`). Set
it in `~/.sentry/sentry.conf.py`:

```python
SENTRY_FRONTEND_DSN = "https://<key>@<host>/<project-id>"
```

**Frontend-only** (`pnpm run dev-ui`) — SPA mode reads two environment variables,
and `SENTRY_SPA_DSN` is only honored when `SENTRY_EXPERIMENTAL_SPA` is set
(`rspack.config.ts:108-114`):

```bash
SENTRY_EXPERIMENTAL_SPA=1 SENTRY_SPA_DSN="https://<key>@<host>/<project-id>" pnpm run dev-ui
```

## 6. Verifying The Loop

1. Load the experiment's surface as an organization inside the rollout.
2. Confirm the element renders, and that **no dev warning** about a missing
   assignment appears in the console. If it does, you are in the §2 trap.
3. Move the org out of the rollout in `flagpole.yaml`, restart, and confirm the
   element does not render.
4. Watch the network tab for envelope requests to the DSN's ingest host — metrics
   are batched, so allow a few seconds or navigate away to force a flush.
5. In the test project, open Metrics Explorer and query
   `sum(product.experiment.exposure)` filtered `experiment.id:<your-experiment>`, grouped by
   `variant`. Both arms should appear.
6. Click the CTA and dismiss the element, then confirm
   `product.experiment.action` arrives with both `action` values.

Backend flag resolution problems show up in `.artifacts/dev.log`
(`src/sentry/runner/commands/devserver.py:458`), which captures the devserver's
full console output.

## 7. Resetting Dismissal State

Dismissal is stored in `localStorage` under `${organizationId}:experiment-<id>`
via `useDismissAlert`. To see the element again:

```js
localStorage.removeItem('<orgId>:experiment-<your-experiment>');
```

Dismissal persists per browser, so a dismissed element stays hidden across
reloads — that is intended behavior, and a common reason for "the element stopped
appearing" during local testing.
