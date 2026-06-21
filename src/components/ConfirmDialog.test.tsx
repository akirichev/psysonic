import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import ConfirmDialog from './ConfirmDialog';

/** Footer-scoped button query — the header X shares the cancel label by design. */
const footer = () => within(document.querySelector('.ui-modal-footer') as HTMLElement);

describe('ConfirmDialog', () => {
  it('renders title, message and both buttons', () => {
    renderWithProviders(
      <ConfirmDialog
        open
        title="Delete playlist?"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Delete playlist?')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(footer().getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(footer().getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('fires onConfirm and onCancel from their buttons', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        title="t"
        message="m"
        confirmLabel="OK"
        cancelLabel="No"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(footer().getByRole('button', { name: 'OK' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(footer().getByRole('button', { name: 'No' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('gives the confirm button initial focus', () => {
    renderWithProviders(
      <ConfirmDialog
        open
        title="t"
        message="m"
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Confirm' }));
  });

  it('applies danger styling to the confirm button', () => {
    renderWithProviders(
      <ConfirmDialog open title="t" message="m" confirmLabel="Delete" danger onConfirm={vi.fn()} />,
    );
    expect(footer().getByRole('button', { name: 'Delete' })).toHaveStyle({
      background: 'var(--danger)',
    });
  });

  it('renders a single button and resolves via onConfirm on Escape', () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <ConfirmDialog open title="t" message="m" confirmLabel="Got it" onConfirm={onConfirm} />,
    );
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('disables buttons and blocks dismissal while busy', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        busy
        title="t"
        message="m"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(footer().getByRole('button', { name: 'OK' })).toBeDisabled();
    expect(footer().getByRole('button', { name: 'Cancel' })).toBeDisabled();

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
