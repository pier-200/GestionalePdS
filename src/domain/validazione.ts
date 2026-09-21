import type { DatiAccordo, DatiAllegato, DatiAtto, DatiCapitolo, DatiPagamento, DatiPds, DatiUtente } from './comandi';
import { isDataISO } from './date';
import { ErroreApp } from './errori';
import { normalizzaPermessi } from './permessi';
import type { Capitolo, Centesimi, Pagamento, Pds, TipoAllegato } from './tipi';

/** Limiti coerenti con lo schema SQL (numeric(15,2) e lunghezze dei testi). */
export const LIMITI = {
  testoBreve: 100,
  testoMedio: 300,
  note: 5000,
  /** 9.999.999.999.999,99 € espresso in centesimi. */
  importoMassimo: 999_999_999_999_999,
  durataGiorniMax: 36_500,
  protocollo: 20,
  durataMesiMax: 1_200,
  esercizioMin: 2000,
  esercizioMax: 2100,
} as const;

export const RE_USERNAME = /^[a-z0-9][a-z0-9._-]{2,39}$/;
/** I protocolli si inseriscono come numero puro (gli zeri iniziali sono conservati). */
export const RE_PROTOCOLLO = /^[0-9]{1,20}$/;
export const LUNGHEZZA_MINIMA_PASSWORD = 10;

type Errori = Record<string, string>;

function fallisci(errori: Errori): void {
  const chiavi = Object.keys(errori);
  if (chiavi.length === 0) return;
  const messaggio = chiavi.length === 1 ? errori[chiavi[0]] : `Dati non validi: ${Object.values(errori).join('; ')}`;
  throw new ErroreApp('VALIDAZIONE', messaggio, errori);
}

function testo(
  errori: Errori,
  campo: string,
  etichetta: string,
  valore: unknown,
  opzioni: { obbligatorio?: boolean; max: number },
): string | null {
  if (valore == null) {
    if (opzioni.obbligatorio) errori[campo] = `${etichetta}: campo obbligatorio`;
    return null;
  }
  if (typeof valore !== 'string') {
    errori[campo] = `${etichetta}: valore non valido`;
    return null;
  }
  const t = valore.trim();
  if (t === '') {
    if (opzioni.obbligatorio) errori[campo] = `${etichetta}: campo obbligatorio`;
    return null;
  }
  if (t.length > opzioni.max) errori[campo] = `${etichetta}: massimo ${opzioni.max} caratteri`;
  return t;
}

function importo(
  errori: Errori,
  campo: string,
  etichetta: string,
  valore: unknown,
  opzioni: { obbligatorio?: boolean; positivo?: boolean } = {},
): Centesimi | null {
  if (valore == null) {
    if (opzioni.obbligatorio) errori[campo] = `${etichetta}: campo obbligatorio`;
    return null;
  }
  if (typeof valore !== 'number' || !Number.isInteger(valore)) {
    errori[campo] = `${etichetta}: importo non valido`;
    return null;
  }
  if (valore < 0 || (opzioni.positivo && valore === 0)) {
    errori[campo] = `${etichetta}: l'importo deve essere ${opzioni.positivo ? 'maggiore di zero' : 'positivo o zero'}`;
  } else if (valore > LIMITI.importoMassimo) {
    errori[campo] = `${etichetta}: importo troppo elevato`;
  }
  return valore;
}

function data(errori: Errori, campo: string, etichetta: string, valore: unknown, obbligatorio = false): string | null {
  if (valore == null || valore === '') {
    if (obbligatorio) errori[campo] = `${etichetta}: campo obbligatorio`;
    return null;
  }
  if (!isDataISO(valore)) {
    errori[campo] = `${etichetta}: data non valida`;
    return null;
  }
  return valore;
}

function ha<T extends object>(oggetto: T, chiave: string): boolean {
  return Object.prototype.hasOwnProperty.call(oggetto, chiave);
}

/** Numero di protocollo: solo cifre; la data si indica nel campo data corrispondente. */
function protocollo(errori: Errori, campo: string, etichetta: string, valore: unknown): string | null {
  const t = testo(errori, campo, etichetta, valore, { max: LIMITI.protocollo });
  if (t != null && !RE_PROTOCOLLO.test(t)) {
    errori[campo] = `${etichetta}: indicare solo il numero di protocollo (es. 0089567)`;
    return null;
  }
  return t;
}

function riferimento(errori: Errori, campo: string, etichetta: string, valore: unknown, obbligatorio = false): string | null {
  if (valore == null || valore === '') {
    if (obbligatorio) errori[campo] = `${etichetta}: campo obbligatorio`;
    return null;
  }
  if (typeof valore !== 'string') {
    errori[campo] = `${etichetta}: valore non valido`;
    return null;
  }
  return valore;
}

