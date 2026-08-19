import * as Sentry from '@sentry/react';

import {
  experimentDefinition,
  type ExperimentId,
} from 'sentry/utils/experiments/experiments';
import type {Action, Variant} from 'sentry/utils/experiments/types';

/**
 * The only place experiment metrics are emitted.
 *
 * Every attribute is derived from the registry entry, so an experiment cannot
 * ship a typo'd attribute, a missing exposure, or an inconsistent metric name.
 * Hand-written `Sentry.metrics.count` calls for an experiment are a bug.
 *
 * Attribute values are bounded string unions. Never add copy, URLs, org slugs,
 * user emails, timestamps, or session ids — see
 * `.agents/skills/sendo/references/metrics.md`.
 */

interface ExposureParams {
  experiment: ExperimentId;
  /**
   * Whether the element was actually shown. `false` for control, and for
   * active-arm users who previously dismissed it. This is what lets one metric
   * serve as both the arm-comparison denominator and the CTR denominator.
   */
  rendered: boolean;
  variant: Variant;
}

interface ActionParams {
  action: Action;
  experiment: ExperimentId;
  variant: Variant;
}

/**
 * Emitted once per mount for every enrolled user, in both arms.
 *
 * This is a *render* record. It is deliberately distinct from the platform's
 * `experiment.exposure` analytics event, which is an *encounter* record with
 * different dedup and different trigger conditions. The two will not agree; see
 * `.agents/skills/sendo/references/platform.md`.
 */
export function recordExposure({experiment, rendered, variant}: ExposureParams) {
  const definition = experimentDefinition(experiment);

  Sentry.metrics.count('product.experiment.exposure', 1, {
    attributes: {
      'experiment.element': definition.element,
      'experiment.id': experiment,
      'experiment.rendered': rendered,
      'experiment.surface': definition.surface,
      'experiment.variant': variant,
    },
  });
}

/**
 * Emitted on each interaction. Not deduplicated — two clicks produce two events.
 */
export function recordAction({action, experiment, variant}: ActionParams) {
  const definition = experimentDefinition(experiment);

  Sentry.metrics.count('product.experiment.action', 1, {
    attributes: {
      'experiment.action': action,
      'experiment.element': definition.element,
      'experiment.id': experiment,
      'experiment.surface': definition.surface,
      'experiment.variant': variant,
    },
  });
}
