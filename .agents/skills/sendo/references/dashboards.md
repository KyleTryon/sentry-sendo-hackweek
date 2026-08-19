# Dashboard Template

A ready-made dashboard for one experiment: the four figures from
`analysis.md` as big numbers, plus three breakdowns. Verified end to end against
a live experiment — every field below was corrected by an API rejection at least
once, so prefer adapting this over writing one from scratch.

There is no MCP tool for creating dashboards (they are read-only there), and the
UI's _Add to Dashboard_ flow is fine for one widget but tedious for seven. Use the
API.

## Create One For A New Experiment

Two substitutions, everywhere they appear:

| Placeholder    | Example        | Where it comes from |
| -------------- | -------------- | ------------------- |
| `<experiment>` | `logs-cta`     | Registry key        |
| `<surface>`    | `explore.logs` | Registry `surface`  |

Then POST it:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  "https://us.sentry.io/api/0/organizations/<org>/dashboards/" \
  --data-binary @dashboard.json
```

`org:read` is sufficient. You do **not** need `org:write`.

## Lead With A Description Widget

**Every experiment dashboard starts with a `text` widget.** Numbers without the
experiment's premise invite misreading, and the people who open a dashboard
months later are rarely the ones who built it. It should state what is being
tested, what each arm sees, and how organizations were segmented.

```json
{
  "title": "About this experiment · <experiment>",
  "description": "### What we're testing\n\n…markdown…",
  "displayType": "text",
  "widgetType": null,
  "interval": "5m",
  "queries": [],
  "layout": {"x": 0, "y": 0, "w": 6, "h": 4, "minH": 2}
}
```

- The markdown lives in **`description`**, not `title`. Tables, headings, code
  spans, and bold all render.
- `widgetType` is `null` and `queries` is `[]` — a text widget queries nothing.
- The grid is **6 columns wide**. `w: 6` spans it; `y: 0` pins it to the top.
  Widgets with no `layout` auto-flow and will collide with a pinned one, so once
  you pin the header, give every other widget an explicit layout too.

Cover four things, drawn from the registry entry and the Flagpole config:

| Section                | Content                                                     |
| ---------------------- | ----------------------------------------------------------- |
| What we're testing     | The hypothesis in a sentence, plus surface, element, status |
| Variants               | A row per arm and what the organization actually sees       |
| Segmentation           | Scope, flag name, rollout, and how bucketing works          |
| Reading this dashboard | Where CTR comes from, and what the numbers do not support   |

The segmentation section is the one people get wrong. State that assignment is
**org-scoped**, that bucketing is a **SHA1 of `organization_id`** rather than the
id itself, that the comparison is inclusive, and that the feature name is absent
from the hash so concurrent experiments at the same rollout share a population.
See the Segmentation and Bucketing sections of `platform.md`, and state the
segment conditions as well as the rollout — eligibility and arm split are
different things, and a reader cannot infer the first from the second.

Carry the caveats from `analysis.md` into the closing section verbatim. A
dashboard confers authority that the underlying data may not have earned.

## The Template

Conditions are `experiment.id:<experiment> experiment.surface:<surface>` plus a per-widget
filter. `<EXP>` and `<ACT>` below stand for the two aggregates:

```
<EXP> = sum(value,product.experiment.exposure,counter,none)
<ACT> = sum(value,product.experiment.action,counter,none)
```

Prepend the description widget from the section above as the first entry in
`widgets` — it is omitted here only to keep the template readable.

```json
{
  "title": "Sendo · <experiment>",
  "projects": [<project-id>],
  "widgets": [
    {
      "title": "A · Impressions (rendered)",
      "displayType": "big_number",
      "widgetType": "tracemetrics",
      "interval": "5m",
      "queries": [{
        "name": "", "fields": ["<EXP>"], "aggregates": ["<EXP>"], "columns": [],
        "conditions": "experiment.id:<experiment> experiment.surface:<surface> tags[experiment.rendered,boolean]:true",
        "orderby": ""
      }]
    },
    {
      "title": "B · CTA clicks",
      "displayType": "big_number", "widgetType": "tracemetrics", "interval": "5m",
      "queries": [{
        "name": "", "fields": ["<ACT>"], "aggregates": ["<ACT>"], "columns": [],
        "conditions": "experiment.id:<experiment> experiment.surface:<surface> experiment.action:cta-clicked",
        "orderby": ""
      }]
    },
    {
      "title": "C · Dismissals",
      "displayType": "big_number", "widgetType": "tracemetrics", "interval": "5m",
      "queries": [{
        "name": "", "fields": ["<ACT>"], "aggregates": ["<ACT>"], "columns": [],
        "conditions": "experiment.id:<experiment> experiment.surface:<surface> experiment.action:dismissed",
        "orderby": ""
      }]
    },
    {
      "title": "D · Total exposures (both arms)",
      "displayType": "big_number", "widgetType": "tracemetrics", "interval": "5m",
      "queries": [{
        "name": "", "fields": ["<EXP>"], "aggregates": ["<EXP>"], "columns": [],
        "conditions": "experiment.id:<experiment> experiment.surface:<surface>",
        "orderby": ""
      }]
    },
    {
      "title": "Exposures over time · by variant and rendered",
      "displayType": "bar", "widgetType": "tracemetrics", "interval": "1h", "limit": 10,
      "queries": [
        {"name": "Rendered", "fields": ["variant", "<EXP>"], "aggregates": ["<EXP>"],
         "columns": ["variant"],
         "conditions": "experiment.id:<experiment> experiment.surface:<surface> tags[experiment.rendered,boolean]:true",
         "orderby": "-<EXP>"},
        {"name": "Not rendered", "fields": ["variant", "<EXP>"], "aggregates": ["<EXP>"],
         "columns": ["variant"],
         "conditions": "experiment.id:<experiment> experiment.surface:<surface> tags[experiment.rendered,boolean]:false",
         "orderby": "-<EXP>"}
      ]
    },
    {
      "title": "Exposures · by variant and rendered",
      "displayType": "categorical_bar", "widgetType": "tracemetrics", "interval": "5m", "limit": 10,
      "queries": [{
        "name": "", "fields": ["variant", "tags[experiment.rendered,boolean]", "<EXP>"],
        "aggregates": ["<EXP>"], "columns": ["variant", "tags[experiment.rendered,boolean]"],
        "conditions": "experiment.id:<experiment> experiment.surface:<surface>",
        "orderby": "-<EXP>"
      }]
    },
    {
      "title": "Interactions · by type",
      "displayType": "categorical_bar", "widgetType": "tracemetrics", "interval": "5m", "limit": 10,
      "queries": [{
        "name": "", "fields": ["action", "<ACT>"], "aggregates": ["<ACT>"],
        "columns": ["action"],
        "conditions": "experiment.id:<experiment> experiment.surface:<surface>",
        "orderby": "-<ACT>"
      }]
    }
  ]
}
```

## CTR Has No Widget — Use A Grouped Bar

Sentry has no ratio widget for this dataset, so CTR cannot be a number on the
dashboard. The closest honest thing is a bar chart carrying both sides of the
ratio, grouped by variant, so the comparison is visual:

```json
{
  "title": "CTR basis · impressions and clicks by variant",
  "displayType": "bar",
  "widgetType": "tracemetrics",
  "interval": "5m",
  "limit": 10,
  "queries": [
    {
      "name": "Impressions",
      "fields": ["variant", "<EXP>"],
      "aggregates": ["<EXP>"],
      "columns": ["variant"],
      "conditions": "experiment.id:<experiment> experiment.surface:<surface> tags[experiment.rendered,boolean]:true",
      "orderby": "-<EXP>"
    },
    {
      "name": "CTA clicks",
      "fields": ["variant", "<ACT>"],
      "aggregates": ["<ACT>"],
      "columns": ["variant"],
      "conditions": "experiment.id:<experiment> experiment.surface:<surface> experiment.action:cta-clicked",
      "orderby": "-<ACT>"
    }
  ]
}
```

**A widget can hold several queries, and they may use different metrics.** That is
what makes this work: one series is drawn from `product.experiment.exposure` and
the other from `product.experiment.action`, side by side per variant. `name` on
each query becomes its series label.

The bar heights give you the ratio at a glance and let you compare arms without
arithmetic. For the actual number, divide B by A — `analysis.md` has the
arithmetic and the caveats, and neither the chart nor the division makes a
difference between arms significant.

## Cross-Tabs Need Two Queries, Not Two Columns

Grouping by a `tags[...]` attribute **together with** another column does not
work. The tag column is dropped and every row collapses into one — no error, and
the resulting chart looks like a legitimate single-category result:

```
group by variant                          -> active: 29         (correct)
group by tags[experiment.rendered,boolean]           -> true: 22, false: 7 (correct)
group by variant + tags[experiment.rendered,boolean] -> active: 29         (WRONG — collapsed)
```

Express the cross-tab as **one series per tag value** instead, each filtered
rather than grouped:

```json
"queries": [
  {"name": "Rendered", "fields": ["variant", "<EXP>"], "aggregates": ["<EXP>"],
   "columns": ["variant"],
   "conditions": "experiment.id:<experiment> experiment.surface:<surface> tags[experiment.rendered,boolean]:true",
   "orderby": "-<EXP>"},
  {"name": "Not rendered", "fields": ["variant", "<EXP>"], "aggregates": ["<EXP>"],
   "columns": ["variant"],
   "conditions": "experiment.id:<experiment> experiment.surface:<surface> tags[experiment.rendered,boolean]:false",
   "orderby": "-<EXP>"}
]
```

Filtering on `tags[...]` is fine; only grouping on it beside another column
breaks. Since booleans have exactly two values, one series each is no real cost.

**Verify the shape, not just the save.** A widget can POST successfully and
still return the wrong grouping — this one did, and only looked wrong on the
rendered chart. Run the group-by through the events API before trusting it.

## Variant And Rendered Are Different Dimensions

Easy to conflate, and the confusion produces charts that look wrong:

| Dimension             | Values              | Means                                        |
| --------------------- | ------------------- | -------------------------------------------- |
| `experiment.variant`  | `active`, `control` | Which arm Flagpole assigned the organization |
| `experiment.rendered` | `true`, `false`     | Whether the element actually drew            |

`not rendered` is **not** a variant and will never appear in a chart grouped by
`variant` alone. `rendered: false` covers control users _and_ active-arm users who
already dismissed — which is why a healthy experiment shows active/not-rendered
counts rising over time as dismissals accumulate.

Group by `variant` to compare arms. Split on `rendered` with two series to see
whether the element is actually being shown. Doing both at once needs the
two-series form above, not a two-column group-by.

At full rollout there is one variant, so a variant-grouped chart shows a single
series. That is correct. Under a real rollout expect four combinations, and
**control + rendered:true should always be zero** — a non-zero value there means
the element drew for someone who should not have seen it, and the window is
unusable. See `analysis.md`.

## Sparse Data Reads Better As Bars

Experiment metrics are low-volume by nature — a handful of exposures per
organization per session, not a continuous stream. At a 5-minute interval over a
day that is 289 buckets with data in perhaps 7 of them, and a `line` chart
renders as a flat line at zero with spikes too narrow to see. It looks broken
while being entirely correct.

Prefer `bar` over `line` for exposures and actions, and set a coarser `interval`
(`1h` rather than `5m`) so each bucket holds something. Reach for `line` only
once an experiment is producing steady traffic.

Before concluding a timeseries widget is broken, check whether it actually has
data — the widget can be right and still look empty:

```bash
curl -s -G -H "Authorization: Bearer $SENTRY_TOKEN" \
  ".../organizations/<org>/events-stats/" \
  --data-urlencode "dataset=tracemetrics" \
  --data-urlencode "yAxis=<EXP>" \
  --data-urlencode "field=variant" --data-urlencode "topEvents=10" \
  --data-urlencode "query=experiment.id:<experiment> experiment.surface:<surface>" \
  --data-urlencode "statsPeriod=24h" --data-urlencode "interval=1h"
