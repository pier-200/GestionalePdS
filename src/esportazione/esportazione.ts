import type { PdsVista } from '../domain/calcoli';
import { aggiungiGrafici, type DefinizioneGrafico } from './grafici';
import { dateUTC, formattaData, oggiISO } from '../domain/date';
import { euroDaCentesimi, formattaNumeroImporto } from '../domain/importi';
import type { SintesiFinanziaria, ValoriSintesi } from '../domain/sintesi';
import { STATI } from '../domain/stato';

/**
 * Esportazione di elenco PdS e sintesi finanziaria in Excel (.xlsx) e CSV.
 * Gli importi sono esportati come numeri (euro con due decimali) e le date come
 * date vere, così restano utilizzabili in fogli di calcolo e altri sistemi contabili.
 */

type TipoColonna = 'testo' | 'importo' | 'data' | 'numero' | 'percentuale';

export interface ColonnaEsportazione<T> {
  titolo: string;
  tipo: TipoColonna;
  larghezza?: number;
  valore: (riga: T) => string | number | null;
}

export interface Foglio<T> {
  nome: string;
  colonne: ColonnaEsportazione<T>[];
  righe: T[];
  /** Riga di totale (facoltativa), già calcolata. */
  totale?: T;
}

const FORMATO_IMPORTO = '#,##0.00 [$€-410]';
const FORMATO_DATA = 'dd/mm/yyyy';
const FORMATO_PERCENTUALE = '0.0%';

// ---------------------------------------------------------------------------
// Colonne
// ---------------------------------------------------------------------------

const euro = (c: number | null | undefined) => (c == null ? null : euroDaCentesimi(c));

export const COLONNE_PDS: ColonnaEsportazione<PdsVista>[] = [
  { titolo: 'Numero PdS', tipo: 'testo', larghezza: 14, valore: (v) => v.numeroCompleto },
  { titolo: 'Stato', tipo: 'testo', larghezza: 16, valore: (v) => STATI[v.stato].etichetta },
  { titolo: 'Esercizio finanziario', tipo: 'numero', larghezza: 11, valore: (v) => v.esercizio },
  { titolo: 'Capitolo di spesa', tipo: 'testo', larghezza: 12, valore: (v) => v.capitolo?.codice ?? null },
  { titolo: 'Ditta', tipo: 'testo', larghezza: 26, valore: (v) => v.pds.ditta },
  { titolo: 'Accordo quadro', tipo: 'testo', larghezza: 24, valore: (v) => v.accordo?.numero ?? null },
  { titolo: 'Atto di adesione', tipo: 'testo', larghezza: 18, valore: (v) => v.atto?.numero ?? null },
  { titolo: 'Ordinativo', tipo: 'testo', larghezza: 16, valore: (v) => v.pds.ordinativo },
  { titolo: 'IDV', tipo: 'testo', larghezza: 16, valore: (v) => v.pds.idv },
  { titolo: 'Collaboratore/DEC', tipo: 'testo', larghezza: 22, valore: (v) => v.pds.dec },
  { titolo: 'Importo trasmesso', tipo: 'importo', larghezza: 16, valore: (v) => euro(v.pds.importo_inviato) },
  { titolo: 'Protocollo invio', tipo: 'testo', larghezza: 18, valore: (v) => v.pds.protocollo_invio },
  { titolo: 'Data invio', tipo: 'data', larghezza: 12, valore: (v) => v.pds.data_invio },
  { titolo: 'Protocollo stipula', tipo: 'testo', larghezza: 18, valore: (v) => v.pds.protocollo_stipula },
  { titolo: 'Data stipula', tipo: 'data', larghezza: 12, valore: (v) => v.pds.data_stipula },
  { titolo: 'Valore stipula', tipo: 'importo', larghezza: 16, valore: (v) => euro(v.pds.valore_stipula) },
  {
    titolo: 'Termine di esecuzione',
    tipo: 'testo',
    larghezza: 20,
    valore: (v) =>
      v.pds.modalita_termine === 'durata' && v.pds.durata != null
        ? `${v.pds.durata} ${v.pds.durata_unita ?? 'giorni'} dalla stipula`
        : v.pds.modalita_termine === 'data'
          ? 'Data fissa'
          : null,
  },
  { titolo: 'Scadenza esecuzione', tipo: 'data', larghezza: 12, valore: (v) => v.scadenza },
  { titolo: 'Giorni alla scadenza', tipo: 'numero', larghezza: 10, valore: (v) => (v.pds.saldato ? null : v.giorniAllaScadenza) },
  { titolo: 'Totale pagato', tipo: 'importo', larghezza: 16, valore: (v) => euro(v.totalePagato) },
  { titolo: 'Numero pagamenti', tipo: 'numero', larghezza: 10, valore: (v) => v.pagamenti.length },
  { titolo: 'Saldato', tipo: 'testo', larghezza: 8, valore: (v) => (v.pds.saldato ? 'Sì' : 'No') },
  { titolo: 'Data saldo', tipo: 'data', larghezza: 12, valore: (v) => v.pds.data_saldo },
  { titolo: 'Totale pagato a saldo', tipo: 'importo', larghezza: 16, valore: (v) => euro(v.pds.totale_pagato_saldo) },
  { titolo: 'Economia', tipo: 'importo', larghezza: 14, valore: (v) => euro(v.economia) },
  { titolo: 'Note', tipo: 'testo', larghezza: 40, valore: (v) => v.pds.note },
];

