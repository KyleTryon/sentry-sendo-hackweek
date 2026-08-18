import type {Organization} from 'sentry/types/organization';

export type ExperimentAnalyticsEventParameters = {
  'ui.experiment.views': {
    experiment: string;
    organization: Organization;
  };
  'ui.experiment.cta_action': {
    action: string;
    experiment: string;
    organization: Organization;
  };
  'ui.experiment.close': {
    experiment: string;
    organization: Organization;
    source: 'backdrop' | 'button' | 'escape';
  };
};

type ExperimentAnalyticsEventKey = keyof ExperimentAnalyticsEventParameters;

export const experimentAnalyticsEventMap: Record<
  ExperimentAnalyticsEventKey,
  string | null
> = {
  'ui.experiment.views': 'UI Experiment Views',
  'ui.experiment.cta_action': 'UI Experiment CTA Action',
  'ui.experiment.close': 'UI Experiment Close',
};
