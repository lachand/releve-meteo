import { describe, expect, it } from 'vitest';
import { Chart } from './chartTheme';

describe('chartTheme', () => {
  // Regression : les graduations suivaient la locale anglaise (« 1,026 »
  // pour 1 026 hPa, « 0.10 » mm).
  it('formate les graduations a la francaise', () => {
    expect(Chart.defaults.locale).toBe('fr-FR');
    expect(new Intl.NumberFormat(Chart.defaults.locale).format(1026)).toBe('1 026');
    expect(new Intl.NumberFormat(Chart.defaults.locale).format(0.1)).toBe('0,1');
  });
});
