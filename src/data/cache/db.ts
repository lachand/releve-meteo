import { deleteDB, openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { ForecastBundle, Place } from '../../domain/types';

// ARCHITECTURE.md section 4.5. Version 1 : forecasts, geocoding.
// Version 2 (ROADMAP.md R5) : datasets, cache generique a expiration
// (ensemble, verification, qualite de l'air, nowcast). Migration
// incrementale, jamais de suppression et recreation de la base.
export interface DbSchema extends DBSchema {
  forecasts: {
    key: string; // `v${schema}|${placeId}|${modelsHash}|${pastDays}|${forecastDays}`
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
  datasets: {
    key: string; // `${kind}|${placeId}`
    value: {
      key: string;
      value: unknown;
      storedAt: number;
      expiresAt: number;
    };
    indexes: { byExpiry: number };
  };
}

const DB_NAME = 'meteo-fr';
export const DB_VERSION = 2;

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function upgrade(db: IDBPDatabase<DbSchema>, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore('forecasts', { keyPath: 'key' }).createIndex('byExpiry', 'expiresAt');
    db.createObjectStore('geocoding', { keyPath: 'key' }).createIndex('byExpiry', 'expiresAt');
  }
  if (oldVersion < 2) {
    db.createObjectStore('datasets', { keyPath: 'key' }).createIndex('byExpiry', 'expiresAt');
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
