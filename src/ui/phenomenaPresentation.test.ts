import { describe, expect, it } from 'vitest';
import type { PhenomenonEpisode, PhenomenonKind } from '../domain/phenomena';
import type { ModelId } from '../domain/types';
import { episodePeriod, episodeSource, evidenceSentence } from './phenomenaPresentation';

function episode(
  kind: PhenomenonKind,
  overrides: {
    readonly start?: string;
    readonly end?: string;
    readonly peakValue?: number | null;
    readonly cape?: number | null;
    readonly model?: ModelId | null;
  } = {},
): PhenomenonEpisode {
  const start = overrides.start ?? '2026-08-17T14:00';
  return {
    kind,
    level: 'moderate',
    start,
    end: overrides.end ?? start,
    peakTime: start,
    evidence: {
      peakValue: overrides.peakValue ?? null,
      cape: overrides.cape ?? null,
      weatherCode: null,
    },
    model: 'model' in overrides ? (overrides.model ?? null) : 'arome',
  };
}

describe('evidenceSentence', () => {
  it('orage : phrase generique sans CAPE, sinon la valeur de pointe', () => {
    expect(evidenceSentence(episode('thunderstorm'))).toBe('Code de temps orageux.');
    expect(evidenceSentence(episode('thunderstorm', { cape: 800 }))).toBe(
      'Énergie convective (CAPE) jusqu’à 800 J/kg.',
    );
  });

  it('forte pluie : cumul de pointe horaire', () => {
    expect(evidenceSentence(episode('heavyRain', { peakValue: 9.2 }))).toBe(
      'Jusqu’à 9,2 mm en une heure.',
    );
  });

  it('neige : phrase generique sans cumul, sinon le cumul de pointe', () => {
    expect(evidenceSentence(episode('snow'))).toBe('Code de temps neigeux.');
    expect(evidenceSentence(episode('snow', { peakValue: 4 }))).toBe('Jusqu’à 4 cm en une heure.');
  });

  it('pluie verglacante : phrase generique sans temperature, sinon la temperature', () => {
    expect(evidenceSentence(episode('freezingRain'))).toBe('Code de pluie ou bruine verglaçante.');
    expect(evidenceSentence(episode('freezingRain', { peakValue: -1.6 }))).toBe('Pluie par −2 °C.');
  });

  it('gel : temperature minimale', () => {
    expect(evidenceSentence(episode('frost', { peakValue: -4.2 }))).toBe('Minimum −4 °C.');
  });

  it('brouillard : phrase generique sans visibilite, sinon la visibilite de pointe', () => {
    expect(evidenceSentence(episode('fog'))).toBe('Air saturé et vent faible.');
    expect(evidenceSentence(episode('fog', { peakValue: 150 }))).toBe('Visibilité jusqu’à 150 m.');
  });

  it('vent fort : rafale de pointe', () => {
    expect(evidenceSentence(episode('strongWind', { peakValue: 92 }))).toBe(
      'Rafales jusqu’à 92 km/h.',
    );
  });

  it('chaleur : temperature de pointe', () => {
    expect(evidenceSentence(episode('heat', { peakValue: 36.7 }))).toBe('Jusqu’à 37 °C.');
  });
});

describe('episodePeriod', () => {
  it('affiche une seule heure quand debut et fin coincident', () => {
    expect(episodePeriod(episode('frost', { start: '2026-08-17T06:00' }))).toBe('lundi 06h');
  });

  it('affiche seulement l heure de fin pour un episode dans la meme journee', () => {
    const result = episodePeriod(
      episode('heavyRain', { start: '2026-08-17T14:00', end: '2026-08-17T18:00' }),
    );
    expect(result).toBe('lundi 14h à 18h');
  });

  it('affiche jour et heure de fin pour un episode a cheval sur deux jours', () => {
    const result = episodePeriod(
      episode('snow', { start: '2026-08-17T22:00', end: '2026-08-18T02:00' }),
    );
    expect(result).toBe('lundi 22h à mardi 02h');
  });
});

describe('episodeSource', () => {
  it('cite le modele quand il est connu', () => {
    expect(episodeSource(episode('fog', { model: 'icon_d2' }))).toBe('selon ICON-D2');
  });

  it('retourne null quand aucun modele n est identifie', () => {
    expect(episodeSource(episode('fog', { model: null }))).toBeNull();
  });
});