function intero(errori: Errori, campo: string, etichetta: string, valore: unknown, opzioni: { max: number; obbligatorio?: boolean }): number | null {
  if (valore == null) {
    if (opzioni.obbligatorio) errori[campo] = `${etichetta}: campo obbligatorio`;
    return null;
  }
  if (typeof valore !== 'number' || !Number.isInteger(valore) || valore <= 0) {
    errori[campo] = `${etichetta}: indicare un numero intero maggiore di zero`;
    return null;
  }
  if (valore > opzioni.max) errori[campo] = `${etichetta}: massimo ${opzioni.max}`;
  return valore;
}

// ---------------------------------------------------------------------------
// Accordi quadro e atti di adesione
// ---------------------------------------------------------------------------

export function validaDatiAccordo(d: Partial<DatiAccordo>, parziale = false): Partial<DatiAccordo> {
  const errori: Errori = {};
  const out: Partial<DatiAccordo> = {};
  const considera = (campo: keyof DatiAccordo) => !parziale || ha(d, campo);
  if (considera('numero')) out.numero = testo(errori, 'numero', 'Numero accordo quadro', d.numero, { obbligatorio: true, max: 50 }) ?? '';
  if (considera('oggetto')) out.oggetto = testo(errori, 'oggetto', 'Oggetto', d.oggetto, { obbligatorio: true, max: LIMITI.testoMedio }) ?? '';
  if (considera('ditta')) out.ditta = testo(errori, 'ditta', 'Ditta', d.ditta, { obbligatorio: true, max: LIMITI.testoMedio }) ?? '';
  if (considera('dec')) out.dec = testo(errori, 'dec', 'Collaboratore/DEC', d.dec ?? null, { max: LIMITI.testoBreve });
  if (considera('protocollo_stipula')) out.protocollo_stipula = protocollo(errori, 'protocollo_stipula', 'Protocollo di stipula', d.protocollo_stipula ?? null);
  if (considera('data_stipula')) out.data_stipula = data(errori, 'data_stipula', 'Data di stipula', d.data_stipula ?? null);
  if (considera('durata_giorni')) out.durata_giorni = intero(errori, 'durata_giorni', 'Durata (giorni)', d.durata_giorni ?? null, { max: LIMITI.durataGiorniMax });
  if (considera('importo')) out.importo = importo(errori, 'importo', 'Importo contrattuale', d.importo ?? 0) ?? 0;
  if (considera('note')) out.note = testo(errori, 'note', 'Note', d.note ?? null, { max: LIMITI.note });
  fallisci(errori);
  return out;
}

export function validaDatiAtto(d: Partial<DatiAtto>, parziale = false): Partial<DatiAtto> {
  const errori: Errori = {};
  const out: Partial<DatiAtto> = {};
  const considera = (campo: keyof DatiAtto) => !parziale || ha(d, campo);
  if (considera('numero')) out.numero = testo(errori, 'numero', 'Numero atto di adesione', d.numero, { obbligatorio: true, max: 50 }) ?? '';
  if (considera('oggetto')) out.oggetto = testo(errori, 'oggetto', 'Oggetto', d.oggetto ?? null, { max: LIMITI.testoMedio });
  if (considera('protocollo_stipula')) out.protocollo_stipula = protocollo(errori, 'protocollo_stipula', 'Protocollo di stipula', d.protocollo_stipula ?? null);
  if (considera('data_stipula')) out.data_stipula = data(errori, 'data_stipula', 'Data di stipula', d.data_stipula ?? null);
  if (considera('durata_giorni')) {
    out.durata_giorni = intero(errori, 'durata_giorni', 'Durata (giorni)', d.durata_giorni ?? null, { max: LIMITI.durataGiorniMax, obbligatorio: true }) ?? 0;
  }
  if (considera('valore')) out.valore = importo(errori, 'valore', 'Valore stipulato', d.valore ?? 0, { obbligatorio: true, positivo: true }) ?? 0;
  if (considera('note')) out.note = testo(errori, 'note', 'Note', d.note ?? null, { max: LIMITI.note });
  fallisci(errori);
  return out;
}

// ---------------------------------------------------------------------------
// Capitoli
// ---------------------------------------------------------------------------

