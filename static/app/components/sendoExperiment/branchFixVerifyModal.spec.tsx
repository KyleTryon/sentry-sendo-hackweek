import {OrganizationFixture} from 'sentry-fixture/organization';

import {render, screen, userEvent} from 'sentry-test/reactTestingLibrary';

import {
  makeClosableHeader,
  makeCloseButton,
  ModalBody,
  ModalFooter,
} from '@sentry/scraps/modal';

import {BranchFixVerifyModal} from 'sentry/components/sendoExperiment/branchFixVerifyModal';

describe('BranchFixVerifyModal', () => {
  const closeModal = jest.fn();
  const organization = OrganizationFixture();

  function renderModal() {
    return render(
      <BranchFixVerifyModal
        closeModal={closeModal}
        Body={ModalBody}
        CloseButton={makeCloseButton(jest.fn())}
        Header={makeClosableHeader(jest.fn())}
        Footer={ModalFooter}
      />,
      {organization}
    );
  }

  it('renders experiment copy', () => {
    renderModal();

    expect(screen.getByText('Need help with logs?')).toBeInTheDocument();
    expect(screen.getByText('Book a free call with an engineer.')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Get 1:1 Help'})).toHaveAttribute(
      'href',
      'https://sentry.io/contact/'
    );
  });

  it('tracks CTA clicks', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('link', {name: 'Get 1:1 Help'}));

    expect(window.analytics).toHaveBeenCalledWith(
      'ui.experiment.cta_action',
      expect.objectContaining({
        cta_label: 'Get 1:1 Help',
        experiment_name: 'branch-fix-verify',
      })
    );
  });

  it('closes when the close button is clicked', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('button', {name: 'Close'}));

    expect(closeModal).toHaveBeenCalled();
  });
});
