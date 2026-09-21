export type CodiceErrore =
  | 'VALIDAZIONE'
  | 'PERMESSO_NEGATO'
  | 'NON_TROVATO'
  | 'CONFLITTO'
  | 'DUPLICATO'
  | 'VINCOLO'
  | 'AUTENTICAZIONE'
  /** Backend GitHub: token di accesso scaduto o revocato, rinnovabile da un amministratore. */
  | 'TOKEN_SCADUTO'
  | 'RETE'
  | 'CONFIGURAZIONE'
  | 'INTERNO';

/** Errore applicativo con messaggio già pronto per l'utente (in italiano). */
export class ErroreApp extends Error {
  readonly codice: CodiceErrore;
  readonly dettagli?: Record<string, string>;

  constructor(codice: CodiceErrore, messaggio: string, dettagli?: Record<string, string>) {
    super(messaggio);
    this.name = 'ErroreApp';
    this.codice = codice;
    this.dettagli = dettagli;
  }
}

export function messaggioErrore(e: unknown): string {
  if (e instanceof ErroreApp) return e.message;
  if (e instanceof TypeError && /fetch|network|Failed to fetch|NetworkError|Load failed/i.test(e.message)) {
    return 'Impossibile contattare il server: verificare la connessione di rete o eventuali blocchi del proxy.';
  }
  if (e instanceof Error && e.message) return e.message;
  return 'Si è verificato un errore imprevisto.';
}
