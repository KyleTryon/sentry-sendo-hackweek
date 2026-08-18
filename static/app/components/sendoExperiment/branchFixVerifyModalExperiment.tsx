import {useEffect, useRef} from 'react';

import {openModal} from 'sentry/actionCreators/modal';
import {
  BRANCH_FIX_VERIFY_EXPERIMENT_NAME,
  BranchFixVerifyModal,
} from 'sentry/components/sendoExperiment/branchFixVerifyModal';
import {trackAnalytics} from 'sentry/utils/analytics';
import {useExperiment} from 'sentry/utils/useExperiment';
import {useOrganization} from 'sentry/utils/useOrganization';

const EXPERIMENT_FEATURE = 'sendo-branch-fix-verify';

export function BranchFixVerifyModalExperiment() {
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
      experiment_name: BRANCH_FIX_VERIFY_EXPERIMENT_NAME,
    });

    openModal(
      ({closeModal, ...modalProps}) => (
        <BranchFixVerifyModal
          {...modalProps}
          closeModal={() => {
            trackAnalytics('ui.experiment.close', {
              organization,
              experiment_name: BRANCH_FIX_VERIFY_EXPERIMENT_NAME,
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
