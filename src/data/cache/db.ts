import { deleteDB, openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { ForecastBundle, Place } from '../../domain/types';

// ARCHITECTURE.md section 4.5 documente le schema complet (forecasts,
// geocoding, archive, reliability, meta). archive/reliability dependent de
// types que domain/reliability.ts n'expose qu'au Lot 7 : cette version 1
// ne cree que les deux magasins requis au Lot 1. Le Lot 7 migrera vers la
// version 2 en ajoutant les magasins manquants, jamais en recreant la base.
export interface DbSchema extends DBSchema {
  forecasts: {
    key: string; // `${placeId}|${modelsHash}|${pastDays}|${forecastDays}`
    value: {
      key: string;
      bundle: ForecastBundle;
      storedAt: number;
      expiresAt: number;
    };
    indexes: { byExpiry: number };
  };
  geocoding: {
    key: string; // requete normalisee, minuscules sans accents
    value: {
      key: string;
      places: readonly Place[];
      storedAt: number;
      expiresAt: number;
    };
    indexes: { byExpiry: number };
  };
}

const DB_NAME = 'meteo-fr';
const DB_VERSION = 1;

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function upgrade(db: IDBPDatabase<DbSchema>, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore('forecasts', { keyPath: 'key' }).createIndex('byExpiry', 'expiresAt');
    db.createObjectStore('geocoding', { keyPath: 'key' }).createIndex('byExpiry', 'expiresAt');
  }
}

let dbPromise: Promise<IDBPDatabase<DbSchema> | null> | null = null;

/**
 * Connexion partagee a la base, ou null si indexedDB est indisponible
 * (mode prive strict, Safari verrouille) ou si l'ouverture echoue. Les
 * magasins appelants basculent alors sur un repli en memoire respectant la
 * meme interface, l'application reste fonctionnelle sans persistance.
 */
export function getDb(): Promise<IDBPDatabase<DbSchema> | null> {
  dbPromise ??= isIndexedDbAvailable()
    ? openDB<DbSchema>(DB_NAME, DB_VERSION, { upgrade }).catch(() => null)
    : Promise.resolve(null);
  return dbPromise;
}

/** Reinitialise la connexion memorisee. Utilise par les tests et `sw:reset`. */
export function resetDbConnection(): void {
  dbPromise = null;
}

/**
 * Ferme et supprime entierement la base. Deux appelants : la purge des
 * donnees locales dans les reglages (BACKLOG.md Lot 5), et les tests, qui
 * partagent une seule instance d'indexedDB (fake ou reelle) entre les cas
 * de test et doivent repartir d'une base vide plutot que de seulement
 * oublier la reference en memoire.
 */
export async function clearAllLocalData(): Promise<void> {
  const db = await getDb();
  db?.close();
  resetDbConnection();
  if (isIndexedDbAvailable()) {
    await deleteDB(DB_NAME);
  }
}

export { clearAllLocalData as deleteDbForTests };
