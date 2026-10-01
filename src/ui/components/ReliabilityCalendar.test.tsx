import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DailyError } from '../../domain/reliability';
import { ReliabilityCalendar } from './ReliabilityCalendar';

function days(values: readonly (readonly [string, number])[]): DailyError[] {
  return values.map(([date, mae]) => ({ date, mae, count: 24 }));
}

const ROWS = [
  {
    model: 'arome' as const,
    daily: days([
      ['2026-09-26', 1],
      ['2026-09-27', 2],
      ['2026-09-28', 0.5],
    ]),
  },
  {
    model: 'arpege' as const,
    daily: days([
      ['2026-09-26', 1.5],
      ['2026-09-27', 0.7],
      ['2026-09-28', 0.9],
    ]),
  },
];

describe('ReliabilityCalendar', () => {
  it('montre, jour par jour, le modele le plus juste, avec son nom en toutes lettres pour chaque case', () => {
    render(<ReliabilityCalendar rows={ROWS} />);
    const grid = within(
      screen.getByRole('list', { name: 'Modèle le plus juste chaque jour, sur 30 jours' }),
    );
    expect(grid.getAllByRole('listitem').length).toBeGreaterThanOrEqual(30);
    expect(
      screen.getByRole('listitem', { name: /^26 septembre : AROME le plus juste/ }),
    ).toHaveTextContent('26AR');
    expect(
      screen.getByRole('listitem', { name: /^27 septembre : ARPEGE le plus juste/ }),
    ).toHaveTextContent('27AP');
    // Un jour sans mesure : case vide, jamais un modele invente.
    expect(
      screen.getByRole('listitem', { name: /^25 septembre : pas assez de mesures/ }),
    ).toHaveTextContent('25–');
  });

  it('compte les jours gagnes, et rappelle qu un modele qui gagne souvent n est pas le plus juste en moyenne', () => {
    render(<ReliabilityCalendar rows={ROWS} />);
    const tally = within(screen.getByRole('list', { name: 'Jours gagnés par modèle' }));
    expect(tally.getByText(/AROME : 2 jours/)).toBeInTheDocument();
    expect(tally.getByText(/ARPEGE : 1 jour$/)).toBeInTheDocument();
    expect(screen.getByText(/pas forcément le plus juste en moyenne/)).toBeInTheDocument();
  });

  it('ne rend rien sans deux modeles comparables', () => {
    const { container } = render(<ReliabilityCalendar rows={[ROWS[0] as (typeof ROWS)[number]]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
