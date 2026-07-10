import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Alert from './Alert';

describe('Alert', () => {
  it('renders nothing without content', () => {
    const { container } = render(<Alert type="error">{null}</Alert>);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an error with role=alert and error-text class', () => {
    render(<Alert type="error">משהו השתבש</Alert>);
    const el = screen.getByRole('alert');
    expect(el).toHaveTextContent('משהו השתבש');
    expect(el).toHaveClass('error-text');
  });

  it('renders a success message with role=status and success-text class', () => {
    render(<Alert type="success">הצליח</Alert>);
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('הצליח');
    expect(el).toHaveClass('success-text');
  });

  it('renders an info message with role=status and info-text class', () => {
    render(<Alert type="info">לידיעתך</Alert>);
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('לידיעתך');
    expect(el).toHaveClass('info-text');
  });

  it('defaults to error styling', () => {
    render(<Alert>ברירת מחדל</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('error-text');
  });
});
