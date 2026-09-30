import { describe, expect, it } from 'vitest';
import { SOLAR } from '../domain/solarOutlook';
import type { SolarDay } from '../domain/solarOutlook';
import { solarCriterion, solarDaySentence } from './solarPresentation';

function day(overrides: Partial<SolarDay> = {}): SolarDay {
  return {
    date: '2026-09-28',
    kwh: 18.36,
    peakKw: 3.4,
    strongHours: 6,
    favourable: true,
    ...overrides,
  };
}

describe('solarDaySentence', () => {
  it('dit la production estimee et le verdict, avec le nombre d heures qui le fonde', () => {
    expect(solarDaySentence(day(), '2026-09-28')).toBe(
      'Aujourd’hui : environ 18,4\u00a0kWh estimés, journée favorable au surplus (6 h au-dessus de 40\u00a0% de la puissance crête).',
    );
  });

  it('dit demain pour le lendemain, et ne promet rien quand la journee est couverte', () => {
    expect(
      solarDaySentence(
        day({ date: '2026-09-29', kwh: 4, strongHours: 0, favourable: false }),
        '2026-09-28',
      ),
    ).toBe(
      'Demain : environ 4\u00a0kWh estimés, journée peu favorable au surplus (0 h au-dessus de 40\u00a0% de la puissance crête).',
    );
  });

  it('avoue une production inconnue plutot que de la mettre a zero', () => {
    expect(
      solarDaySentence(
        day({ kwh: null, peakKw: null, strongHours: null, favourable: null }),
        '2026-09-28',
      ),
    ).toBe('Aujourd’hui : production inconnue, au moins une heure sans rayonnement prévu.');
  });
});

describe('solarCriterion', () => {
  it('ecrit le critere et dit que la consommation est ignoree', () => {
    const text = solarCriterion();
    expect(text).toContain(`au moins ${SOLAR.minStrongHours} h`);
    expect(text).toContain('40\u00a0%');
    expect(text).toContain('consommation');
  });
});
