import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAirQuality, getEnsemble, getNowcast, getVerifications } from '../../data/repository';
import { blendDaily } from '../../domain/dailyBlend';
import { dailyEnsemble } from '../../domain/ensemble';
import { MODEL_ORDER } from '../../domain/models';
import { detectPhenomena } from '../../domain/phenomena';
import { leadHoursFrom, localIsoFromUtc } from '../../domain/time';
import type { Place } from '../../domain/types';
import { InstallPrompt } from '../components/InstallPrompt';
import { PlaceSearch } from '../components/PlaceSearch';
import { PlaceSwitcher } from '../components/PlaceSwitcher';
import { Settings } from '../components/Settings';
import { Tabs } from '../components/Tabs';
import type { TabItem } from '../components/Tabs';
import { UpdateBanner } from '../components/UpdateBanner';
import { formatCompact, formatLongDate } from '../format';
import { useAppliedTheme } from '../hooks/useAppliedTheme';
import { useCascadeView } from '../hooks/useCascadeView';
import { useConfidenceView } from '../hooks/useConfidenceView';
import { useDataset } from '../hooks/useDataset';
import { useForecast } from '../hooks/useForecast';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useModelChoice } from '../hooks/useModelChoice';
import { usePreferences } from '../hooks/usePreferences';
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate';
import { useTerrain } from '../hooks/useTerrain';
import { TERRAIN_KIND_LABELS } from '../modelPresentation';
import { explainSelection } from '../selectionExplanation';
import { parseSharedPlace, sharedPlaceSearch, sharedView } from '../sharedPlace';
import styles from './App.module.css';
import { DaysView } from './DaysView';
import { HoursView } from './HoursView';
import { MapView } from './MapView';
import { ModelsView } from './ModelsView';
import { ReliabilityView } from './ReliabilityView';
import { PHENOMENA_HORIZON_HOURS, TodayView } from './TodayView';
import { VIEW_KEYS } from './viewModel';
import type { ForecastViewModel, ViewKey } from './viewModel';

const TABS: readonly TabItem<ViewKey>[] = [
  { key: 'jour', label: 'Aujourd’hui', short: 'Auj.' },
  { key: 'heures', label: 'Heure par heure', short: 'Heures' },
  { key: 'jours', label: '15 jours', short: '15 j' },
  { key: 'carte', label: 'Radar', short: 'Radar' },
  { key: 'modeles', label: 'Modèles', short: 'Modèles' },
  { key: 'fiabilite', label: 'Fiabilité', short: 'Fiabilité' },
];

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatFetchedAt(epochMs: number): string {
  return dateTimeFormatter.format(new Date(epochMs)).replace(' ', ' à ').replace(':', 'h');
}

function initialView(): ViewKey {
  const requested = sharedView(window.location.search);
  return VIEW_KEYS.find((key) => key === requested) ?? 'jour';
}

function coordinates(place: Place): string {
  const lat = `${formatCompact(Math.abs(Math.round(place.latitude * 100) / 100))}° ${place.latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${formatCompact(Math.abs(Math.round(place.longitude * 100) / 100))}° ${place.longitude >= 0 ? 'E' : 'O'}`;
  return `${lat}, ${lon}`;
}

