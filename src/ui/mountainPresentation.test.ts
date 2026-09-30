import { describe, expect, it } from 'vitest';
import type { MountainOutlook } from '../domain/mountainOutlook';
import { freezingSentence, shouldShowMountain, snowSentence } from './mountainPresentation';

function outlook(overrides: Partial<MountainOutlook> = {}): MountainOutlook {
  return {
    freezingNow: 2050,
    relativeNow: 550,
    freezingMin: 1800,
    freezingMax: 2375,
    freezingModel: 'arome',
    snowCm: 3.4,
    snowHours: 3,
    firstSnow: '2026-09-28T14:00',
    snowModels: ['arome'],
    ...overrides,
  };
}

describe('freezingSentence', () => {
  it('place l isotherme au-dessus du lieu, avec ses extremes et le modele', () => {
    expect(freezingSentence(outlook())).toBe(
      'L’isotherme 0\u00a0°C est à 2\u202f050\u00a0m, 550\u00a0m au-dessus de vous (selon AROME). Sur 48 h, entre 1\u202f800\u00a0m et 2\u202f375\u00a0m.',
    );
  });

  it('la place sous le lieu : la neige peut tomber jusqu ici', () => {
    expect(freezingSentence(outlook({ freezingNow: 900, relativeNow: -300 }))).toMatch(
      /à 900\u00a0m, 300\u00a0m sous vous : la neige peut descendre jusqu’ici \(selon AROME\)/,
    );
  });

  it('avoue l absence de valeur plutot que d inventer une altitude', () => {
    expect(
      freezingSentence(
        outlook({
          freezingNow: null,
          relativeNow: null,
          freezingMin: null,
          freezingMax: null,
          freezingModel: null,
        }),
      ),
    ).toBe('Isotherme 0\u00a0°C : pas de valeur des modèles.');
  });
});

describe('snowSentence', () => {
  it('donne le cumul, la duree, le debut et le modele', () => {
    expect(snowSentence(outlook())).toBe(
      'Neige : 3,4\u00a0cm sur 72 h, en 3 heures, dès lundi 14h (selon AROME).',
    );
  });

  it('accorde une heure de neige et nomme les modeles qui se relaient', () => {
    expect(snowSentence(outlook({ snowHours: 1, snowModels: ['arome', 'icon_eu'] }))).toBe(
      'Neige : 3,4\u00a0cm sur 72 h, en 1 heure, dès lundi 14h (selon AROME, puis ICON-EU).',
    );
  });

  it('dit pas de neige annoncee, et pas de valeur, sans confondre les deux', () => {
    expect(
      snowSentence(outlook({ snowCm: 0, snowHours: 0, firstSnow: null, snowModels: [] })),
    ).toBe('Pas de neige annoncée sur 72 h.');
    expect(
      snowSentence(outlook({ snowCm: null, snowHours: 0, firstSnow: null, snowModels: [] })),
    ).toBe('Neige : pas de valeur des modèles.');
  });
});

describe('shouldShowMountain', () => {
  it('montre la section en terrain de montagne, en altitude, ou des qu il neige', () => {
    expect(
      shouldShowMountain({ kind: 'mountain', elevation: 300, outlook: outlook({ snowCm: 0 }) }),
    ).toBe(true);
    expect(
      shouldShowMountain({ kind: 'plain', elevation: 900, outlook: outlook({ snowCm: 0 }) }),
    ).toBe(true);
    expect(
      shouldShowMountain({ kind: 'plain', elevation: 170, outlook: outlook({ snowCm: 0.2 }) }),
    ).toBe(true);
  });

  it('la cache en plaine sans neige, et sans vue', () => {
    expect(
      shouldShowMountain({ kind: 'plain', elevation: 170, outlook: outlook({ snowCm: 0 }) }),
    ).toBe(false);
    expect(
      shouldShowMountain({ kind: 'plain', elevation: 170, outlook: outlook({ snowCm: null }) }),
    ).toBe(false);
    expect(shouldShowMountain({ kind: 'mountain', elevation: 1500, outlook: null })).toBe(false);
    expect(
      shouldShowMountain({ kind: null, elevation: 170, outlook: outlook({ snowCm: 0 }) }),
    ).toBe(false);
  });
});
