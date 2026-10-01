import { describe, expect, it } from 'vitest';
import type { DayNormal } from '../domain/normals';
import { NORMALS_CAVEAT, normalSentence } from './normalsPresentation';

const normal: DayNormal = { tempMax: 21, tempMin: 11, years: 30 };
const plain = (text: string | null) => (text ?? '').replace(/\u00a0/g, ' ');

describe('normalSentence', () => {
  it('dit le modele, le maximum prevu et l ecart a la normale, au-dessus ou au-dessous', () => {
    expect(
      plain(
        normalSentence({
          model: 'arome',
          forecastMax: 24.4,
          normal,
          anomaly: { max: 3.4, min: 0 },
        }),
      ),
    ).toBe(
      'AROME prévoit un maximum de 24 °C aujourd’hui, 3,4 °C au-dessus de la normale 1991-2020 (21 °C).',
    );
    expect(
      plain(
        normalSentence({ model: 'gfs', forecastMax: 17, normal, anomaly: { max: -4, min: 0 } }),
      ),
    ).toContain('4,0 °C au-dessous de la normale');
  });

  it('dit « proche » sous un degre d ecart', () => {
    expect(
      plain(
        normalSentence({
          model: 'arome',
          forecastMax: 21.5,
          normal,
          anomaly: { max: 0.5, min: 0 },
        }),
      ),
    ).toContain('proche de la normale 1991-2020 (21 °C)');
  });

  it('ne compare pas un maximum absent', () => {
    expect(
      normalSentence({
        model: 'arome',
        forecastMax: null,
        normal,
        anomaly: { max: null, min: null },
      }),
    ).toBeNull();
    expect(
      normalSentence({ model: 'arome', forecastMax: 20, normal, anomaly: { max: null, min: 0 } }),
    ).toBeNull();
  });

  it('dit que la normale est une estimation', () => {
    expect(NORMALS_CAVEAT).toContain('réanalyse ERA5');
    expect(NORMALS_CAVEAT).toContain('pas une mesure de station');
  });
});
