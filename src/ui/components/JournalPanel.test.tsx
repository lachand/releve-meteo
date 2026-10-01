import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as store from '../../data/cache/journalStore';
import type { JournalEntry } from '../../domain/journal';
import { JournalPanel } from './JournalPanel';

vi.mock('../../data/cache/journalStore', () => ({ loadJournal: vi.fn() }));

function entry(date: string, model: 'icon_d2' | 'arome', mae: number): JournalEntry {
  return {
    date,
    stationName: 'Lyon / Bron',
    hours: 24,
    observedMin: 10.4,
    observedMax: 21.6,
    models: [{ model, mae, bias: 0 }],
  };
}

afterEach(() => vi.mocked(store.loadJournal).mockReset());

describe('JournalPanel', () => {
  it('annonce la lecture, puis le debut du journal quand rien n est encore garde', async () => {
    vi.mocked(store.loadJournal).mockResolvedValue([]);
    render(<JournalPanel placeId="lyon" refreshKey="a" />);
    expect(screen.getByText('Lecture du journal…')).toBeInTheDocument();
    expect(
      await screen.findByText(/Le journal commence avec le prochain bilan d’hier/),
    ).toBeInTheDocument();
  });

  it('resume les jours gardes et les liste, le modele le plus proche et son erreur', async () => {
    vi.mocked(store.loadJournal).mockResolvedValue([
      entry('2026-09-29', 'icon_d2', 0.9),
      entry('2026-09-28', 'arome', 1.3),
      entry('2026-09-27', 'icon_d2', 1.1),
    ]);
    render(<JournalPanel placeId="lyon" refreshKey="a" />);
    expect(await screen.findByText(/3 jours de bilan gardés sur cet appareil/)).toHaveTextContent(
      'ICON-D2 a été le plus proche de la mesure 2 jours, AROME 1',
    );
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    // En-tete et trois jours.
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent(/mardi 29 septembre/);
    expect(rows[1]).toHaveTextContent(/10 à 22\s°C/);
    expect(rows[1]).toHaveTextContent(/ICON-D2/);
    expect(rows[1]).toHaveTextContent(/0,9\s°C/);
    expect(
      screen.getByRole('list', { name: 'Erreur moyenne de chaque modèle sur le journal' }),
    ).toHaveTextContent(/ICON-D2.*1,0.°C d’erreur moyenne sur 2 jours/);
    expect(
      screen.getByText(/Température seulement : le journal ne dit rien des averses/),
    ).toBeInTheDocument();
  });

  it('relit le journal quand un nouveau bilan a pu etre enregistre, et dit un jour sans modele', async () => {
    vi.mocked(store.loadJournal).mockResolvedValueOnce([]);
    const { rerender } = render(<JournalPanel placeId="lyon" refreshKey="a" />);
    await screen.findByText(/Le journal commence/);
    vi.mocked(store.loadJournal).mockResolvedValueOnce([
      { ...entry('2026-09-29', 'arome', 1), models: [] },
    ]);
    rerender(<JournalPanel placeId="lyon" refreshKey="b" />);
    expect(await screen.findByText(/sans modèle comparable/)).toBeInTheDocument();
    const row = within(screen.getByRole('table')).getAllByRole('row')[1];
    expect(row).toHaveTextContent('aucun');
    expect(row).toHaveTextContent('aucune');
    expect(store.loadJournal).toHaveBeenCalledTimes(2);
  });

  it('ignore une lecture tardive d un lieu quitte', async () => {
    let resolve: (value: readonly JournalEntry[]) => void = () => {};
    vi.mocked(store.loadJournal).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { unmount } = render(<JournalPanel placeId="lyon" refreshKey="a" />);
    unmount();
    resolve([entry('2026-09-29', 'arome', 1)]);
    await Promise.resolve();
    expect(store.loadJournal).toHaveBeenCalledTimes(1);
  });
});
