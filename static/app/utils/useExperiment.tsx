import {getOverride} from 'sentry/overrideRegistry';
import {useOrganization} from 'sentry/utils/useOrganization';

export interface UseExperimentResult {
  /**
   * The raw assignment string from the backend (e.g. "active" or "control").
   * Useful for future multi-variant experiments where a simple boolean
   * isn't sufficient.
   */
  experimentAssignment: string;
  /**
   * Whether the current organization is in the experiment's active group.
   * True when the assignment is "active", false otherwise.
   */
  inExperiment: boolean;
  /**
   * Whether the organization is enrolled in the experiment at all, i.e. whether
   * Flagpole handed back an assignment for it.
   *
   * This is distinct from `experimentAssignment === 'control'`. That value falls
   * through to "control" both for genuinely control-assigned organizations and
   * for organizations that were never enrolled, so callers that need to tell
   * those apart — for example to avoid counting unenrolled organizations in a
   * control denominator — must use this instead.
   */
  isEnrolled: boolean;
}

export interface UseExperimentOptions {
  /**
   * The experiment key, matching the flagpole flag name without the
   * "organizations:" prefix (e.g. "my-experiment").
   */
  feature: string;
  /**
   * Whether to report that the user has been exposed to this experiment.
   * Required so every call site is intentional: pass true only where the
   * user is actually rendered one of the experiment variants, and false
   * elsewhere (e.g. shared components whose surrounding flow may render
   * something other than a variant).
   *
   * This option is reactive: changing it from false to true will report
   * exposure at that point.
   */
  reportExposure: boolean;
}

/**
 * Open-source fallback: gates on organization.features with no exposure logging.
 *
 * Assignment still comes from organization.experiments, which the organization
 * details API populates via get_experiment_assignments(). It is empty without
 * an entity handler, in which case nothing is enrolled.
 */
function useNoopExperiment(options: UseExperimentOptions): UseExperimentResult {
  const organization = useOrganization();
  const assignment = organization.experiments?.[options.feature];
  return {
    inExperiment: organization.features.includes(options.feature),
    experimentAssignment: assignment ?? 'control',
    isEnrolled: assignment !== undefined,
  };
}

/**
 * Check whether the current organization is enrolled in an experiment and
 * optionally report that the user has been exposed to it.
 *
 * Experiments are backed by flagpole feature flags with `experiment_mode`
 * set. The assignment ("active" or "control") is returned by the organization
 * details API in the `experiments` field.
 *
 * @param options.feature - The experiment key, matching the flagpole flag name
 *   without the "organizations:" prefix (e.g. "my-experiment").
 * @param options.reportExposure - Whether to log an exposure event.
 *   Required: pass true at the call site where the user is actually
 *   rendered one of the experiment variants, and false when the consuming
 *   component may render something other than the control or active variant
 *   (the user has not seen the experiment in that case).
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {inExperiment} = useExperiment({
 *     feature: 'my-experiment',
 *     reportExposure: true,
 *   });
 *   if (!inExperiment) return null;
 *   return <NewFeature />;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Defer exposure until the user actually interacts
 * function MyComponent() {
 *   const [opened, setOpened] = useState(false);
 *   const {inExperiment} = useExperiment({
 *     feature: 'my-experiment',
 *     reportExposure: opened,
 *   });
 *   // ...
 * }
 * ```
 */
export function useExperiment(options: UseExperimentOptions): UseExperimentResult {
  const useExperimentHook = getOverride('react-hook:use-experiment') ?? useNoopExperiment;
  return useExperimentHook(options);
}
