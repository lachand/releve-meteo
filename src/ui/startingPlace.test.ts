import { describe, expect, it } from 'vitest';
import type { Place } from '../domain/types';
import { startingPlace } from './startingPlace';

function place(id: string, name: string): Place {
  return { id, name, latitude: 45, longitude: 5, elevation: 100, admin: null, alias: null };
}

const SHARED = '?lat=45.7578&lon=4.832&nom=Lyon&alt=170';
const LAST = place('last', 'Dernier');
const FAVOURITES = [place('fav1', 'Premier favori'), place('fav2', 'Second favori')];

describe('startingPlace', () => {
  it('prend le lieu de l adresse avant tout : lien partage, clic sur un widget', () => {
    expect(startingPlace(SHARED, LAST, FAVOURITES)?.name).toBe('Lyon');
  });

  it('rouvre le dernier lieu quand l adresse n en donne pas', () => {
    expect(startingPlace('', LAST, FAVOURITES)).toBe(LAST);
    expect(startingPlace('?vue=heures', LAST, FAVOURITES)).toBe(LAST);
  });

  it('ouvre le premier favori quand il n y a pas de dernier lieu', () => {
    expect(startingPlace('', null, FAVOURITES)).toBe(FAVOURITES[0]);
  });

  it('s ouvre sur la recherche quand rien n est connu', () => {
    expect(startingPlace('', null, [])).toBeNull();
  });

  it('ignore une adresse hors metropole : elle n a pas de prevision a offrir', () => {
    expect(startingPlace('?lat=-21.1&lon=55.5', LAST, FAVOURITES)).toBe(LAST);
  });
});
