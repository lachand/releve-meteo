import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InstallPrompt } from './InstallPrompt';

describe('InstallPrompt', () => {
  it('appelle onInstall au clic sur Installer', async () => {
    const onInstall = vi.fn();
    const user = userEvent.setup();
    render(<InstallPrompt onInstall={onInstall} />);

    await user.click(screen.getByRole('button', { name: 'Installer' }));
    expect(onInstall).toHaveBeenCalledOnce();
  });
});
