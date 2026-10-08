import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCalibration } from '../../data/cache/calibrationStore';
import { resetMemoryDatasetStore, setDataset } from '../../data/cache/datasetStore';
import { deleteDbForTests } from '../../data/cache/db';
import type { CalibrationRecord } from '../../domain/calibration';
import { CalibrationPanel } from './CalibrationPanel';

const NOW = Date.parse('2026-10-05T07:00:00Z');

function record(date: string, level: CalibrationRecord['level'], error: number): CalibrationRecord {
  return { date, level, error, model: 'arome', issuedAt: 1 };
}

beforeEach(async () => {
  resetMemoryDatasetStore();
  await deleteDbForTests();
});
afterEach(() => resetMemoryDatasetStore());

describe('CalibrationPanel', () => {
  it('dit que le bilan commence, sans rien affirmer', async () => {
    render(<CalibrationPanel placeId="lyon" refreshKey="a" />);
    expect(screen.getByText('Lecture du bilan…')).toBeInTheDocument();
    expect(await screen.findByText(/Relevé n’affirme pas sa confiance/)).toBeInTheDocument();
  });

  it('dit l erreur par niveau annonce et ne conclut pas avant assez de jours', async () => {
    await setDataset(
      'calibration',
      'lyon',
      [
        record('2026-10-04', 'high', 0.5),
        record('2026-10-03', 'high', 1),
        record('2026-10-02', 'low', 3),
      ],
      NOW,
      NOW + 1000,
    );
    expect(await loadCalibration('lyon')).toHaveLength(3);
    render(<CalibrationPanel placeId="lyon" refreshKey="a" />);
    const list = await screen.findByRole('list', { name: 'Erreur selon la confiance annoncée' });
    expect(list).toHaveTextContent('Confiance élevée : écart moyen de 0,8 °C sur 2 jours');
    expect(list).toHaveTextContent('Confiance basse : écart moyen de 3,0 °C sur 1 jour');
    expect(
      screen.getByText(/Pas encore assez de jours pour juger la confiance/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Température seulement/)).toBeInTheDocument();
  });
});
