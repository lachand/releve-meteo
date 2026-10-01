import { describe, expect, it } from 'vitest';
import type { WaveOutlook } from '../domain/marine';
import { SEA_CAVEAT, currentSeaSentence, peakSeaSentence } from './marinePresentation';

const plain = (text: string | null) => (text ?? '').replace(/\u00a0/g, ' ');

const OUTLOOK: WaveOutlook = {
  current: { time: '2026-09-28T10:00', height: 0.8, period: 7, direction: 270 },
  peak: { time: '2026-09-28T12:00', height: 2.1, period: 9 },
  hours: [],
};

describe('currentSeaSentence', () => {
  it('dit l etat de la mer, la hauteur, la periode et d ou viennent les vagues', () => {
    expect(plain(currentSeaSentence(OUTLOOK))).toBe(
      'Mer belle : vagues de 0,8 m, période 7 s, venant du O.',
    );
  });

  it('omet la periode et la direction quand elles manquent, et se tait sans hauteur', () => {
    const bare: WaveOutlook = {
      ...OUTLOOK,
      current: { time: '2026-09-28T10:00', height: 3, period: null, direction: null },
    };
    expect(plain(currentSeaSentence(bare))).toBe('Mer forte : vagues de 3,0 m.');
    expect(currentSeaSentence({ ...OUTLOOK, current: null })).toBeNull();
  });
});

describe('peakSeaSentence', () => {
  it('dit le pic, son heure, sa periode et l etat de la mer', () => {
    expect(plain(peakSeaSentence(OUTLOOK, 48))).toBe(
      'Pic des 48 prochaines heures : 2,1 m lundi 12h, période 9 s (mer agitée).',
    );
  });

  it('omet la periode absente, et se tait sans pic', () => {
    expect(
      plain(
        peakSeaSentence(
          { ...OUTLOOK, peak: { time: '2026-09-28T12:00', height: 1, period: null } },
          48,
        ),
      ),
    ).not.toContain('période');
    expect(peakSeaSentence({ ...OUTLOOK, peak: null }, 48)).toBeNull();
  });

  it('rappelle que ce n est ni une mesure ni un avis de navigation', () => {
    expect(SEA_CAVEAT).toContain('pas une mesure de bouée');
    expect(SEA_CAVEAT).toContain('vagues-submersion');
  });
});
