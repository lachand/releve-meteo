import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import type { VerificationReference, VerificationReport } from '../../data/clients/verification';
import { MODEL_ORDER } from '../../domain/models';
import type { ModelVerification } from '../../domain/reliability';
import type { ModelId, WeatherVariable } from '../../domain/types';
import { Chart, TOOLTIP_STYLE, axisX, axisY } from '../chartTheme';
import {
  MISSING,
  formatCompact,
  formatDayMonth,
  formatInteger,
  formatOneDecimal,
  formatPercent,
} from '../format';
import type { DatasetState } from '../hooks/useDataset';
import { MODEL_LABELS, modelColor, modelColorVar } from '../modelPresentation';
import { VARIABLE_LABELS, VARIABLE_UNITS } from '../selectionExplanation';
import styles from './ReliabilityPanel.module.css';

const LEADS = [1, 2, 3, 5, 7] as const;
const VARIABLES: readonly WeatherVariable[] = ['temperature', 'precipitation', 'wind'];

function referenceSentence(reference: VerificationReference): string {
  const period = `du ${formatDayMonth(reference.window.startDate)} au ${formatDayMonth(reference.window.endDate)}`;
  if (reference.provenance === 'observed' && reference.station !== null) {
    const { station, distanceKm, elevationDelta } = reference.station;
    const delta =
      elevationDelta === null
        ? 'altitude inconnue'
        : `${elevationDelta >= 0 ? '+' : '−'}${formatInteger(Math.abs(elevationDelta))} m`;
    return `mesures de la station ${station.name} (${formatCompact(distanceKm)} km, ${delta}), ${period}`;
  }
  return `réanalyse ERA5, une estimation et non une mesure, ${period}`;
}

function cell(
  verification: readonly ModelVerification[],
  model: ModelId,
  variable: WeatherVariable,
  lead: number,
): ModelVerification | undefined {
  return verification.find(
    (v) => v.model === model && v.variable === variable && v.leadDays === lead,
  );
}

