import {OrganizationFixture} from 'sentry-fixture/organization';

import {render, screen} from 'sentry-test/reactTestingLibrary';

import {useExperiment} from 'sentry/utils/useExperiment';

function TestComponent({feature}: {feature: string}) {
  const {inExperiment, experimentAssignment, isEnrolled} = useExperiment({
    feature,
    reportExposure: false,
  });
  return (
    <div>
      <span data-test-id="in-experiment">{String(inExperiment)}</span>
      <span data-test-id="assignment">{experimentAssignment}</span>
      <span data-test-id="is-enrolled">{String(isEnrolled)}</span>
    </div>
  );
}

describe('useExperiment (open-source fallback)', () => {
  it('returns control group when feature is not enabled', () => {
    render(<TestComponent feature="test-experiment" />);
    expect(screen.getByTestId('in-experiment')).toHaveTextContent('false');
    expect(screen.getByTestId('assignment')).toHaveTextContent('control');
  });

  it('returns inExperiment true when feature is enabled', () => {
    const org = OrganizationFixture({features: ['test-experiment']});
    render(<TestComponent feature="test-experiment" />, {organization: org});
    expect(screen.getByTestId('in-experiment')).toHaveTextContent('true');
    expect(screen.getByTestId('assignment')).toHaveTextContent('control');
  });

  it('reads the assignment from organization.experiments', () => {
    const org = OrganizationFixture({
      features: ['test-experiment'],
      experiments: {'test-experiment': 'active'},
    });
    render(<TestComponent feature="test-experiment" />, {organization: org});
    expect(screen.getByTestId('assignment')).toHaveTextContent('active');
    expect(screen.getByTestId('is-enrolled')).toHaveTextContent('true');
  });

  it('distinguishes an unenrolled organization from a control assignment', () => {
    const unenrolled = OrganizationFixture({features: ['test-experiment']});
    const {unmount} = render(<TestComponent feature="test-experiment" />, {
      organization: unenrolled,
    });
    expect(screen.getByTestId('assignment')).toHaveTextContent('control');
    expect(screen.getByTestId('is-enrolled')).toHaveTextContent('false');
    unmount();

    const control = OrganizationFixture({experiments: {'test-experiment': 'control'}});
    render(<TestComponent feature="test-experiment" />, {organization: control});
    expect(screen.getByTestId('assignment')).toHaveTextContent('control');
    expect(screen.getByTestId('is-enrolled')).toHaveTextContent('true');
  });

  it('does not derive inExperiment from the assignment', () => {
    const org = OrganizationFixture({experiments: {'test-experiment': 'active'}});
    render(<TestComponent feature="test-experiment" />, {organization: org});
    expect(screen.getByTestId('in-experiment')).toHaveTextContent('false');
    expect(screen.getByTestId('assignment')).toHaveTextContent('active');
  });
});
