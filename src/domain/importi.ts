import type { Centesimi } from './tipi';

/**
 * Gestione degli importi. Il dominio lavora sempre in centesimi interi;
 * la conversione da/verso euro decimali avviene solo ai confini (input, backend, export).
 * La formattazione è implementata a mano per garantire lo stesso risultato
 * su ogni browser (Intl in `it-IT` non raggruppa le migliaia sotto 10.000).
 */

const NBSP = ' ';

function raggruppaMigliaia(intero: number): string {
  return intero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "1.234,56 €" */
export function formattaEuro(c: Centesimi | null | undefined, vuoto = '—'): string {
  if (c == null || !Number.isFinite(c)) return vuoto;
  const arrotondato = Math.round(c);
  const negativo = arrotondato < 0;
  const assoluto = Math.abs(arrotondato);
  const euro = Math.floor(assoluto / 100);
  const cent = assoluto % 100;
  return `${negativo ? '-' : ''}${raggruppaMigliaia(euro)},${cent.toString().padStart(2, '0')}${NBSP}€`;
}

/** Formato compatto per grafici e riquadri: "1,2 mln €", "350 mila €". */
export function formattaEuroCompatto(c: Centesimi | null | undefined, vuoto = '—'): string {
  if (c == null || !Number.isFinite(c)) return vuoto;
  const euro = c / 100;
  const assoluto = Math.abs(euro);
  const segno = euro < 0 ? '-' : '';
  const decimale = (x: number, cifre: number) =>
    x.toFixed(cifre).replace('.', ',').replace(/,0+$/, '');
  if (assoluto >= 1_000_000_000) return `${segno}${decimale(assoluto / 1_000_000_000, 1)}${NBSP}mld${NBSP}€`;
  if (assoluto >= 1_000_000) return `${segno}${decimale(assoluto / 1_000_000, 1)}${NBSP}mln${NBSP}€`;
  if (assoluto >= 10_000) return `${segno}${decimale(assoluto / 1_000, 0)}${NBSP}mila${NBSP}€`;
  return formattaEuro(c, vuoto);
}

/** Numero con due decimali in formato italiano senza simbolo: "1.234,56". */
export function formattaNumeroImporto(c: Centesimi): string {
  return formattaEuro(c).replace(`${NBSP}€`, '');
}

export function centesimiDaEuro(euro: number): Centesimi {
  // toFixed evita derive binarie (es. 1.005 * 100 = 100.49999...)
  return Math.round(Number((euro * 100).toFixed(4)));
}

export function euroDaCentesimi(c: Centesimi): number {
  return c / 100;
}

export function centesimiDaEuroNullable(euro: number | string | null | undefined): Centesimi | null {
  if (euro == null || euro === '') return null;
  const n = typeof euro === 'string' ? Number(euro) : euro;
  return Number.isFinite(n) ? centesimiDaEuro(n) : null;
}

/**
 * Valore emesso dal campo numerico dell'interfaccia: un numero oppure, con decimali
 * fissi, una stringa non formattata con il punto decimale (es. "8000.00").
 */
export function valoreImportoDaInput(v: number | string | null | undefined): Centesimi | null {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? centesimiDaEuro(n) : null;
}

export function euroDaCentesimiNullable(c: Centesimi | null | undefined): number | null {
  return c == null ? null : euroDaCentesimi(c);
}

export function sommaCentesimi(valori: Iterable<Centesimi | null | undefined>): Centesimi {
  let totale = 0;
  for (const v of valori) if (v != null) totale += v;
  return totale;
}

/**
 * Interpreta un importo digitato in formato italiano o internazionale.
 * Accetta "1.234,56", "1234,56", "1234.56", "€ 1.234", "1 234,5".
 * Restituisce null se il testo non è un importo valido.
 */
export function parseImporto(testo: string): Centesimi | null {
  let s = testo.trim().replace(/€/g, '').replace(/[\s  ']/g, '');
  if (s === '') return null;
  let segno = 1;
  if (s.startsWith('-')) {
    segno = -1;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const virgole = (s.match(/,/g) ?? []).length;
  const punti = (s.match(/\./g) ?? []).length;
  let normalizzato: string;
  if (virgole > 1) return null;
  if (virgole === 1) {
    // la virgola è il separatore decimale, i punti sono migliaia
    const [intera, decimali] = s.split(',');
    if (punti > 0 && !/^\d{1,3}(\.\d{3})+$/.test(intera)) return null;
    normalizzato = `${intera.replace(/\./g, '')}.${decimali}`;
  } else if (punti === 1) {
    const [intera, decimali] = s.split('.');
    // "1.234" in un contesto italiano è un migliaio; "1234.5" o "12.50" sono decimali
    normalizzato = decimali.length === 3 && intera.length <= 3 ? `${intera}${decimali}` : `${intera}.${decimali}`;
  } else if (punti > 1) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
    normalizzato = s.replace(/\./g, '');
  } else {
    normalizzato = s;
  }
  if (!/^\d+(\.\d+)?$/.test(normalizzato)) return null;
  const [, dec = ''] = normalizzato.split('.');
  if (dec.length > 2) return null;
  return segno * centesimiDaEuro(Number(normalizzato));
}

/** Rapporto a/b, null se il denominatore è nullo o non positivo. */
export function rapporto(numeratore: number, denominatore: number): number | null {
  if (!Number.isFinite(numeratore) || !Number.isFinite(denominatore) || denominatore <= 0) return null;
  return numeratore / denominatore;
}

/** "12,3%" */
export function formattaPercentuale(r: number | null | undefined, vuoto = '—', decimali = 1): string {
  if (r == null || !Number.isFinite(r)) return vuoto;
  return `${(r * 100).toFixed(decimali).replace('.', ',')}%`;
}