type RigaSintesiEsportata = ValoriSintesi & { esercizio: number | null; codice: string };

export function colonneSintesi(): ColonnaEsportazione<RigaSintesiEsportata>[] {
  return [
    { titolo: 'Esercizio finanziario', tipo: 'numero', larghezza: 11, valore: (r) => r.esercizio },
    { titolo: 'Capitolo di spesa', tipo: 'testo', larghezza: 14, valore: (r) => r.codice },
    { titolo: 'Totale finanziato', tipo: 'importo', larghezza: 17, valore: (r) => euro(r.finanziato) },
    { titolo: 'Impegnato (Trasmesso)', tipo: 'importo', larghezza: 17, valore: (r) => euro(r.inviato) },
    { titolo: '% trasmesso su finanziato', tipo: 'percentuale', larghezza: 11, valore: (r) => r.percInviato },
    { titolo: 'Impegnato (Stipulato)', tipo: 'importo', larghezza: 17, valore: (r) => euro(r.stipulato) },
    { titolo: '% stipulato su finanziato', tipo: 'percentuale', larghezza: 11, valore: (r) => r.percStipulato },
    { titolo: 'Trasmesso non ancora stipulato', tipo: 'importo', larghezza: 17, valore: (r) => euro(r.inviatoNonStipulato) },
    { titolo: 'Effettivo pagato', tipo: 'importo', larghezza: 17, valore: (r) => euro(r.pagato) },
    { titolo: '% pagato su finanziato', tipo: 'percentuale', larghezza: 11, valore: (r) => r.percPagato },
    { titolo: '% pagato su stipulato', tipo: 'percentuale', larghezza: 11, valore: (r) => r.percPagatoSuStipulato },
    { titolo: 'Economie', tipo: 'importo', larghezza: 14, valore: (r) => euro(r.economie) },
    { titolo: 'Disponibile da impegnare', tipo: 'importo', larghezza: 17, valore: (r) => euro(r.disponibileDaImpegnare) },
    { titolo: 'Residuo da pagare', tipo: 'importo', larghezza: 17, valore: (r) => euro(r.residuoDaPagare) },
    { titolo: 'Superamento (trasmesso)', tipo: 'importo', larghezza: 15, valore: (r) => (r.sforamentoInviato > 0 ? euro(r.sforamentoInviato) : null) },
    { titolo: 'Superamento (stipulato)', tipo: 'importo', larghezza: 15, valore: (r) => (r.sforamentoStipulato > 0 ? euro(r.sforamentoStipulato) : null) },
    { titolo: 'N. PdS', tipo: 'numero', larghezza: 8, valore: (r) => r.nPds },
    { titolo: 'N. stipulati', tipo: 'numero', larghezza: 9, valore: (r) => r.nStipulati },
    { titolo: 'N. saldati', tipo: 'numero', larghezza: 9, valore: (r) => r.nSaldati },
  ];
}

export function fogliSintesi(sintesi: SintesiFinanziaria): Foglio<RigaSintesiEsportata> {
  return {
    nome: 'Sintesi per capitolo',
    colonne: colonneSintesi(),
    righe: sintesi.righe.map((r) => ({ ...r, esercizio: r.capitolo.esercizio, codice: r.capitolo.codice })),
    totale: { ...sintesi.totale, esercizio: null, codice: 'TOTALE' },
  };
}

