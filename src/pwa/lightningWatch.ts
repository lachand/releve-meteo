import { fetchLightningFrames } from '../data/clients/lightning';
import { LIGHTNING_WATCH, lightningNear } from '../domain/lightning';
import type { ActiveMask, LightningNear } from '../domain/lightning';

/*
 * Eclairs a proximite d'un lieu, lus par la veille : les dernieres images de
 * l'imageur d'eclairs du satellite MTG, decodees pour savoir quels pixels
 * portent un eclair (un pixel opaque : au moins un eclair en 5 minutes).
 */

/** Lit les pixels actifs d'une image ; null si elle ne se charge pas ou ne se decode pas. */
export type MaskReader = (url: string) => Promise<ActiveMask | null>;

/** Decodage dans un service worker : fetch, createImageBitmap et OffscreenCanvas. */
export const readActiveMask: MaskReader = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (context === null) {
      return null;
    }
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const active: boolean[] = [];
    for (let index = 3; index < data.length; index += 4) {
      // Fond transparent : seuls les pixels colores portent un eclair.
      active.push((data[index] ?? 0) > 0);
    }
    return { width: bitmap.width, height: bitmap.height, active };
  } catch {
    return null;
  }
};

/**
 * Eclairs vus a moins de 30 km du lieu sur les 15 dernieres minutes, ou null
 * (aucun, ou satellite et service injoignables : la veille suivante reessaiera).
 */
export async function loadLightningNear(
  center: { readonly latitude: number; readonly longitude: number },
  read: MaskReader = readActiveMask,
): Promise<LightningNear | null> {
  const result = await fetchLightningFrames(center, undefined, {
    halfExtentKm: LIGHTNING_WATCH.halfExtentKm,
    width: LIGHTNING_WATCH.width,
    count: LIGHTNING_WATCH.frames,
  });
  if (!result.ok) {
    return null;
  }
  const { area, frames } = result.value;
  const masks = await Promise.all(frames.map((frame) => read(frame.imageUrl)));
  const decoded = frames.flatMap((frame, index) => {
    const mask = masks[index];
    return mask === null || mask === undefined ? [] : [{ time: frame.time, mask }];
  });
  return lightningNear({ center, area, frames: decoded });
}
