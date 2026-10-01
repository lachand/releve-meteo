import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBackup } from '../../data/cache/backup';
import { deleteDbForTests } from '../../data/cache/db';
import { resetMemoryDatasetStore } from '../../data/cache/datasetStore';
import { clearModelChoices, readAllModelChoices } from '../../data/cache/modelChoice';
import { addFavourite, defaultPreferences, readPreferences } from '../../data/cache/preferences';
import type { Place } from '../../domain/types';
import { DEFAULT_NOTIFY } from '../../domain/weatherNotices';
import { BackupPanel } from './BackupPanel';

const LYON: Place = {
  id: '45.7578:4.8320',
  name: 'Lyon',
  latitude: 45.7578,
  longitude: 4.832,
  elevation: 170,
  admin: 'Rhône',
  alias: null,
};

function file(content: string): File {
  return new File([content], 'sauvegarde.json', { type: 'application/json' });
}

const VALID = JSON.stringify(
  buildBackup({
    preferences: addFavourite(defaultPreferences(), LYON).preferences,
    modelChoices: { [LYON.id]: 'arpege' },
    watch: { digest: false, notify: DEFAULT_NOTIFY },
    now: new Date('2026-09-28T13:27:00Z'),
  }),
);

beforeEach(async () => {
  localStorage.clear();
  clearModelChoices();
  await deleteDbForTests();
  resetMemoryDatasetStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BackupPanel', () => {
  it('exporte les donnees locales dans un fichier date, et le dit', async () => {
    const created: Blob[] = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (blob: Blob) => {
        created.push(blob);
        return 'blob:test';
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });
    const user = userEvent.setup();
    render(<BackupPanel onRestored={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Exporter mes données' }));
    expect(await screen.findByText('Sauvegarde exportée.')).toBeInTheDocument();
    expect(clicks[0]).toMatch(/^releve-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
    const content = JSON.parse(await (created[0] as Blob).text()) as { app: string };
    expect(content.app).toBe('releve-meteo');
  });

  it('montre le contenu d une sauvegarde avant de remplacer quoi que ce soit, puis la restaure', async () => {
    const onRestored = vi.fn();
    const user = userEvent.setup();
    render(<BackupPanel onRestored={onRestored} />);
    await user.upload(screen.getByLabelText('Restaurer une sauvegarde'), file(VALID));
    const group = await screen.findByRole('group', { name: 'Sauvegarde à restaurer' });
    expect(group).toHaveTextContent('1 favori, 0 alerte et 1 choix de modèle');
    expect(group).toHaveTextContent('remplace vos favoris');
    // Rien n'est applique tant que l'utilisateur n'a pas confirme.
    expect(readPreferences().favourites).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Remplacer mes données' }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledOnce());
    expect(readPreferences().favourites).toEqual([LYON]);
    expect(readAllModelChoices()).toEqual({ [LYON.id]: 'arpege' });
  });

  it('annule sans rien changer', async () => {
    const onRestored = vi.fn();
    const user = userEvent.setup();
    render(<BackupPanel onRestored={onRestored} />);
    await user.upload(screen.getByLabelText('Restaurer une sauvegarde'), file(VALID));
    await user.click(await screen.findByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('group', { name: 'Sauvegarde à restaurer' })).not.toBeInTheDocument();
    expect(onRestored).not.toHaveBeenCalled();
    expect(readPreferences().favourites).toEqual([]);
  });

  it('dit pourquoi un fichier est refuse, et compte les elements ignores', async () => {
    const user = userEvent.setup();
    render(<BackupPanel onRestored={vi.fn()} />);
    const input = screen.getByLabelText('Restaurer une sauvegarde');
    await user.upload(input, file('pas du json'));
    expect(await screen.findByRole('status')).toHaveTextContent('n’est pas lisible');
    await user.upload(input, file('{"app":"autre"}'));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('n’est pas une sauvegarde de Relevé'),
    );
    await user.upload(input, file('{"app":"releve-meteo","version":9}'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('version de Relevé'));
    await user.upload(
      input,
      file(
        JSON.stringify({ app: 'releve-meteo', version: 1, preferences: { favourites: [1, 2] } }),
      ),
    );
    expect(await screen.findByRole('group')).toHaveTextContent(
      '2 éléments invalides ont été ignorés',
    );
  });
});
