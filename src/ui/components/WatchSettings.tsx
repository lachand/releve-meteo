import { localIsoFromUtc } from '../../domain/time';
import { formatDayHour } from '../format';
import type { BackgroundWatch } from '../hooks/useBackgroundWatch';
import styles from './Settings.module.css';

/*
 * Reglage de la veille en arriere-plan. Chaque etat dit ce qui se passera
 * vraiment : ni promesse de notification sur un navigateur qui ne la
 * permet pas, ni « temps reel » la ou le navigateur choisit le rythme.
 */

const LIMITS =
  'C’est le navigateur qui choisit le moment : en général quelques fois par jour au plus, jamais sans réseau ni en économie d’énergie. Ce n’est pas une alerte en temps réel : la vigilance officielle reste la référence.';

function lastRun(watch: BackgroundWatch): string {
  return watch.lastRunUtcMs === null
    ? 'Aucune veille menée pour l’instant.'
    : `Dernière veille : ${formatDayHour(localIsoFromUtc(watch.lastRunUtcMs))}.`;
}

function statusText(watch: BackgroundWatch): string {
  switch (watch.status) {
    case null:
      return 'Vérification de ce que permet ce navigateur…';
    case 'unsupported':
      return 'Ce navigateur ne permet pas la veille en arrière-plan : vos alertes sont évaluées à chaque ouverture du relevé. Chrome et Edge la permettent, une fois Relevé installé comme application.';
    case 'blocked':
      return 'Les notifications de Relevé sont bloquées dans les réglages du navigateur : la veille ne peut pas vous prévenir. Autorisez-les pour ce site pour recevoir des alertes ; vous pouvez en attendant collecter les prévisions sans notification.';
    case 'needs-install':
      return 'Le navigateur n’accorde la veille qu’aux applications installées : installez Relevé (menu du navigateur, « Installer l’application »), puis activez-la depuis l’application.';
    case 'off':
      return 'Relevé peut recharger de temps en temps la prévision de vos favoris et des lieux qui ont des alertes, et vous notifier une alerte personnelle franchie ou une vigilance Météo-France orange ou rouge, application fermée. Sans notification, Relevé peut aussi seulement enregistrer en arrière-plan les prévisions de vos favoris, pour noter les modèles à courte échéance.';
    case 'collecting':
      return `Collecte active, sans notification : Relevé enregistre en arrière-plan les prévisions de vos favoris pour noter les modèles à courte échéance, sans rien afficher. Vos alertes restent évaluées à chaque ouverture. ${lastRun(watch)}`;
    case 'on':
      return `Veille active pour vos favoris et les lieux qui ont des alertes : alerte personnelle franchie, vigilance Météo-France orange ou rouge, avec le modèle retenu comme dans le relevé. Elle enregistre aussi les prévisions pour noter les modèles à courte échéance. ${lastRun(watch)}`;
  }
}

export function WatchSettings({ watch }: { readonly watch: BackgroundWatch }) {
  const canEnable = watch.status === 'off' || watch.status === 'needs-install';
  return (
    <section className={styles.section} aria-labelledby="veille-titre">
      <p className="eyebrow" id="veille-titre">
        Veille en arrière-plan
      </p>
      <p className={styles.explanation} role="status">
        {statusText(watch)}
      </p>
      {watch.status !== null && watch.status !== 'unsupported' && (
        <p className={styles.explanation}>{LIMITS}</p>
      )}
      {canEnable && (
        <button
          type="button"
          className={styles.purgeButton}
          onClick={watch.enable}
          disabled={watch.busy}
        >
          Activer la veille
        </button>
      )}
      {(watch.status === 'off' || watch.status === 'blocked') && (
        <button
          type="button"
          className={styles.purgeButton}
          onClick={watch.collect}
          disabled={watch.busy}
        >
          Collecter sans notification
        </button>
      )}
      {watch.status === 'collecting' && (
        <button
          type="button"
          className={styles.purgeButton}
          onClick={watch.allow}
          disabled={watch.busy}
        >
          Autoriser les notifications
        </button>
      )}
      {watch.status === 'on' && (
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={watch.digest}
            onChange={(event) => watch.setDigest(event.target.checked)}
          />
          <span>
            Résumé du matin : une notification par favori (trois au plus), avec le bulletin du
            moment et les 24 heures à venir.{' '}
            <span className={styles.hint}>
              Elle part à la première veille entre 6 h et midi : l’heure exacte dépend du
              navigateur, qui peut aussi ne pas se réveiller ce jour-là.
            </span>
          </span>
        </label>
      )}
      {(watch.status === 'on' || watch.status === 'collecting') && (
        <button
          type="button"
          className={styles.purgeButton}
          onClick={watch.disable}
          disabled={watch.busy}
        >
          Arrêter la veille
        </button>
      )}
    </section>
  );
}
