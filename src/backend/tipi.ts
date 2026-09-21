import type { Comando, RisultatoComando } from '../domain/comandi';
import type { Allegato, DataISO, DatiCondivisi, EntitaRegistro, ID, Utente, VoceRegistro } from '../domain/tipi';

export type TipoBackend = 'demo' | 'github' | 'supabase';

export interface Sessione {
  utente: Utente;
}

export interface CapacitaBackend {
  /** I permessi sono applicati anche lato server (non solo dall'interfaccia). */
  permessiLatoServer: boolean;
  /** È possibile caricare file come allegati (oltre ai collegamenti). */
  caricamentoFile: boolean;
  /** Dimensione massima dei file allegati, in byte. */
  dimensioneMassimaFile: number;
}

export type StatoAvvio =
  | { tipo: 'pronto' }
  /** Il backend va configurato al primo utilizzo (es. creazione dell'amministratore). */
  | { tipo: 'primo_avvio'; messaggio: string };

export interface FiltroRegistro {
  pdsId?: ID;
  entita?: EntitaRegistro;
  utenteId?: ID;
  dal?: DataISO;
  al?: DataISO;
  limite?: number;
}

export interface EsitoEsecuzione {
  risultato: RisultatoComando;
  /** Dati aggiornati, se il backend li ha già disponibili senza ricaricarli. */
  dati?: DatiCondivisi;
}

export interface DatiPrimoAvvio {
  username: string;
  nome: string;
  password: string;
  /** Solo backend GitHub: token di accesso ai repository. */
  token?: string;
}

/** Interfaccia comune ai backend: l'interfaccia utente non conosce i dettagli di persistenza. */
export interface Backend {
  readonly tipo: TipoBackend;
  readonly nome: string;
  readonly capacita: CapacitaBackend;

  avvia(): Promise<StatoAvvio>;
  /** Configurazione al primo avvio (crea l'amministratore); restituisce la sessione aperta. */
  primoAvvio(dati: DatiPrimoAvvio): Promise<Sessione>;
  ripristinaSessione(): Promise<Sessione | null>;
  accedi(username: string, password: string, ricordami: boolean): Promise<Sessione>;
  esci(): Promise<void>;
  cambiaPassword(passwordAttuale: string, nuovaPassword: string): Promise<void>;

  caricaDati(): Promise<DatiCondivisi>;
  /** Controllo leggero: i dati remoti sono cambiati dall'ultimo caricamento? */
  ciSonoAggiornamenti(): Promise<boolean>;
  esegui(comando: Comando): Promise<EsitoEsecuzione>;
  caricaRegistro(filtro: FiltroRegistro): Promise<VoceRegistro[]>;
  scaricaFile(allegato: Allegato): Promise<Blob>;
}
