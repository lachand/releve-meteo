import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { AIR_DEFAULT_THRESHOLDS, AIR_VARIABLES } from '../../domain/airAlerts';
import type { AirHit } from '../../domain/airAlerts';
import { ALERT_HORIZON_HOURS } from '../../domain/alerts';
import type { AlertHit } from '../../domain/alerts';
import type { ProbabilityHit } from '../../domain/probabilityAlerts';
import type { SpreadHit } from '../../domain/spreadAlerts';
import type {
  AirVariable,
  AlertRule,
  NewAlertRule,
  Preferences,
  WeatherVariable,
} from '../../domain/types';
import {
  AIR_UNITS,
  AIR_VARIABLE_LABELS,
  ALERT_COMPARATOR_LABELS,
  ALERT_VARIABLE_LABELS,
  airHitSentence,
  alertUnit,
  hitSentence,
  probabilityHitSentence,
  ruleSentence,
  spreadHitSentence,
} from '../alertPresentation';
import { toKmh } from '../windUnit';
import styles from './Alerts.module.css';

/*
 * Alertes personnelles (BACKLOG.md Lot 7) : seuils choisis pour ce lieu,
 * evalues a chaque ouverture sur 72 h. Relevé n'a pas de serveur : hors de
 * la veille en arriere-plan (Reglages), il ne peut pas prevenir quand
 * l'application est fermee, et le dit.
 */

type WindUnit = Preferences['units']['wind'];

const VARIABLES: readonly WeatherVariable[] = ['temperature', 'precipitation', 'wind'];

/** Bandeau des regles franchies, en tete du releve. Rien si aucune. */
export function AlertBanner({
  hits,
  spreadHits = [],
  airHits = [],
  probabilityHits = [],
  windUnit,
}: {
  readonly hits: readonly AlertHit[];
  /** Regles d'ecart entre modeles depassees. */
  readonly spreadHits?: readonly SpreadHit[];
  /** Regles d'air, de pollens et d'UV depassees. */
  readonly airHits?: readonly AirHit[];
  /** Regles en probabilite (part des membres de l'ensemble) atteintes. */
  readonly probabilityHits?: readonly ProbabilityHit[];
  readonly windUnit: WindUnit;
}) {
  const total = hits.length + spreadHits.length + airHits.length + probabilityHits.length;
  if (total === 0) {
    return null;
  }
  return (
    <section className={styles.banner} aria-labelledby="alertes-franchies">
      <h2 id="alertes-franchies" className={styles.bannerTitle}>
        {total === 1 ? 'Votre alerte est franchie' : 'Vos alertes sont franchies'}
      </h2>
      <ul className={styles.hits}>
        {hits.map((hit) => (
          <li key={hit.rule.id}>
            <strong>{ruleSentence(hit.rule, windUnit)}</strong> : {hitSentence(hit, windUnit)}.
          </li>
        ))}
        {spreadHits.map((hit) => (
          <li key={hit.rule.id}>
            <strong>{ruleSentence(hit.rule, windUnit)}</strong> : {spreadHitSentence(hit, windUnit)}
            .
          </li>
        ))}
        {probabilityHits.map((hit) => (
          <li key={hit.rule.id}>
            <strong>{ruleSentence(hit.rule, windUnit)}</strong> : {probabilityHitSentence(hit)}.
          </li>
        ))}
        {airHits.map((hit) => (
          <li key={hit.rule.id}>
            <strong>{ruleSentence(hit.rule, windUnit)}</strong> : {airHitSentence(hit)}.
          </li>
        ))}
      </ul>
    </section>
  );
}

interface AlertRulesEditorProps {
  readonly placeId: string;
  readonly placeName: string;
  readonly rules: readonly AlertRule[];
  readonly windUnit: WindUnit;
  readonly onAdd: (rule: NewAlertRule) => void;
  readonly onToggle: (id: string) => void;
  readonly onRemove: (id: string) => void;
}

