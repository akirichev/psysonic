import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { screen, fireEvent, render } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import Modal from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    renderWithProviders(
      <Modal open={false} onClose={vi.fn()} title="Hidden">
        body
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders title, subtitle, icon, body and footer when open', () => {
    renderWithProviders(
      <Modal
        open
        onClose={vi.fn()}
        title="My title"
        subtitle="My subtitle"
        icon={<span data-testid="icon" />}
        footer={<button>Do it</button>}
      >
        <p>body content</p>
      </Modal>,
    );
    expect(screen.getByText('My title')).toBeInTheDocument();
    expect(screen.getByText('My subtitle')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Do it' })).toBeInTheDocument();
  });

  it('portals into document.body', () => {
    renderWithProviders(
      <Modal open onClose={vi.fn()} title="Portaled">
        body
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('.ui-modal-backdrop')?.parentElement).toBe(document.body);
  });

  it('labels the dialog with the title element id', () => {
    renderWithProviders(
      <Modal open onClose={vi.fn()} title="Accessible">
        body
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent('Accessible');
  });

  it('calls onClose on Escape, backdrop click and the X button', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <Modal open onClose={onClose} title="Closable">
        body
      </Modal>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close on Escape when closeOnEscape is false', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <Modal open onClose={onClose} title="Guarded" closeOnEscape={false}>
        body
      </Modal>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close on backdrop click when closeOnBackdrop is false', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <Modal open onClose={onClose} title="Guarded" closeOnBackdrop={false}>
        body
      </Modal>,
    );
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hides the close button when hideClose is set', () => {
    renderWithProviders(
      <Modal open onClose={vi.fn()} title="No X" hideClose>
        body
      </Modal>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('focuses the initialFocusRef target on open', () => {
    const ref = createRef<HTMLButtonElement>();
    renderWithProviders(
      <Modal open onClose={vi.fn()} title="Focus" initialFocusRef={ref} footer={<button ref={ref}>Primary</button>}>
        body
      </Modal>,
    );
    expect(document.activeElement).toBe(ref.current);
  });

  it('focuses the first body field when no initialFocusRef is given', () => {
    renderWithProviders(
      <Modal open onClose={vi.fn()} title="Form">
        <input aria-label="name" />
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('name'));
  });

  it('traps Tab focus inside the dialog', () => {
    renderWithProviders(
      <Modal open onClose={vi.fn()} title="Trap" footer={<button>Last</button>}>
        body
      </Modal>,
    );
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    const lastBtn = screen.getByRole('button', { name: 'Last' });

    lastBtn.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    closeBtn.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastBtn);
  });

  it('restores focus to the opening element on close', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <>
        <button data-testid="opener">opener</button>
        <Modal open={false} onClose={onClose} title="Restore">
          body
        </Modal>
      </>,
    );
    const opener = screen.getByTestId('opener');
    opener.focus();
    expect(document.activeElement).toBe(opener);

    rerender(
      <>
        <button data-testid="opener">opener</button>
        <Modal open onClose={onClose} title="Restore">
          body
        </Modal>
      </>,
    );
    // Modal grabbed focus.
    expect(document.activeElement).not.toBe(opener);

    rerender(
      <>
        <button data-testid="opener">opener</button>
        <Modal open={false} onClose={onClose} title="Restore">
          body
        </Modal>
      </>,
    );
    expect(document.activeElement).toBe(opener);
  });
});
