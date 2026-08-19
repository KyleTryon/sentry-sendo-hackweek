import * as Sentry from '@sentry/react';
import {OrganizationFixture} from 'sentry-fixture/organization';

import {render, screen, userEvent} from 'sentry-test/reactTestingLibrary';

import {AnalyticsArea} from 'sentry/components/analyticsArea';
import {ExperimentSurface} from 'sentry/utils/experiments/experimentSurface';
import type {ExperimentDefinition} from 'sentry/utils/experiments/types';

const TEST_ID = 'test-cta';
const FEATURE = `experiment-${TEST_ID}`;
const HEADING = 'Test heading';

// The shipped registry is empty — experiments are added per surface, not kept
// around for tests. Stand up a synthetic one so the framework itself is covered
// independently of whatever experiments happen to be live.
const TEST_EXPERIMENTS: Record<string, ExperimentDefinition> = {
  [TEST_ID]: {
    hypothesis: 'Testing that the framework renders and measures.',
    owner: 'sendo',
    surface: 'explore.logs',
    element: 'floating-cta',
    status: 'active',
    content: () => ({
      heading: HEADING,
      body: 'Test body',
      ctaLabel: 'Test CTA',
      ctaTarget: '/settings/projects/',
    }),
  },
};

jest.mock('sentry/utils/experiments/experiments', () => ({
  get EXPERIMENTS() {
    return TEST_EXPERIMENTS;
  },
  experimentFeature: (id: string) => `experiment-${id}`,
  experimentDefinition: (id: string) => TEST_EXPERIMENTS[id],
  experimentArmAttribute: (id: string) => `experiment.arm.${id}`,
  experimentDismissalKey: (id: string, orgId: string) => `${orgId}:experiment-${id}`,
  activeExperimentForSurface: (surface: string) =>
    Object.keys(TEST_EXPERIMENTS).find(
      id =>
        TEST_EXPERIMENTS[id]!.surface === surface &&
        TEST_EXPERIMENTS[id]!.status === 'active'
    ),
}));

function renderSurface(organization: ReturnType<typeof OrganizationFixture>) {
  return render(
    <AnalyticsArea name="explore.logs">
      <ExperimentSurface surface="explore.logs" />
    </AnalyticsArea>,
    {organization}
  );
}

function exposures() {
  return jest
    .mocked(Sentry.metrics.count)
    .mock.calls.filter(([name]) => name === 'product.experiment.exposure');
}

function actions() {
  return jest
    .mocked(Sentry.metrics.count)
    .mock.calls.filter(([name]) => name === 'product.experiment.action');
}

