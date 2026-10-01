import { useState } from 'react';
import { DIAGNOSTIC_SOURCES, readDiagnostics } from '../../data/cache/diagnostics';
import { DIAGNOSTIC_LABELS, diagnosticSentences } from '../diagnosticPresentation';
import styles from './Settings.module.css';

/**
 * Diagnostic local : pour chaque source, la dernière lecture réussie et le
 * dernier échec. Calculé sur cet appareil, rien n'est envoyé ailleurs.
 */
export function DiagnosticPanel() {
  const [diagnostics, setDiagnostics] = useState(readDiagnostics);
  return (
    <section className={styles.section} aria-labelledby="diagnostic-titre">
      <p className="eyebrow" id="diagnostic-titre">
        Diagnostic
      </p>
      <p className={styles.explanation}>
        Pour chaque source de données, la dernière lecture réussie et le dernier échec, notés sur
        cet appareil seulement : des heures et la nature de l’échec, jamais une adresse ni un lieu.
      </p>
      <ul className={styles.diagnostics}>
        {DIAGNOSTIC_SOURCES.map((source) => {
          const sentences = diagnosticSentences(diagnostics[source]);
          return (
            <li key={source}>
              <strong>{DIAGNOSTIC_LABELS[source]}</strong>
              <span>{sentences.success}</span>
              {sentences.failure !== null && <span data-echec>{sentences.failure}</span>}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className={styles.purgeButton}
        onClick={() => setDiagnostics(readDiagnostics())}
      >
        Actualiser
      </button>
    </section>
  );
}
