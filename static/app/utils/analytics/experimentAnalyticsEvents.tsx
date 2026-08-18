import type {Organization} from 'sentry/types/organization';

export type ExperimentAnalyticsEventParameters = {
  'ui.experiment.close': {
    experiment_name: string;
    organization: Organization;
  };
  'ui.experiment.cta_action': {
    cta_label: string;
    experiment_name: string;
    organization: Organization;
  };
  'ui.experiment.views': {
    experiment_name: string;
    organization: Organization;
  };
};

type ExperimentAnalyticsEventKey = keyof ExperimentAnalyticsEventParameters;

export const experimentAnalyticsEventMap: Record<
  ExperimentAnalyticsEventKey,
  string | null
> = {
  'ui.experiment.views': 'UI Experiment Viewed',
  'ui.experiment.cta_action': 'UI Experiment CTA Action',
  'ui.experiment.close': 'UI Experiment Closed',
};
