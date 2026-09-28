import { WeatherSymbol } from '../symbols/WeatherSymbol';
import { WindArrow } from '../symbols/WindArrow';
import { weatherCodeLabel } from '../weatherCodePresentation';
import styles from './SymbolLegend.module.css';

const CODES = [
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 61, 63, 65, 66, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96,
] as const;

/** La nuit, la lune remplace le soleil. */
const NIGHT_CODES = [0, 2, 80] as const;

const WINDS: readonly { readonly kmh: number; readonly from: number; readonly label: string }[] = [
  { kmh: 3, from: 270, label: 'Calme, moins de 5 km/h' },
  { kmh: 12, from: 270, label: 'Vent d’ouest faible : il va vers l’est' },
  { kmh: 30, from: 180, label: 'Vent du sud modéré : il va vers le nord' },
  { kmh: 50, from: 0, label: 'Vent du nord fort, 40 km/h et plus' },
  { kmh: 75, from: 315, label: 'Vent du nord-ouest très fort, 60 km/h et plus' },
];
/**
 * Planche de référence des pictogrammes employés par le relevé, chacun
 * avec son libellé : le pictogramme n'est jamais la seule information.
 */
export function SymbolLegend() {
  return (
    <div className={styles.legend}>
      <ul className={styles.grid} aria-label="Symboles de temps présent">
        {CODES.map((code) => (
          <li key={code} className={styles.item}>
            <WeatherSymbol code={code} size={32} decorative />
            <span>{weatherCodeLabel(code)}</span>
          </li>
        ))}
        {NIGHT_CODES.map((code) => (
          <li key={`nuit-${code}`} className={styles.item}>
            <WeatherSymbol code={code} isDay={false} size={32} decorative />
            <span>{weatherCodeLabel(code)}, la nuit</span>
          </li>
        ))}
      </ul>
      <ul className={styles.grid} aria-label="Flèches de vent">
        {WINDS.map((wind) => (
          <li key={wind.label} className={styles.item}>
            <WindArrow speedKmh={wind.kmh} directionDeg={wind.from} size={32} />
            <span>{wind.label}</span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        Plus il y a de gouttes ou de flocons, plus la pluie ou la neige est forte ; un cristal de
        glace signale le verglas. La flèche montre où va le vent et s’épaissit quand il forcit ; le
        texte « du SO » dit d’où il vient, comme dans les bulletins.
      </p>
    </div>
  );
}
