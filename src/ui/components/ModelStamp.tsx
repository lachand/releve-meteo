import type { CSSProperties } from 'react';
import { MODEL_SPECS } from '../../domain/models';
import type { ModelId } from '../../domain/types';
import { MODEL_LABELS, modelColorVar, modelResolution } from '../modelPresentation';
import styles from './ModelStamp.module.css';

interface ModelStampProps {
  readonly model: ModelId;
  readonly manual: boolean;
  readonly compact?: boolean;
}

/**
 * Tampon encre « MODÈLE RETENU » : le nom du modèle est aussi visible que
 * la température (DESIGN.md 6.1), à la couleur du modèle, en grand corps.
 */
export function ModelStamp({ model, manual, compact = false }: ModelStampProps) {
  const style = { '--stamp': modelColorVar(model) } as CSSProperties;
  return (
    <div
      className={compact ? `${styles.stamp} ${styles.compact}` : styles.stamp}
      style={style}
      data-model={model}
    >
      <span className={styles.eyebrow}>{manual ? 'Choix manuel' : 'Modèle retenu'}</span>
      <span className={styles.model}>{MODEL_LABELS[model]}</span>
      {!compact && (
        <span className={styles.meta}>
          {MODEL_SPECS[model].producer} · maille {modelResolution(model)}
        </span>
      )}
    </div>
  );
}