// ---------------------------------------------------------------------------
// CSV (separatore ";" e virgola decimale, come si aspetta Excel in italiano)
// ---------------------------------------------------------------------------

function cellaCsv(valore: string | number | null, tipo: TipoColonna): string {
  if (valore == null || valore === '') return '';
  let testo: string;
  if (tipo === 'importo' && typeof valore === 'number') testo = formattaNumeroImporto(Math.round(valore * 100)).replace(/\./g, '');
  else if (tipo === 'percentuale' && typeof valore === 'number') testo = (valore * 100).toFixed(1).replace('.', ',');
  else if (tipo === 'data' && typeof valore === 'string') testo = formattaData(valore);
  else testo = String(valore);
  if (/[";\n\r]/.test(testo) || /^[=+\-@]/.test(testo)) {
    // virgolette per separatori e a capo; apostrofo iniziale contro l'interpretazione come formula
    const sicuro = /^[=+\-@]/.test(testo) && tipo === 'testo' ? `'${testo}` : testo;
    return `"${sicuro.replace(/"/g, '""')}"`;
  }
  return testo;
}

export function creaCsv<T>(foglio: Foglio<T>): string {
  const righe = [foglio.colonne.map((c) => cellaCsv(c.titolo, 'testo')).join(';')];
  const tutte = foglio.totale ? [...foglio.righe, foglio.totale] : foglio.righe;
  for (const r of tutte) righe.push(foglio.colonne.map((c) => cellaCsv(c.valore(r), c.tipo)).join(';'));
  return `﻿${righe.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

async function creaXlsx(fogli: Foglio<never>[], grafici: DefinizioneGrafico[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const grassetto = 'bold' as const;
  const sheets = fogli.map((foglio) => {
    const intestazione = foglio.colonne.map((c) => ({ value: c.titolo, fontWeight: grassetto, wrap: true, backgroundColor: '#E8EEF7' }));
    const cella = (c: ColonnaEsportazione<never>, riga: never, totale: boolean) => {
      const v = c.valore(riga);
      const stile = totale ? { fontWeight: grassetto } : {};
      if (v == null || v === '') return null;
      switch (c.tipo) {
        case 'importo':
          return { value: Number(v), type: Number, format: FORMATO_IMPORTO, ...stile };
        case 'percentuale':
          return { value: Number(v), type: Number, format: FORMATO_PERCENTUALE, ...stile };
        case 'numero':
          return { value: Number(v), type: Number, ...stile };
        case 'data':
          return { value: dateUTC(String(v)), type: Date, format: FORMATO_DATA, ...stile };
        default:
          return { value: String(v), type: String, ...stile };
      }
    };
    const data = [
      intestazione,
      ...foglio.righe.map((r) => foglio.colonne.map((c) => cella(c, r, false))),
      ...(foglio.totale ? [foglio.colonne.map((c) => cella(c, foglio.totale as never, true))] : []),
    ];
    return {
      data,
      sheet: foglio.nome.slice(0, 31),
      columns: foglio.colonne.map((c) => ({ width: c.larghezza ?? 14 })),
      stickyRowsCount: 1,
    };
  });
  const blob = await writeXlsxFile(sheets as unknown as Parameters<typeof writeXlsxFile>[0] as never).toBlob();
  if (grafici.length === 0) return blob;
  const completo = aggiungiGrafici(new Uint8Array(await blob.arrayBuffer()), grafici);
  return new Blob([completo as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function scaricaBlob(blob: Blob, nomeFile: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function nomeFile(base: string, estensione: string): string {
  return `${base}_${oggiISO()}.${estensione}`;
}

/**
 * Esporta i fogli indicati. In Excel i `grafici` diventano grafici nativi,
 * ancorati al foglio a cui si riferiscono; il CSV contiene i soli dati.
 */
export async function esportaFogli<T>(base: string, fogli: Foglio<T>[], formato: 'xlsx' | 'csv', grafici: DefinizioneGrafico[] = []) {
  if (formato === 'csv') {
    const testo = fogli.map((f) => creaCsv(f)).join('\r\n');
    scaricaBlob(new Blob([testo], { type: 'text/csv;charset=utf-8' }), nomeFile(base, 'csv'));
    return;
  }
  const blob = await creaXlsx(fogli as unknown as Foglio<never>[], grafici);
  scaricaBlob(blob, nomeFile(base, 'xlsx'));
}
