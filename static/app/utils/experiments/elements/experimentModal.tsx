import {Fragment, useEffect} from 'react';
import {css} from '@emotion/react';

import {LinkButton} from '@sentry/scraps/button';
import {Flex, Stack} from '@sentry/scraps/layout';
import {Heading, Text} from '@sentry/scraps/text';

import {closeModal, openModal, type ModalRenderProps} from 'sentry/actionCreators/modal';
import {IconSupport} from 'sentry/icons';
import type {ExperimentElementProps} from 'sentry/utils/experiments/types';

const bottomRightModalCss = css`
  position: fixed;
  right: 0;
  bottom: 0;
  margin: 0;
  width: 100%;
  max-width: 380px;
  padding: ${p => p.theme.space.xl};

  [role='document'] {
    padding: ${p => p.theme.space.xl};
  }
`;

function ExperimentModalContent({
  Body,
  Footer,
  Header,
  content,
  onCtaClick,
}: Omit<ExperimentElementProps, 'onDismiss'> & ModalRenderProps) {
  const isExternal = content.ctaTarget.startsWith('http');

  return (
    <Fragment>
      <Header closeButton>
        <Stack gap="xs">
          {content.badgeText ? (
            <Text size="sm" variant="promotion">
              {content.badgeText}
            </Text>
          ) : null}
          <Heading as="h4">{content.heading}</Heading>
        </Stack>
      </Header>
      <Body>
        <Text>{content.body}</Text>
      </Body>
      <Footer>
        <Flex gap="md" justify="end">
          <LinkButton
            external={isExternal}
            href={isExternal ? content.ctaTarget : undefined}
            icon={<IconSupport />}
            onClick={onCtaClick}
            size="sm"
            to={isExternal ? undefined : content.ctaTarget}
            variant="primary"
          >
            {content.ctaLabel}
          </LinkButton>
        </Flex>
      </Footer>
    </Fragment>
  );
}

/**
 * Opens a modal through the global modal system.
 *
 * The catalog element renders nothing itself — the modal is portaled by
 * `openModal`. It reports interactions through the props it is given and does
 * nothing else — no metrics, no assignment reads.
 */
export function ExperimentModal({
  content,
  onCtaClick,
  onDismiss,
}: ExperimentElementProps) {
  useEffect(() => {
    const isBottomRight = content.modalPlacement === 'bottom_right';
    const closedRef = {current: false};

    openModal(
      renderProps => (
        <ExperimentModalContent
          {...renderProps}
          content={content}
          onCtaClick={() => {
            closedRef.current = true;
            onCtaClick();
            renderProps.closeModal();
          }}
        />
      ),
      {
        backdrop: isBottomRight ? false : true,
        closeEvents: 'all',
        modalCss: isBottomRight ? bottomRightModalCss : undefined,
        onClose: () => {
          if (closedRef.current) {
            return;
          }
          closedRef.current = true;
          onDismiss();
        },
      }
    );

    return () => closeModal();
  }, [content, onCtaClick, onDismiss]);

  return null;
}
