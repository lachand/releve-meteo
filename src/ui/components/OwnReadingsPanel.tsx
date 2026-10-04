import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { getPreviousDay } from '../../data/repository';
import { compareReadings, readingProblem, readingsOf } from '../../domain/ownReadings';
import type { OwnReading, ReadingProblem } from '../../domain/ownReadings';
import type { ModelId, Place } from '../../domain/types';
import { formatLongDate } from '../format';
import { useDataset } from '../hooks/useDataset';
import type { OwnReadingsApi } from '../hooks/useOwnReadings';
import { MODEL_LABELS } from '../modelPresentation';
import {
  READING_PROBLEMS,
  comparisonHeadline,
  modelLine,
  predictionText,
  readingText,
} from '../ownReadingsPresentation';
import styles from './OwnReadingsPanel.module.css';

interface OwnReadingsPanelProps {
  readonly place: Place;
  /** Modeles disponibles pour ce lieu : ceux dont on compare la prevision de la veille. */
  readonly models: readonly ModelId[];
  /** Jour local, AAAA-MM-JJ. */
  readonly today: string;
  readonly store: OwnReadingsApi;
}

/** Nombre decimal saisi a la francaise (virgule) ou a l'anglaise ; vide ou illisible : absent. */
function parseField(text: string): number | null | 'invalid' {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : 'invalid';
}

/** Jours montres dans le tableau, au plus. */
const SHOWN_DAYS = 14;

/**
 * Mon relevé : vos propres mesures (thermometre, pluviometre), comparees a ce
 * que chaque modele avait prevu la veille pour ce lieu. « Mesuré par vous »
 * (observed) face a « prévu la veille » (forecast) : jamais melanges.
 */
