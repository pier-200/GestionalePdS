import { aggiungiDurata, differenzaGiorni } from './date';
import type { DataISO, Pds } from './tipi';

/** Stato del PdS, calcolato dai dati inseriti (sez. 5.7). */
export type StatoPds = 'in_preparazione' | 'inviato' | 'stipulato' | 'scaduto' | 'saldato';

export interface InfoStato {
  etichetta: string;
  descrizione: string;
  /** Colore del tema Mantine usato per il badge. */
  colore: string;
  /** Ordine nel ciclo di vita, per ordinamenti e legende. */
  ordine: number;
}

export const STATI: Record<StatoPds, InfoStato> = {
  in_preparazione: {
    etichetta: 'In preparazione',
    descrizione: 'Progetto registrato ma non ancora inviato',
    colore: 'gray',
    ordine: 1,
  },
  inviato: {
    etichetta: 'Inviato',
    descrizione: 'Progetto inviato, in attesa di stipula',
    colore: 'blue',
    ordine: 2,
  },
  stipulato: {
    etichetta: 'Stipulato',
    descrizione: 'Stipula registrata: il progetto è in esecuzione',
    colore: 'green',
    ordine: 3,
  },
  scaduto: {
    etichetta: 'Scaduto',
    descrizione: 'Termine di esecuzione superato e saldo non ancora confermato (conta tra gli stipulati)',
    colore: 'red',
    ordine: 4,
  },
  saldato: {
    etichetta: 'Saldato',
    descrizione: 'Saldo confermato: progetto chiuso',
    colore: 'teal',
    ordine: 5,
  },
};

export const ELENCO_STATI = (Object.keys(STATI) as StatoPds[]).sort((a, b) => STATI[a].ordine - STATI[b].ordine);

type DatiTermine = Pick<Pds, 'modalita_termine' | 'durata' | 'durata_unita' | 'data_termine' | 'data_stipula'>;

/**
 * Data di scadenza per l'esecuzione (sez. 5.4):
 * - modalità "durata": data di stipula + durata (serve la data di stipula);
 * - modalità "data": data fissata direttamente.
 */
export function dataScadenza(p: DatiTermine): DataISO | null {
  if (p.modalita_termine === 'data') return p.data_termine ?? null;
  if (p.modalita_termine === 'durata') {
    if (!p.data_stipula || p.durata == null || p.durata <= 0 || !p.durata_unita) return null;
    return aggiungiDurata(p.data_stipula, p.durata, p.durata_unita);
  }
  return null;
}

export function statoPds(p: Pds, oggi: DataISO): StatoPds {
  if (p.saldato) return 'saldato';
  const scadenza = dataScadenza(p);
  if (scadenza && oggi > scadenza) return 'scaduto';
  if (p.data_stipula) return 'stipulato';
  if (p.data_invio) return 'inviato';
  return 'in_preparazione';
}

export type LivelloAvviso = 'scaduto' | 'in_scadenza';

export interface AvvisoScadenza {
  livello: LivelloAvviso | null;
  /** Giorni mancanti alla scadenza (negativi se superata); null se non c'è scadenza. */
  giorni: number | null;
}

/** Avviso sulle scadenze di esecuzione dei PdS non saldati (sez. 7). */
export function avvisoScadenza(p: Pds, oggi: DataISO, sogliaGiorni: number): AvvisoScadenza {
  const scadenza = dataScadenza(p);
  if (!scadenza) return { livello: null, giorni: null };
  const giorni = differenzaGiorni(oggi, scadenza);
  if (p.saldato) return { livello: null, giorni };
  if (giorni < 0) return { livello: 'scaduto', giorni };
  if (giorni <= sogliaGiorni) return { livello: 'in_scadenza', giorni };
  return { livello: null, giorni };
}

export function stipulaAvvenuta(p: Pick<Pds, 'data_stipula'>): boolean {
  return Boolean(p.data_stipula);
}

/** Un PdS è considerato inviato se ha la data di invio o se è già stipulato. */
export function invioAvvenuto(p: Pick<Pds, 'data_invio' | 'data_stipula'>): boolean {
  return Boolean(p.data_invio || p.data_stipula);
}
