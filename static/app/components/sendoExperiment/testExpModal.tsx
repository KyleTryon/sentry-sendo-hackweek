import {Fragment} from 'react';

import {Button, LinkButton} from '@sentry/scraps/button';
import {Stack} from '@sentry/scraps/layout';
import {Heading, Text} from '@sentry/scraps/text';

import type {ModalRenderProps} from 'sentry/actionCreators/modal';
import {t} from 'sentry/locale';
import type {Organization} from 'sentry/types/organization';
import {trackAnalytics} from 'sentry/utils/analytics';

type Props = ModalRenderProps & {
  experiment: string;
  onDismiss: () => void;
  organization: Organization;
};

export function TestExpModal({
  Body,
  Footer,
  Header,
  closeModal,
  experiment,
  onDismiss,
  organization,
}: Props) {
  return (
    <Fragment>
      <Header closeButton>
        <Heading as="h4">{t('Seer agent now available')}</Heading>
      </Header>
      <Body>
        <Stack gap="lg">
          <Text>{t('Ask questions in slack')}</Text>
        </Stack>
      </Body>
      <Footer>
        <Button onClick={closeModal}>{t('Close')}</Button>
        <LinkButton
          href="https://docs.sentry.io"
          external
          priority="primary"
          onClick={() => {
            trackAnalytics('ui.experiment.cta_action', {
              organization,
              experiment,
              action: 'primary_cta',
            });
            onDismiss();
          }}
        >
          {t('Get Help')}
        </LinkButton>
      </Footer>
    </Fragment>
  );
}
