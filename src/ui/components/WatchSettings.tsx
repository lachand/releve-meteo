import { localIsoFromUtc } from '../../domain/time';
import { androidApp } from '../../pwa/androidApp';
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

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Ce que Relevé peut notifier, et quand. Chaque case dit ce qui partira ; le
 * moment est soit une heure visee le matin, soit des qu'un avis est detecte.
 */
function NoticeSettings({ watch }: { readonly watch: BackgroundWatch }) {
  const { notify, setNotify } = watch;
  const morning = notify.mode === 'morning';
  return (
    <fieldset className={styles.notices}>
      <legend className={styles.noticesLegend}>Notifications météo</legend>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={watch.digest}
          onChange={(event) => watch.setDigest(event.target.checked)}
        />
        <span>
          Résumé du matin : le bulletin du moment (modèle nommé, écart des autres chiffré) et les 24
          heures à venir, pour vos favoris (trois au plus).
        </span>
      </label>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={notify.risks}
          onChange={(event) => setNotify({ risks: event.target.checked })}
        />
        <span>
          Phénomènes violents à venir : orage, forte pluie, vent fort, pluie verglaçante (niveau
          modéré ou fort), gel, neige, brouillard et chaleur (niveau fort), dans les 48 heures.
        </span>
      </label>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={notify.rain}
          onChange={(event) => setNotify({ rain: event.target.checked })}
        />
        <span>Pluie à venir : au plus tard dans les trois heures en mode immédiat.</span>
      </label>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={notify.pollen}
          onChange={(event) => setNotify({ pollen: event.target.checked })}
        />
        <span>Pollens à un niveau élevé (prévision CAMS Europe, 80 grains par m³ et plus).</span>
      </label>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={notify.lightning}
          onChange={(event) => setNotify({ lightning: event.target.checked })}
        />
        <span>
          Foudre à proximité : éclairs vus par le satellite MTG à moins de 30 km d’un favori sur les
          15 dernières minutes, à chaque veille, jamais groupés le matin. Une observation optique,
          pas un impact localisé au sol.
        </span>
      </label>
      <div className={styles.timing} role="radiogroup" aria-label="Quand notifier">
        <label className={styles.checkRow}>
          <input
            type="radio"
            name="notify-mode"
            checked={morning}
            onChange={() => setNotify({ mode: 'morning' })}
          />
          <span>
            Le matin, une notification groupée vers{' '}
            <select
              aria-label="Heure visée"
              value={notify.hour}
              onChange={(event) => setNotify({ hour: Number(event.target.value) })}
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}&nbsp;h
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className={styles.checkRow}>
          <input
            type="radio"
            name="notify-mode"
            checked={!morning}
            onChange={() => setNotify({ mode: 'instant' })}
          />
          <span>Dès qu’un avis est détecté, à chaque veille du navigateur.</span>
        </label>
      </div>
      <p className={styles.hint}>
        Sans serveur, l’heure n’est pas garantie : la notification du matin part à la première
        veille entre l’heure visée et six heures plus tard, et le navigateur choisit le moment des
        veilles (souvent quelques fois par jour). Il peut aussi ne pas se réveiller ce jour-là. Pour
        un risque vital, la vigilance officielle de Météo-France reste la référence.
      </p>
    </fieldset>
  );
}

/**
 * Dans l'application Android, la veille du navigateur n'existe pas : ce sont les
 * widgets qui rechargent la prevision. Le dire, plutot que renvoyer a un navigateur.
 */
function AndroidSettings() {
  return (
    <section className={styles.section} aria-labelledby="veille-titre">
      <p className="eyebrow" id="veille-titre">
        Widgets et veille
      </p>
      <p className={styles.explanation} role="status">
        Dans l’application Android, ce sont les widgets de l’écran d’accueil qui rechargent la
        prévision de vos favoris, environ toutes les heures : Android choisit le moment, jamais sans
        réseau ni en économie d’énergie, et un widget qui n’a pas pu se mettre à jour le dit. La
        veille par notification n’existe pas dans l’application : vos alertes sont évaluées à chaque
        ouverture.
      </p>
      <button
        type="button"
        className={styles.purgeButton}
        onClick={() => androidApp()?.refreshWidgets?.()}
      >
        Mettre à jour les widgets
      </button>
    </section>
  );
}

export function WatchSettings({ watch }: { readonly watch: BackgroundWatch }) {
  // L'appel passe toujours par l'objet du pont : une methode Java detachee ne s'execute pas.
  if (androidApp()?.refreshWidgets !== undefined) {
    return <AndroidSettings />;
  }
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
      {watch.status === 'on' && <NoticeSettings watch={watch} />}
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
