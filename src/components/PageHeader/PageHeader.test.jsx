import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Star } from 'lucide-react';
import PageHeader from './PageHeader';

describe('PageHeader', () => {
  it('renders the title as a heading', () => {
    render(<PageHeader title="כותרת הדף" />);
    expect(screen.getByRole('heading', { name: 'כותרת הדף' })).toBeInTheDocument();
  });

  it('renders the subtitle when provided', () => {
    render(<PageHeader title="כותרת" subtitle="תיאור משנה" />);
    expect(screen.getByText('תיאור משנה')).toBeInTheDocument();
  });

  it('omits the subtitle when not provided', () => {
    const { container } = render(<PageHeader title="כותרת" />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders the icon when provided', () => {
    const { container } = render(<PageHeader icon={Star} title="כותרת" />);
    expect(container.querySelector('.header-icon')).toBeInTheDocument();
  });
});
