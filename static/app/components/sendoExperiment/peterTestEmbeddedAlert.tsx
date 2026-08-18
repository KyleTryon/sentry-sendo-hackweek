import {useEffect} from 'react';
import styled from '@emotion/styled';

import {Alert} from '@sentry/scraps/alert';
import {Button} from '@sentry/scraps/button';
import {Stack} from '@sentry/scraps/layout';
import {ExternalLink} from '@sentry/scraps/link';

import {IconClose} from 'sentry/icons';
import {t} from 'sentry/locale';
import type {Organization} from 'sentry/types/organization';
import {trackAnalytics} from 'sentry/utils/analytics';
import {useDismissAlert} from 'sentry/utils/useDismissAlert';
import {useExperiment} from 'sentry/utils/useExperiment';

const EXPERIMENT_NAME = 'peter-test';
const FEATURE_FLAG = 'sendo-peter-test';

interface PeterTestEmbeddedAlertProps {
  organization: Organization;
}

export function PeterTestEmbeddedAlert({organization}: PeterTestEmbeddedAlertProps) {
  const {inExperiment} = useExperiment({
    feature: FEATURE_FLAG,
    reportExposure: true,
  });

  const {dismiss, isDismissed} = useDismissAlert({
    key: `${organization.id}:sendo-peter-test-experiment`,
  });

  useEffect(() => {
    if (!inExperiment || isDismissed) {
      return;
    }

    trackAnalytics('ui.experiment.views', {
      organization,
      experiment: EXPERIMENT_NAME,
    });
  }, [inExperiment, isDismissed, organization]);

  if (!inExperiment || isDismissed) {
    return null;
  }

  const handleClose = () => {
    trackAnalytics('ui.experiment.close', {
      organization,
      experiment: EXPERIMENT_NAME,
    });
    dismiss();
  };

  const handleCtaClick = () => {
    trackAnalytics('ui.experiment.cta_action', {
      organization,
      experiment: EXPERIMENT_NAME,
    });
  };

  return (
    <Alert.Container>
      <Alert
        variant="info"
        trailingItems={
          <Button
            icon={<IconClose />}
            onClick={handleClose}
            size="zero"
            variant="transparent"
            aria-label={t('Dismiss alert')}
          />
        }
      >
        <Stack gap="xs">
          <AlertHeader>{t('Try Seer agent')}</AlertHeader>
          <div>{t('Talk with the Seer')}</div>
          <ExternalLink
            href="https://docs.sentry.io/product/logs/"
            onClick={handleCtaClick}
          >
            {t('Add to Slack')}
          </ExternalLink>
        </Stack>
      </Alert>
    </Alert.Container>
  );
}

const AlertHeader = styled('div')`
  font-weight: ${p => p.theme.font.weight.sans.medium};
  font-size: ${p => p.theme.font.size.lg};
`;
