import { isOwnReading } from '../../domain/ownReadings';
import type { OwnReading } from '../../domain/ownReadings';

/*
 * Vos mesures saisies a la main (Mon relevé), sur cet appareil. Une cle a part,
 * pas dans les preferences : ce sont vos donnees, pas un reglage, et une lecture
 * ratee ne doit jamais toucher aux favoris. Elles sont dans la sauvegarde
 * (backup.ts) : contrairement au journal, rien ne peut les recalculer.
 */

const STORAGE_KEY = 'meteo-fr:own-readings';

// Repli en memoire quand localStorage est indisponible (mode prive strict, quota).
let memoryFallback: readonly OwnReading[] | null = null;

export function readOwnReadings(): readonly OwnReading[] {
  if (memoryFallback !== null) {
    return memoryFallback;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    // Un enregistrement abime est ecarte seul, jamais toute la liste.
    return Array.isArray(parsed) ? parsed.filter(isOwnReading) : [];
  } catch {
    return [];
  }
}

export function writeOwnReadings(readings: readonly OwnReading[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readings));
    memoryFallback = null;
  } catch {
    memoryFallback = readings;
  }
}

/** Reinitialise le repli memoire. Utilise par les tests. */
export function resetMemoryOwnReadingsForTests(): void {
  memoryFallback = null;
}
