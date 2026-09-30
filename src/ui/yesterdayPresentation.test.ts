import { describe, expect, it } from 'vitest';
import type { YesterdayModel, YesterdayReview } from '../domain/yesterdayReview';
import { biasWords, yesterdayHeadline } from './yesterdayPresentation';

function model(id: YesterdayModel['model'], bias: number, mae = Math.abs(bias)): YesterdayModel {
  return { model: id, pairs: 24, bias, mae, minGap: bias, maxGap: bias };
}

function review(models: readonly YesterdayModel[]): YesterdayReview {
  return { date: '2026-09-27', hours: 24, observedMin: 10.4, observedMax: 32.6, models };
}

describe('biasWords', () => {
  it('dit le sens et l amplitude de l ecart moyen', () => {
    expect(biasWords(0.84)).toBe('0,8\u00a0°C trop chaud en moyenne');
    expect(biasWords(-1.26)).toBe('1,3\u00a0°C trop froid en moyenne');
  });

  it('parle d absence de biais dans l arrondi des releves', () => {
    expect(biasWords(0.3)).toBe('sans biais net');
    expect(biasWords(-0.49)).toBe('sans biais net');
  });
});

describe('yesterdayHeadline', () => {
  it('nomme la station, la mesure, le modele le plus juste et la provenance de la prevision', () => {
    expect(
      yesterdayHeadline(review([model('arpege', 0.84), model('gfs', -2.1)]), 'Lyon / Bron'),
    ).toBe(
      'Hier, dimanche 27 septembre 2026, la station Lyon / Bron a mesuré de 10\u00a0°C à 33\u00a0°C. ' +
        'Prévu la veille, c’est ARPEGE qui a vu le plus juste : 0,8\u00a0°C trop chaud en moyenne ' +
        '(24 heures comparées).',
    );
  });

  it('reste honnete quand le meilleur modele n a pas de biais', () => {
    expect(yesterdayHeadline(review([model('arome', 0.1, 0.9)]), 'Bron')).toContain(
      'c’est AROME qui a vu le plus juste : sans biais net, erreur moyenne de 0,9\u00a0°C',
    );
  });
});
