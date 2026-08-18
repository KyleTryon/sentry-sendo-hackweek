import {useEffect} from 'react';

import {useAnalyticsArea} from 'sentry/components/analyticsArea';
import {FloatingCtaWindow} from 'sentry/utils/experiments/elements/floatingCtaWindow';
import {
  activeExperimentForSurface,
  type ExperimentId,
} from 'sentry/utils/experiments/experiments';
import type {
  ElementName,
  ExperimentElementProps,
  Surface,
} from 'sentry/utils/experiments/types';
import {useExperimentSurface} from 'sentry/utils/experiments/useExperimentSurface';

const ELEMENTS: Record<ElementName, React.ComponentType<ExperimentElementProps>> = {
  'floating-cta': FloatingCtaWindow,
};

interface Props {
  surface: Surface;
}

/**
 * Renders whichever active experiment the registry assigns to this surface.
 *
 * Safe to mount unconditionally: it renders nothing for unenrolled users,
 * control users, dismissed elements, and concluded experiments.
 */
export function ExperimentSurface({surface}: Props) {
  const experiment = activeExperimentForSurface(surface);

  if (!experiment) {
    return null;
  }

  return <ActiveExperiment experiment={experiment} surface={surface} />;
}

/**
 * Split out so the hooks below run only once an experiment is known.
 */
function ActiveExperiment({
  experiment,
  surface,
}: {
  experiment: ExperimentId;
  surface: Surface;
}) {
  const area = useAnalyticsArea();
  const {content, element, onCtaClick, onDismiss, shouldRender} =
    useExperimentSurface(experiment);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !area || area.startsWith(surface)) {
      return;
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[sendo] surface "${surface}" is mounted inside AnalyticsArea "${area}". ` +
        `Surface names should match the area a page publishes so the attribute ` +
        `stays joinable with ordinary analytics.`
    );
  }, [area, surface]);

  if (!shouldRender) {
    return null;
  }

  const ElementComponent = ELEMENTS[element];

  return (
    <ElementComponent content={content} onCtaClick={onCtaClick} onDismiss={onDismiss} />
  );
}
