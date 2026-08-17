import { useState } from 'react';
import type { Place } from '../../domain/types';
import { blendDaily } from '../dailyBlend';
import { useCascadeView } from '../hooks/useCascadeView';
import { useConfidenceView } from '../hooks/useConfidenceView';
import { useForecast } from '../hooks/useForecast';
import { useTerrain } from '../hooks/useTerrain';
import { ComparisonView } from '../components/ComparisonView';
import { ModelInfoPanel } from '../components/ModelInfoPanel';
import { NowBlock } from '../components/NowBlock';
import { PlaceSearch } from '../components/PlaceSearch';
import { PrecipitationChart } from '../components/PrecipitationChart';
import { SevenDayView } from '../components/SevenDayView';
import { Timeline48h } from '../components/Timeline48h';
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
  const [place, setPlace] = useState<Place | null>(null);
  const [comparing, setComparing] = useState(false);
  const forecastState = useForecast(place);
  const bundle = forecastState?.status === 'ready' ? forecastState.result.bundle : null;
  const cascade = useCascadeView(bundle);
  const terrain = useTerrain(place);
  const confidence = useConfidenceView(bundle, terrain);

  const nowPoint =
    bundle !== null && cascade !== null && cascade.activeModel !== null && cascade.nowIndex !== -1
      ? (bundle.series[cascade.activeModel]?.hourly[cascade.nowIndex] ?? null)
      : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Relevé</p>
          <h1>
            {place === null
              ? 'Aucun lieu selectionne'
              : `${place.name}${place.admin !== null ? ` · ${place.admin}` : ''}`}
          </h1>
        </div>
        <div className={styles.searchColumn}>
          <PlaceSearch onSelect={setPlace} />
        </div>
      </header>

      <main>
        {place === null && (
          <div className={styles.emptyState}>
            <p>Aucun lieu enregistre.</p>
            <p>Cherchez une commune ou utilisez votre position pour voir sa prevision.</p>
          </div>
        )}

        {place !== null && forecastState?.status === 'loading' && (
          <div className={styles.section} aria-busy="true" aria-label="Chargement de la prevision">
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
                <NowBlock point={nowPoint} model={cascade.activeModel} />
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

                  {cascade.activeModel !== null && terrain !== null && cascade.nowIndex !== -1 && (
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
    </div>
  );
}
