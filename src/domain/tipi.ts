/**
 * Modello dati del Gestionale PdS.
 *
 * Convenzioni valide per tutto il dominio (e per tutti i backend):
 * - gli importi sono interi in CENTESIMI di euro (nessun errore di arrotondamento);
 * - le date di calendario sono stringhe ISO `YYYY-MM-DD` (nessun problema di fuso orario);
 * - gli istanti (creazione, modifica, registro) sono stringhe ISO 8601 in UTC.
 */

export type ID = string;
/** Importo in centesimi di euro (intero). */
export type Centesimi = number;
/** Data di calendario `YYYY-MM-DD`. */
export type DataISO = string;
/** Istante ISO 8601 (UTC). */
export type Istante = string;

export interface Tracciamento {
  created_at: Istante;
  created_by: ID | null;
  updated_at: Istante;
  updated_by: ID | null;
}

/** Capitolo di spesa, definito per esercizio finanziario (sez. 4). */
export interface Capitolo extends Tracciamento {
  id: ID;
  /** Esercizio finanziario di competenza (anno). */
  esercizio: number;
  /** Identificativo del capitolo (es. "1234" o "1234/05"). */
  codice: string;
  /** Denominazione descrittiva (facoltativa, non mostrata nell'interfaccia). */
  descrizione: string;
  /** Totale finanziato sul capitolo. */
  finanziato: Centesimi;
  /** L'amministratore ha autorizzato il superamento del finanziato: l'avviso rosso non viene mostrato. */
  sforamento_ignorato: boolean;
  /** Motivazione del superamento autorizzato. */
  sforamento_note: string;
}

export type ModalitaTermine = 'durata' | 'data';
export type UnitaDurata = 'giorni' | 'mesi';

/**
 * Accordo quadro (AQ): contenitore contrattuale con una propria capienza.
 * La capienza è impegnata dagli atti di adesione a quantità indeterminata e dai
 * PdS collegati direttamente all'AQ (atti di adesione a quantità determinata).
 */
export interface AccordoQuadro extends Tracciamento {
  id: ID;
  /** Identificativo breve mostrato negli elenchi (es. "AQ 12/2026"). */
  numero: string;
  oggetto: string;
  ditta: string;
  /** Collaboratore o DEC dell'accordo quadro. */
  dec: string | null;
  /** Numero puro del protocollo di stipula. */
  protocollo_stipula: string | null;
  data_stipula: DataISO | null;
  /** Durata contrattuale in giorni dalla stipula. */
  durata_giorni: number | null;
  /** Capienza contrattuale complessiva. */
  importo: Centesimi;
  note: string | null;
}

/** Durata predefinita di un atto di adesione a quantità indeterminata. */
export const DURATA_ATTO_PREDEFINITA = 365;

/**
 * Atto di adesione a quantità indeterminata: impegna la capienza contrattuale
 * dell'accordo quadro ma nessun fondo sul capitolo di spesa. Sono i PdS collegati
 * all'atto a impegnare i fondi del capitolo e a consumarne la quota parte.
 * Gli atti di adesione a quantità determinata non sono registrati qui: coincidono
 * con i PdS collegati direttamente all'accordo quadro.
 */
export interface AttoAdesione extends Tracciamento {
  id: ID;
  accordo_id: ID;
  numero: string;
  oggetto: string | null;
  protocollo_stipula: string | null;
  data_stipula: DataISO | null;
  /** Durata in giorni dalla stipula (predefinita: 365). */
  durata_giorni: number;
  /** Valore stipulato: è la quota di capienza dell'AQ impegnata dall'atto. */
  valore: Centesimi;
  note: string | null;
}

/** Progetto di spesa (sez. 5). */
export interface Pds extends Tracciamento {
  id: ID;
  // 5.1 Dati identificativi
  /** Numero progressivo inserito dall'utente (es. "18"); l'anno viene aggiunto dall'esercizio del capitolo. */
  numero: string;
  capitolo_id: ID;
  /** Accordo quadro di riferimento (facoltativo). */
  accordo_id: ID | null;
  /** Atto di adesione a quantità indeterminata dell'accordo quadro indicato. */
  atto_adesione_id: ID | null;
  /** Ditta affidataria. */
  ditta: string | null;
  /** Ordinativo associato al PdS. */
  ordinativo: string | null;
  /** IDV associati al PdS (suddivisione del capitolo): uno o più codici separati da virgola. */
  idv: string | null;
  /** Collaboratore o DEC (Direttore dell'Esecuzione del Contratto). */
  dec: string | null;
  // 5.2 Invio
  importo_inviato: Centesimi | null;
  protocollo_invio: string | null;
  data_invio: DataISO | null;
  // 5.3 Stipula
  protocollo_stipula: string | null;
  data_stipula: DataISO | null;
  valore_stipula: Centesimi | null;
  // 5.4 Tempi di esecuzione
  modalita_termine: ModalitaTermine | null;
  durata: number | null;
  durata_unita: UnitaDurata | null;
  /** Termine di esecuzione fissato direttamente (modalità "data"). */
  data_termine: DataISO | null;
  // 5.5 Saldo
  saldato: boolean;
  data_saldo: DataISO | null;
  /** Valore complessivo finale pagato, registrato alla conferma del saldo. */
  totale_pagato_saldo: Centesimi | null;
  // 5.6 Note
  note: string | null;
  // 5.10 Eliminazione logica: i PdS eliminati restano visibili al solo amministratore
  eliminato_at: Istante | null;
  eliminato_da: ID | null;
}