describe('ExperimentSurface', () => {
  let setAttribute: jest.Mock;

  beforeEach(() => {
    jest.spyOn(Sentry.metrics, 'count').mockImplementation(jest.fn());
    setAttribute = jest.fn();
    jest.spyOn(Sentry, 'getCurrentScope').mockReturnValue({setAttribute} as any);
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing and emits nothing when the org is not enrolled', () => {
    renderSurface(OrganizationFixture());

    expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
    expect(Sentry.metrics.count).not.toHaveBeenCalled();
  });

  it('emits a control exposure without rendering for the control arm', () => {
    renderSurface(OrganizationFixture({experiments: {[FEATURE]: 'control'}}));

    expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
    expect(exposures()).toHaveLength(1);
    expect(exposures()[0]![2]).toEqual({
      attributes: expect.objectContaining({
        'experiment.id': TEST_ID,
        'experiment.variant': 'control',
        'experiment.surface': 'explore.logs',
        'experiment.element': 'floating-cta',
        'experiment.rendered': false,
      }),
    });
  });

  it('renders the element and emits a rendered exposure for the active arm', () => {
    renderSurface(
      OrganizationFixture({features: [FEATURE], experiments: {[FEATURE]: 'active'}})
    );

    expect(screen.getByText(HEADING)).toBeInTheDocument();
    expect(exposures()).toHaveLength(1);
    expect(exposures()[0]![2]).toEqual({
      attributes: expect.objectContaining({
        'experiment.variant': 'active',
        'experiment.rendered': true,
      }),
    });
  });

  it('does not emit a second exposure on rerender', () => {
    const organization = OrganizationFixture({
      features: [FEATURE],
      experiments: {[FEATURE]: 'active'},
    });
    const {rerender} = renderSurface(organization);

    rerender(
      <AnalyticsArea name="explore.logs">
        <ExperimentSurface surface="explore.logs" />
      </AnalyticsArea>
    );

    expect(exposures()).toHaveLength(1);
  });

  it('records a cta-clicked action', async () => {
    renderSurface(
      OrganizationFixture({features: [FEATURE], experiments: {[FEATURE]: 'active'}})
    );

    await userEvent.click(screen.getByRole('button', {name: 'Test CTA'}));

    expect(actions()).toHaveLength(1);
    expect(actions()[0]![2]).toEqual({
      attributes: expect.objectContaining({
        'experiment.action': 'cta-clicked',
        'experiment.variant': 'active',
      }),
    });
  });

  it('records a dismissed action and hides the element', async () => {
    renderSurface(
      OrganizationFixture({features: [FEATURE], experiments: {[FEATURE]: 'active'}})
    );

    await userEvent.click(screen.getByRole('button', {name: 'Dismiss'}));

    expect(actions()).toHaveLength(1);
    expect(actions()[0]![2]).toEqual({
      attributes: expect.objectContaining({'experiment.action': 'dismissed'}),
    });
    expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
  });

  it('stays dismissed across remounts and reports rendered:false', async () => {
    const organization = OrganizationFixture({
      features: [FEATURE],
      experiments: {[FEATURE]: 'active'},
    });
    const {unmount} = renderSurface(organization);
    await userEvent.click(screen.getByRole('button', {name: 'Dismiss'}));
    unmount();

    jest.mocked(Sentry.metrics.count).mockClear();
    renderSurface(organization);

    expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
    expect(exposures()).toHaveLength(1);
    expect(exposures()[0]![2]).toEqual({
      attributes: expect.objectContaining({
        'experiment.rendered': false,
        'experiment.variant': 'active',
      }),
    });
  });

  it('puts the arm on the SDK scope for enrolled orgs', () => {
    renderSurface(
      OrganizationFixture({features: [FEATURE], experiments: {[FEATURE]: 'active'}})
    );

    expect(setAttribute).toHaveBeenCalledWith(`experiment.arm.${TEST_ID}`, 'active');
  });

  it('puts the arm on the scope for the control group too', () => {
    renderSurface(OrganizationFixture({experiments: {[FEATURE]: 'control'}}));

    expect(setAttribute).toHaveBeenCalledWith(`experiment.arm.${TEST_ID}`, 'control');
  });

  it('does not touch the scope when the org is not enrolled', () => {
    renderSurface(OrganizationFixture());

    expect(setAttribute).not.toHaveBeenCalled();
  });

  describe('development warning', () => {
    let warn: jest.SpyInstance;
    const nodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
      warn = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
      (process.env as {NODE_ENV?: string}).NODE_ENV = 'development';
    });

    afterEach(() => {
      (process.env as {NODE_ENV?: string}).NODE_ENV = nodeEnv;
    });

    it('warns when the flag is on but Flagpole assigned no arm', () => {
      renderSurface(OrganizationFixture({features: [FEATURE]}));

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('no Flagpole assignment')
      );
    });

    it('stays quiet for an enrolled organization in the control arm', () => {
      // The flag can be on while the assignment is control — via SENTRY_FEATURES
      // locally, for instance. That is a legitimate state, not unusable data.
      renderSurface(
        OrganizationFixture({features: [FEATURE], experiments: {[FEATURE]: 'control'}})
      );

      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('no Flagpole assignment')
      );
    });

    it('stays quiet for an enrolled organization in the active arm', () => {
      renderSurface(
        OrganizationFixture({features: [FEATURE], experiments: {[FEATURE]: 'active'}})
      );

      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('no Flagpole assignment')
      );
    });
  });

  it('renders nothing and emits nothing once the experiment is concluded', () => {
    // Widen the literal type `satisfies` narrows to, so the registry can be
    // temporarily flipped to a status it does not currently declare.
    jest.replaceProperty(TEST_EXPERIMENTS[TEST_ID]!, 'status', 'concluded');

    renderSurface(
      OrganizationFixture({features: [FEATURE], experiments: {[FEATURE]: 'active'}})
    );

    expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
    expect(Sentry.metrics.count).not.toHaveBeenCalled();
  });
});
