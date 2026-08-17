import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DailyPoint } from '../../domain/types';
import { SevenDayView } from './SevenDayView';

const measure = (value: number | null) => ({ value, provenance: 'forecast' as const });

function day(
  date: string,
  tempMax: number | null,
  tempMin: number | null,
  precip: number | null,
): DailyPoint {
  return {
    date,
    tempMax: measure(tempMax),
    tempMin: measure(tempMin),
    precipitationSum: measure(precip),
    uvIndexMax: measure(5),
    sunrise: `${date}T06:30`,
    sunset: `${date}T21:00`,
    weatherCode: 1,
  };
}

describe('SevenDayView', () => {
  it('affiche le jour, les temperatures et la precipitation', () => {
    render(<SevenDayView days={[day('2026-08-17', 22, 12, 0)]} />);
    expect(screen.getByText('Lun. 17')).toBeInTheDocument();
    expect(screen.getByText('0.0 mm')).toBeInTheDocument();
  });

  it("affiche un tiret plutot qu'un zero pour une precipitation absente", () => {
    render(<SevenDayView days={[day('2026-08-17', 22, 12, null)]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it("invite a agir quand aucune journee n'est disponible", () => {
    render(<SevenDayView days={[]} />);
    expect(screen.getByText(/Aucune prevision quotidienne/)).toBeInTheDocument();
  });
});