/** Regles de ce lieu : liste, activation, suppression, ajout. */
export function AlertRulesEditor({
  placeId,
  placeName,
  rules,
  windUnit,
  onAdd,
  onToggle,
  onRemove,
}: AlertRulesEditorProps) {
  const id = useId().replace(/:/g, '');
  const [kind, setKind] = useState<'value' | 'spread' | 'probability' | 'air'>('value');
  const [variable, setVariable] = useState<WeatherVariable>('temperature');
  const [airVariable, setAirVariable] = useState<AirVariable>('uv');
  const [comparator, setComparator] = useState<AlertRule['comparator']>('lt');
  const [threshold, setThreshold] = useState('2');
  const [probability, setProbability] = useState('40');
  const probabilityValue = Number(probability.replace(',', '.'));
  const probabilityValid =
    kind !== 'probability' ||
    (probability.trim() !== '' && probabilityValue > 0 && probabilityValue <= 100);
  const parsed = Number(threshold.replace(',', '.'));
  const valid = threshold.trim() !== '' && Number.isFinite(parsed) && probabilityValid;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    if (kind === 'air') {
      // Air, pollens et UV : toujours « au-dessus de », sur la prevision CAMS.
      onAdd({
        placeId,
        kind,
        variable: airVariable,
        comparator: 'gt',
        threshold: parsed,
        enabled: true,
      });
      return;
    }
    const converted = variable === 'wind' ? toKmh(parsed, windUnit) : parsed;
    // Une regle de valeur ne porte pas de `kind` : meme forme qu'avant l'alerte d'ecart.
    const rule: NewAlertRule =
      kind === 'spread'
        ? { placeId, variable, comparator: 'gt', threshold: converted, enabled: true, kind }
        : kind === 'probability'
          ? {
              placeId,
              variable,
              comparator,
              threshold: converted,
              enabled: true,
              kind,
              probability: Math.round(probabilityValue),
            }
          : { placeId, variable, comparator, threshold: converted, enabled: true };
    onAdd(rule);
  };

  return (
    <div className={styles.editor}>
      <p className={styles.note}>
        Évaluées à chaque ouverture du relevé, sur les {ALERT_HORIZON_HOURS} prochaines heures, avec
        le modèle retenu heure par heure ; une alerte « modèles en désaccord » compare à la place le
        plus haut et le plus bas des modèles disponibles ; une alerte en probabilité compte la part
        des scénarios de l’ensemble ECMWF qui franchissent le seuil (une proportion de trajectoires
        plausibles, pas un risque étalonné) ; une alerte d’air, de pollens ou d’UV suit la prévision
        CAMS Europe, toujours « au-dessus de ». Sans serveur, Relevé ne peut vous prévenir
        application fermée que par la veille en arrière-plan, là où le navigateur la permet
        (Réglages).
      </p>

      {rules.length === 0 ? (
        <p className={styles.muted}>Aucune alerte pour {placeName}.</p>
      ) : (
        <ul className={styles.rules} aria-label={`Alertes pour ${placeName}`}>
          {rules.map((rule) => (
            <li key={rule.id} className={styles.rule}>
              <label className={styles.toggle}>
                <input type="checkbox" checked={rule.enabled} onChange={() => onToggle(rule.id)} />
                <span>{ruleSentence(rule, windUnit)}</span>
              </label>
              <button
                type="button"
                className={styles.remove}
                onClick={() => onRemove(rule.id)}
                aria-label={`Supprimer l’alerte ${ruleSentence(rule, windUnit)}`}
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className={styles.form} onSubmit={submit} aria-label="Nouvelle alerte">
        <label className={styles.field} htmlFor={`${id}-type`}>
          <span>Type</span>
          <select
            id={`${id}-type`}
            value={kind}
            onChange={(event) => {
              const next = event.target.value as 'value' | 'spread' | 'probability' | 'air';
              setKind(next);
              if (next === 'air') {
                setThreshold(String(AIR_DEFAULT_THRESHOLDS[airVariable]));
              }
            }}
          >
            <option value="value">Valeur franchie</option>
            <option value="spread">Modèles en désaccord</option>
            <option value="probability">Probabilité (ensemble)</option>
            <option value="air">Air, pollens ou UV</option>
          </select>
        </label>
        <label className={styles.field} htmlFor={`${id}-grandeur`}>
          <span>Grandeur</span>
          {kind === 'air' ? (
            <select
              id={`${id}-grandeur`}
              value={airVariable}
              onChange={(event) => {
                const next = event.target.value as AirVariable;
                setAirVariable(next);
                setThreshold(String(AIR_DEFAULT_THRESHOLDS[next]));
              }}
            >
              {AIR_VARIABLES.map((option) => (
                <option key={option} value={option}>
                  {AIR_VARIABLE_LABELS[option]}
                </option>
              ))}
            </select>
          ) : (
            <select
              id={`${id}-grandeur`}
              value={variable}
              onChange={(event) => setVariable(event.target.value as WeatherVariable)}
            >
              {VARIABLES.map((option) => (
                <option key={option} value={option}>
                  {ALERT_VARIABLE_LABELS[option]}
                </option>
              ))}
            </select>
          )}
        </label>
        {(kind === 'value' || kind === 'probability') && (
          <label className={styles.field} htmlFor={`${id}-sens`}>
            <span>Sens</span>
            <select
              id={`${id}-sens`}
              value={comparator}
              onChange={(event) => setComparator(event.target.value as AlertRule['comparator'])}
            >
              <option value="lt">{ALERT_COMPARATOR_LABELS.lt}</option>
              <option value="gt">{ALERT_COMPARATOR_LABELS.gt}</option>
            </select>
          </label>
        )}
        <label className={styles.field} htmlFor={`${id}-seuil`}>
          <span>
            {kind === 'spread' ? 'Écart entre modèles' : 'Seuil'}{' '}
            {kind === 'air'
              ? AIR_UNITS[airVariable] === ''
                ? '(indice)'
                : `(${AIR_UNITS[airVariable]})`
              : `(${alertUnit(variable, windUnit)})`}
          </span>
          <input
            id={`${id}-seuil`}
            type="text"
            inputMode="decimal"
            value={threshold}
            aria-invalid={!valid}
            onChange={(event) => setThreshold(event.target.value)}
          />
        </label>
        {kind === 'probability' && (
          <label className={styles.field} htmlFor={`${id}-proba`}>
            <span>Au moins (% des scénarios)</span>
            <input
              id={`${id}-proba`}
              type="text"
              inputMode="decimal"
              value={probability}
              aria-invalid={!probabilityValid}
              onChange={(event) => setProbability(event.target.value)}
            />
          </label>
        )}
        <button type="submit" className={styles.add} disabled={!valid}>
          Ajouter
        </button>
      </form>
    </div>
  );
}
