import L from 'leaflet';
import styles from './mapBase.module.css';
import { OSM_TILE_URL } from './tileSource';

/*
 * Fond de carte commun au radar et a la carte de prevision : tuiles
 * OpenStreetMap passees en gris sepia (encre claire sur papier, ou papier
 * de nuit en theme sombre), dans un volet a part pour que le filtre ne
 * touche jamais les couches de donnees posees par-dessus.
 */

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const BASE_PANE = 'fond';

export function addPaperBaseLayer(map: L.Map): L.TileLayer {
  const pane = map.getPane(BASE_PANE) ?? map.createPane(BASE_PANE);
  if (styles.fond !== undefined) {
    pane.classList.add(styles.fond);
  }
  // Sous les couches de tuiles de donnees (volet 'tilePane', z-index 200).
  pane.style.zIndex = '150';
  // crossOrigin : OSM envoie Access-Control-Allow-Origin: *. Sans cette
  // option, les tuiles arrivent en reponses opaques que le service worker
  // ne peut pas horodater (sw.ts, piege 1).
  return L.tileLayer(OSM_TILE_URL, {
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
    crossOrigin: true,
    pane: BASE_PANE,
  }).addTo(map);
}

/**
 * Detruit une carte. Leaflet 1.9 acheve une animation de zoom par une
 * minuterie de 250 ms liee au moment du zoom, qui s'execute meme apres
 * remove() et leve alors une erreur (volets detruits) : quitter l'onglet
 * pendant un zoom suffisait. La minuterie ne fait rien si la carte n'est
 * plus marquee « en train de zoomer ».
 */
export function removeMap(map: L.Map): void {
  (map as unknown as { _animatingZoom: boolean })._animatingZoom = false;
  map.remove();
}
