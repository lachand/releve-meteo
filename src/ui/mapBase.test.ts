import L from 'leaflet';
import { describe, expect, it } from 'vitest';
import { removeMap } from './mapBase';

type Animating = L.Map & { _animatingZoom: boolean; _onZoomTransitionEnd: () => void };

describe('removeMap', () => {
  it('detruit une carte en plein zoom sans erreur quand l animation s acheve ensuite', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const map = L.map(container).setView([45.75, 4.83], 7) as Animating;
    // Leaflet 1.9 acheve l'animation par une minuterie de 250 ms, liee au
    // moment du zoom : elle s'execute meme apres remove().
    map._animatingZoom = true;
    const finishZoom = map._onZoomTransitionEnd.bind(map);
    removeMap(map);
    expect(finishZoom).not.toThrow();
    container.remove();
  });
});