/** Pagamento associato a un PdS (sez. 5.5). */
export interface Pagamento extends Tracciamento {
  id: ID;
  pds_id: ID;
  data: DataISO;
  importo: Centesimi;
  /** Numero puro del protocollo del pagamento (mostrato come "Prot. n. … del …"). */
  riferimento: string | null;
  note: string | null;
}

export type TipoAllegato = 'protocollo_invio' | 'protocollo_stipula' | 'fattura' | 'altro';

/** Allegato o collegamento a documento (sez. 5.8). */
export interface Allegato {
  id: ID;
  pds_id: ID;
  tipo: TipoAllegato;
  titolo: string;
  /** Collegamento esterno (se l'allegato è un link). */
  url: string | null;
  /** Percorso del file nello storage del backend (se l'allegato è un file caricato). */
  file_path: string | null;
  file_nome: string | null;
  file_dimensione: number | null;
  file_tipo: string | null;
  created_at: Istante;
  created_by: ID | null;
}

export type Ruolo = 'admin' | 'utente';

/**
 * Permessi di modifica (sez. 3). La lettura dei dati condivisi è consentita
 * a tutti gli utenti attivi; ogni area di modifica va concessa esplicitamente.
 */
export interface Permessi {
  /** Gestione dei capitoli di spesa. */
  capitoli: boolean;
  /** Gestione degli accordi quadro e dei relativi atti di adesione. */
  accordi: boolean;
  /** Creazione ed eliminazione di PdS. */
  pds_crea: boolean;
  /** Modifica di dati identificativi, invio, stipula, tempi di esecuzione e note. */
  pds_dati: boolean;
  /** Registrazione dei pagamenti e conferma/annullamento del saldo. */
  pds_pagamenti: boolean;
  /** Gestione degli allegati. */
  pds_allegati: boolean;
  /**
   * Ambito dei permessi sui PdS: codici dei capitoli su cui l'utente può operare
   * (validi per tutti gli esercizi). `null` = tutti i capitoli.
   */
  ambito_capitoli: string[] | null;
}

export type AreaPermesso = Exclude<keyof Permessi, 'ambito_capitoli'>;

export interface Utente {
  id: ID;
  username: string;
  nome: string;
  ruolo: Ruolo;
  attivo: boolean;
  permessi: Permessi;
  created_at: Istante;
  updated_at: Istante;
}

export type EntitaRegistro = 'capitolo' | 'accordo' | 'atto' | 'pds' | 'pagamento' | 'allegato' | 'utente';
export type AzioneRegistro = 'creazione' | 'modifica' | 'eliminazione';

export interface ModificaCampo {
  da: unknown;
  a: unknown;
}

/** Voce dello storico modifiche (sez. 5.9). */
export interface VoceRegistro {
  id: string;
  ts: Istante;
  utente_id: ID | null;
  username: string | null;
  entita: EntitaRegistro;
  entita_id: ID | null;
  /** PdS di riferimento (per PdS, pagamenti e allegati). */
  pds_id: ID | null;
  azione: AzioneRegistro;
  /** Descrizione leggibile dell'oggetto (es. "PdS 12/2026"), utile anche dopo l'eliminazione. */
  riferimento: string | null;
  modifiche: Record<string, ModificaCampo> | null;
}

/** Insieme dei dati condivisi caricati dal backend. */
export interface DatiCondivisi {
  capitoli: Capitolo[];
  accordi: AccordoQuadro[];
  atti: AttoAdesione[];
  pds: Pds[];
  pagamenti: Pagamento[];
  allegati: Allegato[];
  utenti: Utente[];
}

export const PERMESSI_NESSUNO: Permessi = {
  capitoli: false,
  accordi: false,
  pds_crea: false,
  pds_dati: false,
  pds_pagamenti: false,
  pds_allegati: false,
  ambito_capitoli: null,
};

export const PERMESSI_TUTTI: Permessi = {
  capitoli: true,
  accordi: true,
  pds_crea: true,
  pds_dati: true,
  pds_pagamenti: true,
  pds_allegati: true,
  ambito_capitoli: null,
};

export function datiVuoti(): DatiCondivisi {
  return { capitoli: [], accordi: [], atti: [], pds: [], pagamenti: [], allegati: [], utenti: [] };
}
