import type { Comando } from '../../domain/comandi';
import { adessoISO, oggiISO } from '../../domain/date';
import { ErroreApp } from '../../domain/errori';
import type { Allegato, DatiCondivisi, ID, VoceRegistro } from '../../domain/tipi';
import { normalizzaUsername, validaPassword } from '../../domain/validazione';
import { applicaComando, type Effetto } from '../../motore/motore';
import { archivioBrowser, archivioFileIndexedDb, type ArchivioFile, type ArchivioTesto } from '../archivi';
import { base64DaBytes, bytesCasuali, bytesDaBase64, hashPassword, nuovoUuid, uguaglianzaCostante } from '../crittografia';
import { filtraRegistro } from '../registroLocale';
import type { Backend, DatiPrimoAvvio, EsitoEsecuzione, FiltroRegistro, Sessione, StatoAvvio } from '../tipi';
import { PASSWORD_DEMO, creaDatiDimostrativi } from './datiDimostrativi';

const CHIAVE_DB = 'gestionale-pds:demo:db';
const CHIAVE_SESSIONE = 'gestionale-pds:demo:sessione';
const ITERAZIONI = 20_000;
// il formato cambia quando il modello dati cambia: i dati dimostrativi vengono rigenerati
const FORMATO = 2;

interface Credenziale {
  salt: string;
  hash: string;
}

interface StatoDemo {
  formato: number;
  revisione: number;
  dati: DatiCondivisi;
  registro: VoceRegistro[];
  credenziali: Record<ID, Credenziale>;
}

export interface OpzioniDemo {
  archivio?: ArchivioTesto;
  sessioneTemporanea?: ArchivioTesto;
  file?: ArchivioFile;
  oggi?: () => string;
}

/**
 * Backend dimostrativo: tutti i dati restano nel browser (localStorage + IndexedDB).
 * Serve a provare l'applicazione senza configurare nulla; non è condiviso tra utenti.
 */
export class DemoBackend implements Backend {
  readonly tipo = 'demo' as const;
  readonly nome = 'Dimostrativo (dati salvati solo in questo browser)';
  readonly capacita = { permessiLatoServer: false, caricamentoFile: true, dimensioneMassimaFile: 5 * 1024 * 1024 };

  private readonly archivio: ArchivioTesto;
  private readonly sessioneTemporanea: ArchivioTesto;
  private readonly file: ArchivioFile;
  private readonly oggi: () => string;
  private utenteId: ID | null = null;
  private revisioneCaricata = -1;

  constructor(opzioni: OpzioniDemo = {}) {
    this.archivio = opzioni.archivio ?? archivioBrowser('local');
    this.sessioneTemporanea = opzioni.sessioneTemporanea ?? archivioBrowser('session');
    this.file = opzioni.file ?? archivioFileIndexedDb('gestionale-pds-demo');
    this.oggi = opzioni.oggi ?? (() => oggiISO());
  }

  private leggiStato(): StatoDemo | null {
    const grezzo = this.archivio.leggi(CHIAVE_DB);
    if (!grezzo) return null;
    try {
      const s = JSON.parse(grezzo) as StatoDemo;
      return s.formato === FORMATO ? s : null;
    } catch {
      return null;
    }
  }

  private scriviStato(s: StatoDemo) {
    this.archivio.scrivi(CHIAVE_DB, JSON.stringify(s));
  }

  private async stato(): Promise<StatoDemo> {
    return this.leggiStato() ?? (await this.inizializza());
  }

  private async credenziale(password: string): Promise<Credenziale> {
    const salt = bytesCasuali(16);
    return { salt: base64DaBytes(salt), hash: await hashPassword(password, salt, ITERAZIONI) };
  }

  private async inizializza(): Promise<StatoDemo> {
    const { dati, registro } = creaDatiDimostrativi(this.oggi());
    const credenziali: Record<ID, Credenziale> = {};
    for (const u of dati.utenti) credenziali[u.id] = await this.credenziale(PASSWORD_DEMO);
    const s: StatoDemo = { formato: FORMATO, revisione: 1, dati, registro, credenziali };
    this.scriviStato(s);
    return s;
  }

  /** Ripristina i dati dimostrativi iniziali (cancella le modifiche fatte nel browser). */
  async ripristina(): Promise<void> {
    this.archivio.rimuovi(CHIAVE_DB);
    await this.file.svuota().catch(() => undefined);
    const s = await this.inizializza();
    s.revisione = Date.now();
    this.scriviStato(s);
  }

  async avvia(): Promise<StatoAvvio> {
    await this.stato();
    return { tipo: 'pronto' };
  }

  async primoAvvio(_dati: DatiPrimoAvvio): Promise<Sessione> {
    throw new ErroreApp('CONFIGURAZIONE', 'Il backend dimostrativo non richiede configurazione iniziale.');
  }

  private leggiSessione(): ID | null {
    return this.sessioneTemporanea.leggi(CHIAVE_SESSIONE) ?? this.archivio.leggi(CHIAVE_SESSIONE);
  }