export function App() {
  const [place, setPlace] = useState<Place | null>(() => parseSharedPlace(window.location.search));
  const [view, setView] = useState<ViewKey>(initialView);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();
  const { available: installAvailable, promptInstall } = useInstallPrompt();
  const preferences = usePreferences();
  const [preferred, setPreferred] = useModelChoice(place?.id ?? null);
  const forecastState = useForecast(place);
  const bundle = forecastState?.status === 'ready' ? forecastState.result.bundle : null;
  const terrain = useTerrain(place);

  const verification = useDataset(place === null ? null : `verification|${place.id}`, () =>
    // `place` est non nul des que la cle l'est.
    getVerifications(place as Place, MODEL_ORDER),
  );
  const ensemble = useDataset(place === null ? null : `ensemble|${place.id}`, () =>
    getEnsemble(place as Place),
  );
  const airQuality = useDataset(place === null ? null : `air|${place.id}`, () =>
    getAirQuality(place as Place),
  );
  const nowcast = useDataset(place === null ? null : `nowcast|${place.id}`, () =>
    getNowcast(place as Place),
  );

  const verifications = useMemo(
    () => (verification.status === 'ready' ? verification.value.verifications : []),
    [verification],
  );
  const cascade = useCascadeView(bundle, { terrain, verification: verifications, preferred });
  const confidence = useConfidenceView(bundle, terrain);

  useAppliedTheme(preferences.preferences.theme);

  useEffect(() => {
    if (place === null) {
      return;
    }
    const search = sharedPlaceSearch(place, view === 'jour' ? undefined : view);
    if (window.location.search !== search) {
      window.history.replaceState(null, '', search);
    }
  }, [place, view]);

  const navigate = useCallback((next: ViewKey) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const ensembleValue = ensemble.status === 'ready' ? ensemble.value : null;
  const ensembleDays = useMemo(
    () => (ensembleValue === null ? null : dailyEnsemble(ensembleValue)),
    [ensembleValue],
  );

  const vm = useMemo((): ForecastViewModel | null => {
    if (place === null || bundle === null || cascade === null) {
      return null;
    }
    const now = new Date();
    const nowIso = localIsoFromUtc(now.getTime());
    const today = nowIso.slice(0, 10);
    const horizon = cascade.points.filter((point, index) => {
      const time = bundle.timeline[index];
      if (point === null || time === undefined) {
        return false;
      }
      const lead = leadHoursFrom(now, time);
      return lead >= -1 && lead <= PHENOMENA_HORIZON_HOURS;
    });
    return {
      place,
      terrain,
      bundle,
      cascade,
      confidence,
      days: blendDaily({ bundle, context: cascade.context, now, preferred }),
      ensembleDays: ensembleDays?.filter((day) => day.date >= today) ?? null,
      ensembleMembers: ensembleValue?.temperature.length ?? 0,
      ensembleState: ensemble.status,
      verification,
      airQuality,
      nowcast,
      episodes: detectPhenomena(horizon.filter((p) => p !== null)),
      explanation: explainSelection(cascade.rankingNow, cascade.activeModel, preferred),
      windUnit: preferences.preferences.units.wind,
      now,
      today,
      currentHour: `${nowIso.slice(0, 13)}:00`,
      preferred,
      setPreferred,
      navigate,
    };
  }, [
    place,
    terrain,
    bundle,
    cascade,
    confidence,
    ensembleDays,
    ensembleValue,
    ensemble.status,
    verification,
    airQuality,
    nowcast,
    preferences.preferences.units.wind,
    preferred,
    setPreferred,
    navigate,
  ]);

  const isFavourite =
    place !== null && preferences.preferences.favourites.some((f) => f.id === place.id);
  const displayName = place === null ? null : (place.alias ?? place.name);

  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#contenu">
        Aller au relevé
      </a>
      {updateAvailable && <UpdateBanner onRefresh={applyUpdate} />}
      {!updateAvailable && installAvailable && (
        <InstallPrompt
          onInstall={() => {
            void promptInstall();
          }}
        />
      )}

      <header className={styles.masthead}>
        <div className={styles.brand}>
          <img src="/icons/mark.svg" alt="" width={28} height={28} className={styles.mark} />
          <p className={styles.brandName}>
            Relevé <span className={styles.brandSub}>carnet météorologique</span>
          </p>
        </div>
        <div className={styles.actions}>
          <div className={styles.searchColumn}>
            <PlaceSearch onSelect={setPlace} />
          </div>
          <div className={styles.buttons}>
            {place !== null && (
              <button
                type="button"
                className={styles.iconButton}
                aria-pressed={isFavourite}
                onClick={() =>
                  isFavourite
                    ? preferences.removeFavourite(place.id)
                    : preferences.addFavourite(place)
                }
                aria-label={isFavourite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                title={isFavourite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              >
                {isFavourite ? '★' : '☆'}
              </button>
            )}
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label="Réglages"
              aria-expanded={settingsOpen}
              title="Réglages"
            >
              ⚙
            </button>
          </div>
        </div>
        {place !== null && (
          <div className={styles.placeBlock}>
            <h1 className={styles.placeName}>{displayName}</h1>
            <p className={styles.placeMeta}>
              {[
                place.admin,
                `${Math.round(place.elevation)} m`,
                terrain !== null ? TERRAIN_KIND_LABELS[terrain.kind] : null,
                coordinates(place),
              ]
                .filter((value): value is string => value !== null)
                .join(' · ')}
            </p>
            {bundle !== null && (
              <p className={styles.dateline}>
                Relevé du {formatLongDate(localIsoFromUtc(bundle.fetchedAt))}
              </p>
            )}
          </div>
        )}
      </header>

      {settingsOpen && (
        <Settings
          preferences={preferences.preferences}
          onSetWindUnit={preferences.setWindUnit}
          onSetTheme={preferences.setTheme}
          onPurge={preferences.purgeLocalData}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {!settingsOpen && place !== null && (
        <Tabs
          items={TABS}
          active={view}
          onChange={setView}
          label="Sections du relevé"
          idPrefix="releve"
        />
      )}

      {!settingsOpen && (
        <main id="contenu" className={styles.main}>
          {place === null && (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>Aucun lieu au carnet.</p>
              <p>
                Cherchez une commune de France métropolitaine, ou utilisez votre position, pour
                ouvrir son relevé : le meilleur modèle y est choisi automatiquement, et justifié.
              </p>
            </div>
          )}

          {place !== null && forecastState?.status === 'loading' && (
            <div
              className={styles.loading}
              aria-busy="true"
              aria-label="Chargement de la prévision"
            >
              <div className={styles.skeleton} />
              <div className={styles.skeletonShort} />
              <p className="note">Interrogation de sept modèles de prévision…</p>
            </div>
          )}

          {place !== null && forecastState?.status === 'error' && (
            <div className={styles.errorState} role="alert">
              <p className={styles.emptyTitle}>Prévision indisponible.</p>
              <p>
                Le service de prévision Open-Meteo ne répond pas
                {forecastState.failure.kind === 'rate_limited' ? ' (quota atteint)' : ''}. Vérifiez
                la connexion puis réessayez.
              </p>
              <button type="button" onClick={() => setPlace({ ...place })}>
                Réessayer
              </button>
            </div>
          )}

          {vm !== null && forecastState?.status === 'ready' && (
            <>
              {forecastState.result.stale && (
                <p className={styles.staleBanner}>
                  Hors ligne · Relevé du {formatFetchedAt(vm.bundle.fetchedAt)}
                </p>
              )}
              <div
                role="tabpanel"
                id={`releve-panel-${view}`}
                aria-labelledby={`releve-tab-${view}`}
                className={styles.panel}
              >
                {view === 'jour' && <TodayView vm={vm} />}
                {view === 'heures' && <HoursView vm={vm} />}
                {view === 'jours' && <DaysView vm={vm} />}
                {view === 'carte' && <MapView vm={vm} />}
                {view === 'modeles' && <ModelsView vm={vm} />}
                {view === 'fiabilite' && <ReliabilityView vm={vm} />}
              </div>
            </>
          )}
        </main>
      )}

      {!settingsOpen && (
        <PlaceSwitcher
          favourites={preferences.preferences.favourites}
          activePlaceId={place?.id ?? null}
          onSelect={setPlace}
          onReorder={preferences.reorderFavourites}
          onRemove={preferences.removeFavourite}
          onRename={preferences.setAlias}
        />
      )}

      <footer className={styles.footer}>
        <p>
          Prévisions Open-Meteo (Météo-France, DWD, ECMWF, NOAA), observations Meteostat, réanalyse
          ERA5 et qualité de l’air Copernicus, radar RainViewer, fonds OpenStreetMap.
        </p>
        <p>
          <a href="/sources.html">Sources, licences et méthode</a>
        </p>
      </footer>
    </div>
  );
}