export function OwnReadingsPanel({ place, models, today, store }: OwnReadingsPanelProps) {
  const id = useId().replace(/:/g, '');
  const mine = readingsOf(store.readings, place.id);
  const [date, setDate] = useState(() => yesterdayOf(today));
  const [tempMax, setTempMax] = useState('');
  const [tempMin, setTempMin] = useState('');
  const [rain, setRain] = useState('');
  const [problem, setProblem] = useState<ReadingProblem | 'number' | null>(null);

  // La prevision de la veille n'est lue que s'il y a quelque chose a comparer.
  const previous = useDataset(
    mine.length === 0 ? null : `previousDay|${place.id}|${[...models].sort().join(',')}`,
    () => getPreviousDay(place, models),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const fields = [parseField(tempMax), parseField(tempMin), parseField(rain)] as const;
    if (fields.some((field) => field === 'invalid')) {
      setProblem('number');
      return;
    }
    const [max, min, rainValue] = fields as readonly [number | null, number | null, number | null];
    const found = readingProblem({ date, tempMax: max, tempMin: min, rain: rainValue }, today);
    if (found !== null) {
      setProblem(found);
      return;
    }
    store.save({ placeId: place.id, date, tempMax: max, tempMin: min, rain: rainValue });
    setProblem(null);
    setTempMax('');
    setTempMin('');
    setRain('');
  };

  const comparison =
    previous.status === 'ready'
      ? compareReadings({ readings: mine, series: previous.value, today })
      : null;
  const captionId = `${id}-legende`;

  return (
    <div className={styles.panel}>
      <form className={styles.form} onSubmit={submit} aria-label="Nouvelle mesure">
        <label className={styles.field} htmlFor={`${id}-jour`}>
          <span>Jour</span>
          <input
            id={`${id}-jour`}
            type="date"
            value={date}
            max={today}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className={styles.field} htmlFor={`${id}-max`}>
          <span>Maximum (°C)</span>
          <input
            id={`${id}-max`}
            type="text"
            inputMode="decimal"
            value={tempMax}
            onChange={(event) => setTempMax(event.target.value)}
          />
        </label>
        <label className={styles.field} htmlFor={`${id}-min`}>
          <span>Minimum (°C)</span>
          <input
            id={`${id}-min`}
            type="text"
            inputMode="decimal"
            value={tempMin}
            onChange={(event) => setTempMin(event.target.value)}
          />
        </label>
        <label className={styles.field} htmlFor={`${id}-pluie`}>
          <span>Pluie (mm)</span>
          <input
            id={`${id}-pluie`}
            type="text"
            inputMode="decimal"
            value={rain}
            onChange={(event) => setRain(event.target.value)}
          />
        </label>
        <button type="submit" className={styles.add}>
          Enregistrer
        </button>
      </form>
      {problem !== null && (
        <p className={styles.problem} role="alert">
          {problem === 'number' ? 'Une valeur n’est pas un nombre.' : READING_PROBLEMS[problem]}
        </p>
      )}

      {mine.length === 0 ? (
        <p className={styles.muted}>
          Aucune mesure saisie pour {place.alias ?? place.name}. Notez le maximum, le minimum de
          votre thermomètre ou le cumul de votre pluviomètre : Relevé les compare à ce que chaque
          modèle avait prévu la veille, chez vous.
        </p>
      ) : (
        <>
          {previous.status === 'loading' && <p className={styles.muted}>Lecture des prévisions…</p>}
          {previous.status === 'error' && (
            <p className={styles.muted}>
              Prévisions de la veille indisponibles pour le moment : vos mesures sont gardées, la
              comparaison reviendra.
            </p>
          )}
          {comparison !== null && (
            <>
              <p className={styles.headline}>{comparisonHeadline(comparison)}</p>
              {comparison.models.length > 0 && (
                <ul className={styles.models} aria-label="Écart de chaque modèle à vos mesures">
                  {comparison.models.map((model) => (
                    <li key={model.model} data-donnee>
                      {modelLine(model)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <p id={captionId} className={styles.caption}>
            Les {Math.min(mine.length, SHOWN_DAYS)} dernières saisies. « Mesuré par vous » est ce
            que vous avez relevé ; chaque modèle est « prévu la veille ».
          </p>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className={styles.scroller} role="region" aria-labelledby={captionId} tabIndex={0}>
            <table className={styles.table} aria-labelledby={captionId}>
              <thead>
                <tr>
                  <th scope="col">Jour</th>
                  <th scope="col">Mesuré par vous</th>
                  {(comparison?.models ?? []).map((model) => (
                    <th key={model.model} scope="col">
                      {MODEL_LABELS[model.model]}, prévu la veille
                    </th>
                  ))}
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {mine.slice(0, SHOWN_DAYS).map((reading) => (
                  <ReadingRow
                    key={reading.date}
                    reading={reading}
                    comparison={comparison}
                    onRemove={() => store.remove(reading.placeId, reading.date)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className={styles.muted}>
        Gardé sur cet appareil et dans la sauvegarde. Un jour est comparé dès le lendemain, avec les
        prévisions de la veille des 30 derniers jours ; une mesure laissée vide n’est jamais lue
        comme un zéro.
      </p>
    </div>
  );
}

function ReadingRow({
  reading,
  comparison,
  onRemove,
}: {
  readonly reading: OwnReading;
  readonly comparison: ReturnType<typeof compareReadings> | null;
  readonly onRemove: () => void;
}) {
  const day = comparison?.days.find((d) => d.date === reading.date);
  return (
    <tr>
      <th scope="row">{formatLongDate(reading.date)}</th>
      <td data-donnee>{readingText(reading)}</td>
      {(comparison?.models ?? []).map((model) => {
        const prediction = day?.models.find((m) => m.model === model.model)?.prediction;
        return (
          <td key={model.model} data-donnee>
            {prediction === undefined ? 'pas encore comparable' : predictionText(prediction)}
          </td>
        );
      })}
      <td>
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          aria-label={`Supprimer la mesure du ${formatLongDate(reading.date)}`}
        >
          Supprimer
        </button>
      </td>
    </tr>
  );
}

/** La veille d'une date AAAA-MM-JJ (calendrier, midi UTC : sans effet de l'heure d'ete). */
function yesterdayOf(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
