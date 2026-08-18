import {OrganizationFixture} from 'sentry-fixture/organization';

import {render, waitFor} from 'sentry-test/reactTestingLibrary';

import {BranchFixVerifyModalExperiment} from 'sentry/components/sendoExperiment/branchFixVerifyModalExperiment';

jest.mock('sentry/actionCreators/modal', () => ({
  openModal: jest.fn(),
}));

describe('BranchFixVerifyModalExperiment', () => {
  const {openModal} = jest.requireMock('sentry/actionCreators/modal');

  beforeEach(() => {
    openModal.mockClear();
  });

  it('opens the modal when the experiment feature is enabled', async () => {
    const organization = OrganizationFixture({
      features: ['sendo-branch-fix-verify'],
    });

    render(<BranchFixVerifyModalExperiment />, {organization});

    await waitFor(() => {
      expect(openModal).toHaveBeenCalled();
    });

    expect(window.analytics).toHaveBeenCalledWith(
      'ui.experiment.views',
      expect.objectContaining({
        experiment_name: 'branch-fix-verify',
      })
    );
  });

  it('does not open the modal when the experiment feature is disabled', async () => {
    render(<BranchFixVerifyModalExperiment />);

    await waitFor(() => {
      expect(openModal).not.toHaveBeenCalled();
    });
  });
});
