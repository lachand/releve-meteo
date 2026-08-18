import { useEffect, useState } from 'react';
import type { Place } from '../../domain/types';
import { blendDaily } from '../dailyBlend';
import { useAppliedTheme } from '../hooks/useAppliedTheme';
import { useCascadeView } from '../hooks/useCascadeView';
import { useConfidenceView } from '../hooks/useConfidenceView';
import { useForecast } from '../hooks/useForecast';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { usePreferences } from '../hooks/usePreferences';
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate';
import { useTerrain } from '../hooks/useTerrain';
import { TERRAIN_KIND_LABELS } from '../modelPresentation';
import { parseSharedPlace, sharedPlaceSearch } from '../sharedPlace';
import { ComparisonView } from '../components/ComparisonView';
import { InstallPrompt } from '../components/InstallPrompt';
import { ModelInfoPanel } from '../components/ModelInfoPanel';
import { NowBlock } from '../components/NowBlock';
import { PlaceSearch } from '../components/PlaceSearch';
import { PlaceSwitcher } from '../components/PlaceSwitcher';
import { PrecipitationChart } from '../components/PrecipitationChart';
import { Settings } from '../components/Settings';
import { SevenDayView } from '../components/SevenDayView';
import { Timeline48h } from '../components/Timeline48h';
import { UpdateBanner } from '../components/UpdateBanner';
import styles from './App.module.css';

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

export function App() {
  const [place, setPlace] = useState<Place | null>(() => parseSharedPlace(window.location.search));
  const [comparing, setComparing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();
  const { available: installAvailable, promptInstall } = useInstallPrompt();
  const preferences = usePreferences();
  const forecastState = useForecast(place);
  const bundle = forecastState?.status === 'ready' ? forecastState.result.bundle : null;
  const cascade = useCascadeView(bundle);
  const terrain = useTerrain(place);
  const confidence = useConfidenceView(bundle, terrain);

  useAppliedTheme(preferences.preferences.theme);

  useEffect(() => {
    if (place === null) {
      return;
    }
    const search = sharedPlaceSearch(place);
    if (window.location.search !== search) {
      window.history.replaceState(null, '', search);
    }
  }, [place]);

  const isFavourite =
    place !== null && preferences.preferences.favourites.some((f) => f.id === place.id);

  const nowPoint =
    bundle !== null && cascade !== null && cascade.activeModel !== null && cascade.nowIndex !== -1
      ? (bundle.series[cascade.activeModel]?.hourly[cascade.nowIndex] ?? null)
      : null;

  return (
    <div className={styles.page}>
      {updateAvailable && <UpdateBanner onRefresh={applyUpdate} />}
      {!updateAvailable && installAvailable && (
        <InstallPrompt
          onInstall={() => {
            void promptInstall();
          }}
        />
      )}
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Relevé</p>
          <h1>{place === null ? 'Aucun lieu selectionne' : place.name}</h1>
          {place !== null && (
            <p className={styles.placeMeta}>
              {[
                place.admin,
                `${Math.round(place.elevation)} m`,
                terrain !== null ? TERRAIN_KIND_LABELS[terrain.kind] : null,
              ]
                .filter((value): value is string => value !== null)
                .join(' · ')}
            </p>
          )}
        </div>
        <div className={styles.headerActions}>
          <div className={styles.searchColumn}>
            <PlaceSearch onSelect={setPlace} />
          </div>
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
            onClick={() => setSettingsOpen(true)}
            aria-label="Réglages"
            title="Réglages"
          >
            ⚙
          </button>
        </div>
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

      {!settingsOpen && (
        <main>
          {place === null && (
            <div className={styles.emptyState}>
              <p>Aucun lieu enregistre.</p>
              <p>Cherchez une commune ou utilisez votre position pour voir sa prevision.</p>
            </div>
          )}

          {place !== null && forecastState?.status === 'loading' && (
            <div
              className={styles.section}
              aria-busy="true"
              aria-label="Chargement de la prevision"
            >
              <div className={styles.skeleton} />
            </div>
          )}

          {place !== null && forecastState?.status === 'error' && (
            <div className={styles.errorState} role="alert">
              <p>Prevision indisponible.</p>
              <p>Le service de prevision ne repond pas.</p>
              <button type="button" onClick={() => setPlace({ ...place })}>
                Reessayer
              </button>
            </div>
          )}

          {place !== null &&
            forecastState?.status === 'ready' &&
            bundle !== null &&
            cascade !== null && (
              <>
                {forecastState.result.stale && (
                  <p className={styles.staleBanner}>
                    Hors ligne · Releve du {formatFetchedAt(bundle.fetchedAt)}
                  </p>
                )}

                <section className={styles.section}>
                  <p className="eyebrow">Maintenant</p>
                  <NowBlock
                    point={nowPoint}
                    model={cascade.activeModel}
                    windUnit={preferences.preferences.units.wind}
                  />
                </section>

                {comparing ? (
                  <section className={styles.section}>
                    <ComparisonView
                      bundle={bundle}
                      nowIndex={cascade.nowIndex}
                      onClose={() => setComparing(false)}
                    />
                  </section>
                ) : (
                  <div className={styles.detailLayout}>
                    <div>
                      <section className={styles.section}>
                        <p className="eyebrow">48 heures</p>
                        <Timeline48h bundle={bundle} cascade={cascade} confidence={confidence} />
                      </section>

                      <section className={styles.section}>
                        <p className="eyebrow">Précipitations</p>
                        <PrecipitationChart bundle={bundle} cascade={cascade} />
                      </section>

                      <section className={styles.section}>
                        <p className="eyebrow">7 jours</p>
                        <SevenDayView days={blendDaily(bundle)} />
                      </section>
                    </div>

                    {cascade.activeModel !== null &&
                      terrain !== null &&
                      cascade.nowIndex !== -1 && (
                        <aside className={styles.sidePanel}>
                          <ModelInfoPanel
                            bundle={bundle}
                            nowIndex={cascade.nowIndex}
                            activeModel={cascade.activeModel}
                            available={cascade.available}
                            terrain={terrain}
                            onCompareClick={() => setComparing(true)}
                          />
                        </aside>
                      )}
                  </div>
                )}
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
    </div>
  );
}
