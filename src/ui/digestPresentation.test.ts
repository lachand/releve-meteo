import { describe, expect, it } from 'vitest';
import type { Briefing } from '../domain/briefing';
import type { DayDigest } from '../domain/dayDigest';
import { digestBody } from './digestPresentation';

const briefing: Briefing = {
  model: 'arome',
  temperature: 14,
  others: 6,
  meanGap: 0.8,
  maxGap: 1.9,
  confidence: 'high',
  drivers: [],
};

const digest: DayDigest = { tempMin: 9.4, tempMax: 18.2, rainMm: 2.4, gustMax: 47 };

const plain = (text: string | null) => (text ?? '').replace(/\u00a0/g, ' ');

describe('digestBody', () => {
  it('donne la phrase du bulletin, modele nomme, puis les 24 heures', () => {
    expect(plain(digestBody(briefing, digest, 'kmh'))).toBe(
      'AROME prévoit 14 °C. Les 6 autres modèles s’en écartent de 0,8 °C en moyenne, au plus 1,9 °C : confiance élevée. Sur 24 h : de 9 à 18 °C, 2,4 mm de pluie, rafales jusqu’à 47 km/h.',
    );
  });

  it('suit l unite de vent choisie', () => {
    expect(plain(digestBody(null, digest, 'kt'))).toContain('rafales jusqu’à 25 kt');
  });

  it('dit « pas de pluie » quand le cumul est connu et nul, et omet ce qui est absent', () => {
    expect(plain(digestBody(null, { ...digest, rainMm: 0 }, 'kmh'))).toContain('pas de pluie');
    const sparse = plain(
      digestBody(null, { tempMin: null, tempMax: null, rainMm: null, gustMax: 30 }, 'kmh'),
    );
    expect(sparse).toBe('Sur 24 h : rafales jusqu’à 30 km/h.');
    expect(sparse).not.toContain('pluie');
    expect(sparse).not.toContain('°C');
  });

  it('se contente de la phrase du bulletin sans resume de 24 heures, et rien sans rien', () => {
    expect(plain(digestBody(briefing, null, 'kmh'))).toMatch(/^AROME prévoit 14 °C\./);
    expect(plain(digestBody(briefing, null, 'kmh'))).not.toContain('Sur 24');
    expect(digestBody(null, null, 'kmh')).toBeNull();
    expect(
      digestBody(null, { tempMin: null, tempMax: null, rainMm: null, gustMax: null }, 'kmh'),
    ).toBeNull();
  });
});