```

One series per arm that has data. A rollout of 0 or 100 yields exactly one, which
is correct rather than a fault.

## Rules The API Enforces

Each of these was a real rejection, and two of them fail in ways that do not say
what is wrong.

| Rule                                                                                                                                  | Symptom if broken                                           |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `widgetType` is `tracemetrics`                                                                                                        | Wrong dataset, empty widget                                 |
| Aggregates take four parts: `sum(value,<name>,<type>,<unit>)` — counters are `counter,none`                                           | Validation error                                            |
| `table` is **not** a valid `displayType` for tracemetrics. Allowed: `area`, `bar`, `big_number`, `categorical_bar`, `heatmap`, `line` | Explicit, readable error                                    |
| Any widget with `columns` (a group-by) needs `limit`, max 10                                                                          | `limit is required`                                         |
| Booleans are keyed `tags[experiment.rendered,boolean]`, not `rendered`                                                                | **Silently returns 0**                                      |
| Grouping on `tags[...]` **alongside another column** drops the tag column                                                             | **Silently collapses to one row**                           |
| Every project id in `projects` must belong to a team you are on                                                                       | **403 `You do not have permission to perform this action`** |
| Pinning one widget's `layout` means pinning them all; the grid is 6 columns wide                                                      | Auto-flowed widgets overlap the pinned one                  |

That last one is the expensive one. It reads as a scopes problem and is not —
no token scope will fix it. Either add your team to the project, or omit
`projects` entirely: the widget conditions already isolate one experiment, so an
all-projects dashboard returns identical numbers.

To confirm access before blaming scopes:

```bash
curl -s -H "Authorization: Bearer $SENTRY_TOKEN" \
  "https://us.sentry.io/api/0/projects/<org>/<project>/teams/"
```

Cross-reference against the teams where you are `isMember` in
`/organizations/<org>/teams/`.

## Before Reading Anything Off It

The variant-grouped widgets show one series per arm that has data. A rollout of
0 or 100 produces a single series — correct, but not a comparison. Every caveat
in `analysis.md` applies to these widgets exactly as it does to the raw queries,
and a dashboard makes numbers look more authoritative than they are.
