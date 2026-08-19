import {
  activeExperimentForSurface,
  EXPERIMENTS,
} from 'sentry/utils/experiments/experiments';
import type {ExperimentDefinition} from 'sentry/utils/experiments/types';

const REGISTRY: Record<string, ExperimentDefinition> = EXPERIMENTS;

describe('experiment registry invariants', () => {
  const entries = Object.entries(REGISTRY);

  it('uses kebab-case ids that do not restate "experiment"', () => {
    for (const [id] of entries) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(id).not.toContain('experiment');
    }
  });

  it('runs at most one active experiment per surface', () => {
    const seen = new Set<string>();
    for (const [id, definition] of entries) {
      if (definition.status !== 'active') {
        continue;
      }
      expect(seen.has(definition.surface)).toBe(false);
      seen.add(definition.surface);
      expect(activeExperimentForSurface(definition.surface)).toBe(id);
    }
  });

  it('never returns a concluded experiment for a surface', () => {
    for (const definition of Object.values(REGISTRY)) {
      if (definition.status === 'active') {
        continue;
      }
      const active = activeExperimentForSurface(definition.surface);
      expect(active === undefined || REGISTRY[active]!.status === 'active').toBe(true);
    }
  });

  it('states a hypothesis and an owner', () => {
    // TypeScript guarantees the fields exist. It cannot guarantee anyone filled
    // them in, and an empty hypothesis is the same as no hypothesis.
    for (const [id, definition] of entries) {
      expect(definition.hypothesis.trim().length).toBeGreaterThan(10);
      expect(definition.owner.trim()).not.toBe('');
      expect(definition.hypothesis).not.toContain(id);
    }
  });

  it('declares content that resolves to non-empty copy', () => {
    for (const [, definition] of entries) {
      const content = definition.content();
      expect(content.heading).toBeTruthy();
      expect(content.body).toBeTruthy();
      expect(content.ctaLabel).toBeTruthy();
      expect(content.ctaTarget).toBeTruthy();
    }
  });
});
