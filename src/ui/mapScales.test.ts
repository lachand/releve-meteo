import { describe, expect, it } from 'vitest';
import {
  RAIN_COLORS,
  SPREAD_COLORS,
  SPREAD_THRESHOLDS,
  TEMPERATURE_GRADIENT,
  THUNDER_COLORS,
  rainClass,
  rainColor,
  spreadColor,
  temperatureColor,
  thunderColor,
} from './mapScales';

describe('rainClass', () => {
  it('laisse sans couleur une case seche ou sans valeur, jamais comme zero', () => {
    expect(rainClass(null)).toBeNull();
    expect(rainClass(0)).toBeNull();
    expect(rainClass(0.09)).toBeNull();
    expect(rainColor(null)).toBeNull();
  });

  it('classe la pluie par seuils croissants', () => {
    expect(rainClass(0.1)).toBe(0);
    expect(rainClass(0.49)).toBe(0);
    expect(rainClass(0.5)).toBe(1);
    expect(rainClass(2)).toBe(2);
    expect(rainClass(7)).toBe(3);
    expect(rainClass(10)).toBe(4);
    expect(rainClass(60)).toBe(4);
    expect(rainColor(3)).toBe(RAIN_COLORS[2]);
  });
});

describe('temperatureColor', () => {
  const range = { min: 10, max: 30 };

  it('va du bleu au rouge sur la plage de la carte', () => {
    expect(temperatureColor(10, range)).toBe('#2f5f8f');
    expect(temperatureColor(30, range)).toBe('#a8392c');
  });

  it('borne les valeurs hors plage', () => {
    expect(temperatureColor(-5, range)).toBe('#2f5f8f');
    expect(temperatureColor(45, range)).toBe('#a8392c');
  });

  it('interpole entre deux reperes', () => {
    // 10 % de la plage : a mi-chemin entre les deux premiers reperes.
    expect(temperatureColor(12, range)).toBe('#5783aa');
  });

  it('prend le milieu de l echelle quand toute la carte a la meme temperature', () => {
    expect(temperatureColor(18, { min: 18, max: 18 })).toBe(temperatureColor(20, range));
  });

  it('expose le degrade de la legende', () => {
    expect(TEMPERATURE_GRADIENT).toMatch(/^linear-gradient\(to right, #2f5f8f, .*#a8392c\)$/);
  });
});

describe('spreadColor', () => {
  it('laisse sans couleur un accord, ou un ecart absent, jamais comme zero', () => {
    expect(spreadColor(null, 'temperature')).toBeNull();
    expect(spreadColor(0, 'temperature')).toBeNull();
    expect(spreadColor(0.4, 'temperature')).toBeNull();
    expect(spreadColor(0.05, 'rain')).toBeNull();
  });

  it('colore selon les seuils de la grandeur, du plus clair au plus fonce', () => {
    expect(spreadColor(0.5, 'temperature')).toBe(SPREAD_COLORS[0]);
    expect(spreadColor(2.5, 'temperature')).toBe(SPREAD_COLORS[2]);
    expect(spreadColor(12, 'temperature')).toBe(SPREAD_COLORS[4]);
    expect(spreadColor(0.5, 'rain')).toBe(SPREAD_COLORS[1]);
    expect(SPREAD_THRESHOLDS.temperature).toHaveLength(SPREAD_COLORS.length);
    expect(SPREAD_THRESHOLDS.rain).toHaveLength(SPREAD_COLORS.length);
  });
});

describe('thunderColor', () => {
  it('ne colore que les cases ou un orage est prevu', () => {
    expect(thunderColor(null)).toBeNull();
    expect(thunderColor('low')).toBe(THUNDER_COLORS.low);
    expect(thunderColor('high')).toBe(THUNDER_COLORS.high);
  });
});
