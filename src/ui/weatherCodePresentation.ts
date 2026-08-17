// Table WMO (WW) telle que documentee par Open-Meteo. Etiquette texte
// uniquement : DESIGN.md section 1 exclut les grandes icones soleil-nuage
// stylisees, l'esthetique du produit reste typographique.
const WEATHER_CODE_LABELS: Readonly<Record<number, string>> = {
  0: 'Ciel dégagé',
  1: 'Peu nuageux',
  2: 'Partiellement nuageux',
  3: 'Couvert',
  45: 'Brouillard',
  48: 'Brouillard givrant',
  51: 'Bruine légère',
  53: 'Bruine',
  55: 'Bruine forte',
  56: 'Bruine verglaçante légère',
  57: 'Bruine verglaçante',
  61: 'Pluie légère',
  63: 'Pluie',
  65: 'Pluie forte',
  66: 'Pluie verglaçante légère',
  67: 'Pluie verglaçante',
  71: 'Neige légère',
  73: 'Neige',
  75: 'Neige forte',
  77: 'Neige en grains',
  80: 'Averses légères',
  81: 'Averses',
  82: 'Averses violentes',
  85: 'Averses de neige',
  86: 'Averses de neige fortes',
  95: 'Orage',
  96: 'Orage avec grêle',
  99: 'Orage violent avec grêle',
};

export function weatherCodeLabel(code: number | null): string | null {
  if (code === null) {
    return null;
  }
  return WEATHER_CODE_LABELS[code] ?? null;
}
