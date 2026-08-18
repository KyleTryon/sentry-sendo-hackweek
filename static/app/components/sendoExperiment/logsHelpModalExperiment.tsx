import {useEffect, useRef} from 'react';

import {openModal} from 'sentry/actionCreators/modal';
import {
  LOGS_HELP_MODAL_EXPERIMENT_NAME,
  LogsHelpModal,
} from 'sentry/components/sendoExperiment/logsHelpModal';
import {trackAnalytics} from 'sentry/utils/analytics';
import {useExperiment} from 'sentry/utils/useExperiment';
import {useOrganization} from 'sentry/utils/useOrganization';

const EXPERIMENT_FEATURE = 'sendo-logs-help-modal-q3';

export function LogsHelpModalExperiment() {
  const organization = useOrganization();
  const hasOpenedRef = useRef(false);
  const {inExperiment} = useExperiment({
    feature: EXPERIMENT_FEATURE,
    reportExposure: true,
  });

  useEffect(() => {
    if (!inExperiment || hasOpenedRef.current) {
      return;
    }

    hasOpenedRef.current = true;
    trackAnalytics('ui.experiment.views', {
      organization,
      experiment_name: LOGS_HELP_MODAL_EXPERIMENT_NAME,
    });

    openModal(
      ({closeModal, ...modalProps}) => (
        <LogsHelpModal
          {...modalProps}
          closeModal={() => {
            trackAnalytics('ui.experiment.close', {
              organization,
              experiment_name: LOGS_HELP_MODAL_EXPERIMENT_NAME,
            });
            closeModal();
          }}
        />
      ),
      {closeEvents: 'escape-key'}
    );
  }, [inExperiment, organization]);

  return null;
}
