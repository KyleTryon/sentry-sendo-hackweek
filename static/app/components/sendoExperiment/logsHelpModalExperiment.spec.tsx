import {OrganizationFixture} from 'sentry-fixture/organization';

import {render, waitFor} from 'sentry-test/reactTestingLibrary';

import {LogsHelpModalExperiment} from 'sentry/components/sendoExperiment/logsHelpModalExperiment';

jest.mock('sentry/actionCreators/modal', () => ({
  openModal: jest.fn(),
}));

describe('LogsHelpModalExperiment', () => {
  const {openModal} = jest.requireMock('sentry/actionCreators/modal');

  beforeEach(() => {
    openModal.mockClear();
  });

  it('opens the modal when the experiment feature is enabled', async () => {
    const organization = OrganizationFixture({
      features: ['sendo-logs-help-modal-q3'],
    });

    render(<LogsHelpModalExperiment />, {organization});

    await waitFor(() => {
      expect(openModal).toHaveBeenCalled();
    });

    expect(window.analytics).toHaveBeenCalledWith(
      'ui.experiment.views',
      expect.objectContaining({
        experiment_name: 'logs-help-modal-q3',
      })
    );
  });

  it('does not open the modal when the experiment feature is disabled', async () => {
    render(<LogsHelpModalExperiment />);

    await waitFor(() => {
      expect(openModal).not.toHaveBeenCalled();
    });
  });
});
