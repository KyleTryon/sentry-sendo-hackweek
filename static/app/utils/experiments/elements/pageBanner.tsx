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
 * Reports interactions through the props it is given and does nothing else —
 * no metrics, no assignment reads.
 */
export function PageBanner({content, onCtaClick, onDismiss}: ExperimentElementProps) {
  const isExternalCta = /^https?:\/\//.test(content.ctaTarget);

  return (
    <Alert
      variant={content.alertVariant ?? 'info'}
      system={content.alertSystem ?? false}
      trailingItems={
        <Flex gap="md" align="center">
          {content.secondaryCtaLabel ? (
            <Button size="sm" onClick={onDismiss}>
              {content.secondaryCtaLabel}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="transparent"
              onClick={onDismiss}
              aria-label={t('Dismiss')}
              icon={<IconClose />}
            />
          )}
          {isExternalCta ? (
            <LinkButton
              size="sm"
              variant="primary"
              href={content.ctaTarget}
              external
              icon={<IconSupport />}
              onClick={onCtaClick}
            >
              {content.ctaLabel}
            </LinkButton>
          ) : (
            <LinkButton
              size="sm"
              variant="primary"
              to={content.ctaTarget}
              icon={<IconSupport />}
              onClick={onCtaClick}
            >
              {content.ctaLabel}
            </LinkButton>
          )}
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
