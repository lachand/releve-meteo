import { describe, expect, it } from 'vitest';
import { mostSevereWeather, weatherIcon } from './icon';

describe('weatherIcon', () => {
  it('rend le soleil le jour et la lune la nuit pour un ciel degage ou peu nuageux', () => {
    expect(weatherIcon(0, true)).toBe('clear');
    expect(weatherIcon(0, false)).toBe('clearNight');
    expect(weatherIcon(1, true)).toBe('partly');
    expect(weatherIcon(2, false)).toBe('partlyNight');
  });

  it('prend le jour quand on ne sait pas s il fait jour', () => {
    expect(weatherIcon(0, null)).toBe('clear');
  });

  it.each([
    [3, 'cloudy'],
    [45, 'fog'],
    [48, 'fog'],
    [51, 'drizzle'],
    [57, 'drizzle'],
    [61, 'rain'],
    [66, 'rain'],
    [80, 'rain'],
    [82, 'rain'],
    [71, 'snow'],
    [77, 'snow'],
    [85, 'snow'],
    [95, 'thunder'],
    [99, 'thunder'],
  ])('le code %i a l icone %s', (code, icon) => {
    expect(weatherIcon(code, true)).toBe(icon);
    expect(weatherIcon(code, false)).toBe(icon);
  });

  it('ne devine rien pour un code absent ou inconnu', () => {
    expect(weatherIcon(null, true)).toBeNull();
    expect(weatherIcon(42, true)).toBeNull();
  });

  describe('mostSevereWeather', () => {
    it('garde le temps le plus marquant des heures donnees', () => {
      expect(mostSevereWeather([0, 3, 61, 1])).toBe(61);
      expect(mostSevereWeather([0, 95, 61])).toBe(95);
      expect(mostSevereWeather([71, 61])).toBe(71);
      expect(mostSevereWeather([1, 0])).toBe(1);
    });

    it('ignore les heures sans code ou de code inconnu, et ne rend rien sans heure utile', () => {
      expect(mostSevereWeather([null, 3, null])).toBe(3);
      expect(mostSevereWeather([null, 42])).toBeNull();
      expect(mostSevereWeather([])).toBeNull();
    });

    it('prend la premiere heure a gravite egale', () => {
      expect(mostSevereWeather([61, 63])).toBe(61);
    });
  });
});
