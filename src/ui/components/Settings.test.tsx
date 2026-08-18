import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from '../../data/cache/preferences';
import { Settings } from './Settings';

describe('Settings', () => {
  it('appelle onSetWindUnit au changement de select', async () => {
    const onSetWindUnit = vi.fn();
    const user = userEvent.setup();
    render(
      <Settings
        preferences={defaultPreferences()}
        onSetWindUnit={onSetWindUnit}
        onSetTheme={vi.fn()}
        onPurge={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Vitesse du vent'), 'kt');
    expect(onSetWindUnit).toHaveBeenCalledWith('kt');
  });

  it('appelle onSetTheme au changement de select', async () => {
    const onSetTheme = vi.fn();
    const user = userEvent.setup();
    render(
      <Settings
        preferences={defaultPreferences()}
        onSetWindUnit={vi.fn()}
        onSetTheme={onSetTheme}
        onPurge={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Apparence'), 'dark');
    expect(onSetTheme).toHaveBeenCalledWith('dark');
  });

  it('exige une confirmation avant de purger', async () => {
    const onPurge = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <Settings
        preferences={defaultPreferences()}
        onSetWindUnit={vi.fn()}
        onSetTheme={vi.fn()}
        onPurge={onPurge}
        onClose={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Purger les données locales' });
    await user.click(button);
    expect(onPurge).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmer la purge' }));
    expect(onPurge).toHaveBeenCalledOnce();
    expect(await screen.findByText('Données locales effacées.')).toBeInTheDocument();
  });

  it('appelle onClose au clic sur fermer', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Settings
        preferences={defaultPreferences()}
        onSetWindUnit={vi.fn()}
        onSetTheme={vi.fn()}
        onPurge={vi.fn().mockResolvedValue(undefined)}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
