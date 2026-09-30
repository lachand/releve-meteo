import type { MountainOutlook } from '../../domain/mountainOutlook';
import { freezingSentence, snowSentence } from '../mountainPresentation';
import styles from './DryWindowPanel.module.css';

/* Isotherme 0 °C et neige des 72 heures : deux phrases, chacune avec son modele. */

export function MountainPanel({ outlook }: { readonly outlook: MountainOutlook }) {
  return (
    <div className={styles.panel}>
      <p className={styles.sentence}>{freezingSentence(outlook)}</p>
      <p className={styles.sentence}>{snowSentence(outlook)}</p>
      <p className={styles.criteria}>
        L’isotherme 0 °C est l’altitude où l’air passe sous zéro : au-dessus, la précipitation tombe
        en neige. La neige est le cumul des heures annoncées par le modèle retenu.
      </p>
    </div>
  );
}
