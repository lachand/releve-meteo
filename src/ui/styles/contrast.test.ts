import { describe, expect, it } from 'vitest';
import tokensCss from './tokens.css?raw';

/*
 * Contraste des jetons de couleur (WCAG 2.1, ROADMAP.md Z10), verifie par
 * calcul sur tokens.css lui-meme, dans les deux themes : 4,5:1 pour tout
 * ce qui ecrit du texte, 3:1 pour les traces de modele (element graphique,
 * WCAG 1.4.11 ; un nom de modele en couleur n'est compose qu'en grand
 * corps, cf. tokens.css).
 */

type Palette = Readonly<Record<string, string>>;

function block(selector: string): string {
  const start = tokensCss.indexOf(selector);
  if (start === -1) {
    throw new Error(`bloc introuvable : ${selector}`);
  }
  return tokensCss.slice(start, tokensCss.indexOf('}', start));
}

function colors(text: string): Palette {
  const result: Record<string, string> = {};
  for (const match of text.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      result[name] = value.toLowerCase();
    }
  }
  return result;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const LIGHT = colors(block(':root {'));
const DARK_FORCED = colors(block(":root[data-theme='dark']"));
const DARK_AUTO = colors(block(":root:not([data-theme='light'])"));
const DARK: Palette = { ...LIGHT, ...DARK_FORCED };

const SURFACES = ['papier', 'papier-haut', 'papier-creux'] as const;
const TEXT_TOKENS = [
  'encre',
  'encre-faible',
  'marge',
  'alerte',
  'observe',
  'estime',
  'risque-faible',
  'risque-modere',
  'risque-fort',
] as const;
const MODEL_TOKENS = [
  'arome',
  'arome-france',
  'icon-d2',
  'arpege',
  'icon-eu',
  'ecmwf',
  'gfs',
] as const;

describe('contraste des jetons de couleur', () => {
  it('calcule le contraste WCAG comme la reference (noir sur blanc : 21:1)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('garde le theme sombre automatique identique au theme sombre force', () => {
    expect(DARK_AUTO).toEqual(DARK_FORCED);
  });

  for (const [theme, palette] of [
    ['clair', LIGHT],
    ['sombre', DARK],
  ] as const) {
    it(`theme ${theme} : tout texte atteint 4,5:1 sur chaque papier`, () => {
      for (const token of TEXT_TOKENS) {
        for (const surface of SURFACES) {
          const fg = palette[token];
          const bg = palette[surface];
          expect(fg, token).toBeDefined();
          expect(bg, surface).toBeDefined();
          expect(contrast(fg ?? '', bg ?? ''), `${token} sur ${surface}`).toBeGreaterThanOrEqual(
            4.5,
          );
        }
      }
    });

    it(`theme ${theme} : chaque trace de modele atteint 3:1 sur chaque papier`, () => {
      for (const token of MODEL_TOKENS) {
        for (const surface of SURFACES) {
          expect(
            contrast(palette[token] ?? '', palette[surface] ?? ''),
            `${token} sur ${surface}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }
});
