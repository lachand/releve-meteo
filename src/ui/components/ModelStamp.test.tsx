import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModelStamp } from './ModelStamp';

describe('ModelStamp', () => {
  it('affiche "Modèle retenu" pour une selection automatique', () => {
    render(<ModelStamp model="arome" manual={false} />);
    expect(screen.getByText('Modèle retenu')).toBeInTheDocument();
    expect(screen.queryByText('Choix manuel')).not.toBeInTheDocument();
  });

  it('affiche "Choix manuel" pour un choix manuel', () => {
    render(<ModelStamp model="arome" manual />);
    expect(screen.getByText('Choix manuel')).toBeInTheDocument();
    expect(screen.queryByText('Modèle retenu')).not.toBeInTheDocument();
  });

  it('affiche le libelle du modele', () => {
    render(<ModelStamp model="arpege" manual={false} />);
    expect(screen.getByText('ARPEGE')).toBeInTheDocument();
  });

  it('affiche le producteur et la maille quand il n est pas compact', () => {
    render(<ModelStamp model="arpege" manual={false} />);
    expect(screen.getByText(/Météo-France/)).toBeInTheDocument();
    expect(screen.getByText(/10 km/)).toBeInTheDocument();
  });

  it('masque le producteur et la maille en mode compact', () => {
    render(<ModelStamp model="arpege" manual={false} compact />);
    expect(screen.queryByText(/Météo-France/)).not.toBeInTheDocument();
  });
});
