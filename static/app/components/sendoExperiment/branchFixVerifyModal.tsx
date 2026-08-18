import {Fragment} from 'react';

import {Button, LinkButton} from '@sentry/scraps/button';
import {Flex} from '@sentry/scraps/layout';
import {Heading, Text} from '@sentry/scraps/text';

import type {ModalRenderProps} from 'sentry/actionCreators/modal';
import {t} from 'sentry/locale';
import {trackAnalytics} from 'sentry/utils/analytics';
import {useOrganization} from 'sentry/utils/useOrganization';

export const BRANCH_FIX_VERIFY_EXPERIMENT_NAME = 'branch-fix-verify';

interface BranchFixVerifyModalProps extends ModalRenderProps {}

export function BranchFixVerifyModal({closeModal}: BranchFixVerifyModalProps) {
  const organization = useOrganization();

  return (
    <Fragment>
      <Heading as="h3">{t('Need help with logs?')}</Heading>
      <Text>{t('Book a free call with an engineer.')}</Text>
      <Flex justify="end" gap="md" marginTop="2xl">
        <Button onClick={closeModal}>{t('Close')}</Button>
        <LinkButton
          href="https://sentry.io/contact/"
          variant="primary"
          external
          onClick={() => {
            trackAnalytics('ui.experiment.cta_action', {
              organization,
              experiment_name: BRANCH_FIX_VERIFY_EXPERIMENT_NAME,
              cta_label: 'Get 1:1 Help',
            });
          }}
        >
          {t('Get 1:1 Help')}
        </LinkButton>
      </Flex>
    </Fragment>
  );
}
