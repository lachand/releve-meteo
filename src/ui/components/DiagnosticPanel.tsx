import { useState } from 'react';
import { DIAGNOSTIC_SOURCES, readDiagnostics } from '../../data/cache/diagnostics';
import {
  DIAGNOSTIC_LABELS,
  diagnosticReport,
  diagnosticSentences,
} from '../diagnosticPresentation';
import styles from './Settings.module.css';

/**
 * Diagnostic local : pour chaque source, la dernière lecture réussie et le
 * dernier échec. Calculé sur cet appareil, rien n'est envoyé ailleurs.
 */
export function DiagnosticPanel() {
  const [diagnostics, setDiagnostics] = useState(readDiagnostics);
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null);

  const copyReport = async () => {
    const report = diagnosticReport(diagnostics, {
      now: new Date(),
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      installed: window.matchMedia('(display-mode: standalone)').matches,
      language: navigator.language,
    });
    try {
      await navigator.clipboard.writeText(report);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  };
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
      </button>{' '}
      <button type="button" className={styles.purgeButton} onClick={() => void copyReport()}>
        Copier le rapport
      </button>
      {copied !== null && (
        <p className={styles.status} role="status">
          {copied === 'copied'
            ? 'Rapport copié : collez-le dans votre message.'
            : 'Copie impossible : le navigateur refuse l’accès au presse-papiers.'}
        </p>
      )}
    </section>
  );
}
