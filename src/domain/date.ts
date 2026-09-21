import type { DataISO, Istante, UnitaDurata } from './tipi';

/**
 * Date di calendario come stringhe `YYYY-MM-DD`: tutta l'aritmetica è svolta
 * in UTC, così i calcoli non dipendono dal fuso orario del dispositivo.
 */

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_GIORNO = 86_400_000;

function due(n: number): string {
  return n.toString().padStart(2, '0');
}

export function componiData(anno: number, mese: number, giorno: number): DataISO {
  return `${anno.toString().padStart(4, '0')}-${due(mese)}-${due(giorno)}`;
}

export function giorniNelMese(anno: number, mese: number): number {
  return new Date(Date.UTC(anno, mese, 0)).getUTCDate();
}

export function isDataISO(valore: unknown): valore is DataISO {
  if (typeof valore !== 'string') return false;
  const m = RE_DATA.exec(valore);
  if (!m) return false;
  const anno = Number(m[1]);
  const mese = Number(m[2]);
  const giorno = Number(m[3]);
  return anno >= 1900 && anno <= 2200 && mese >= 1 && mese <= 12 && giorno >= 1 && giorno <= giorniNelMese(anno, mese);
}

function scomponi(data: DataISO): [number, number, number] {
  const m = RE_DATA.exec(data);
  if (!m) throw new Error(`Data non valida: ${data}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function millisecondi(data: DataISO): number {
  const [a, m, g] = scomponi(data);
  return Date.UTC(a, m - 1, g);
}

function daMillisecondi(ms: number): DataISO {
  const d = new Date(ms);
  return componiData(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Data odierna secondo il calendario locale del dispositivo. */
export function oggiISO(ora: Date = new Date()): DataISO {
  return componiData(ora.getFullYear(), ora.getMonth() + 1, ora.getDate());
}

export function annoDi(data: DataISO): number {
  return scomponi(data)[0];
}

export function aggiungiGiorni(data: DataISO, giorni: number): DataISO {
  return daMillisecondi(millisecondi(data) + giorni * MS_GIORNO);
}

/**
 * Somma mesi di calendario. Se nel mese di arrivo manca il giorno corrispondente
 * il termine cade nell'ultimo giorno del mese (criterio dell'art. 2963 c.c.).
 */
export function aggiungiMesi(data: DataISO, mesi: number): DataISO {
  const [a, m, g] = scomponi(data);
  const indice = a * 12 + (m - 1) + mesi;
  const anno = Math.floor(indice / 12);
  const mese = (indice % 12) + 1;
  return componiData(anno, mese, Math.min(g, giorniNelMese(anno, mese)));
}

/**
 * Termine calcolato a partire da una data: il giorno iniziale non si computa,
 * quindi "30 giorni dalla stipula del 10/01" scade il 09/02.
 */
export function aggiungiDurata(data: DataISO, quantita: number, unita: UnitaDurata): DataISO {
  return unita === 'mesi' ? aggiungiMesi(data, quantita) : aggiungiGiorni(data, quantita);
}

/** Numero di giorni da `da` ad `a` (positivo se `a` è successiva). */
export function differenzaGiorni(da: DataISO, a: DataISO): number {
  return Math.round((millisecondi(a) - millisecondi(da)) / MS_GIORNO);
}

/** "17/09/2026" */
export function formattaData(data: DataISO | null | undefined, vuoto = '—'): string {
  if (!data || !isDataISO(data)) return vuoto;
  const [a, m, g] = scomponi(data);
  return `${due(g)}/${due(m)}/${a}`;
}

/** Interpreta "17/09/2026" (o "17-09-2026", "17.09.2026"). */
export function dataDaFormatoItaliano(testo: string): DataISO | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(testo);
  if (!m) return null;
  const data = componiData(Number(m[3]), Number(m[2]), Number(m[1]));
  return isDataISO(data) ? data : null;
}

/** "17/09/2026 10:42" nel fuso orario del dispositivo. */
export function formattaIstante(istante: Istante | null | undefined, vuoto = '—'): string {
  if (!istante) return vuoto;
  const d = new Date(istante);
  if (Number.isNaN(d.getTime())) return vuoto;
  return `${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()} ${due(d.getHours())}:${due(d.getMinutes())}`;
}

/** Oggetto Date (mezzanotte UTC) per export in fogli di calcolo. */
export function dateUTC(data: DataISO): Date {
  return new Date(millisecondi(data));
}

export function adessoISO(): Istante {
  return new Date().toISOString();
}

/** "tra 5 giorni", "oggi", "scaduto da 3 giorni" */
export function descriviGiorni(giorni: number): string {
  if (giorni === 0) return 'scade oggi';
  if (giorni === 1) return 'scade domani';
  if (giorni > 1) return `tra ${giorni} giorni`;
  if (giorni === -1) return 'scaduto da 1 giorno';
  return `scaduto da ${-giorni} giorni`;
}
