import { beforeEach, describe, expect, it } from 'vitest';
import type { AlertRule, Place } from '../../domain/types';
import { DEFAULT_NOTIFY } from '../../domain/weatherNotices';
import {
  BACKUP_APP,
  BACKUP_VERSION,
  buildBackup,
  collectBackup,
  parseBackup,
  restoreBackup,
  summarizeBackup,
} from './backup';
import { deleteDbForTests } from './db';
import { resetMemoryDatasetStore } from './datasetStore';
import { clearModelChoices, readAllModelChoices, writeModelChoice } from './modelChoice';
import {
  addAlert,
  addFavourite,
  defaultPreferences,
  readPreferences,
  setApiKey,
  writePreferences,
} from './preferences';
import { readWatchState, saveWatchDigest, saveWatchNotify } from './watchStore';

const NOW = new Date('2026-09-28T13:27:00Z');

const LYON: Place = {
  id: '45.7578:4.8320',
  name: 'Lyon',
  latitude: 45.7578,
  longitude: 4.832,
  elevation: 170,
  admin: 'Rhône',
  alias: 'Chez nous',
};

const FROST: AlertRule = {
  id: 'gel',
  placeId: LYON.id,
  variable: 'temperature',
  comparator: 'lt',
  threshold: 2,
  enabled: true,
};

beforeEach(async () => {
  localStorage.clear();
  clearModelChoices();
  await deleteDbForTests();
  resetMemoryDatasetStore();
});

function fullBackupText(): string {
  const preferences = addAlert(addFavourite(defaultPreferences(), LYON).preferences, FROST);
  return JSON.stringify(
    buildBackup({
      preferences: { ...preferences, theme: 'dark', display: { quick: true } },
      modelChoices: { [LYON.id]: 'arpege' },
      watch: { digest: true, notify: { ...DEFAULT_NOTIFY, risks: true, mode: 'instant', hour: 6 } },
      now: NOW,
    }),
  );
}

describe('buildBackup', () => {
  it('ne contient jamais les cles d API saisies sur cet appareil', () => {
    const withKey = setApiKey(defaultPreferences(), 'vigilance', 'secret-123');
    const backup = buildBackup({
      preferences: withKey,
      modelChoices: {},
      watch: { digest: false, notify: DEFAULT_NOTIFY },
      now: NOW,
    });
    expect(JSON.stringify(backup)).not.toContain('secret-123');
    expect(backup).toMatchObject({
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: NOW.toISOString(),
    });
  });
});

describe('parseBackup', () => {
  it('relit une sauvegarde complete', () => {
    const parsed = parseBackup(fullBackupText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const { backup } = parsed;
    expect(backup.preferences.favourites).toEqual([LYON]);
    expect(backup.preferences.alerts).toEqual([FROST]);
    expect(backup.preferences.theme).toBe('dark');
    expect(backup.preferences.display.quick).toBe(true);
    expect(backup.modelChoices).toEqual({ [LYON.id]: 'arpege' });
    expect(backup.watch).toEqual({
      digest: true,
      notify: { ...DEFAULT_NOTIFY, risks: true, mode: 'instant', hour: 6 },
    });
    expect(backup.dropped).toBe(0);
    expect(summarizeBackup(backup)).toEqual({ favourites: 1, alerts: 1, modelChoices: 1 });
  });

  it('refuse ce qui n est pas une sauvegarde de Relevé, sans rien appliquer', () => {
    expect(parseBackup('{pas du json')).toEqual({ ok: false, failure: 'unreadable' });
    expect(parseBackup('42')).toEqual({ ok: false, failure: 'foreign' });
    expect(parseBackup('[]')).toEqual({ ok: false, failure: 'foreign' });
    expect(parseBackup(JSON.stringify({ app: 'autre', version: 1 }))).toEqual({
      ok: false,
      failure: 'foreign',
    });
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, version: 2 }))).toEqual({
      ok: false,
      failure: 'version',
    });
  });

  it('ecarte et compte les elements invalides : lieux hors France, doublons, alertes, choix', () => {
    const text = JSON.stringify({
      app: BACKUP_APP,
      version: 1,
      preferences: {
        favourites: [
          LYON,
          LYON,
          { ...LYON, id: 'bruxelles', latitude: 50.85, longitude: 4.35 },
          { ...LYON, id: 'x', latitude: 'nord' },
          { ...LYON, id: 'y', elevation: Number.NaN },
          'texte',
          null,
        ],
        alerts: [FROST, { id: 'x', variable: 'neige' }],
        units: { wind: 'kt' },
        theme: 'inconnu',
        display: { quick: 'oui' },
        solar: { peakKwp: 500 },
      },
      modelChoices: { lyon: 'arome', brest: 'meteo-fantaisie' },
    });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const { preferences, modelChoices, dropped, watch } = parsed.backup;
    expect(preferences.favourites).toEqual([LYON]);
    expect(preferences.alerts).toEqual([FROST]);
    expect(preferences.units.wind).toBe('kt');
    expect(preferences.theme).toBe('auto');
    expect(preferences.display.quick).toBe(false);
    expect(preferences.solar.peakKwp).toBeNull();
    expect(modelChoices).toEqual({ lyon: 'arome' });
    // 6 lieux ecartes, 1 alerte, 1 choix.
    expect(dropped).toBe(8);
    expect(watch).toEqual({ digest: false, notify: DEFAULT_NOTIFY });
  });

  it('tolere un fichier sans reglages', () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1 }));
    expect(parsed.ok && parsed.backup.preferences.favourites).toEqual([]);
    const lenient = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        version: 1,
        preferences: { favourites: 'oups', alerts: 3, theme: 'light' },
      }),
    );
    expect(lenient.ok && lenient.backup.preferences.theme).toBe('light');
  });
});

describe('collectBackup et restoreBackup', () => {
  it('sauvegarde l etat local puis le restaure sur un autre appareil, cles d API gardees', async () => {
    const preferences = addAlert(addFavourite(defaultPreferences(), LYON).preferences, FROST);
    writePreferences(setApiKey(preferences, 'vigilance', 'cle-appareil-1'));
    writeModelChoice(LYON.id, 'ecmwf');
    await saveWatchDigest(true, NOW);
    await saveWatchNotify({ ...DEFAULT_NOTIFY, rain: true, hour: 8 }, NOW);

    const text = JSON.stringify(await collectBackup(NOW));
    expect(text).not.toContain('cle-appareil-1');

    // Autre appareil : etat vide, avec sa propre cle.
    localStorage.clear();
    clearModelChoices();
    await deleteDbForTests();
    resetMemoryDatasetStore();
    writePreferences(setApiKey(defaultPreferences(), 'vigilance', 'cle-appareil-2'));

    const parsed = parseBackup(text);
    if (!parsed.ok) {
      throw new Error('sauvegarde illisible');
    }
    await restoreBackup(parsed.backup, NOW);
    const restored = readPreferences();
    expect(restored.favourites).toEqual([LYON]);
    expect(restored.alerts).toEqual([FROST]);
    expect(restored.apiKeys.vigilance).toBe('cle-appareil-2');
    expect(readAllModelChoices()).toEqual({ [LYON.id]: 'ecmwf' });
    const watch = await readWatchState();
    expect(watch.digest).toBe(true);
    expect(watch.notify).toEqual({ ...DEFAULT_NOTIFY, rain: true, hour: 8 });
  });
});
