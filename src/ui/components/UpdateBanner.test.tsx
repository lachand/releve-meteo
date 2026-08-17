import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UpdateBanner } from './UpdateBanner';

describe('UpdateBanner', () => {
  it('affiche le message et appelle onRefresh au clic sur Actualiser', async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(<UpdateBanner onRefresh={onRefresh} />);

    expect(screen.getByText('Une nouvelle version est disponible.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
