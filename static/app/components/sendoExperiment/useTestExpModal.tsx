import {useEffect, useRef, useState} from 'react';

import {openModal} from 'sentry/actionCreators/modal';
import {TestExpModal} from 'sentry/components/sendoExperiment/testExpModal';
import {trackAnalytics} from 'sentry/utils/analytics';
import {useDismissAlert} from 'sentry/utils/useDismissAlert';
import {useExperiment} from 'sentry/utils/useExperiment';
import {useOrganization} from 'sentry/utils/useOrganization';

export const SENDO_TEST_EXP_FEATURE = 'sendo-test-exp';
export const SENDO_TEST_EXP_NAME = 'test-exp';

function getCloseSource(reason?: string): 'backdrop' | 'button' | 'escape' {
  if (reason === 'backdrop-click') {
    return 'backdrop';
  }
  if (reason === 'escape-key') {
    return 'escape';
  }
  return 'button';
}

export function useTestExpModal() {
  const organization = useOrganization();
  const hasOpened = useRef(false);
  const [reportExposure, setReportExposure] = useState(false);
  const {isDismissed, dismiss} = useDismissAlert({
    key: `${organization.id}:sendo-test-exp-modal`,
  });
  const {inExperiment} = useExperiment({
    feature: SENDO_TEST_EXP_FEATURE,
    reportExposure,
  });

  useEffect(() => {
    if (!inExperiment || isDismissed || hasOpened.current) {
      return;
    }

    hasOpened.current = true;
    setReportExposure(true);
    trackAnalytics('ui.experiment.views', {
      organization,
      experiment: SENDO_TEST_EXP_NAME,
    });

    openModal(
      deps => (
        <TestExpModal
          {...deps}
          experiment={SENDO_TEST_EXP_NAME}
          organization={organization}
          onDismiss={dismiss}
        />
      ),
      {
        onClose: reason => {
          trackAnalytics('ui.experiment.close', {
            organization,
            experiment: SENDO_TEST_EXP_NAME,
            source: getCloseSource(reason),
          });
          dismiss();
        },
      }
    );
  }, [dismiss, inExperiment, isDismissed, organization]);
}
