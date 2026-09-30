import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SolarOutlook } from '../../domain/solarOutlook';
import { SolarPanel } from './SolarPanel';

const OUTLOOK: SolarOutlook = {
  hours: [
    { time: '2026-09-28T11:00', kw: 2.4 },
    { time: '2026-09-28T12:00', kw: null },
  ],
  days: [
    { date: '2026-09-28', kwh: 18.4, peakKw: 3.4, strongHours: 6, favourable: true },
    { date: '2026-09-29', kwh: null, peakKw: null, strongHours: null, favourable: null },
  ],
  models: ['arome', 'gfs'],
};

describe('SolarPanel', () => {
  it('dit chaque journee, avec la production estimee ou son absence', () => {
    render(<SolarPanel outlook={OUTLOOK} peakKwp={5} today="2026-09-28" />);
    expect(
      screen.getByText(/Aujourd’hui : environ 18,4 kWh estimés, journée favorable au surplus/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Demain : production inconnue/)).toBeInTheDocument();
  });

  it('presente l estimation comme telle, avec les modeles, la puissance et ses limites', () => {
    render(<SolarPanel outlook={OUTLOOK} peakKwp={5} today="2026-09-28" />);
    const note = screen.getByText(/Estimation, pas une mesure/).closest('p') as HTMLElement;
    expect(note).toHaveTextContent('AROME, puis GFS');
    expect(note).toHaveTextContent('5,0 kWc');
    expect(note).toHaveTextContent('20 % de pertes forfaitaires');
    expect(note).toHaveTextContent('ni des masques');
    expect(note).toHaveTextContent('consommation');
  });

  it('decrit la courbe aux lecteurs d ecran', () => {
    render(<SolarPanel outlook={OUTLOOK} peakKwp={5} today="2026-09-28" />);
    expect(
      screen.getByRole('img', {
        name: /Puissance solaire estimée heure par heure sur 48 heures, pour 5,0 kWc/,
      }),
    ).toBeInTheDocument();
  });
});
