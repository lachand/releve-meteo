import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAirQuality,
  getClimate,
  getMarine,
  getEnsemble,
  getNowcast,
  getStationReport,
  getVigilance,
  getVerifications,
} from '../../data/repository';
import { evaluateAlerts } from '../../domain/alerts';
import type { AlertHit } from '../../domain/alerts';
import { evaluateSpreadAlerts } from '../../domain/spreadAlerts';
import type { SpreadHit } from '../../domain/spreadAlerts';
import { blendDaily } from '../../domain/dailyBlend';
import { dailyEnsemble, rainOutlook, temperatureSpaghetti } from '../../domain/ensemble';
import { MODEL_ORDER } from '../../domain/models';
import { detectPhenomena } from '../../domain/phenomena';
import { waveOutlook } from '../../domain/marine';
import { dayNormal } from '../../domain/normals';
import { rainCheck } from '../../domain/rainCheck';
import { stationCheck } from '../../domain/stationCheck';
import { stationTrace } from '../../domain/stationTrace';
import { leadScores } from '../../domain/leadScores';
import { yesterdayReview } from '../../domain/yesterdayReview';
import { leadHoursFrom, localIsoFromUtc } from '../../domain/time';
import type { ForecastBundle, Place } from '../../domain/types';
import { summarizeVigilance } from '../../domain/vigilance';
import { InstallPrompt } from '../components/InstallPrompt';
import { PlaceSearch } from '../components/PlaceSearch';
import { PlaceSwitcher } from '../components/PlaceSwitcher';
import { Settings } from '../components/Settings';
import { ShareButton } from '../components/ShareButton';
import { Tabs } from '../components/Tabs';
import type { TabItem } from '../components/Tabs';
import { UpdateBanner } from '../components/UpdateBanner';
import { forecastFailureSentence } from '../failurePresentation';
import { formatCompact, formatLongDate } from '../format';
import { PrintIcon } from '../tabIcons';
import { useAppliedReading } from '../hooks/useAppliedReading';
import { useAppliedTheme } from '../hooks/useAppliedTheme';
import { useCascadeView } from '../hooks/useCascadeView';
import { useConfidenceView } from '../hooks/useConfidenceView';
import { useBackgroundWatch } from '../hooks/useBackgroundWatch';
import { DaysIcon, HoursIcon, MapIcon, ModelsIcon, ReliabilityIcon, TodayIcon } from '../tabIcons';
import { useDataset } from '../hooks/useDataset';
import { useForecast } from '../hooks/useForecast';
import { useGeolocation } from '../hooks/useGeolocation';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useModelChoice } from '../hooks/useModelChoice';
import { usePreferences } from '../hooks/usePreferences';
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate';
import { useTerrain } from '../hooks/useTerrain';
import { TERRAIN_KIND_LABELS } from '../modelPresentation';
import { explainSelection } from '../selectionExplanation';
import { parseSharedPlace, sharedModel, sharedPlaceSearch, sharedView } from '../sharedPlace';
import styles from './App.module.css';
import { PHENOMENA_HORIZON_HOURS, TodayView } from './TodayView';
import { VIEW_KEYS } from './viewModel';
import type { ForecastViewModel, ViewKey } from './viewModel';

// Seule la vue « Aujourd'hui » est dans le paquet initial : elle n'utilise
// ni Chart.js ni Leaflet. Les autres vues sont chargees a la demande (et
// precachees par le service worker pour le hors ligne).
const HoursView = lazy(() => import('./HoursView').then((m) => ({ default: m.HoursView })));
const DaysView = lazy(() => import('./DaysView').then((m) => ({ default: m.DaysView })));
const MapView = lazy(() => import('./MapView').then((m) => ({ default: m.MapView })));
const ModelsView = lazy(() => import('./ModelsView').then((m) => ({ default: m.ModelsView })));
const ReliabilityView = lazy(() =>
  import('./ReliabilityView').then((m) => ({ default: m.ReliabilityView })),
);

