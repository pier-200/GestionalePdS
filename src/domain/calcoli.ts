import { formattaData } from './date';
import { rapporto, sommaCentesimi } from './importi';
import { avvisoScadenza, dataScadenza, statoPds, type LivelloAvviso, type StatoPds } from './stato';
import type { AccordoQuadro, Allegato, AttoAdesione, Capitolo, Centesimi, DataISO, DatiCondivisi, ID, Pagamento, Pds } from './tipi';

/** PdS con tutti i valori derivati, pronto per elenchi, filtri ed export. */
export interface PdsVista {
  pds: Pds;
  capitolo: Capitolo | null;
  accordo: AccordoQuadro | null;
  atto: AttoAdesione | null;
  esercizio: number | null;
  /** Numero completo mostrato all'utente: numero inserito + anno dell'esercizio (es. "18/2026"). */
  numeroCompleto: string;
  stato: StatoPds;
  scadenza: DataISO | null;
  giorniAllaScadenza: number | null;
  avviso: LivelloAvviso | null;
  pagamenti: Pagamento[];
  totalePagato: Centesimi;
  /** Economia = valore di stipula − totale pagato a saldo (solo per PdS saldati). */
  economia: Centesimi | null;
  /** Quota pagata rispetto al valore stipulato. */
  quotaPagata: number | null;
  allegati: Allegato[];
}

export interface IndiciDati {
  capitoliPerId: Map<ID, Capitolo>;
  accordiPerId: Map<ID, AccordoQuadro>;
  attiPerId: Map<ID, AttoAdesione>;
  pagamentiPerPds: Map<ID, Pagamento[]>;
  allegatiPerPds: Map<ID, Allegato[]>;
}

export function indicizza(dati: DatiCondivisi): IndiciDati {
  const capitoliPerId = new Map(dati.capitoli.map((c) => [c.id, c]));
  const accordiPerId = new Map(dati.accordi.map((a) => [a.id, a]));
  const attiPerId = new Map(dati.atti.map((a) => [a.id, a]));
  const pagamentiPerPds = new Map<ID, Pagamento[]>();
  for (const p of dati.pagamenti) {
    const elenco = pagamentiPerPds.get(p.pds_id);
    if (elenco) elenco.push(p);
    else pagamentiPerPds.set(p.pds_id, [p]);
  }
  for (const elenco of pagamentiPerPds.values()) {
    elenco.sort((a, b) => a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at));
  }
  const allegatiPerPds = new Map<ID, Allegato[]>();
  for (const a of dati.allegati) {
    const elenco = allegatiPerPds.get(a.pds_id);
    if (elenco) elenco.push(a);
    else allegatiPerPds.set(a.pds_id, [a]);
  }
  return { capitoliPerId, accordiPerId, attiPerId, pagamentiPerPds, allegatiPerPds };
}

export function economia(p: Pick<Pds, 'saldato' | 'valore_stipula' | 'totale_pagato_saldo'>): Centesimi | null {
  if (!p.saldato || p.valore_stipula == null || p.totale_pagato_saldo == null) return null;
  return p.valore_stipula - p.totale_pagato_saldo;
}

export function vistaPds(p: Pds, indici: IndiciDati, oggi: DataISO, sogliaGiorni: number): PdsVista {
  const capitolo = indici.capitoliPerId.get(p.capitolo_id) ?? null;
  const pagamenti = indici.pagamentiPerPds.get(p.id) ?? [];
  const totalePagato = sommaCentesimi(pagamenti.map((x) => x.importo));
  const avviso = avvisoScadenza(p, oggi, sogliaGiorni);
  return {
    pds: p,
    capitolo,
    accordo: p.accordo_id ? (indici.accordiPerId.get(p.accordo_id) ?? null) : null,
    atto: p.atto_adesione_id ? (indici.attiPerId.get(p.atto_adesione_id) ?? null) : null,
    esercizio: capitolo?.esercizio ?? null,
    numeroCompleto: numeroPds(p, capitolo?.esercizio ?? null),
    stato: statoPds(p, oggi),
    scadenza: dataScadenza(p),
    giorniAllaScadenza: avviso.giorni,
    avviso: avviso.livello,
    pagamenti,
    totalePagato,
    economia: economia(p),
    quotaPagata: p.valore_stipula != null ? rapporto(totalePagato, p.valore_stipula) : null,
    allegati: indici.allegatiPerPds.get(p.id) ?? [],
  };
}

export function vistePds(dati: DatiCondivisi, oggi: DataISO, sogliaGiorni: number): PdsVista[] {
  const indici = indicizza(dati);
  return dati.pds.map((p) => vistaPds(p, indici, oggi, sogliaGiorni));
}

/** Confronto "naturale" di numeri e codici (es. "PdS 2" prima di "PdS 10"). */
export const confrontoNaturale = new Intl.Collator('it', { numeric: true, sensitivity: 'base' }).compare;

export function ordinaCapitoli(capitoli: Capitolo[]): Capitolo[] {
  return [...capitoli].sort((a, b) => b.esercizio - a.esercizio || confrontoNaturale(a.codice, b.codice));
}

export function eserciziDisponibili(dati: Pick<DatiCondivisi, 'capitoli'>): number[] {
  return [...new Set(dati.capitoli.map((c) => c.esercizio))].sort((a, b) => b - a);
}

export function etichettaCapitolo(c: Pick<Capitolo, 'codice' | 'esercizio'>, conEsercizio = true): string {
  return conEsercizio ? `${c.codice} (${c.esercizio})` : c.codice;
}

/**
 * Numero del PdS mostrato all'utente: si inseriscono il numero e l'esercizio
 * finanziario e si leggono insieme come "25/2026". Se il numero conservato
 * contiene già l'anno (dati inseriti con versioni precedenti) resta invariato.
 */
export function numeroPds(p: Pick<Pds, 'numero'>, esercizio: number | null | undefined): string {
  const n = p.numero.trim();
  if (esercizio == null || n.includes('/')) return n;
  return `${n}/${esercizio}`;
}

/** Protocollo leggibile: "Prot. n. 0089567 del 15/01/2026". */
export function protocollo(numero: string | null | undefined, data: DataISO | null | undefined): string | null {
  const n = (numero ?? '').trim();
  if (!n) return null;
  return data ? `Prot. n. ${n} del ${formattaData(data)}` : `Prot. n. ${n}`;
}

/** Un PdS eliminato resta negli archivi ma è visibile solo all'amministratore. */
export function isEliminato(p: Pick<Pds, 'eliminato_at'>): boolean {
  return p.eliminato_at != null;
}

/** IDV del PdS: il campo contiene uno o più codici separati da virgola. */
export function elencoIdv(p: Pick<Pds, 'idv'>): string[] {
  return (p.idv ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function idvDaElenco(valori: readonly string[]): string | null {
  const unici = [...new Set(valori.map((x) => x.trim()).filter(Boolean))];
  return unici.length ? unici.join(', ') : null;
}
