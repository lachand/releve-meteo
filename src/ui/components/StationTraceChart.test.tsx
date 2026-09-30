import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StationTrace } from '../../domain/stationTrace';
import { StationTraceChart } from './StationTraceChart';

const TRACE: StationTrace = {
  timeline: ['2026-09-28T10:00', '2026-09-28T11:00', '2026-09-28T12:00'],
  observed: [24, null, 26],
  byModel: { arome: [24.5, 25.1, 27.4], gfs: [23, 24, 24.8] },
  drifts: [
    { model: 'gfs', recent: -1.1, earlier: -0.2, trend: 'widening' },
    { model: 'arome', recent: 0.9, earlier: 0.9, trend: 'steady' },
  ],
};

describe('StationTraceChart', () => {
  it('nomme la station et la plage d heures dans le nom accessible du graphique', () => {
    render(<StationTraceChart trace={TRACE} activeModel="arome" stationName="Lyon / Bron" />);
    expect(
      screen.getByRole('img', {
        name: 'Température mesurée à Lyon / Bron et prévue par chaque modèle, de 10h à 12h',
      }),
    ).toBeInTheDocument();
  });

  it('marque le modele retenu et ecrit la derive de chacun, du plus proche au plus eloigne', () => {
    render(<StationTraceChart trace={TRACE} activeModel="arome" stationName="Lyon / Bron" />);
    const key = within(screen.getByRole('list', { name: 'Légende du graphique' }));
    expect(key.getByText('retenu')).toBeInTheDocument();
    const drifts = within(screen.getByRole('list', { name: 'Dérive de chaque modèle' }));
    const items = drifts.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('GFS');
    expect(items[0]).toHaveTextContent('1,1 °C trop froid depuis 3 h : l’écart s’élargit');
    expect(items[1]).toHaveTextContent('AROME');
    expect(items[1]).toHaveTextContent('l’écart est stable');
  });

  it('expose la table equivalente, avec un trou pour l heure sans mesure', () => {
    render(<StationTraceChart trace={TRACE} activeModel={null} stationName="Lyon / Bron" />);
    const table = screen.getByRole('table', { name: /Température heure par heure/ });
    const rows = within(table).getAllByRole('row');
    // En-tete, puis une ligne par heure.
    expect(rows).toHaveLength(4);
    const missing = within(rows[2] as HTMLElement).getAllByRole('cell');
    expect(missing[0]?.textContent).toBe('–');
  });
});
