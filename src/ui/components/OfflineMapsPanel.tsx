import { useRef, useState } from 'react';
import { TILE_PLAN, estimateTileBytes, tilePlan } from '../../domain/tiles';
import type { Place } from '../../domain/types';
import { downloadTiles, tilesCanBeKept } from '../../pwa/offlineTiles';
import type { TileDownload } from '../../pwa/offlineTiles';
import { formatOneDecimal } from '../format';
import { OSM_TILE_URL } from '../tileSource';
import styles from './Settings.module.css';

function megabytes(bytes: number): string {
  return `${formatOneDecimal(bytes / 1_000_000)}\u00a0Mo`;
}

/**
 * Cartes hors ligne : telecharge a l'avance les tuiles autour des favoris,
 * pour que le fond de carte s'affiche sans reseau. Le poids est annonce avant,
 * comme estimation ; le telechargement est lance, suivi et arretable par
 * l'utilisateur, et reste petit : OpenStreetMap demande un usage mesure.
 */
export function OfflineMapsPanel({ favourites }: { readonly favourites: readonly Place[] }) {
  const [progress, setProgress] = useState<TileDownload | null>(null);
  const [outcome, setOutcome] = useState<TileDownload | null>(null);
  const controller = useRef<AbortController | null>(null);

  const plan = tilePlan({
    places: favourites.slice(0, TILE_PLAN.maxPlaces),
    zooms: TILE_PLAN.zooms,
    radius: TILE_PLAN.radius,
    maxTiles: TILE_PLAN.maxTiles,
  });
  const running = progress !== null;
  const kept = tilesCanBeKept();

  const start = async () => {
    const abort = new AbortController();
    controller.current = abort;
    setOutcome(null);
    setProgress({ done: 0, failed: 0, total: plan.tiles.length });
    const result = await downloadTiles({
      tiles: plan.tiles,
      template: OSM_TILE_URL,
      onProgress: setProgress,
      signal: abort.signal,
    });
    controller.current = null;
    setProgress(null);
    setOutcome(result);
  };

  return (
    <section className={styles.section} aria-labelledby="cartes-hors-ligne-titre">
      <p className="eyebrow" id="cartes-hors-ligne-titre">
        Cartes hors ligne
      </p>
      {favourites.length === 0 ? (
        <p className={styles.explanation}>
          Ajoutez un lieu aux favoris pour télécharger à l’avance le fond de carte autour de lui.
        </p>
      ) : (
        <>
          <p className={styles.explanation}>
            Télécharge le fond de carte (OpenStreetMap) autour de{' '}
            {plan.tiles.length > 0 ? 'vos ' : ''}
            {Math.min(favourites.length, TILE_PLAN.maxPlaces)}{' '}
            {favourites.length > 1 ? 'premiers favoris' : 'favori'}, pour l’afficher sans réseau :{' '}
            {plan.tiles.length} tuiles, environ {megabytes(estimateTileBytes(plan.tiles.length))}{' '}
            (estimation).
            {plan.truncated && ' Le plafond de tuiles laisse de côté une partie de la zone.'}{' '}
            OpenStreetMap demande un usage mesuré : le téléchargement reste petit et ne se lance que
            sur votre demande.
          </p>
          {!kept && (
            <p className={styles.explanation}>
              Le service worker ne contrôle pas encore cette page : rechargez-la une fois, ou
              installez l’application, pour que les tuiles soient gardées.
            </p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.purgeButton}
              onClick={() => void start()}
              disabled={running || plan.tiles.length === 0}
            >
              Télécharger les cartes
            </button>
            {running && (
              <button
                type="button"
                className={styles.purgeButton}
                onClick={() => controller.current?.abort()}
              >
                Arrêter
              </button>
            )}
          </div>
          {progress !== null && (
            <p className={styles.status} role="status">
              {progress.done + progress.failed} tuiles sur {progress.total}…
            </p>
          )}
          {outcome !== null && (
            <p className={styles.status} role="status">
              {outcome.done} tuiles téléchargées sur {outcome.total}
              {outcome.failed > 0
                ? `, ${outcome.failed} en échec (réseau, ou limite du service)`
                : ''}
              .
            </p>
          )}
        </>
      )}
    </section>
  );
}
