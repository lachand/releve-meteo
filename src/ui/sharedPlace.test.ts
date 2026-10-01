import { describe, expect, it } from 'vitest';
import { parseSharedPlace, sharedModel, sharedPlaceSearch } from './sharedPlace';

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

describe('modele partage', () => {
  const place = parseSharedPlace('?lat=47.6559&lon=-2.7603');

  it('ajoute le modele choisi au lien, apres la vue', () => {
    expect(place).not.toBeNull();
    if (place === null) {
      return;
    }
    const search = sharedPlaceSearch(place, 'heures', 'arpege');
    expect(new URLSearchParams(search).get('modele')).toBe('arpege');
    expect(new URLSearchParams(search).get('vue')).toBe('heures');
    expect(sharedModel(search)).toBe('arpege');
    // La selection automatique ne laisse aucun parametre.
    expect(new URLSearchParams(sharedPlaceSearch(place, undefined, null)).has('modele')).toBe(
      false,
    );
    expect(new URLSearchParams(sharedPlaceSearch(place)).has('modele')).toBe(false);
  });

  it('ne lit que les identifiants de modeles connus', () => {
    expect(sharedModel('?modele=ecmwf')).toBe('ecmwf');
    expect(sharedModel('?modele=gfs&lat=1')).toBe('gfs');
    expect(sharedModel('?modele=meteo-fantaisie')).toBeNull();
    expect(sharedModel('?modele=')).toBeNull();
    expect(sharedModel('?lat=45')).toBeNull();
  });
});
