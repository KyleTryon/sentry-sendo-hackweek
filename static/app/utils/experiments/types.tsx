/**
 * Types for the Sendo experiment framework.
 *
 * Every value that reaches a metric attribute is a bounded string union here.
 * The compiler is the enforcement mechanism — see `.agents/skills/sendo/`.
 */

/**
 * A region of the UI that can host an experiment.
 *
 * Names mirror the `AnalyticsArea` a page already publishes, so a Sendo
 * `surface` attribute is joinable with ordinary analytics. Do not invent a name
 * here — take it from the page's `<AnalyticsArea name="...">`.
 */
export type Surface = 'explore.logs';

/**
 * A component from the element catalog. Experiments choose one; they never ship
 * bespoke UI.
 *
 * Named `ElementName` rather than `Element` to avoid shadowing the DOM global.
 */
export type ElementName = 'floating-cta';

/**
 * Flagpole's native assignment strings, used verbatim.
 */
export type Variant = 'active' | 'control';

/**
 * Interactions an element can report.
 */
export type Action = 'cta-clicked' | 'dismissed';

/**
 * Copy and links for an element. Never flows into metric attributes.
 *
 * Declared as a function so `t()` runs at render rather than at module load,
 * when the locale may not be initialized yet.
 */
export type ExperimentContent = () => {
  body: string;
  ctaLabel: string;
  ctaTarget: string;
  heading: string;
};

export interface ExperimentDefinition {
  content: ExperimentContent;
  element: ElementName;
  /**
   * `concluded` stops the element rendering and stops all metric emission,
   * while leaving historical data queryable.
   */
  status: 'active' | 'concluded';
  surface: Surface;
}

export interface ExperimentElementProps {
  content: ReturnType<ExperimentContent>;
  onCtaClick: () => void;
  onDismiss: () => void;
}
