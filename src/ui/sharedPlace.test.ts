import { describe, expect, it } from 'vitest';
import { parseSharedPlace, sharedPlaceSearch } from './sharedPlace';

// Vannes, tete du Golfe du Morbihan, cf. BACKLOG.md "Ecarts constates" du
// 2026-08-18 : les coordonnees `?lat=47.57&lon=-2.80` de TESTING.md 5.5
// tombent en pleine eau, hors du polygone metropolitain.
describe('parseSharedPlace', () => {
  it('construit un lieu depuis des coordonnees valides en metropole', () => {
    const place = parseSharedPlace('?lat=47.6559&lon=-2.7603');
    expect(place).not.toBeNull();
    expect(place?.latitude).toBe(47.6559);
    expect(place?.longitude).toBe(-2.7603);
    expect(place?.id).toBe('47.6559:-2.7603');
  });

  it('retourne null sans parametres', () => {
    expect(parseSharedPlace('')).toBeNull();
  });

  it('retourne null sur des coordonnees non numeriques', () => {
    expect(parseSharedPlace('?lat=abc&lon=-2.7603')).toBeNull();
  });

  it('retourne null hors metropole', () => {
    // Bruxelles.
    expect(parseSharedPlace('?lat=50.8503&lon=4.3517')).toBeNull();
  });
});

describe('sharedPlaceSearch', () => {
  it('produit une chaine de recherche relisible par parseSharedPlace', () => {
    const place = parseSharedPlace('?lat=47.6559&lon=-2.7603');
    expect(place).not.toBeNull();
    if (place === null) {
      return;
    }
    const search = sharedPlaceSearch(place);
    expect(parseSharedPlace(search)?.id).toBe(place.id);
  });
});
