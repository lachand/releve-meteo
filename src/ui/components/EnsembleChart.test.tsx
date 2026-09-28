import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EnsembleDay } from '../../domain/ensemble';
import { MISSING } from '../format';
import { EnsembleChart } from './EnsembleChart';

describe('EnsembleChart', () => {
  it('affiche un etat vide quand aucune journee d ensemble n est disponible', () => {
    render(<EnsembleChart days={[]} memberCount={50} />);
    expect(screen.getByText('Ensemble indisponible pour ce lieu.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('rend le graphique (chart.js ne dessine pas sous jsdom, sans planter) avec son libelle et sa legende', () => {
    const days: readonly EnsembleDay[] = [
      {
        date: '2026-08-17',
        tempMax: { min: 18, p10: 19, p25: 20, median: 22, p75: 24, p90: 25, max: 26 },
        tempMin: { min: 10, p10: 11, p25: 12, median: 13, p75: 14, p90: 15, max: 16 },
        precipitation: null,
        rainProbability: 0.3,
        heavyRainProbability: 0.05,
        memberCount: 50,
      },
      {
        date: '2026-08-18',
        tempMax: null,
        tempMin: null,
        precipitation: null,
        rainProbability: null,
        heavyRainProbability: null,
        memberCount: 0,
      },
    ];
    render(<EnsembleChart days={days} memberCount={50} />);
    expect(
      screen.getByRole('img', {
        name: "Éventail de l'ensemble ECMWF sur 2 jours : températures maximales et minimales avec leur incertitude, probabilité de pluie",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('ECMWF ENS, 50 membres')).toBeInTheDocument();
  });

  it('expose un tableau de donnees accessible equivalent au graphique', () => {
    const days: readonly EnsembleDay[] = [
      {
        date: '2026-08-17',
        tempMax: { min: 18, p10: 19, p25: 20, median: 22, p75: 24, p90: 25, max: 26 },
        tempMin: { min: 10, p10: 11, p25: 12, median: 13, p75: 14, p90: 15, max: 16 },
        precipitation: null,
        rainProbability: 0.3,
        heavyRainProbability: 0.05,
        memberCount: 50,
      },
      {
        date: '2026-08-18',
        tempMax: null,
        tempMin: null,
        precipitation: null,
        rainProbability: null,
        heavyRainProbability: null,
        memberCount: 0,
      },
    ];
    render(<EnsembleChart days={days} memberCount={50} />);
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    // Une ligne d'entete + une ligne par jour.
    expect(rows).toHaveLength(3);

    const firstDay = within(rows[1] as HTMLElement)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(firstDay).toEqual([
      '2026-08-17',
      '22 °C',
      '19 à 25 °C',
      '13 °C',
      '11 à 15 °C',
      '30 %',
      '5 %',
    ]);

    const secondDay = within(rows[2] as HTMLElement)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(secondDay).toEqual([
      '2026-08-18',
      `${MISSING} °C`,
      MISSING,
      `${MISSING} °C`,
      MISSING,
      MISSING,
      MISSING,
    ]);
  });
});
