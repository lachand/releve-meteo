import { describe, expect, it } from 'vitest';
import { explainActiveModel } from './modelExplanation';

describe('explainActiveModel', () => {
  it('explique le cas nominal AROME', () => {
    const text = explainActiveModel('arome', 0, ['arome', 'arpege', 'icon_eu', 'gfs']);
    expect(text).toContain('AROME');
    expect(text).toContain('36 h');
  });

  it("mentionne l'indisponibilite quand un modele plus fin manque pour ce lieu", () => {
    const text = explainActiveModel('arpege', 0, ['arpege', 'icon_eu', 'gfs']);
    expect(text).toContain('AROME');
    expect(text).toContain('indisponible');
    expect(text).toContain('96 h');
  });

  it('mentionne les deux modeles indisponibles au pluriel', () => {
    const text = explainActiveModel('icon_eu', 0, ['icon_eu', 'gfs']);
    expect(text).toContain('AROME, ARPEGE');
    expect(text).toContain('sont indisponibles');
  });

  it("explique la progression normale de la cascade quand l'echeance depasse la portee", () => {
    const text = explainActiveModel('arpege', 50, ['arome', 'arpege', 'icon_eu', 'gfs']);
    expect(text).toContain('portée des modèles plus fins');
    expect(text).toContain('ARPEGE');
  });
});
