/*
 * Reponse d'archive synthetique pour les normales 1991-2020 : un maximum de
 * 18 °C et un minimum de 8 °C chaque jour, toutes annees. Elle est fabriquee,
 * et le dit : le quota d'Open-Meteo de l'environnement de developpement ne
 * permet pas d'enregistrer la vraie serie de 30 ans. Elle prouve le calcul,
 * pas la climatologie de Lyon.
 */
export const SYNTHETIC_NORMAL_MAX = 18;
export const SYNTHETIC_NORMAL_MIN = 8;

export function climateBody() {
  const time: string[] = [];
  for (let year = 1991; year <= 2020; year += 1) {
    for (let day = 0; day < 366; day += 1) {
      const date = new Date(Date.UTC(year, 0, 1 + day));
      if (date.getUTCFullYear() === year) {
        time.push(date.toISOString().slice(0, 10));
      }
    }
  }
  return {
    daily: {
      time,
      temperature_2m_max: time.map(() => SYNTHETIC_NORMAL_MAX),
      temperature_2m_min: time.map(() => SYNTHETIC_NORMAL_MIN),
    },
  };
}
