export type ExperimentEventParameters = {
  'ui.experiment.views': {
    experiment: string;
  };
  'ui.experiment.cta_action': {
    experiment: string;
  };
  'ui.experiment.close': {
    experiment: string;
  };
};

type ExperimentAnalyticsKey = keyof ExperimentEventParameters;

export const experimentEventMap: Record<ExperimentAnalyticsKey, string | null> = {
  'ui.experiment.views': 'UI Experiment Views',
  'ui.experiment.cta_action': 'UI Experiment CTA Action',
  'ui.experiment.close': 'UI Experiment Close',
};
