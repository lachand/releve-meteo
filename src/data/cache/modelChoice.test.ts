import { afterEach, describe, expect, it } from 'vitest';
import { clearModelChoices, readModelChoice, writeModelChoice } from './modelChoice';

afterEach(() => {
  clearModelChoices();
});

describe('modelChoice', () => {
  it('vaut la selection automatique par defaut', () => {
    expect(readModelChoice('45.7600:4.8400')).toBeNull();
  });

  it('memorise un choix par lieu et revient a l automatique avec null', () => {
    writeModelChoice('a', 'arpege');
    writeModelChoice('b', 'ecmwf');
    expect(readModelChoice('a')).toBe('arpege');
    expect(readModelChoice('b')).toBe('ecmwf');
    writeModelChoice('a', null);
    expect(readModelChoice('a')).toBeNull();
    expect(readModelChoice('b')).toBe('ecmwf');
  });

  it('ignore un stockage corrompu ou un modele inconnu', () => {
    localStorage.setItem('meteo-fr:model-choice', '{pas du json');
    expect(readModelChoice('a')).toBeNull();
    localStorage.setItem('meteo-fr:model-choice', JSON.stringify({ a: 'harmonie', b: 'gfs' }));
    expect(readModelChoice('a')).toBeNull();
    expect(readModelChoice('b')).toBe('gfs');
    localStorage.setItem('meteo-fr:model-choice', 'null');
    expect(readModelChoice('b')).toBeNull();
  });
});