export function validaDatiCapitolo(d: Partial<DatiCapitolo>, parziale = false): Partial<DatiCapitolo> {
  const errori: Errori = {};
  const out: Partial<DatiCapitolo> = {};
  if (!parziale || ha(d, 'esercizio')) {
    const e = d.esercizio;
    if (typeof e !== 'number' || !Number.isInteger(e) || e < LIMITI.esercizioMin || e > LIMITI.esercizioMax) {
      errori.esercizio = `Esercizio finanziario non valido (anno tra ${LIMITI.esercizioMin} e ${LIMITI.esercizioMax})`;
    } else out.esercizio = e;
  }
  if (!parziale || ha(d, 'codice')) {
    out.codice = testo(errori, 'codice', 'Codice capitolo', d.codice, { obbligatorio: true, max: 50 }) ?? '';
  }
  if (!parziale || ha(d, 'descrizione')) {
    out.descrizione = testo(errori, 'descrizione', 'Descrizione', d.descrizione ?? null, { max: LIMITI.testoMedio }) ?? '';
  }
  if (!parziale || ha(d, 'finanziato')) {
    out.finanziato = importo(errori, 'finanziato', 'Totale finanziato', d.finanziato ?? 0) ?? 0;
  }
  if (!parziale || ha(d, 'sforamento_ignorato')) {
    out.sforamento_ignorato = d.sforamento_ignorato === true;
  }
  if (!parziale || ha(d, 'sforamento_note')) {
    out.sforamento_note = testo(errori, 'sforamento_note', 'Motivazione del superamento', d.sforamento_note ?? null, { max: LIMITI.note }) ?? '';
  }
  if (out.sforamento_ignorato === true && (out.sforamento_note ?? '') === '') {
    errori.sforamento_note = "Motivazione del superamento: indicare il motivo per cui l'avviso va ignorato";
  }
  fallisci(errori);
  return out;
}

