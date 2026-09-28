import { WeatherSymbol } from '../symbols/WeatherSymbol';
import { WindBarb } from '../symbols/WindBarb';
import { weatherCodeLabel } from '../weatherCodePresentation';
import styles from './SymbolLegend.module.css';

const CODES = [
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 61, 63, 65, 66, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96,
] as const;

const BARBS: readonly { readonly kmh: number; readonly label: string }[] = [
  { kmh: 2, label: 'calme' },
  { kmh: 9, label: '5 nœuds' },
  { kmh: 19, label: '10 nœuds' },
  { kmh: 46, label: '25 nœuds' },
  { kmh: 93, label: '50 nœuds' },
];

/**
 * Planche de référence des symboles synoptiques employés par le relevé,
 * chacun avec son libellé : le symbole n'est jamais la seule information.
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
      </ul>
      <ul className={styles.grid} aria-label="Barbules de vent">
        {BARBS.map((barb) => (
          <li key={barb.label} className={styles.item}>
            <WindBarb speedKmh={barb.kmh} directionDeg={270} size={36} />
            <span>Vent d’ouest, {barb.label}</span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        Le cercle de station se remplit par huitièmes de ciel couvert ; la hampe du vent pointe d’où
        il vient.
      </p>
    </div>
  );
}
