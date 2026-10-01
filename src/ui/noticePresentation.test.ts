import { describe, expect, it } from 'vitest';
import type { PhenomenonEpisode } from '../domain/phenomena';
import {
  lightningSentence,
  pollenSentence,
  rainSentence,
  violentSentence,
  violentTitle,
} from './noticePresentation';

const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

const storm: PhenomenonEpisode = {
  kind: 'thunderstorm',
  level: 'high',
  start: '2026-09-29T14:00',
  end: '2026-09-29T18:00',
  peakTime: '2026-09-29T16:00',
  evidence: { peakValue: null, cape: 1800, weatherCode: 95 },
  model: 'arome',
};

describe('violentTitle et violentSentence', () => {
  it('nomme le phenomene et son niveau, la periode, la preuve et le modele', () => {
    expect(violentTitle(storm)).toBe('Orage, risque fort');
    expect(plain(violentSentence(storm))).toBe(
      'Mardi 14h à 18h. Énergie convective (CAPE) jusqu’à 1 800 J/kg. Selon AROME.',
    );
  });

  it('omet le modele quand il est inconnu', () => {
    expect(violentSentence({ ...storm, model: null })).not.toContain('Selon');
  });
});

describe('rainSentence', () => {
  it('dit quand, selon quel modele, et le cumul', () => {
    expect(plain(rainSentence({ start: '2026-09-28T13:00', totalMm: 3.2, model: 'arpege' }))).toBe(
      'Pluie attendue dès lundi 13h selon ARPEGE : 3,2 mm sur 24 h.',
    );
  });
});

describe('pollenSentence', () => {
  it('liste les pollens eleves avec leur pointe, et la source', () => {
    expect(
      plain(
        pollenSentence([
          { kind: 'birch', peak: 150.4 },
          { kind: 'grass', peak: 80 },
        ]),
      ),
    ).toBe(
      'Pollens élevés : Bouleau (150 grains/m³), Graminées (80 grains/m³). Prévision CAMS Europe.',
    );
  });

  it('garde le nom brut d un pollen inconnu', () => {
    expect(plain(pollenSentence([{ kind: 'cypres', peak: 90 }]))).toContain('cypres (90');
  });
});

describe('lightningSentence', () => {
  const T = Date.UTC(2026, 9, 1, 13, 10);

  it('dit la distance, la periode en heure de Paris, la taille des zones et la nature optique', () => {
    const text = plain(
      lightningSentence({ cells: 4, nearestKm: 14.6, firstTime: T, lastTime: T + 600_000 }),
    );
    expect(text).toBe(
      'Éclairs vus par le satellite MTG à environ 15 km, entre 15:10 et 15:20 (4 zones de 2 km). Observation optique, pas un impact localisé au sol.',
    );
  });

  it('dit « sur place » tout pres, une heure unique et une seule zone', () => {
    const text = plain(lightningSentence({ cells: 1, nearestKm: 1.2, firstTime: T, lastTime: T }));
    expect(text).toContain('MTG sur place, à 15:10 (1 zone de 2 km)');
  });
});
