import { aggiungiGiorni } from '../domain/date';
import type { DataISO, VoceRegistro } from '../domain/tipi';
import type { FiltroRegistro } from './tipi';

/** Inizio della giornata (fuso orario del dispositivo) come istante ISO. */
export function inizioGiornata(data: DataISO): string {
  const [a, m, g] = data.split('-').map(Number);
  return new Date(a, m - 1, g, 0, 0, 0, 0).toISOString();
}

/** Intervallo [da, a) di istanti corrispondente ai filtri per data. */
export function intervalloRegistro(filtro: FiltroRegistro): { da: string | null; a: string | null } {
  return {
    da: filtro.dal ? inizioGiornata(filtro.dal) : null,
    a: filtro.al ? inizioGiornata(aggiungiGiorni(filtro.al, 1)) : null,
  };
}

/** Filtra e ordina (dalla più recente) le voci di registro tenute in memoria. */
export function filtraRegistro(voci: VoceRegistro[], filtro: FiltroRegistro): VoceRegistro[] {
  const { da, a } = intervalloRegistro(filtro);
  const risultato = voci
    .map((v, indice) => ({ v, indice }))
    .filter(({ v }) => {
      if (filtro.pdsId && v.pds_id !== filtro.pdsId) return false;
      if (filtro.entita && v.entita !== filtro.entita) return false;
      if (filtro.utenteId && v.utente_id !== filtro.utenteId) return false;
      if (da && v.ts < da) return false;
      if (a && v.ts >= a) return false;
      return true;
    });
  // dalla più recente; a parità di istante vale l'ordine di inserimento (le voci sono accodate)
  risultato.sort((x, y) => (x.v.ts < y.v.ts ? 1 : x.v.ts > y.v.ts ? -1 : y.indice - x.indice));
  const ordinate = risultato.map(({ v }) => v);
  return filtro.limite ? ordinate.slice(0, filtro.limite) : ordinate;
}
