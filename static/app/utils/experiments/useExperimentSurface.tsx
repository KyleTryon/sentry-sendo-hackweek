import {useCallback, useEffect, useRef} from 'react';
import * as Sentry from '@sentry/react';

import {recordAction, recordExposure} from 'sentry/utils/experiments/experimentMetrics';
import {
  experimentArmAttribute,
  experimentDefinition,
  experimentDismissalKey,
  experimentFeature,
  type ExperimentId,
} from 'sentry/utils/experiments/experiments';
import type {ExperimentDefinition} from 'sentry/utils/experiments/types';
import {useDismissAlert} from 'sentry/utils/useDismissAlert';
import {useExperiment} from 'sentry/utils/useExperiment';
import {useOrganization} from 'sentry/utils/useOrganization';

interface UseExperimentSurfaceResult {
  content: ReturnType<ExperimentDefinition['content']>;
  element: ExperimentDefinition['element'];
  onCtaClick: () => void;
  onDismiss: () => void;
  /**
   * Whether the element should be shown. False for unenrolled users, control
   * users, dismissed elements, and concluded experiments.
   */
  shouldRender: boolean;
}

/**
 * Resolves one experiment: assignment, exposure, interactions, and dismissal.
 *
 * Assignment is read through the platform's `useExperiment`, never recomputed.
 * That hook also reports exposure into the analytics pipeline; the metrics this
 * emits are a separate render record. See
 * `.agents/skills/sendo/references/platform.md`.
 */
export function useExperimentSurface(
  experiment: ExperimentId
): UseExperimentSurfaceResult {
  const organization = useOrganization();
  const definition = experimentDefinition(experiment);
  const feature = experimentFeature(experiment);
  const isConcluded = definition.status !== 'active';

  const {inExperiment, experimentAssignment, isEnrolled} = useExperiment({
    feature,
    reportExposure: !isConcluded,
  });

  const {dismiss, isDismissed} = useDismissAlert({
    key: experimentDismissalKey(experiment, organization.id),
  });

  const variant = experimentAssignment === 'active' ? 'active' : 'control';

  // Render gating follows the platform, which gates on organization.features
  // rather than on the assignment. See the SKILL for why the two can disagree.
  const shouldRender = !isConcluded && inExperiment && !isDismissed;

  // Exposure fires once per mount. The ref guard lives inside the effect so it
  // survives React StrictMode's double invoke, and is never touched during
  // render.
  const reportedExposureRef = useRef<string | null>(null);
  const exposureKey = `${organization.id}:${variant}`;

  useEffect(() => {
    if (isConcluded || !isEnrolled) {
      return;
    }
    if (reportedExposureRef.current === exposureKey) {
      return;
    }
    reportedExposureRef.current = exposureKey;
    recordExposure({experiment, variant, rendered: shouldRender});
    // `shouldRender` is intentionally omitted: exposure records the state at
    // first mount, and dismissing later must not emit a second event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiment, exposureKey, isConcluded, isEnrolled, variant]);

  // Put the arm on the SDK scope so spans, logs, and metrics from enrolled users
  // carry it. Guardrail analysis compares latency between arms, and without this
  // the experiment attributes exist only on Sendo's own metrics.
  //
  // Keyed per experiment rather than a bare `variant` so concurrent experiments
  // do not overwrite each other. Attributes do not reach error events — that
  // would need setTag as well, which this deliberately does not do.
  useEffect(() => {
    if (isConcluded || !isEnrolled) {
      return;
    }
    Sentry.getCurrentScope().setAttribute(experimentArmAttribute(experiment), variant);
  }, [experiment, isConcluded, isEnrolled, variant]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }
    if (inExperiment && experimentAssignment !== 'active') {
      // eslint-disable-next-line no-console
      console.warn(
        `[sendo] "${experiment}" rendered from organization.features with no ` +
          `Flagpole assignment, so its metrics report variant "control" for a ` +
          `treatment element. Data collected in this state is unusable. Run ` +
          `with SENDO_LOCAL_FLAGPOLE=1 — see .agents/skills/sendo/references/local-setup.md.`
      );
    }
  }, [experiment, experimentAssignment, inExperiment]);

  const onCtaClick = useCallback(() => {
    recordAction({experiment, variant, action: 'cta-clicked'});
  }, [experiment, variant]);

  const onDismiss = useCallback(() => {
    recordAction({experiment, variant, action: 'dismissed'});
    dismiss();
  }, [dismiss, experiment, variant]);

  return {
    content: definition.content(),
    element: definition.element,
    onCtaClick,
    onDismiss,
    shouldRender,
  };
}
