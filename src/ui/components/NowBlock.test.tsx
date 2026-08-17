import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HourlyPoint } from '../../domain/types';
import { NowBlock } from './NowBlock';

const measure = (value: number | null) => ({ value, provenance: 'forecast' as const });

const point: HourlyPoint = {
  time: '2026-08-17T14:00',
  temperature: measure(14.2),
  precipitation: measure(0),
  windSpeed: measure(12),
  windGust: measure(24),
  windDirection: measure(315),
  pressure: measure(1014),
  dewPoint: measure(9),
  cloudCover: measure(40),
  radiation: measure(200),
  weatherCode: 1,
};

describe('NowBlock', () => {
  it('affiche la temperature et le modele actif', () => {
    const { container } = render(<NowBlock point={point} model="arome" />);
    expect(screen.getByText('14,2 °C')).toBeInTheDocument();
    expect(screen.getByText('AROME')).toBeInTheDocument();
    expect(container.textContent).toContain('raf. 24,0 km/h');
  });

  it("affiche un tiret plutot qu'un zero pour une mesure absente", () => {
    const partial: HourlyPoint = { ...point, temperature: measure(null) };
    render(<NowBlock point={partial} model="arome" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0,0 °C')).not.toBeInTheDocument();
  });

  it("affiche un message plutot qu'un ecran vide quand aucun modele ne couvre cet instant", () => {
    render(<NowBlock point={null} model={null} />);
    expect(screen.getByText(/Aucune echeance/)).toBeInTheDocument();
  });
});
