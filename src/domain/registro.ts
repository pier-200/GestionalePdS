import { formattaData } from './date';
import { formattaEuro } from './importi';
import type { EntitaRegistro, ModificaCampo, VoceRegistro } from './tipi';

/** Tipologia dei campi, per mostrare correttamente i valori nello storico. */
type TipoCampo = 'testo' | 'importo' | 'data' | 'booleano' | 'numero' | 'enum' | 'elenco' | 'riferimento';

interface DefinizioneCampo {
  etichetta: string;
  tipo: TipoCampo;
  valori?: Record<string, string>;
}

const PERMESSI_ETICHETTE: Record<string, string> = {
  capitoli: 'Capitoli di spesa',
  accordi: 'Accordi quadro',
  pds_crea: 'Creazione/eliminazione PdS',
  pds_dati: 'Dati PdS',
  pds_pagamenti: 'Pagamenti e saldo',
  pds_allegati: 'Allegati',
};

export const CAMPI: Record<EntitaRegistro, Record<string, DefinizioneCampo>> = {
  capitolo: {
    esercizio: { etichetta: 'Esercizio finanziario', tipo: 'numero' },
    codice: { etichetta: 'Codice capitolo', tipo: 'testo' },
    descrizione: { etichetta: 'Descrizione', tipo: 'testo' },
    finanziato: { etichetta: 'Totale finanziato', tipo: 'importo' },
    sforamento_ignorato: { etichetta: 'Superamento del finanziato autorizzato', tipo: 'booleano' },
    sforamento_note: { etichetta: 'Motivazione del superamento', tipo: 'testo' },
  },
  accordo: {
    numero: { etichetta: 'Numero accordo quadro', tipo: 'testo' },
    oggetto: { etichetta: 'Oggetto', tipo: 'testo' },
    ditta: { etichetta: 'Ditta', tipo: 'testo' },
    dec: { etichetta: 'Collaboratore/DEC', tipo: 'testo' },
    protocollo_stipula: { etichetta: 'Protocollo di stipula', tipo: 'testo' },
    data_stipula: { etichetta: 'Data di stipula', tipo: 'data' },
    durata_giorni: { etichetta: 'Durata (giorni)', tipo: 'numero' },
    importo: { etichetta: 'Importo contrattuale', tipo: 'importo' },
    note: { etichetta: 'Note', tipo: 'testo' },
  },
  atto: {
    accordo_id: { etichetta: 'Accordo quadro', tipo: 'riferimento' },
    numero: { etichetta: 'Numero atto di adesione', tipo: 'testo' },
    oggetto: { etichetta: 'Oggetto', tipo: 'testo' },
    protocollo_stipula: { etichetta: 'Protocollo di stipula', tipo: 'testo' },
    data_stipula: { etichetta: 'Data di stipula', tipo: 'data' },
    durata_giorni: { etichetta: 'Durata (giorni)', tipo: 'numero' },
    valore: { etichetta: 'Valore stipulato', tipo: 'importo' },
    note: { etichetta: 'Note', tipo: 'testo' },
  },
  pds: {
    numero: { etichetta: 'Numero PdS', tipo: 'testo' },
    capitolo_id: { etichetta: 'Capitolo di spesa', tipo: 'riferimento' },
    accordo_id: { etichetta: 'Accordo quadro', tipo: 'riferimento' },
    atto_adesione_id: { etichetta: 'Atto di adesione', tipo: 'riferimento' },
    ditta: { etichetta: 'Ditta', tipo: 'testo' },
    ordinativo: { etichetta: 'Ordinativo', tipo: 'testo' },
    idv: { etichetta: 'IDV', tipo: 'testo' },
    dec: { etichetta: 'Collaboratore/DEC', tipo: 'testo' },
    importo_inviato: { etichetta: 'Importo inviato', tipo: 'importo' },
    protocollo_invio: { etichetta: 'Protocollo di invio', tipo: 'testo' },
    data_invio: { etichetta: 'Data di invio', tipo: 'data' },
    protocollo_stipula: { etichetta: 'Protocollo di stipula', tipo: 'testo' },
    data_stipula: { etichetta: 'Data di stipula', tipo: 'data' },
    valore_stipula: { etichetta: 'Valore della stipula', tipo: 'importo' },
    modalita_termine: {
      etichetta: 'Modalità del termine',
      tipo: 'enum',
      valori: { durata: 'Durata dalla stipula', data: 'Data fissa' },
    },
    durata: { etichetta: 'Durata', tipo: 'numero' },
    durata_unita: { etichetta: 'Unità di durata', tipo: 'enum', valori: { giorni: 'giorni', mesi: 'mesi' } },
    data_termine: { etichetta: 'Termine di esecuzione', tipo: 'data' },
    saldato: { etichetta: 'Saldato', tipo: 'booleano' },
    data_saldo: { etichetta: 'Data del saldo', tipo: 'data' },
    totale_pagato_saldo: { etichetta: 'Totale pagato a saldo', tipo: 'importo' },
    note: { etichetta: 'Note', tipo: 'testo' },
    eliminato_at: { etichetta: 'Spostato tra i PdS eliminati', tipo: 'testo' },
    eliminato_da: { etichetta: 'Eliminato da', tipo: 'riferimento' },
  },
  pagamento: {
    data: { etichetta: 'Data', tipo: 'data' },
    importo: { etichetta: 'Importo', tipo: 'importo' },
    riferimento: { etichetta: 'Riferimento', tipo: 'testo' },
    note: { etichetta: 'Note', tipo: 'testo' },
  },
  allegato: {
    tipo: {
      etichetta: 'Tipo',
      tipo: 'enum',
      valori: {
        protocollo_invio: 'Protocollo di invio',
        protocollo_stipula: 'Protocollo di stipula',
        fattura: 'Fattura',
        altro: 'Altro documento',
      },
    },
    titolo: { etichetta: 'Titolo', tipo: 'testo' },
    url: { etichetta: 'Collegamento', tipo: 'testo' },
    file_nome: { etichetta: 'File', tipo: 'testo' },
  },
  utente: {
    username: { etichetta: 'Nome utente', tipo: 'testo' },
    nome: { etichetta: 'Nome', tipo: 'testo' },
    ruolo: { etichetta: 'Ruolo', tipo: 'enum', valori: { admin: 'Amministratore', utente: 'Utente' } },
    attivo: { etichetta: 'Attivo', tipo: 'booleano' },
    permessi: { etichetta: 'Permessi', tipo: 'elenco' },
    password: { etichetta: 'Password', tipo: 'testo' },
  },
};