  async ripristinaSessione(): Promise<Sessione | null> {
    const id = this.leggiSessione();
    if (!id) return null;
    const s = await this.stato();
    const utente = s.dati.utenti.find((u) => u.id === id);
    if (!utente || !utente.attivo) {
      await this.esci();
      return null;
    }
    this.utenteId = utente.id;
    return { utente };
  }

  async accedi(username: string, password: string, ricordami: boolean): Promise<Sessione> {
    const s = await this.stato();
    const utente = s.dati.utenti.find((u) => u.username === normalizzaUsername(username));
    const cred = utente ? s.credenziali[utente.id] : undefined;
    const hash = await hashPassword(password, bytesDaBase64(cred?.salt ?? 'AAAAAAAAAAAAAAAAAAAAAA=='), ITERAZIONI);
    if (!utente || !cred || !uguaglianzaCostante(hash, cred.hash)) {
      throw new ErroreApp('AUTENTICAZIONE', 'Nome utente o password non corretti.');
    }
    if (!utente.attivo) throw new ErroreApp('AUTENTICAZIONE', "Utente disattivato: rivolgersi all'amministratore.");
    this.utenteId = utente.id;
    (ricordami ? this.archivio : this.sessioneTemporanea).scrivi(CHIAVE_SESSIONE, utente.id);
    return { utente };
  }

  async esci(): Promise<void> {
    this.utenteId = null;
    this.archivio.rimuovi(CHIAVE_SESSIONE);
    this.sessioneTemporanea.rimuovi(CHIAVE_SESSIONE);
  }

  private richiediSessione(): ID {
    if (!this.utenteId) throw new ErroreApp('AUTENTICAZIONE', 'Sessione scaduta: accedere di nuovo.');
    return this.utenteId;
  }

  async cambiaPassword(passwordAttuale: string, nuovaPassword: string): Promise<void> {
    const id = this.richiediSessione();
    const s = await this.stato();
    const cred = s.credenziali[id];
    const hash = cred ? await hashPassword(passwordAttuale, bytesDaBase64(cred.salt), ITERAZIONI) : '';
    if (!cred || !uguaglianzaCostante(hash, cred.hash)) throw new ErroreApp('AUTENTICAZIONE', 'La password attuale non è corretta.');
    validaPassword(nuovaPassword);
    s.credenziali[id] = await this.credenziale(nuovaPassword);
    s.revisione++;
    this.scriviStato(s);
  }

  async caricaDati(): Promise<DatiCondivisi> {
    const s = await this.stato();
    this.revisioneCaricata = s.revisione;
    return s.dati;
  }

  async ciSonoAggiornamenti(): Promise<boolean> {
    const s = this.leggiStato();
    return s != null && s.revisione !== this.revisioneCaricata;
  }

  async esegui(comando: Comando): Promise<EsitoEsecuzione> {
    const utenteId = this.richiediSessione();
    const s = await this.stato();
    if (comando.tipo === 'allegato.crea' && comando.file && comando.file.dimensione > this.capacita.dimensioneMassimaFile) {
      throw new ErroreApp('VALIDAZIONE', 'Il file supera la dimensione massima consentita (5 MB) nella modalità dimostrativa.');
    }
    const esito = applicaComando(s.dati, comando, {
      utenteId,
      ora: adessoISO(),
      nuovoId: nuovoUuid,
      percorsoFile: (pdsId, allegatoId, nome) => `file/${pdsId}/${allegatoId}/${nome}`,
    });
    for (const effetto of esito.effetti) await this.applicaEffetto(s, effetto);
    s.dati = esito.dati;
    s.registro.push(...esito.voci);
    s.revisione++;
    this.scriviStato(s);
    this.revisioneCaricata = s.revisione;
    return { risultato: esito.risultato, dati: s.dati };
  }

  private async applicaEffetto(s: StatoDemo, effetto: Effetto) {
    switch (effetto.tipo) {
      case 'file.carica':
        await this.file.salva(effetto.path, effetto.file.contenuto);
        break;
      case 'file.elimina':
        await this.file.elimina(effetto.path).catch(() => undefined);
        break;
      case 'credenziali.imposta':
        s.credenziali[effetto.utente.id] = await this.credenziale(effetto.password);
        break;
      case 'credenziali.elimina':
        delete s.credenziali[effetto.utente.id];
        break;
      case 'credenziali.aggiorna':
        break;
    }
  }

  async caricaRegistro(filtro: FiltroRegistro): Promise<VoceRegistro[]> {
    const s = await this.stato();
    return filtraRegistro(s.registro, filtro);
  }

  async scaricaFile(allegato: Allegato): Promise<Blob> {
    if (!allegato.file_path) throw new ErroreApp('NON_TROVATO', "L'allegato non contiene un file.");
    const blob = await this.file.leggi(allegato.file_path);
    if (!blob) throw new ErroreApp('NON_TROVATO', 'File non disponibile in questo browser.');
    return blob;
  }
}
