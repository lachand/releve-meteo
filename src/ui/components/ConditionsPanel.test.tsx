import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DailyPoint, HourlyPoint } from '../../domain/types';
import { ConditionsPanel } from './ConditionsPanel';

const measure = (value: number | null) => ({ value, provenance: 'forecast' as const });

const nowPoint: HourlyPoint = {
  time: '2026-08-17T14:00',
  temperature: measure(14),
  precipitation: measure(0),
  windSpeed: measure(4),
  windGust: measure(10),
  windDirection: measure(180),
  pressure: measure(1013),
  dewPoint: measure(13.5),
  cloudCover: measure(50),
  radiation: measure(0),
  humidity: measure(65),
  apparentTemperature: measure(13),
  precipitationProbability: measure(null),
  snowfall: measure(0),
  cape: measure(0),
  visibility: measure(20000),
  freezingLevel: measure(3000),
  weatherCode: 1,
  isDay: true,
};

const today: DailyPoint = {
  date: '2026-08-17',
  tempMax: measure(20),
  tempMin: measure(-1),
  precipitationSum: measure(0),
  uvIndexMax: measure(5.4),
  windGustMax: measure(30),
  windSpeedMax: measure(15),
  windDirectionDominant: measure(220),
  precipitationHours: measure(0),
  snowfallSum: measure(0),
  sunrise: '2026-08-17T06:30',
  sunset: '2026-08-17T21:05',
  weatherCode: 1,
};

describe('ConditionsPanel', () => {
  it('affiche le point de rosee, le risque de gel et de brouillard, UV, lever/coucher', () => {
    render(<ConditionsPanel nowPoint={nowPoint} today={today} />);
    expect(screen.getByText('13,5 °C')).toBeInTheDocument();
    // tempMin -1 -> gel probable ; ecart T/Td 0,5 et vent 4 km/h -> brouillard probable aussi.
    expect(screen.getAllByText('probable')).toHaveLength(2);
    expect(screen.getByText('risque de gel').closest('tr')?.textContent).toContain('probable');
    expect(screen.getByText('risque de brouillard').closest('tr')?.textContent).toContain(
      'probable',
    );
    expect(screen.getByText('5,4')).toBeInTheDocument();
    expect(screen.getByText('06:30')).toBeInTheDocument();
    expect(screen.getByText('21:05')).toBeInTheDocument();
  });

  it('donne la duree du jour et les deux heures dorees', () => {
    render(<ConditionsPanel nowPoint={nowPoint} today={today} />);
    // 6 h 30 a 21 h 05 : 14 h 35.
    expect(screen.getByText('durée du jour').closest('tr')).toHaveTextContent('14 h 35');
    expect(screen.getByText('heures dorées').closest('tr')).toHaveTextContent(
      '06:30 à 07:30, puis 20:05 à 21:05',
    );
  });

  it('ne donne ni duree ni heures dorees sans lever ou coucher', () => {
    const partial: DailyPoint = { ...today, sunrise: null };
    render(<ConditionsPanel nowPoint={nowPoint} today={partial} />);
    expect(screen.getByText('durée du jour').closest('tr')).toHaveTextContent('–');
    expect(screen.getByText('heures dorées').closest('tr')).toHaveTextContent('–');
  });

  it("affiche un tiret plutot qu'un zero quand une donnee manque", () => {
    const partial: DailyPoint = { ...today, uvIndexMax: measure(null), sunrise: null };
    render(<ConditionsPanel nowPoint={null} today={partial} />);
    expect(screen.getAllByText('–').length).toBeGreaterThan(0);
  });

  it("n'affiche pas de risque de brouillard sans mesure complete", () => {
    const withoutWind: HourlyPoint = { ...nowPoint, windSpeed: measure(null) };
    render(<ConditionsPanel nowPoint={withoutWind} today={today} />);
    const row = screen.getByText('risque de brouillard').closest('tr');
    expect(row?.textContent).toContain('–');
  });
});