function ErrorByLeadChart({
  verification,
}: {
  readonly verification: readonly ModelVerification[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const models = MODEL_ORDER.filter((model) =>
      LEADS.some((lead) => cell(verification, model, 'temperature', lead)?.stats != null),
    );
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: LEADS.map((lead) => `J+${lead}`),
        datasets: models.map((model) => ({
          label: MODEL_LABELS[model],
          data: LEADS.map(
            (lead) => cell(verification, model, 'temperature', lead)?.stats?.mae ?? null,
          ),
          borderColor: modelColor(model),
          backgroundColor: modelColor(model),
          borderWidth: 2,
          pointRadius: 3,
          spanGaps: true,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: { x: axisX(5), y: { ...axisY('°C'), beginAtZero: true } },
        plugins: {
          tooltip: {
            ...TOOLTIP_STYLE,
            displayColors: true,
            callbacks: {
              label: (item) =>
                `${item.dataset.label ?? ''} : ${formatOneDecimal(item.parsed.y)} °C`,
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [verification]);
  return (
    <div className={styles.chart}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Erreur moyenne de température par modèle selon l'échéance"
      />
    </div>
  );
}

function VariableTable({
  variable,
  verification,
}: {
  readonly variable: WeatherVariable;
  readonly verification: readonly ModelVerification[];
}) {
  const unit = VARIABLE_UNITS[variable];
  const models = MODEL_ORDER.filter((model) =>
    LEADS.some((lead) => cell(verification, model, variable, lead) !== undefined),
  );
  if (models.length === 0) {
    return <p className={styles.muted}>Aucune donnée appariée pour cette grandeur.</p>;
  }
  const best = new Map<number, number>();
  for (const lead of LEADS) {
    const values = models
      .map((model) => cell(verification, model, variable, lead)?.stats?.mae)
      .filter((v): v is number => v !== undefined);
    if (values.length > 0) {
      best.set(lead, Math.min(...values));
    }
  }
  const errors = models.flatMap((model) =>
    LEADS.map((lead) => cell(verification, model, variable, lead)?.stats?.mae).filter(
      (mae): mae is number => mae !== undefined,
    ),
  );
  const worst = Math.max(...errors, 0.1);
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <caption className="visually-hidden">
          Erreur absolue moyenne ({unit}) par modèle et par échéance, {VARIABLE_LABELS[variable]}
        </caption>
        <thead>
          <tr>
            <th scope="col">Modèle</th>
            {LEADS.map((lead) => (
              <th key={lead} scope="col" data-donnee>
                J+{lead}
              </th>
            ))}
            <th scope="col">Biais J+1</th>
            {variable === 'precipitation' && <th scope="col">Pluie ou sec J+1</th>}
          </tr>
        </thead>
        <tbody>
          {models.map((model) => {
            const first = cell(verification, model, variable, 1);
            const bias = first?.stats?.bias ?? null;
            return (
              <tr key={model} style={{ '--model': modelColorVar(model) } as CSSProperties}>
                <th scope="row" className={styles.model}>
                  <span className={styles.dot} aria-hidden="true" />
                  {MODEL_LABELS[model]}
                </th>
                {LEADS.map((lead) => {
                  const entry = cell(verification, model, variable, lead);
                  const mae = entry?.stats?.mae ?? null;
                  const isBest = mae !== null && best.get(lead) === mae;
                  return (
                    <td key={lead} className={styles.value} data-best={isBest || undefined}>
                      {entry === undefined ? (
                        <span className={styles.muted}>{MISSING}</span>
                      ) : mae === null ? (
                        <span className={styles.muted}>en collecte</span>
                      ) : (
                        <>
                          <span data-donnee>{formatOneDecimal(mae)}</span>
                          <span
                            className={styles.bar}
                            style={{ width: `${Math.round((mae / worst) * 100)}%` }}
                            aria-hidden="true"
                          />
                          {isBest && <span className="visually-hidden"> (le plus juste)</span>}
                        </>
                      )}
                    </td>
                  );
                })}
                <td data-donnee className={styles.bias}>
                  {bias === null
                    ? MISSING
                    : `${bias >= 0 ? '+' : '−'}${formatOneDecimal(Math.abs(bias))} ${unit}`}
                </td>
                {variable === 'precipitation' && (
                  <td data-donnee>{formatPercent(first?.rain?.accuracy ?? null)}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface ReliabilityPanelProps {
  readonly state: DatasetState<VerificationReport>;
}

export function ReliabilityPanel({ state }: ReliabilityPanelProps) {
  if (state.status === 'idle') {
    return null;
  }
  if (state.status === 'loading') {
    return (
      <div className={styles.loading} aria-busy="true">
        <p className="note">Rapprochement des prévisions passées et des mesures…</p>
        <div className={styles.skeleton} />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <p className={styles.error} role="alert">
        Vérification indisponible : le service des prévisions passées ou des mesures ne répond pas.
        Les prévisions restent affichées, choisies sur les seuls critères de maille et d’échéance.
      </p>
    );
  }
  const { verifications, references } = state.value;
  const ready = verifications.some((v) => v.stats !== null);
  if (!ready) {
    return (
      <p className={styles.muted}>
        Pas encore assez d’heures appariées pour noter les modèles ici. La vérification reprendra
        automatiquement à la prochaine consultation.
      </p>
    );
  }
  return (
    <div className={styles.panel}>
      <div className={styles.method}>
        <p>
          Chaque jour, les prévisions émises la veille (J+1) jusqu’à sept jours avant (J+7) sont
          comparées à ce qui s’est réellement produit. Le chiffre est l’erreur absolue moyenne :
          plus il est bas, plus le modèle a été juste ici.
        </p>
        <ul className={styles.references}>
          {references.map((reference) => (
            <li key={reference.variable} data-provenance={reference.provenance}>
              <span className={styles.pastille} aria-hidden="true" />
              <strong>{VARIABLE_LABELS[reference.variable]}</strong> :{' '}
              {referenceSentence(reference)}.
            </li>
          ))}
        </ul>
        {references.some((r) => r.provenance === 'estimated') && (
          <p className={styles.caveat}>
            ERA5 est produite par l’ECMWF sur une maille d’environ 30 km : elle avantage ECMWF et
            pénalise les modèles fins là où la ville ou le relief créent des effets locaux.
          </p>
        )}
      </div>

      {VARIABLES.map((variable) => (
        <section key={variable} className={styles.section}>
          <h3>
            {VARIABLE_LABELS[variable]}{' '}
            <span className={styles.unit}>erreur moyenne en {VARIABLE_UNITS[variable]}</span>
          </h3>
          <VariableTable variable={variable} verification={verifications} />
          {variable === 'temperature' && <ErrorByLeadChart verification={verifications} />}
        </section>
      ))}

      <p className={styles.privacy}>
        Calcul effectué sur cet appareil à partir de données publiques ; rien n’est envoyé ailleurs.
        Ces scores alimentent directement le choix automatique du modèle.
      </p>
    </div>
  );
}
