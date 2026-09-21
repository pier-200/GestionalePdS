import type { AccordoQuadro, Allegato, AttoAdesione, Capitolo, DataISO, ID, Pagamento, Pds, Permessi, Ruolo } from './tipi';
import type { CampoDatiPds } from './permessi';

/**
 * Tutte le modifiche ai dati passano da questi comandi, identici per ogni backend.
 * I comandi di modifica riportano anche i valori `originale` visti dall'utente:
 * se nel frattempo un altro utente ha cambiato gli stessi campi, la modifica
 * viene respinta con un errore di conflitto invece di sovrascriverla.
 */

export type DatiCapitolo = Pick<Capitolo, 'esercizio' | 'codice' | 'descrizione' | 'finanziato' | 'sforamento_ignorato' | 'sforamento_note'>;
export type DatiAccordo = Pick<
  AccordoQuadro,
  'numero' | 'oggetto' | 'ditta' | 'dec' | 'protocollo_stipula' | 'data_stipula' | 'durata_giorni' | 'importo' | 'note'
>;
export type DatiAtto = Pick<AttoAdesione, 'numero' | 'oggetto' | 'protocollo_stipula' | 'data_stipula' | 'durata_giorni' | 'valore' | 'note'>;
export type DatiPds = Pick<Pds, CampoDatiPds>;
export type DatiPagamento = Pick<Pagamento, 'data' | 'importo' | 'riferimento' | 'note'>;
export type DatiAllegato = Pick<Allegato, 'tipo' | 'titolo' | 'url'>;
export interface DatiUtente {
  username: string;
  nome: string;
  ruolo: Ruolo;
  attivo: boolean;
  permessi: Permessi;
}

/** File da allegare: il backend lo carica e ne registra il percorso. */
export interface FileAllegato {
  nome: string;
  tipo: string;
  dimensione: number;
  contenuto: Blob;
}

export type Comando =
  | { tipo: 'capitolo.crea'; dati: DatiCapitolo }
  | { tipo: 'capitolo.modifica'; id: ID; modifiche: Partial<DatiCapitolo>; originale: Partial<DatiCapitolo> }
  | { tipo: 'capitolo.elimina'; id: ID }
  | { tipo: 'capitoli.copia'; esercizioOrigine: number; esercizioDestinazione: number; copiaImporti: boolean }
  | { tipo: 'accordo.crea'; dati: DatiAccordo }
  | { tipo: 'accordo.modifica'; id: ID; modifiche: Partial<DatiAccordo>; originale: Partial<DatiAccordo> }
  | { tipo: 'accordo.elimina'; id: ID }
  | { tipo: 'atto.crea'; accordo_id: ID; dati: DatiAtto }
  | { tipo: 'atto.modifica'; id: ID; modifiche: Partial<DatiAtto>; originale: Partial<DatiAtto> }
  | { tipo: 'atto.elimina'; id: ID }
  | { tipo: 'pds.crea'; dati: Partial<DatiPds> & Pick<DatiPds, 'numero' | 'capitolo_id'> }
  | { tipo: 'pds.modifica'; id: ID; modifiche: Partial<DatiPds>; originale: Partial<DatiPds> }
  /** Eliminazione logica: il PdS finisce tra i "PdS eliminati", visibili al solo amministratore. */
  | { tipo: 'pds.elimina'; id: ID }
  /** Ripristino di un PdS eliminato (solo amministratore). */
  | { tipo: 'pds.ripristina'; id: ID }
  /** Eliminazione definitiva di un PdS già eliminato, con pagamenti e allegati (solo amministratore). */
  | { tipo: 'pds.elimina_definitivo'; id: ID }
  | { tipo: 'pagamento.crea'; pds_id: ID; dati: DatiPagamento }
  | { tipo: 'pagamento.modifica'; id: ID; modifiche: Partial<DatiPagamento>; originale: Partial<DatiPagamento> }
  | { tipo: 'pagamento.elimina'; id: ID }
  | { tipo: 'saldo.conferma'; pds_id: ID; data_saldo: DataISO; pagamento_finale: DatiPagamento | null }
  | { tipo: 'saldo.annulla'; pds_id: ID }
  | { tipo: 'allegato.crea'; pds_id: ID; dati: DatiAllegato; file: FileAllegato | null }
  | { tipo: 'allegato.elimina'; id: ID }
  | { tipo: 'utente.crea'; dati: DatiUtente; password: string }
  | { tipo: 'utente.modifica'; id: ID; modifiche: Partial<Omit<DatiUtente, 'username'>> }
  | { tipo: 'utente.password'; id: ID; password: string }
  | { tipo: 'utente.elimina'; id: ID };

export type TipoComando = Comando['tipo'];

export interface RisultatoComando {
  /** Identificativo dell'elemento creato o modificato. */
  id?: ID;
  /** Numero di elementi coinvolti (es. capitoli copiati). */
  conteggio?: number;
}