export const ETICHETTE_ENTITA: Record<EntitaRegistro, string> = {
  capitolo: 'Capitolo di spesa',
  accordo: 'Accordo quadro',
  atto: 'Atto di adesione',
  pds: 'PdS',
  pagamento: 'Pagamento',
  allegato: 'Allegato',
  utente: 'Utente',
};

export const ETICHETTE_AZIONE = {
  creazione: 'Creazione',
  modifica: 'Modifica',
  eliminazione: 'Eliminazione',
} as const;

function uguali(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'object' && typeof b === 'object' && a && b) return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

export { uguali as valoriUguali };

/** Campi effettivamente cambiati tra due versioni di un oggetto. */
export function differenze<T extends object>(prima: T, dopo: T, campi: readonly (keyof T)[]): Record<string, ModificaCampo> {
  const out: Record<string, ModificaCampo> = {};
  for (const campo of campi) {
    const da = prima[campo] ?? null;
    const a = dopo[campo] ?? null;
    if (!uguali(da, a)) out[String(campo)] = { da, a };
  }
  return out;
}

/** Istantanea dei campi valorizzati (per le voci di creazione ed eliminazione). */
export function istantanea<T extends object>(oggetto: T, campi: readonly (keyof T)[], creazione: boolean): Record<string, ModificaCampo> {
  const out: Record<string, ModificaCampo> = {};
  for (const campo of campi) {
    const valore = oggetto[campo] ?? null;
    if (valore === null || valore === '' || valore === false) continue;
    out[String(campo)] = creazione ? { da: null, a: valore } : { da: valore, a: null };
  }
  return out;
}

export function etichettaCampo(entita: EntitaRegistro, campo: string): string {
  return CAMPI[entita]?.[campo]?.etichetta ?? campo;
}

/**
 * Valore leggibile di un campo. `risolviRiferimento` traduce gli identificativi
 * (es. capitolo_id) in descrizioni.
 */
export function formattaValoreCampo(
  entita: EntitaRegistro,
  campo: string,
  valore: unknown,
  risolviRiferimento?: (campo: string, id: string) => string | null,
): string {
  if (valore === null || valore === undefined || valore === '') return '—';
  const def = CAMPI[entita]?.[campo];
  switch (def?.tipo) {
    case 'importo':
      return typeof valore === 'number' ? formattaEuro(valore) : String(valore);
    case 'data':
      return typeof valore === 'string' ? formattaData(valore) : String(valore);
    case 'booleano':
      return valore ? 'Sì' : 'No';
    case 'enum':
      return def.valori?.[String(valore)] ?? String(valore);
    case 'riferimento':
      return (typeof valore === 'string' && risolviRiferimento?.(campo, valore)) || String(valore);
    case 'elenco':
      if (typeof valore === 'object') return descriviPermessiRegistro(valore as Record<string, unknown>);
      return String(valore);
    default:
      if (typeof valore === 'object') return JSON.stringify(valore);
      return String(valore);
  }
}

function descriviPermessiRegistro(p: Record<string, unknown>): string {
  const aree = Object.entries(PERMESSI_ETICHETTE)
    .filter(([k]) => p[k] === true)
    .map(([, v]) => v);
  const ambito = Array.isArray(p.ambito_capitoli) ? ` · capitoli: ${(p.ambito_capitoli as string[]).join(', ') || 'nessuno'}` : '';
  return (aree.length ? aree.join(', ') : 'nessuno') + ambito;
}

/** Sintesi in una riga di una voce di registro. */
export function titoloVoce(v: VoceRegistro): string {
  const oggetto = `${ETICHETTE_ENTITA[v.entita]}${v.riferimento ? ` ${v.riferimento}` : ''}`;
  if (v.entita === 'pds' && v.azione === 'modifica' && v.modifiche?.eliminato_at) {
    return v.modifiche.eliminato_at.a ? `Spostato tra gli eliminati – ${oggetto}` : `Ripristinato – ${oggetto}`;
  }
  if (v.entita === 'pds' && v.azione === 'modifica' && v.modifiche?.saldato) {
    return v.modifiche.saldato.a ? `Saldo confermato – ${oggetto}` : `Saldo annullato – ${oggetto}`;
  }
  if (v.entita === 'utente' && v.azione === 'modifica' && v.modifiche?.password) {
    return `Password reimpostata – ${oggetto}`;
  }
  return `${ETICHETTE_AZIONE[v.azione]} – ${oggetto}`;
}
