import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import NotFoundPage from './NotFoundPage';

describe('NotFoundPage', () => {
  it('renders the 404 message', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: '404 — הדף לא נמצא' })
    ).toBeInTheDocument();
    expect(screen.getByText('הקישור שגוי או שהדף הוסר.')).toBeInTheDocument();
  });

  it('links back to the landing page', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('link', { name: 'חזרה לדף הבית' })
    ).toHaveAttribute('href', '/');
  });
});
