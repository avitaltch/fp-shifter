import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

function Boom({ shouldThrow }) {
  if (shouldThrow) throw new Error('boom');
  return <div>ok</div>;
}

describe('ErrorBoundary', () => {
  let consoleError;

  beforeEach(() => {
    // React logs the caught error to console.error — silence the noise.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('shows a Hebrew fallback when a child throws during render', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByRole('heading', { name: 'משהו השתבש' })).toBeInTheDocument();
    expect(screen.getByText(/אירעה שגיאה בלתי צפויה/)).toBeInTheDocument();
    expect(screen.queryByText('ok')).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });

  it('retries by clearing the error state so children can remount', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByRole('heading', { name: 'משהו השתבש' })).toBeInTheDocument();

    // Stop throwing, then click retry — the boundary remounts children.
    rerender(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: 'נסה שוב' }));

    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('navigates home via a full page assign on the secondary action', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });

    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: 'חזרה לדף הבית' }));
    expect(assign).toHaveBeenCalledWith('/');

    vi.unstubAllGlobals();
  });
});
