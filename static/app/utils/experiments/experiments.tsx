import {t} from 'sentry/locale';
import type {ExperimentDefinition, Surface} from 'sentry/utils/experiments/types';

/**
 * The Sendo experiment registry.
 *
 * Adding an experiment to an already-instrumented surface is an entry here plus
 * a feature flag in `src/sentry/features/temporary.py`. No component code, and
 * no metrics code — the framework derives every metric attribute from the entry.
 *
 * At most one `status: 'active'` experiment per surface; two would make
 * exposures uninterpretable. Enforced by `experiments.spec.tsx`.
 *
 * See `.agents/skills/sendo/SKILL.md`.
 */
export const EXPERIMENTS = {
  'logs-pm-test-run': {
    hypothesis:
      'Organizations exploring logs may not know where to get setup help; an inline banner on the logs page should raise clicks to logs documentation.',
    owner: 'sendo',
    surface: 'explore.logs',
    element: 'page-banner',
    status: 'active',
    content: () => ({
      heading: t('Getting Started With Logs?'),
      body: t(
        'If you want to know more about how to setup or improve your Sentry logs, book a 1:1 appointing with an engineer.'
      ),
      ctaLabel: t('Get Help'),
      ctaTarget: 'https://docs.sentry.io/product/logs',
      alertVariant: 'info',
      alertSystem: false,
    }),
  },
} satisfies Record<string, ExperimentDefinition>;

export type ExperimentId = keyof typeof EXPERIMENTS;

/**
 * Look up a definition.
 *
 * `ExperimentId` is derived from the registry, so it narrows to `never` while
 * the registry is empty and indexing `EXPERIMENTS` directly stops type-checking.
 * That is TypeScript telling the truth — there are no valid ids yet — but the
 * framework still has to compile. Going through a widened record keeps callers
 * well-typed either way, and they keep the compile-time id check at their own
 * call sites.
 */
export function experimentDefinition(experiment: ExperimentId): ExperimentDefinition {
  const registry: Record<string, ExperimentDefinition> = EXPERIMENTS;
  return registry[experiment as string]!;
}

/**
 * The feature flag backing an experiment, without the `organizations:` prefix —
 * which is also its key in `organization.experiments`.
 */
export function experimentFeature(experiment: ExperimentId): string {
  return `experiment-${experiment}`;
}

/**
 * The scope attribute key carrying this experiment's arm.
 *
 * Namespaced under `experiment.arm.` rather than `experiment.` so it cannot be
 * confused with the `experiment.*` attribute *fields* on the metrics themselves.
 */
export function experimentArmAttribute(experiment: ExperimentId): string {
  return `experiment.arm.${experiment}`;
}

/**
 * The localStorage key holding this experiment's dismissal for an organization.
 *
 * Built here rather than inline because it is a user-visible string people paste
 * into a console, and it is repeated in the skill's local-setup notes.
 */
export function experimentDismissalKey(
  experiment: ExperimentId,
  organizationId: string
): string {
  return `${organizationId}:${experimentFeature(experiment)}`;
}

/**
 * The active experiment for a surface, or `undefined` if there is none.
 */
export function activeExperimentForSurface(surface: Surface): ExperimentId | undefined {
  const registry: Record<string, ExperimentDefinition> = EXPERIMENTS;
  return (Object.keys(registry) as ExperimentId[]).find(
    id => registry[id]!.surface === surface && registry[id]!.status === 'active'
  );
}
