import {Alert} from '@sentry/scraps/alert';
import {Button, LinkButton} from '@sentry/scraps/button';
import {Flex, Stack} from '@sentry/scraps/layout';
import {Heading, Text} from '@sentry/scraps/text';

import {IconClose, IconSupport} from 'sentry/icons';
import {t} from 'sentry/locale';
import type {ExperimentElementProps} from 'sentry/utils/experiments/types';

/**
 * An inline banner that participates in page layout.
 *
 * Reports interactions through the props it is given and does nothing else — no
 * metrics, no assignment reads.
 */
export function PageBanner({content, onCtaClick, onDismiss}: ExperimentElementProps) {
  const isExternal = content.ctaTarget.startsWith('http');

  return (
    <Alert
      variant={content.alertVariant ?? 'info'}
      system={content.alertSystem ?? false}
      trailingItems={
        <Flex gap="md" align="center">
          <Button
            aria-label={t('Dismiss')}
            borderless
            icon={<IconClose />}
            onClick={onDismiss}
            size="sm"
          />
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
      }
    >
      <Stack gap="xs">
        <Heading as="h4">{content.heading}</Heading>
        <Text>{content.body}</Text>
      </Stack>
    </Alert>
  );
}