/** Aucune alerte franchie : reference stable pour la veille. */
const NO_HITS: readonly AlertHit[] = [];
const NO_SPREAD_HITS: readonly SpreadHit[] = [];

const TABS: readonly TabItem<ViewKey>[] = [
  { key: 'jour', label: 'Aujourd’hui', short: 'Auj.', icon: <TodayIcon /> },
  { key: 'heures', label: 'Heure par heure', short: 'Heures', icon: <HoursIcon /> },
  { key: 'jours', label: '15 jours', short: '15 j', icon: <DaysIcon /> },
  { key: 'carte', label: 'Cartes', short: 'Cartes', icon: <MapIcon /> },
  { key: 'modeles', label: 'Modèles', short: 'Modèles', icon: <ModelsIcon /> },
  { key: 'fiabilite', label: 'Fiabilité', short: 'Fiab.', icon: <ReliabilityIcon /> },
];

function examplePlace(
  name: string,
  latitude: number,
  longitude: number,
  elevation: number,
  admin: string,
): Place {
  return {
    id: `${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
    name,
    latitude,
    longitude,
    elevation,
    admin,
    alias: null,
  };
}

/** Lieux d'exemple de l'ecran vide : un par type de terrain, pour voir la selection varier. */
const EXAMPLE_PLACES: readonly { readonly place: Place; readonly terrain: string }[] = [
  { place: examplePlace('Paris', 48.8566, 2.3522, 35, 'Paris'), terrain: 'grande ville' },
  {
    place: examplePlace('Chamonix-Mont-Blanc', 45.9237, 6.8694, 1035, 'Haute-Savoie'),
    terrain: 'montagne',
  },
  { place: examplePlace('Brest', 48.3904, -4.4861, 52, 'Finistère'), terrain: 'côte atlantique' },
  {
    place: examplePlace('Marseille', 43.2965, 5.3698, 12, 'Bouches-du-Rhône'),
    terrain: 'Méditerranée',
  },
  {
    place: examplePlace('Strasbourg', 48.5734, 7.7521, 142, 'Bas-Rhin'),
    terrain: 'plaine d’Alsace',
  },
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
  const [installDismissed, setInstallDismissed] = useState(false);
  const preferences = usePreferences();
  const [preferred, setPreferred] = useModelChoice(place?.id ?? null);
  const forecastState = useForecast(place);
  const bundle = forecastState?.status === 'ready' ? forecastState.result.bundle : null;
  // Copie perimee servie hors ligne : le releve est relu des que le reseau revient.
  const forecastStale = forecastState?.status === 'ready' && forecastState.result.stale;
  useEffect(() => {
    if (!forecastStale) {
      return;
    }
    const refresh = () => setPlace((current) => (current === null ? current : { ...current }));
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, [forecastStale]);
  // Le lieu de la prevision peut porter une altitude plus juste (terrain
  // d'Open-Meteo quand la position n'en donnait pas) : c'est lui qui sert
  // au terrain et au choix de la station de reference.
  const resolvedPlace = bundle?.place ?? place;
  const terrain = useTerrain(resolvedPlace);
  const geolocation = useGeolocation(setPlace);

  // La verification attend la prevision : elle a besoin de l'altitude
  // resolue pour retenir une station representative.
  const verification = useDataset(bundle === null ? null : `verification|${bundle.place.id}`, () =>
    // `bundle` est non nul des que la cle l'est.
    getVerifications((bundle as ForecastBundle).place, MODEL_ORDER),
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
  // Meme dependance que la verification : la station depend de l'altitude resolue.
  const station = useDataset(bundle === null ? null : `station|${bundle.place.id}`, () =>
    getStationReport((bundle as ForecastBundle).place, MODEL_ORDER),
  );
  // Les vagues ne concernent que le littoral.
  const coastal = terrain?.kind === 'coastal';
  const marine = useDataset(place !== null && coastal ? `marine|${place.id}` : null, () =>
    getMarine(place as Place),
  );
  const climate = useDataset(place === null ? null : `normals|${place.id}`, () =>
    getClimate(place as Place),
  );
  const vigilance = useDataset(place === null ? null : `vigilance|${place.id}`, () =>
    getVigilance(place as Place),
  );

  const verifications = useMemo(
    () => (verification.status === 'ready' ? verification.value.verifications : []),
    [verification],
  );
  // Notes de 1 a 12 h : les prevues enregistrees par l'application, face aux
  // mesures de la station. Elles entrent dans la selection quand il y en a assez.
  const shortLead = useMemo(
    () =>
      station.status === 'ready'
        ? leadScores({
            snapshots: station.value.snapshots,
            records: station.value.records,
            now: new Date(),
          })
        : undefined,
    [station],
  );
  const cascade = useCascadeView(bundle, {
    terrain,
    verification: verifications,
    preferred,
    shortLead,
  });
  const confidence = useConfidenceView(bundle, terrain);

  useAppliedTheme(preferences.preferences.theme);
  useAppliedReading(preferences.preferences.display.quick);

  // Raccourci « Ma position » du manifeste : `?geo=1` localise au demarrage.
  const { locate } = geolocation;
  const [geoRequested] = useState(
    () => new URLSearchParams(window.location.search).get('geo') === '1',
  );
  useEffect(() => {
    if (geoRequested && place === null) {
      locate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule tentative au demarrage.
  }, [geoRequested]);

  // Un lien partage peut porter un modele (`?modele=`) : il est applique une
  // seule fois, a l'ouverture, comme un choix manuel que l'interface affiche.
  const [linkedModel] = useState(() => sharedModel(window.location.search));
  useEffect(() => {
    if (linkedModel !== null) {
      setPreferred(linkedModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, a l'ouverture.
  }, []);

  const searchView = view === 'jour' ? undefined : view;
  useEffect(() => {
    if (place === null) {
      return;
    }
    const search = sharedPlaceSearch(place, searchView, preferred);
    if (window.location.search !== search) {
      window.history.replaceState(null, '', search);
    }
  }, [place, searchView, preferred]);

  const navigate = useCallback((next: ViewKey) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const ensembleValue = ensemble.status === 'ready' ? ensemble.value : null;
  const climateValue = climate.status === 'ready' ? climate.value : null;
  const marineValue = marine.status === 'ready' ? marine.value : null;
  const ensembleDays = useMemo(
    () => (ensembleValue === null ? null : dailyEnsemble(ensembleValue)),
    [ensembleValue],
  );

  const vm = useMemo((): ForecastViewModel | null => {
    if (bundle === null || cascade === null) {
      return null;
    }
    const place = bundle.place;
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
      rainOutlook: ensembleValue === null ? null : rainOutlook({ ensemble: ensembleValue, now }),
      temperatureSpaghetti:
        ensembleValue === null ? null : temperatureSpaghetti({ ensemble: ensembleValue, now }),
      marine: coastal
        ? {
            state: marine,
            outlook: marineValue === null ? null : waveOutlook({ series: marineValue, now }),
          }
        : null,
      todayNormal: climateValue === null ? null : dayNormal(climateValue, today.slice(5)),
      ensembleMembers: ensembleValue?.temperature.length ?? 0,
      ensembleState: ensemble.status,
      verification,
      airQuality,
      nowcast,
      station,
      stationCheck:
        station.status === 'ready'
          ? stationCheck({ records: station.value.records, models: station.value.models, now })
          : null,
      stationTrace:
        station.status === 'ready'
          ? stationTrace({ records: station.value.records, models: station.value.models, now })
          : null,
      rainCheck:
        station.status === 'ready' && cascade.activeModel !== null
          ? rainCheck({
              records: station.value.records,
              model: cascade.activeModel,
              hourly: bundle.series[cascade.activeModel]?.hourly ?? [],
              now,
            })
          : null,
      leadScores: shortLead ?? null,
      yesterday:
        station.status === 'ready'
          ? yesterdayReview({
              records: station.value.records,
              forecasts: station.value.previousDay,
              now,
            })
          : null,
      vigilance,
      vigilanceSummary:
        vigilance.status === 'ready' && vigilance.value.bulletin !== null
          ? summarizeVigilance(vigilance.value.bulletin, now)
          : null,
      episodes: detectPhenomena(horizon.filter((p) => p !== null)),
      explanation: explainSelection(cascade.rankingNow, cascade.activeModel, preferred),
      windUnit: preferences.preferences.units.wind,
      peakKwp: preferences.preferences.solar.peakKwp,
      now,
      today,
      currentHour: `${nowIso.slice(0, 13)}:00`,
      preferred,
      setPreferred,
      navigate,
      favourites: preferences.preferences.favourites,
      openPlace: setPlace,
      quick: preferences.preferences.display.quick,
      alertRules: preferences.preferences.alerts.filter((rule) => rule.placeId === place.id),
      alertHits: evaluateAlerts({
        rules: preferences.preferences.alerts,
        placeId: place.id,
        points: cascade.points.filter((point) => point !== null),
        now,
      }),
      spreadHits: evaluateSpreadAlerts({
        rules: preferences.preferences.alerts.filter((rule) => rule.placeId === place.id),
        bundle,
        now,
      }),
      addAlert: preferences.addAlert,
      toggleAlert: preferences.toggleAlert,
      removeAlert: preferences.removeAlert,
    };
  }, [
    terrain,
    bundle,
    cascade,
    shortLead,
    confidence,
    ensembleDays,
    ensembleValue,
    climateValue,
    marine,
    marineValue,
    coastal,
    ensemble.status,
    verification,
    airQuality,
    nowcast,
    station,
    vigilance,
    preferences.preferences.units.wind,
    preferences.preferences.solar.peakKwp,
    preferred,
    setPreferred,
    navigate,
    preferences.preferences.favourites,
    preferences.preferences.alerts,
    preferences.preferences.display.quick,
    preferences.addAlert,
    preferences.toggleAlert,
    preferences.removeAlert,
  ]);

  const watch = useBackgroundWatch({
    place: bundle?.place ?? null,
    terrain,
    verification: verifications,
    preferred,
    favourites: preferences.preferences.favourites,
    rules: preferences.preferences.alerts,
    windUnit: preferences.preferences.units.wind,
    alertHits: vm?.alertHits ?? NO_HITS,
    spreadHits: vm?.spreadHits ?? NO_SPREAD_HITS,
    vigilance:
      vm !== null &&
      vm.vigilanceSummary !== null &&
      vm.vigilance.status === 'ready' &&
      vm.vigilance.value.department !== null
        ? { department: vm.vigilance.value.department.code, summary: vm.vigilanceSummary }
        : null,
  });

  const isFavourite =
    place !== null && preferences.preferences.favourites.some((f) => f.id === place.id);
  const displayName = place === null ? null : (place.alias ?? place.name);
  const metaPlace = resolvedPlace ?? place;

  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#contenu">
        Aller au relevé
      </a>
      {updateAvailable && <UpdateBanner onRefresh={applyUpdate} />}
      {!updateAvailable && installAvailable && !installDismissed && (
        <InstallPrompt
          onInstall={() => {
            void promptInstall();
          }}
          onDismiss={() => setInstallDismissed(true)}
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
            {place !== null && (
              <ShareButton
                className={styles.iconButton}
                title={place.alias ?? place.name}
                url={`${window.location.origin}${window.location.pathname}${sharedPlaceSearch(place, searchView, preferred)}`}
              />
            )}
            {place !== null && (
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => window.print()}
                aria-label="Imprimer le relevé"
                title="Imprimer le relevé"
              >
                <PrintIcon />
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
                metaPlace === null ? null : `${Math.round(metaPlace.elevation)} m`,
                terrain !== null ? TERRAIN_KIND_LABELS[terrain.kind] : null,
                coordinates(place),
              ]
                .filter((value): value is string => value !== null)
                .join(' · ')}
            </p>
            {vm !== null && (
              <p className={styles.printOnly}>
                Feuille de registre, imprimée le {formatLongDate(vm.today)}. Les valeurs sont des
                prévisions ou des estimations, jamais des mesures, sauf celles attribuées à une
                station.
              </p>
            )}
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
          onSetQuickReading={preferences.setQuickReading}
          onRestored={() => window.location.reload()}
          onSetPeakKwp={preferences.setPeakKwp}
          onPurge={preferences.purgeLocalData}
          onClose={() => setSettingsOpen(false)}
          watch={watch}
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
              {geolocation.isSupported && (
                <button
                  type="button"
                  className={styles.primaryAction}
                  onClick={geolocation.locate}
                  disabled={geolocation.state.status === 'loading'}
                >
                  Utiliser ma position
                </button>
              )}
              {geolocation.state.status === 'error' && (
                <p role="alert">{geolocation.state.message}</p>
              )}
              <ol className={styles.howto} aria-label="Comment lire ce carnet">
                <li>
                  Plusieurs modèles de prévision sont comparés ; celui qui convient le mieux au lieu
                  est choisi, et le choix est justifié.
                </li>
                <li>
                  Chaque valeur dit d’où elle vient : prévision d’un modèle nommé, estimation, ou
                  mesure d’une station.
                </li>
                <li>
                  Les modèles sont notés contre les mesures des stations voisines. La veille en
                  arrière-plan, facultative, se règle dans les réglages.
                </li>
              </ol>
              <div className={styles.examples}>
                <p className="note">
                  Ou ouvrir un lieu d’exemple, chacun sur un terrain différent :
                </p>
                <ul>
                  {EXAMPLE_PLACES.map((example) => (
                    <li key={example.place.id}>
                      <button
                        type="button"
                        aria-label={`${example.place.name}, ${example.terrain}`}
                        onClick={() => setPlace(example.place)}
                      >
                        {example.place.name}
                        <span>{example.terrain}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
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
              <p>{forecastFailureSentence(forecastState.failure, forecastState.failedAt)}</p>
              <button type="button" onClick={() => setPlace({ ...place })}>
                Réessayer
              </button>
            </div>
          )}

          {vm !== null && forecastState?.status === 'ready' && (
            <>
              {forecastState.result.stale && (
                <p className={styles.staleBanner}>
                  Hors ligne · Relevé du {formatFetchedAt(vm.bundle.fetchedAt)}, se met à jour dès
                  que le réseau revient
                </p>
              )}
              <div
                role="tabpanel"
                id={`releve-panel-${view}`}
                aria-labelledby={`releve-tab-${view}`}
                className={styles.panel}
              >
                <Suspense
                  fallback={
                    <div className={styles.loading} aria-busy="true" aria-label="Chargement">
                      <div className={styles.skeleton} />
                    </div>
                  }
                >
                  {view === 'jour' && <TodayView vm={vm} />}
                  {view === 'heures' && <HoursView vm={vm} />}
                  {view === 'jours' && <DaysView vm={vm} />}
                  {view === 'carte' && <MapView vm={vm} />}
                  {view === 'modeles' && <ModelsView vm={vm} />}
                  {view === 'fiabilite' && <ReliabilityView vm={vm} />}
                </Suspense>
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
          ERA5 et qualité de l’air Copernicus, radar RainViewer, éclairs EUMETSAT, fonds
          OpenStreetMap.
        </p>
        <p>
          <a href="/sources.html">Sources, licences et méthode</a>
        </p>
      </footer>
    </div>
  );
}
