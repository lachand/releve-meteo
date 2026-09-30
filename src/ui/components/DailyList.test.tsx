import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DailyValues } from '../../../tests/factories';
import { dailyPoint } from '../../../tests/factories';
import type { DailyFillable } from '../../domain/dailyBlend';
import type { BlendedDay } from '../../domain/dailyBlend';
import type { EnsembleDay } from '../../domain/ensemble';
import type { ModelId } from '../../domain/types';
import { MISSING } from '../format';
import { DailyList } from './DailyList';

function blendedDay(
  date: string,
  values: DailyValues,
  model: ModelId = 'arome',
  filledFrom: Partial<Record<DailyFillable, ModelId>> = {},
): BlendedDay {
  return { ...dailyPoint(date, values), model, filledFrom };
}

function ensembleDay(
  date: string,
  rainProbability: number | null,
  extra: Partial<Pick<EnsembleDay, 'frostProbability' | 'gustProbability'>> = {},
): EnsembleDay {
  return {
    date,
    tempMax: null,
    tempMin: null,
    precipitation: null,
    rainProbability,
    heavyRainProbability: null,
    frostProbability: null,
    gustProbability: null,
    ...extra,
    memberCount: 20,
  };
}

/** data-donnee dans l'ordre du balisage : min, max, pluie, vent. */
function dataCells(row: HTMLElement): readonly string[] {
  return Array.from(row.querySelectorAll('[data-donnee]')).map((el) => el.textContent ?? '');
}

describe('DailyList, probabilites de gel et de rafales', () => {
  it('ecrit la part des membres qui annoncent du gel ou des rafales fortes, quand elle compte', () => {
    const days = [blendedDay('2026-08-17', {})];
    const ensemble = [
      ensembleDay('2026-08-17', 0.1, { frostProbability: 0.3, gustProbability: 0.45 }),
    ];
    render(<DailyList days={days} ensemble={ensemble} windUnit="kmh" today="2026-08-17" />);
    expect(screen.getByText(/gel ens\.\s30\s%/)).toBeInTheDocument();
    expect(screen.getByText(/60\skm\/h et plus ens\.\s45\s%/)).toBeInTheDocument();
  });

  it('se tait sous 10 % et quand l ensemble ne dit rien : jamais 0 % par defaut', () => {
    const days = [blendedDay('2026-08-17', {})];
    const ensemble = [
      ensembleDay('2026-08-17', 0.1, { frostProbability: 0.05, gustProbability: null }),
    ];
    render(<DailyList days={days} ensemble={ensemble} windUnit="kmh" today="2026-08-17" />);
    expect(screen.queryByText(/gel ens\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/et plus ens\./)).not.toBeInTheDocument();
  });

  it('donne le seuil de rafales dans l unite choisie', () => {
    const days = [blendedDay('2026-08-17', {})];
    const ensemble = [ensembleDay('2026-08-17', 0.1, { gustProbability: 0.5 })];
    render(<DailyList days={days} ensemble={ensemble} windUnit="kt" today="2026-08-17" />);
    expect(screen.getByText(/32\skt et plus ens\.\s50\s%/)).toBeInTheDocument();
  });
});

describe('DailyList', () => {
  it("affiche un etat vide quand aucune journee complete n'est couverte", () => {
    render(<DailyList days={[]} ensemble={null} windUnit="kmh" today="2026-08-17" />);
    expect(screen.getByText('Aucune journée complète couverte par un modèle.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('libelle Aujourd’hui la journee courante, le jour de semaine pour les autres', () => {
    const days = [blendedDay('2026-08-17', {}), blendedDay('2026-08-18', {})];
    render(<DailyList days={days} ensemble={null} windUnit="kmh" today="2026-08-17" />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText('Aujourd’hui')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('mardi')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).queryByText('Aujourd’hui')).not.toBeInTheDocument();
  });

  it('affiche temperatures, pluie, vent et modele de chaque ligne', () => {
    const days = [
      blendedDay(
        '2026-08-17',
        { tempMin: 10, tempMax: 21, precipitationSum: 3.5, precipitationHours: 2, windGustMax: 42 },
        'arpege',
      ),
    ];
    render(<DailyList days={days} ensemble={null} windUnit="kmh" today="2026-08-17" />);
    const row = screen.getAllByRole('listitem')[0] as HTMLElement;
    const [min, max, rain, wind] = dataCells(row);
    expect(min).toBe('10°');
    expect(max).toBe('21°');
    expect(rain).toBe('3,5mm');
    expect(wind).toBe('42km/h');
    expect(within(row).getByText('2 h de pluie')).toBeInTheDocument();
    expect(within(row).getByText('ARPEGE')).toBeInTheDocument();
  });

  it('affiche "sec" quand aucune heure de pluie n est prevue', () => {
    const days = [blendedDay('2026-08-17', { precipitationHours: 0 })];
    render(<DailyList days={days} ensemble={null} windUnit="kmh" today="2026-08-17" />);
    expect(screen.getByText('sec')).toBeInTheDocument();
  });

  it('affiche MISSING pour une rafale absente, jamais 0', () => {
    const days = [blendedDay('2026-08-17', { windGustMax: null })];
    render(<DailyList days={days} ensemble={null} windUnit="kmh" today="2026-08-17" />);
    const row = screen.getAllByRole('listitem')[0] as HTMLElement;
    const [, , , wind] = dataCells(row);
    expect(wind).toBe(MISSING);
  });

  it('ajoute la probabilite de pluie de l ensemble quand elle est disponible pour la date', () => {
    const days = [blendedDay('2026-08-17', { precipitationHours: 1 })];
    const ensemble = [ensembleDay('2026-08-17', 0.4)];
    render(<DailyList days={days} ensemble={ensemble} windUnit="kmh" today="2026-08-17" />);
    expect(screen.getByText(/ens\. 40 %/)).toBeInTheDocument();
  });

  it('n ajoute rien quand l ensemble n a pas d entree pour cette date', () => {
    const days = [blendedDay('2026-08-17', {})];
    const ensemble = [ensembleDay('2026-08-20', 0.4)];
    render(<DailyList days={days} ensemble={ensemble} windUnit="kmh" today="2026-08-17" />);
    expect(screen.queryByText(/ens\./)).not.toBeInTheDocument();
  });
});
