import styled from '@emotion/styled';

import {Button, LinkButton} from '@sentry/scraps/button';
import {Flex, Stack} from '@sentry/scraps/layout';
import {Heading, Text} from '@sentry/scraps/text';

import {IconClose} from 'sentry/icons';
import {t} from 'sentry/locale';
import type {ExperimentElementProps} from 'sentry/utils/experiments/types';

/**
 * A dismissible floating card.
 *
 * Fixed positioning keeps it out of document flow, so mounting it cannot shift
 * the host page's layout. It reports interactions through the props it is given
 * and does nothing else — no metrics, no assignment reads.
 */
export function FloatingCtaWindow({
  content,
  onCtaClick,
  onDismiss,
}: ExperimentElementProps) {
  return (
    <Window role="complementary" aria-label={content.heading}>
      <Stack gap="md">
        <Flex justify="between" gap="md" align="start">
          <Heading as="h3">{content.heading}</Heading>
          <Button
            aria-label={t('Dismiss')}
            icon={<IconClose />}
            onClick={onDismiss}
            size="xs"
            variant="transparent"
          />
        </Flex>
        <Text size="sm" variant="muted">
          {content.body}
        </Text>
        <Flex justify="end">
          <LinkButton
            onClick={onCtaClick}
            size="sm"
            to={content.ctaTarget}
            variant="primary"
          >
            {content.ctaLabel}
          </LinkButton>
        </Flex>
      </Stack>
    </Window>
  );
}

const Window = styled('aside')`
  position: fixed;
  right: ${p => p.theme.space.xl};
  bottom: ${p => p.theme.space.xl};
  z-index: ${p => p.theme.zIndex.toast};
  max-width: 340px;
  padding: ${p => p.theme.space.xl};
  background: ${p => p.theme.tokens.background.primary};
  border: 1px solid ${p => p.theme.tokens.border.primary};
  border-radius: ${p => p.theme.radius.md};
  box-shadow: ${p => p.theme.shadow.high};
`;
