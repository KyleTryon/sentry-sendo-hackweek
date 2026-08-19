# Scraps components for Sendo experiment UI

This is the Sentry production design system, **not** the cloned scrapscn files in sendo-ui (`src/components/ui/*`). Those exist only for the wizard preview.

## Rules

- Import from `@sentry/scraps/<package>`. Never from `sentry/components/ui`, Tailwind clones, or another repo.
- Copy and links belong in registry `content` (`heading`, `body`, `ctaLabel`, `ctaTarget`) and are rendered with `t()`.
- Elements call `onCtaClick` / `onDismiss` only. Do not emit metrics from the element.
- Follow `static/AGENTS.md` and the `design-system` skill for spacing tokens (`gap="md"`), not raw pixels.

## Packages to use

| Need                   | Import                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| Inline / system banner | `import {Alert} from '@sentry/scraps/alert'`                                                     |
| Buttons                | `import {Button, LinkButton} from '@sentry/scraps/button'`                                       |
| Layout                 | `import {Flex, Stack, Container} from '@sentry/scraps/layout'`                                   |
| Typography             | `import {Heading, Text} from '@sentry/scraps/text'`                                              |
| Links                  | `import {Link, ExternalLink} from '@sentry/scraps/link'`                                         |
| Icons                  | `import {IconClose, IconInfo, …} from 'sentry/icons'`                                            |
| Modal chrome           | `ModalRenderProps` from `sentry/actionCreators/modal` (`Header`, `Body`, `Footer`, `closeModal`) |

Do **not** import `Alert` from `sentry/components/core/alert` unless you are changing the design-system primitive itself. Experiment UI consumes the public `@sentry/scraps/alert` export.

## Map Sendo UI payload → catalog element

Sendo UI sends `component.type` plus `component.design`. Map, then implement with Scraps — do not generate a one-off page component.

| `component.type` | Catalog `element`                                                     | Notes                                                                                                        |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `embedded_alert` | `page-banner` (or `floating-cta` if the banner must not shift layout) | `page-banner` is the layout-participating match. Implement it if still Planned.                              |
| `modal`          | `modal` (add to the catalog if missing)                               | Compose Scraps inside `ModalRenderProps`. Pattern: `static/app/components/sendoExperiment/testExpModal.tsx`. |

### Design fields

| Payload                            | Render as                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `design.title`                     | `Heading as="h4"` (modal) or `Alert` title / `Text bold` (banner)                                                                          |
| `design.body`                      | `Text`                                                                                                                                     |
| `design.primaryCta.label` + `.url` | `LinkButton` `priority="primary"` `href={ctaTarget}` `external` when the URL is absolute. Click → `onCtaClick`.                            |
| `design.secondaryCta` (if present) | `Button` or `LinkButton` `priority="default"`. Dismiss-only secondary → `onDismiss`.                                                       |
| `design.badgeText`                 | `Text size="sm"` muted, or omit — there is no Scraps Badge required.                                                                       |
| `design.alertVariant`              | `<Alert variant={…}>` — `'info' \| 'warning' \| 'danger' \| 'success' \| 'muted'`                                                          |
| `design.alertSystem`               | `<Alert system={true}>` for full-bleed; omit / `false` for the card (rounded border).                                                      |
| `design.modalPlacement`            | Modal only. `'center'` is the default `openModal` path. `'bottom_right'` needs a positioned container; do not fake it with a second Alert. |

## Embedded alert (page banner)

```tsx
import {Alert} from '@sentry/scraps/alert';
import {Button, LinkButton} from '@sentry/scraps/button';
import {Flex, Stack} from '@sentry/scraps/layout';
import {Heading, Text} from '@sentry/scraps/text';

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
        <Button size="sm" borderless onClick={onDismiss} aria-label={t('Dismiss')}>
          {/* IconClose */}
        </Button>
      )}
      <LinkButton
        size="sm"
        priority="primary"
        href={content.ctaTarget}
        onClick={onCtaClick}
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
</Alert>;
```

`Alert` already owns icon, rail, and border. Do not wrap it in another colored `div`.

## Modal

```tsx
import {Button, LinkButton} from '@sentry/scraps/button';
import {Stack} from '@sentry/scraps/layout';
import {Heading, Text} from '@sentry/scraps/text';
import type {ModalRenderProps} from 'sentry/actionCreators/modal';

<Header closeButton>
  <Heading as="h4">{content.heading}</Heading>
</Header>
<Body>
  <Stack gap="lg">
    <Text>{content.body}</Text>
  </Stack>
</Body>
<Footer>
  <Button onClick={onDismiss}>{t('Dismiss')}</Button>
  <LinkButton
    href={content.ctaTarget}
    external
    priority="primary"
    onClick={onCtaClick}
  >
    {content.ctaLabel}
  </LinkButton>
</Footer>
```

Open via `openModal` from `sentry/actionCreators/modal`. The catalog element should trigger that from `onCtaClick`/`onDismiss` wiring in the element, not from a page-level one-off.

## Forbidden

- `className` Tailwind from sendo-ui (`bg-primary/5`, `rounded-lg`, lucide icons).
- `styled` Emotion wrappers that re-implement Alert/Button.
- Hand-rolled `Sentry.metrics.count` in the element.
- Putting copy in metric attributes.
- Enabling the flag in `sentry-options-automator`.
