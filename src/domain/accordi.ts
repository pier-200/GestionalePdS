import { confrontoNaturale, type PdsVista } from './calcoli';
import { aggiungiGiorni, differenzaGiorni } from './date';
import { rapporto, sommaCentesimi } from './importi';
import { stipulaAvvenuta } from './stato';
import type { AccordoQuadro, AttoAdesione, Centesimi, DataISO, ID } from './tipi';

/**
 * Situazione contrattuale degli accordi quadro (AQ).
 *
 * - La **capienza** dell'AQ è l'importo stipulato con la ditta.
 * - La capienza è impegnata dagli **atti di adesione a quantità indeterminata**
 *   (che non toccano i capitoli di spesa) e dai **PdS collegati direttamente
 *   all'AQ**, che sono gli atti di adesione a quantità determinata.
 * - Un PdS collegato a un atto di adesione impegna i fondi del capitolo e
 *   consuma la quota parte dell'atto, non altra capienza dell'AQ.
 */

/** Importo con cui un PdS impegna: il valore di stipula se c'è, altrimenti l'importo trasmesso. */
export function importoImpegnato(v: PdsVista): Centesimi {
  if (stipulaAvvenuta(v.pds)) return v.pds.valore_stipula ?? 0;
  return v.pds.importo_inviato ?? 0;
}

/** Scadenza contrattuale: data di stipula + durata in giorni. */
export function scadenzaContrattuale(data: DataISO | null, durataGiorni: number | null | undefined): DataISO | null {
  if (!data || durataGiorni == null || durataGiorni <= 0) return null;
  return aggiungiGiorni(data, durataGiorni);
}

export interface VistaAtto {
  atto: AttoAdesione;
  /** PdS (ordinativi) emessi sull'atto di adesione. */
  pds: PdsVista[];
  scadenza: DataISO | null;
  giorniAllaScadenza: number | null;
  /** Somma degli importi impegnati dai PdS collegati. */
  impegnato: Centesimi;
  pagato: Centesimi;
  /** Quota dell'atto ancora ordinabile. */
  residuo: Centesimi;
  quotaImpegnata: number | null;
}

export interface VistaAccordo {
  accordo: AccordoQuadro;
  atti: VistaAtto[];
  /** PdS collegati all'AQ senza atto di adesione: atti di adesione a quantità determinata. */
  pdsDiretti: PdsVista[];
  /** Tutti i PdS collegati all'AQ, direttamente o tramite un atto di adesione. */
  pds: PdsVista[];
  scadenza: DataISO | null;
  giorniAllaScadenza: number | null;
  /** Capienza impegnata dagli atti di adesione a quantità indeterminata. */
  impegnatoAtti: Centesimi;
  /** Capienza impegnata dai PdS a quantità determinata. */
  impegnatoDiretto: Centesimi;
  impegnato: Centesimi;
  /** Capienza contrattuale ancora impegnabile (negativa in caso di superamento). */
  residuo: Centesimi;
  quotaImpegnata: number | null;
  /** Importo complessivo degli ordinativi (PdS) emessi sull'AQ. */
  ordinato: Centesimi;
  pagato: Centesimi;
  nPds: number;
  superamento: Centesimi;
}

function vistaAtto(atto: AttoAdesione, pds: PdsVista[], oggi: DataISO): VistaAtto {
  const scadenza = scadenzaContrattuale(atto.data_stipula, atto.durata_giorni);
  const impegnato = sommaCentesimi(pds.map(importoImpegnato));
  return {
    atto,
    pds,
    scadenza,
    giorniAllaScadenza: scadenza ? differenzaGiorni(oggi, scadenza) : null,
    impegnato,
    pagato: sommaCentesimi(pds.map((v) => v.totalePagato)),
    residuo: atto.valore - impegnato,
    quotaImpegnata: rapporto(impegnato, atto.valore),
  };
}

export function vistaAccordo(accordo: AccordoQuadro, atti: AttoAdesione[], viste: PdsVista[], oggi: DataISO): VistaAccordo {
  const pds = viste.filter((v) => v.pds.accordo_id === accordo.id);
  const attiAccordo = [...atti]
    .filter((a) => a.accordo_id === accordo.id)
    .sort((a, b) => confrontoNaturale(a.numero, b.numero));
  const vistaAtti = attiAccordo.map((a) => vistaAtto(a, pds.filter((v) => v.pds.atto_adesione_id === a.id), oggi));
  const pdsDiretti = pds.filter((v) => v.pds.atto_adesione_id == null);
  const impegnatoAtti = sommaCentesimi(attiAccordo.map((a) => a.valore));
  const impegnatoDiretto = sommaCentesimi(pdsDiretti.map(importoImpegnato));
  const impegnato = impegnatoAtti + impegnatoDiretto;
  const scadenza = scadenzaContrattuale(accordo.data_stipula, accordo.durata_giorni);
  return {
    accordo,
    atti: vistaAtti,
    pdsDiretti,
    pds,
    scadenza,
    giorniAllaScadenza: scadenza ? differenzaGiorni(oggi, scadenza) : null,
    impegnatoAtti,
    impegnatoDiretto,
    impegnato,
    residuo: accordo.importo - impegnato,
    quotaImpegnata: rapporto(impegnato, accordo.importo),
    ordinato: sommaCentesimi(pds.map(importoImpegnato)),
    pagato: sommaCentesimi(pds.map((v) => v.totalePagato)),
    nPds: pds.length,
    superamento: Math.max(0, impegnato - accordo.importo),
  };
}

export function visteAccordi(accordi: AccordoQuadro[], atti: AttoAdesione[], viste: PdsVista[], oggi: DataISO): VistaAccordo[] {
  return [...accordi]
    .sort((a, b) => confrontoNaturale(a.numero, b.numero))
    .map((a) => vistaAccordo(a, atti, viste, oggi));
}

/** Atti di adesione di un accordo quadro, ordinati per numero. */
export function attiDiAccordo(atti: AttoAdesione[], accordoId: ID | null | undefined): AttoAdesione[] {
  if (!accordoId) return [];
  return atti.filter((a) => a.accordo_id === accordoId).sort((a, b) => confrontoNaturale(a.numero, b.numero));
}

export function etichettaAccordo(a: Pick<AccordoQuadro, 'numero' | 'oggetto'>): string {
  return a.oggetto ? `${a.numero} – ${a.oggetto}` : a.numero;
}

export function etichettaAtto(a: Pick<AttoAdesione, 'numero' | 'oggetto'>): string {
  return a.oggetto ? `${a.numero} – ${a.oggetto}` : a.numero;
}
