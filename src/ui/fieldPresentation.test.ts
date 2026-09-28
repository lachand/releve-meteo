import { describe, expect, it } from 'vitest';
import type { FillableField } from '../domain/modelCascade';
import type { ModelId } from '../domain/types';
import { describeFilledFrom } from './fieldPresentation';

describe('describeFilledFrom', () => {
  it('retourne null quand rien n a ete complete', () => {
    expect(describeFilledFrom({})).toBeNull();
  });

  it('redige un seul champ complete par un seul modele', () => {
    const filled: Partial<Record<FillableField, ModelId>> = { cloudCover: 'arome_france' };
    expect(describeFilledFrom(filled)).toBe('nébulosité : AROME France');
  });

  it('joint deux champs du meme modele avec "et"', () => {
    const filled: Partial<Record<FillableField, ModelId>> = {
      cloudCover: 'arome_france',
      pressure: 'arome_france',
    };
    expect(describeFilledFrom(filled)).toBe('nébulosité et pression : AROME France');
  });

  it('joint trois champs ou plus du meme modele avec des virgules puis "et"', () => {
    const filled: Partial<Record<FillableField, ModelId>> = {
      cloudCover: 'arome_france',
      pressure: 'arome_france',
      visibility: 'arome_france',
    };
    expect(describeFilledFrom(filled)).toBe('nébulosité, pression et visibilité : AROME France');
  });

  it('groupe par modele et separe les groupes par un point-virgule', () => {
    const filled: Partial<Record<FillableField, ModelId>> = {
      cloudCover: 'arome_france',
      visibility: 'gfs',
    };
    expect(describeFilledFrom(filled)).toBe('nébulosité : AROME France ; visibilité : GFS');
  });
});
