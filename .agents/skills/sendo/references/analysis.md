# Reading Experiment Results

Analysis is manual, in Metrics Explorer. There is no results UI and no statistics
engine; see the Known Limitations section of `SPEC.md` before reporting anything.

## Base Filter

Every query below assumes a filter isolating one experiment:

```
experiment.id:logs-cta experiment.surface:explore.logs
```

Always include `surface` even though `experiment` is unique. If an experiment is
ever run on two surfaces, queries written without it silently merge them.

## Core Queries

| Name                | Query                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| A — Impressions     | `sum(product.experiment.exposure)` filtered `rendered:true`               |
| B — CTA clicks      | `sum(product.experiment.action)` filtered `experiment.action:cta-clicked` |
| C — Dismissals      | `sum(product.experiment.action)` filtered `experiment.action:dismissed`   |
| D — Total exposures | `sum(product.experiment.exposure)` (no `rendered` filter)                 |
| CTR                 | `B / A`                                                                   |
| Dismissal rate      | `C / A`                                                                   |

Group by `variant` to split `control` from `active`.

## Querying Them For Real

Verified against live data. Two things will silently give you wrong answers:

**Boolean attributes are not queryable by their plain name.** `rendered` is keyed
`tags[experiment.rendered,boolean]`. Filtering on `rendered:true` matches nothing and returns
**0 rather than an error**, which looks exactly like "no data":

```
metric.name:product.experiment.exposure experiment.id:logs-cta tags[experiment.rendered,boolean]:true
```

Confirm the key first — string attributes use their bare name, booleans do not:

```bash
curl -s -G -H "Authorization: Bearer $TOKEN" \
  ".../organizations/<org>/trace-items/attributes/" \
  --data-urlencode "itemType=tracemetrics" --data-urlencode "project=<id>"
```

**The dataset is `tracemetrics`, and the aggregate needs an argument** —
`count(value)`, not `count()`:

```bash
curl -s -G -H "Authorization: Bearer $TOKEN" \
  ".../organizations/<org>/events/" \
  --data-urlencode "dataset=tracemetrics" \
  --data-urlencode "field=count(value)" \
  --data-urlencode "query=metric.name:product.experiment.exposure experiment.id:logs-cta tags[experiment.rendered,boolean]:true" \
  --data-urlencode "statsPeriod=2h" --data-urlencode "project=<id>"
```

Before trusting a zero, cross-check that the data arrived at all with the org's
outcome stats — `stats_v2` grouped by `outcome` and `category` will show
`trace_metric accepted N`. If N is non-zero and your query returns 0, the query
is wrong, not the pipeline.

Use **A**, not **D**, as the denominator for CTR and dismissal rate. `D` includes
control users and dismissed-state active-arm users, who had no opportunity to
click — including them understates engagement.

Use **D** grouped by `variant` when comparing arms, because it is the only series
where `control` and `active` are measured on the same basis.

For a standing view of these figures rather than one-off queries, use the
dashboard template in `references/dashboards.md` — it wires A, B, C, and D up as
widgets and documents the API rules that reject or silently zero them.

## Guardrails

Run these alongside the core queries. An experiment that raises CTR while
degrading the page is not a win.

- Errors on the surface — filter issues to the affected route
- Page and interaction latency — pageload and `ui.action` spans for the route
- Unexpected navigation failures following CTA clicks

Session Replay on the affected route is the fastest way to see what a regression
actually looked like.

## Sanity Checks Before Believing A Number

1. **Are there `experiment.variant:control` rows carrying `rendered:true`?** There must not
   be. That combination means the element rendered off a raw feature flag while no
   Flagpole assignment existed — see the render/variant split in `metrics.md`.
   Those rows are unusable. Discard the window; do not reinterpret it.
2. **Is `A` for control zero?** It should be. Control renders nothing. A nonzero
   value is the same failure as (1).
3. **Is `B` nonzero while `A` is zero?** Clicks without impressions means exposure
   is not firing — a framework bug, not a result.
4. **Do the arms have plausible relative sizes?** Compare `D` grouped by `variant`
   against the intended split. Two caveats before reading anything into it:
   - Rollout is inclusive, so `rollout: 50` is 51/49 at the org level
     (`src/flagpole/conditions.py:364`).
   - This counts pageviews, not orgs. It is an eyeball check, not an SRM test —
     there is no chi-squared here. Neither a mismatch nor a match proves anything.
5. **Does `D` track the platform's `experiment.exposure` count?** Query
   `analytics.events_denormalized` for the same flag. The two will differ by
   construction — different trigger conditions and different dedup scope, see
   `platform.md`. What matters is that the _ratio_ stays stable. A sudden
   divergence means one pipeline broke.
6. **Did the experiment run over full weeks?** Weekday and weekend traffic differ
   substantially. Partial weeks bias any comparison.

## What These Numbers Support

They support: "the element was shown N times and clicked M times." That is a
description of element engagement, and it is genuinely useful for deciding
whether copy and placement work.

They do **not** support: "the active arm caused users to adopt logs," or "the
active arm beat control." Four things are missing, all structural rather than a
matter of collecting more data:

- **No outcome metric.** Nothing downstream of the click is measured in both arms.
  Until `control/active → logs setup started → logs sent successfully` is
  instrumented for control as well as the active arm, there is no lift to compute.
- **No statistics.** No significance test, confidence interval, or power
  calculation. A difference between arms may be noise, and nothing here can tell
  you which.
- **Clustered observations.** Assignment is org-level; counting is
  per-user-per-pageview. Observations within an org are correlated, so the
  denominators are not independent samples and any naive test badly understates
  variance. The SDK attaches `user.id` and `organization` to every metric, so
  grouping by `organization` to get one observation per org is possible and is a
  better basis for comparing arms than raw counts. It does not make the counts
  independent — it just stops one busy org dominating the total.
- **Possible cross-experiment confounding.** Flagpole's rollout hash omits the
  feature name, so another experiment running at the same rollout with the same
  conditions has the _same_ orgs in treatment. Check what else is live before
  attributing anything.

State these limits explicitly whenever results are presented.

The recommended long-term direction is to consolidate assignment and feed one
canonical exposure model into BigQuery, rather than build statistics here. See
`platform.md`.
