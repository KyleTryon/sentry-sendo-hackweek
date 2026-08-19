#!/usr/bin/env bash
# Pull A/B/C/D and CTR for one experiment from Sentry.
#
#   SENTRY_TOKEN=... ./experiment_results.sh <org> <project-id> <experiment> [period]
#
# Read references/analysis.md before believing any of it. In particular: control's
# A must be zero, and any row with experiment.variant:control alongside
# tags[experiment.rendered,boolean]:true makes the window unusable.
set -euo pipefail

if [ $# -lt 3 ]; then
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

: "${SENTRY_TOKEN:?set SENTRY_TOKEN to a token with org:read}"
ORG=$1; PROJECT=$2; EXPERIMENT=$3; PERIOD=${4:-7d}
HOST=${SENTRY_HOST:-https://us.sentry.io}

EXPOSURE='sum(value,product.experiment.exposure,counter,none)'
ACTION='sum(value,product.experiment.action,counter,none)'

count() {
  curl -sf -G -H "Authorization: Bearer $SENTRY_TOKEN" \
    "$HOST/api/0/organizations/$ORG/events/" \
    --data-urlencode "dataset=tracemetrics" \
    --data-urlencode "field=count(value)" \
    --data-urlencode "query=$1" \
    --data-urlencode "statsPeriod=$PERIOD" \
    --data-urlencode "project=$PROJECT" \
  | python3 -c 'import sys,json;r=json.load(sys.stdin).get("data",[]);print(int(r[0]["count(value)"]) if r else 0)'
}

BASE="experiment.id:$EXPERIMENT"
RENDERED='tags[experiment.rendered,boolean]:true'

A=$(count "metric.name:product.experiment.exposure $BASE $RENDERED")
B=$(count "metric.name:product.experiment.action $BASE experiment.action:cta-clicked")
C=$(count "metric.name:product.experiment.action $BASE experiment.action:dismissed")
D=$(count "metric.name:product.experiment.exposure $BASE")
CONTROL_RENDERED=$(count "metric.name:product.experiment.exposure $BASE experiment.variant:control $RENDERED")

printf '%s over %s\n\n' "$EXPERIMENT" "$PERIOD"
printf '  A  impressions (rendered)   %s\n' "$A"
printf '  B  cta-clicked              %s\n' "$B"
printf '  C  dismissed                %s\n' "$C"
printf '  D  total exposures          %s\n\n' "$D"

if [ "$A" -eq 0 ]; then
  echo "  no impressions yet — CTR undefined"
else
  python3 -c "print(f'  CTR             {100*$B/$A:.1f}%'); print(f'  dismissal rate  {100*$C/$A:.1f}%')"
fi

if [ "$CONTROL_RENDERED" -ne 0 ]; then
  printf '\n  UNUSABLE: %s control-arm exposures report rendered:true.\n' "$CONTROL_RENDERED"
  printf '  The element drew for organizations that should not have seen it.\n'
  exit 1
fi