export function chiaveCapitolo(esercizio: number, codice: string): string {
  return `${esercizio}|${codice.trim().toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// PdS
// ---------------------------------------------------------------------------

const CAMPI_TESTO_PDS: { campo: keyof DatiPds; etichetta: string; max: number }[] = [
  { campo: 'ditta', etichetta: 'Ditta', max: LIMITI.testoMedio },
  { campo: 'ordinativo', etichetta: 'Ordinativo', max: LIMITI.testoBreve },
  // un PdS può essere collegato a più IDV: il campo contiene i codici separati da virgola
  { campo: 'idv', etichetta: 'IDV', max: LIMITI.testoMedio },
  { campo: 'dec', etichetta: 'Collaboratore/DEC', max: LIMITI.testoBreve },
];

export function validaDatiPds(d: Partial<DatiPds>, parziale = false): Partial<DatiPds> {
  const errori: Errori = {};
  const out: Partial<DatiPds> = {};
  const considera = (campo: keyof DatiPds) => !parziale || ha(d, campo);

  if (considera('numero')) {
    const n = testo(errori, 'numero', 'Numero PdS', d.numero, { obbligatorio: true, max: 20 });
    if (n != null && !/^\d{1,20}$/.test(n)) {
      errori.numero = "Numero PdS: indicare solo il numero (l'anno dell'esercizio viene aggiunto automaticamente)";
    }
    out.numero = n ?? '';
  }
  if (considera('capitolo_id')) {
    if (typeof d.capitolo_id !== 'string' || d.capitolo_id === '') errori.capitolo_id = 'Capitolo di spesa: campo obbligatorio';
    else out.capitolo_id = d.capitolo_id;
  }
  for (const { campo, etichetta, max } of CAMPI_TESTO_PDS) {
    if (considera(campo)) (out as Record<string, unknown>)[campo] = testo(errori, campo, etichetta, d[campo] ?? null, { max });
  }
  if (considera('accordo_id')) out.accordo_id = riferimento(errori, 'accordo_id', 'Accordo quadro', d.accordo_id ?? null);
  if (considera('atto_adesione_id')) out.atto_adesione_id = riferimento(errori, 'atto_adesione_id', 'Atto di adesione', d.atto_adesione_id ?? null);
  if (considera('protocollo_invio')) out.protocollo_invio = protocollo(errori, 'protocollo_invio', 'Protocollo di invio', d.protocollo_invio ?? null);
  if (considera('protocollo_stipula')) out.protocollo_stipula = protocollo(errori, 'protocollo_stipula', 'Protocollo di stipula', d.protocollo_stipula ?? null);
  if (considera('note')) out.note = testo(errori, 'note', 'Note', d.note ?? null, { max: LIMITI.note });
  if (considera('importo_inviato')) out.importo_inviato = importo(errori, 'importo_inviato', 'Importo inviato', d.importo_inviato ?? null);
  if (considera('valore_stipula')) out.valore_stipula = importo(errori, 'valore_stipula', 'Valore della stipula', d.valore_stipula ?? null);
  if (considera('data_invio')) out.data_invio = data(errori, 'data_invio', 'Data di invio', d.data_invio ?? null);
  if (considera('data_stipula')) out.data_stipula = data(errori, 'data_stipula', 'Data di stipula', d.data_stipula ?? null);
  if (considera('data_termine')) out.data_termine = data(errori, 'data_termine', 'Termine di esecuzione', d.data_termine ?? null);
  if (considera('modalita_termine')) {
    const m = d.modalita_termine ?? null;
    if (m !== null && m !== 'durata' && m !== 'data') errori.modalita_termine = 'Modalità del termine non valida';
    else out.modalita_termine = m;
  }
  if (considera('durata_unita')) {
    const u = d.durata_unita ?? null;
    if (u !== null && u !== 'giorni' && u !== 'mesi') errori.durata_unita = 'Unità di durata non valida';
    else out.durata_unita = u;
  }
  if (considera('durata')) {
    const v = d.durata ?? null;
    if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v <= 0)) {
      errori.durata = 'Durata: indicare un numero intero maggiore di zero';
    } else out.durata = v;
  }
  fallisci(errori);
  return out;
}

/**
 * Rende coerenti i campi dei tempi di esecuzione dopo una modifica e verifica
 * i vincoli che coinvolgono più campi.
 */
export function normalizzaTermine<T extends Pick<Pds, 'modalita_termine' | 'durata' | 'durata_unita' | 'data_termine'>>(p: T): T {
  const r = { ...p };
  if (r.modalita_termine === 'durata') {
    r.data_termine = null;
    if (r.durata != null && r.durata_unita == null) r.durata_unita = 'giorni';
    const max = r.durata_unita === 'mesi' ? LIMITI.durataMesiMax : LIMITI.durataGiorniMax;
    if (r.durata != null && r.durata > max) {
      throw new ErroreApp('VALIDAZIONE', `Durata: massimo ${max} ${r.durata_unita}`, { durata: 'Durata troppo elevata' });
    }
  } else if (r.modalita_termine === 'data') {
    r.durata = null;
    r.durata_unita = null;
  } else {
    r.durata = null;
    r.durata_unita = null;
    r.data_termine = null;
  }
  return r;
}

// ---------------------------------------------------------------------------
// Pagamenti e allegati
// ---------------------------------------------------------------------------

export function validaDatiPagamento(d: Partial<DatiPagamento>, parziale = false): Partial<DatiPagamento> {
  const errori: Errori = {};
  const out: Partial<DatiPagamento> = {};
  if (!parziale || ha(d, 'data')) out.data = data(errori, 'data', 'Data del pagamento', d.data ?? null, true) ?? undefined;
  if (!parziale || ha(d, 'importo')) {
    out.importo = importo(errori, 'importo', 'Importo del pagamento', d.importo ?? null, { obbligatorio: true, positivo: true }) ?? undefined;
  }
  if (!parziale || ha(d, 'riferimento')) out.riferimento = protocollo(errori, 'riferimento', 'Protocollo del pagamento', d.riferimento ?? null);
  if (!parziale || ha(d, 'note')) out.note = testo(errori, 'note', 'Note', d.note ?? null, { max: LIMITI.testoMedio });
  fallisci(errori);
  return out;
}

export const TIPI_ALLEGATO: { valore: TipoAllegato; etichetta: string }[] = [
  { valore: 'protocollo_invio', etichetta: 'Protocollo di invio' },
  { valore: 'protocollo_stipula', etichetta: 'Protocollo di stipula' },
  { valore: 'fattura', etichetta: 'Fattura' },
  { valore: 'altro', etichetta: 'Altro documento' },
];

export function isUrlValido(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validaDatiAllegato(d: Partial<DatiAllegato>, conFile: boolean): DatiAllegato {
  const errori: Errori = {};
  const tipo = d.tipo;
  if (!TIPI_ALLEGATO.some((t) => t.valore === tipo)) errori.tipo = 'Tipo di allegato non valido';
  const titolo = testo(errori, 'titolo', 'Titolo', d.titolo ?? null, { obbligatorio: true, max: LIMITI.testoMedio });
  const url = testo(errori, 'url', 'Collegamento', d.url ?? null, { max: 2000 });
  if (!conFile && !url) errori.url = 'Indicare un collegamento o caricare un file';
  if (url && !isUrlValido(url)) errori.url = 'Collegamento non valido: deve iniziare con https:// o http://';
  fallisci(errori);
  return { tipo: tipo as TipoAllegato, titolo: titolo ?? '', url: conFile ? null : url };
}

// ---------------------------------------------------------------------------
// Utenti
// ---------------------------------------------------------------------------

export function normalizzaUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function erroreUsername(username: string): string | null {
  if (!RE_USERNAME.test(username)) {
    return 'Nome utente non valido: 3-40 caratteri tra lettere minuscole, cifre, punto, trattino e trattino basso';
  }
  return null;
}

export function errorePassword(password: string): string | null {
  if (password.length < LUNGHEZZA_MINIMA_PASSWORD) return `La password deve contenere almeno ${LUNGHEZZA_MINIMA_PASSWORD} caratteri`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'La password deve contenere almeno una lettera e una cifra';
  if (password.length > 128) return 'La password è troppo lunga (massimo 128 caratteri)';
  return null;
}

export function validaPassword(password: string): void {
  const e = errorePassword(password);
  if (e) throw new ErroreApp('VALIDAZIONE', e, { password: e });
}

export function validaDatiUtente(d: Partial<DatiUtente>, parziale = false): Partial<DatiUtente> {
  const errori: Errori = {};
  const out: Partial<DatiUtente> = {};
  if (!parziale || ha(d, 'username')) {
    const u = normalizzaUsername(d.username ?? '');
    const e = erroreUsername(u);
    if (e) errori.username = e;
    out.username = u;
  }
  if (!parziale || ha(d, 'nome')) {
    out.nome = testo(errori, 'nome', 'Nome e cognome', d.nome ?? null, { obbligatorio: true, max: LIMITI.testoBreve }) ?? '';
  }
  if (!parziale || ha(d, 'ruolo')) {
    if (d.ruolo !== 'admin' && d.ruolo !== 'utente') errori.ruolo = 'Ruolo non valido';
    else out.ruolo = d.ruolo;
  }
  if (!parziale || ha(d, 'attivo')) out.attivo = d.attivo !== false;
  if (!parziale || ha(d, 'permessi')) out.permessi = normalizzaPermessi(d.permessi);
  fallisci(errori);
  return out;
}

// ---------------------------------------------------------------------------
// Avvisi di coerenza (non bloccanti)
// ---------------------------------------------------------------------------

export function avvisiCoerenzaPds(
  p: Pds,
  contesto: { pagamenti: Pagamento[]; altriPds: Pds[]; capitoli: Map<string, Capitolo> },
): string[] {
  const avvisi: string[] = [];
  const capitolo = contesto.capitoli.get(p.capitolo_id);
  if (capitolo) {
    const numero = p.numero.trim().toLowerCase();
    const duplicato = contesto.altriPds.some(
      (x) =>
        x.id !== p.id &&
        x.eliminato_at == null &&
        x.numero.trim().toLowerCase() === numero &&
        contesto.capitoli.get(x.capitolo_id)?.esercizio === capitolo.esercizio,
    );
    if (duplicato) avvisi.push(`Esiste un altro PdS con numero "${p.numero}/${capitolo.esercizio}".`);
  }
  if (p.importo_inviato != null && !p.data_invio && !p.data_stipula) {
    avvisi.push("È indicato l'importo inviato ma manca la data di invio: il PdS non risulta ancora inviato.");
  }
  if ((p.valore_stipula != null || p.protocollo_stipula) && !p.data_stipula) {
    avvisi.push('Sono presenti dati di stipula ma manca la data di stipula: la stipula non risulta avvenuta.');
  }
  if (p.data_stipula && p.valore_stipula == null) {
    avvisi.push('Stipula registrata senza valore della stipula.');
  }
  if (p.data_invio && p.data_stipula && p.data_stipula < p.data_invio) {
    avvisi.push('La data di stipula è precedente alla data di invio.');
  }
  if (p.modalita_termine === 'durata' && p.durata != null && !p.data_stipula) {
    avvisi.push('La scadenza sarà calcolata quando verrà inserita la data di stipula.');
  }
  if (p.modalita_termine === 'data' && p.data_termine && p.data_stipula && p.data_termine < p.data_stipula) {
    avvisi.push('Il termine di esecuzione è precedente alla data di stipula.');
  }
  const pagato = contesto.pagamenti.reduce((t, x) => t + x.importo, 0);
  if (p.valore_stipula != null && pagato > p.valore_stipula) {
    avvisi.push('Il totale dei pagamenti supera il valore della stipula.');
  }
  if (p.saldato && p.data_saldo && p.data_stipula && p.data_saldo < p.data_stipula) {
    avvisi.push('La data del saldo è precedente alla data di stipula.');
  }
  return avvisi;
}
