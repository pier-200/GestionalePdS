import type { ConfigBackend } from '../../config';
import type { Comando } from '../../domain/comandi';
import { adessoISO } from '../../domain/date';
import { ErroreApp } from '../../domain/errori';
import { PERMESSI_TUTTI, datiVuoti, type Allegato, type DatiCondivisi, type ID, type VoceRegistro } from '../../domain/tipi';
import { titoloVoce } from '../../domain/registro';
import { errorePassword, erroreUsername, normalizzaUsername, validaPassword } from '../../domain/validazione';
import { applicaComando, type EsitoMotore } from '../../motore/motore';
import { archivioBrowser, type ArchivioTesto } from '../archivi';
import { bytesDaTesto, nuovoUuid, shaBlobGit, testoDaBytes } from '../crittografia';
import { filtraRegistro, intervalloRegistro } from '../registroLocale';
import type { Backend, DatiPrimoAvvio, EsitoEsecuzione, FiltroRegistro, Sessione, StatoAvvio } from '../tipi';
import { ApiGitHub, ConflittoRef, type FetchFn, type VoceAlberoGit } from './api';
import {
  ITERAZIONI_PREDEFINITE,
  aggiornaRuolo,
  cambiaPasswordPropria,
  creaKeyring,
  impostaCredenziali,
  rimuoviUtente,
  ruotaChiavi,
  sbloccaKeyring,
  validaKeyring,
  type ChiaviSessione,
  type Keyring,
} from './keyring';

type ConfigGitHub = Extract<ConfigBackend, { tipo: 'github' }>;

export const FORMATO_DATI = 1;
const CHIAVE_SESSIONE = 'gestionale-pds:github:sessione';
const FILE_KEYRING = 'keyring.json';
const DIMENSIONE_MASSIMA_FILE = 20 * 1024 * 1024;

const PERCORSI = {
  capitoli: 'db/capitoli.json',
  accordi: 'db/accordi.json',
  atti: 'db/atti.json',
  pds: 'db/pds.json',
  pagamenti: 'db/pagamenti.json',
  allegati: 'db/allegati.json',
  utenti: 'db/utenti.json',
} as const satisfies Record<keyof DatiCondivisi, string>;

const percorsoRegistro = (ts: string) => `registro/${ts.slice(0, 7)}.json`;

const README_DATI = `# Dati del Gestionale PdS

Questo repository **privato** è gestito automaticamente dall'applicazione Gestionale PdS.
Non modificare i file a mano: ogni salvataggio dell'applicazione crea un commit.

- \`db/*.json\`: capitoli di spesa, accordi quadro, atti di adesione, PdS, pagamenti, allegati, utenti (importi in centesimi di euro);
- \`registro/AAAA-MM.json\`: storico delle modifiche;
- \`file/\`: file allegati ai PdS.

La cronologia dei commit consente di recuperare qualsiasi versione precedente dei dati.
`;

interface SessioneSalvata {
  utenteId: ID;
  chiavi: ChiaviSessione;
}

export interface OpzioniGitHub {
  fetch?: FetchFn;
  archivio?: ArchivioTesto;
  archivioTemporaneo?: ArchivioTesto;
  iterazioni?: number;
  baseApi?: string;
  baseRaw?: string;
}

function serializza(elementi: unknown[]): string {
  return `${JSON.stringify({ formato: FORMATO_DATI, elementi }, null, 2)}\n`;
}

function interpreta<T>(testo: string, percorso: string): T[] {
  const json = JSON.parse(testo) as { formato?: number; elementi?: T[] };
  if ((json.formato ?? 1) > FORMATO_DATI) {
    throw new ErroreApp('CONFIGURAZIONE', `Il file ${percorso} è stato salvato da una versione più recente dell'applicazione: aggiornare l'applicazione.`);
  }
  return Array.isArray(json.elementi) ? json.elementi : [];
}

/**
 * Backend che conserva i dati in un repository GitHub privato.
 * Funziona interamente tramite domini GitHub (api.github.com, raw.githubusercontent.com,
 * github.io): adatto a reti che bloccano altri servizi.
 */
export class GitHubBackend implements Backend {
  readonly tipo = 'github' as const;
  readonly nome: string;
  readonly capacita = { permessiLatoServer: false, caricamentoFile: true, dimensioneMassimaFile: DIMENSIONE_MASSIMA_FILE };

  private readonly owner: string;
  private readonly repoDati: string;
  private readonly repoAccessi: string;
  private readonly ramo: string;
  private readonly fetchFn: FetchFn;
  private readonly archivio: ArchivioTesto;
  private readonly archivioTemporaneo: ArchivioTesto;
  private readonly iterazioni: number;
  private readonly baseApi: string;
  private readonly baseRaw: string;

  private api: ApiGitHub | null = null;
  private chiavi: ChiaviSessione | null = null;
  private utenteId: ID | null = null;
  private testa: { commit: string; albero: string } | null = null;
  private shaFile = new Map<string, string>();
  private readonly cacheTesti = new Map<string, string>();
  private dati: DatiCondivisi | null = null;
  private caricamento: Promise<DatiCondivisi> | null = null;
  private coda: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: ConfigGitHub,
    opzioni: OpzioniGitHub = {},
  ) {
    this.owner = config.owner;
    this.repoDati = config.repoDati;
    this.repoAccessi = config.repoAccessi;
    this.ramo = config.branch ?? 'main';
    this.nome = `Repository GitHub privato (${config.owner}/${config.repoDati})`;
    this.fetchFn = opzioni.fetch ?? ((input, init) => fetch(input, init));
    this.archivio = opzioni.archivio ?? archivioBrowser('local');
    this.archivioTemporaneo = opzioni.archivioTemporaneo ?? archivioBrowser('session');
    this.iterazioni = opzioni.iterazioni ?? ITERAZIONI_PREDEFINITE;
    this.baseApi = opzioni.baseApi ?? 'https://api.github.com';
    this.baseRaw = opzioni.baseRaw ?? 'https://raw.githubusercontent.com';
  }

  // -------------------------------------------------------------------------
  // Portachiavi
  // -------------------------------------------------------------------------

  /** Legge il portachiavi pubblico da più fonti GitHub e sceglie la revisione più recente. */
  private async leggiKeyringPubblico(): Promise<Keyring | null> {
    const pubblica = new ApiGitHub(null, this.fetchFn, this.baseApi);
    const fonti: Promise<unknown>[] = [
      pubblica.leggiContenuto(this.owner, this.repoAccessi, FILE_KEYRING, this.ramo).then((c) => (c ? JSON.parse(testoDaBytes(c.bytes)) : null)),
      this.fetchFn(`${this.baseRaw}/${this.owner}/${this.repoAccessi}/${this.ramo}/${FILE_KEYRING}?t=${Date.now()}`, { cache: 'no-store' }).then(async (r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    ];
    if (this.config.urlKeyringPages) {
      fonti.push(
        this.fetchFn(this.config.urlKeyringPages, { cache: 'no-store' }).then(async (r) => {
          if (r.status === 404) return null;
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
      );
    }
    const esiti = await Promise.allSettled(fonti);
    const validi: Keyring[] = [];
    let assenti = 0;
    for (const e of esiti) {
      if (e.status === 'fulfilled') {
        if (e.value == null) assenti++;
        else {
          try {
            validi.push(validaKeyring(e.value));
          } catch {
            /* fonte non valida: ignorata */
          }
        }
      }
    }
    if (validi.length) return validi.sort((a, b) => b.revisione - a.revisione)[0];
    if (assenti > 0) return null;
    throw new ErroreApp('RETE', 'Impossibile leggere il portachiavi degli accessi da GitHub: verificare la connessione (vedi «Verifica connessione»).');
  }

  private async leggiKeyringAutenticato(api: ApiGitHub): Promise<{ keyring: Keyring; sha: string } | null> {
    const c = await api.leggiContenuto(this.owner, this.repoAccessi, FILE_KEYRING, this.ramo);
    if (!c) return null;
    return { keyring: validaKeyring(JSON.parse(testoDaBytes(c.bytes))), sha: c.sha };
  }

  private async scriviKeyring(api: ApiGitHub, keyring: Keyring, messaggio: string, sha?: string) {
    await api.scriviContenuto(this.owner, this.repoAccessi, FILE_KEYRING, bytesDaTesto(`${JSON.stringify(keyring, null, 2)}\n`), messaggio, sha, this.ramo);
  }

  /** Applica una trasformazione al portachiavi con controllo di concorrenza (ripetuta in caso di conflitto). */
  private async aggiornaKeyring(trasforma: (k: Keyring) => Promise<Keyring | null>, messaggio: string, api = this.richiediApi()): Promise<void> {
    for (let tentativo = 0; tentativo < 4; tentativo++) {
      const attuale = await this.leggiKeyringAutenticato(api);
      if (!attuale) throw new ErroreApp('CONFIGURAZIONE', 'Portachiavi degli accessi non trovato.');
      const nuovo = await trasforma(attuale.keyring);
      if (!nuovo) return;
      try {
        await this.scriviKeyring(api, nuovo, messaggio, attuale.sha);
        return;
      } catch (e) {
        if (e instanceof ConflittoRef) continue;
        throw e;
      }
    }
    throw new ErroreApp('CONFLITTO', 'Il portachiavi è stato modificato contemporaneamente da un altro utente: riprovare.');
  }

  // -------------------------------------------------------------------------
  // Sessione
  // -------------------------------------------------------------------------

  private richiediApi(): ApiGitHub {
    if (!this.api) throw new ErroreApp('AUTENTICAZIONE', 'Sessione scaduta: accedere di nuovo.');
    return this.api;
  }

  private apriSessione(utenteId: ID, chiavi: ChiaviSessione, ricordami: boolean | null) {
    this.chiavi = chiavi;
    this.utenteId = utenteId;
    this.api = new ApiGitHub(chiavi.token, this.fetchFn, this.baseApi);
    const salvata: SessioneSalvata = { utenteId, chiavi };
    const valore = JSON.stringify(salvata);
    if (ricordami === null) {
      // aggiornamento: riscrive dove era già salvata
      if (this.archivio.leggi(CHIAVE_SESSIONE)) this.archivio.scrivi(CHIAVE_SESSIONE, valore);
      else this.archivioTemporaneo.scrivi(CHIAVE_SESSIONE, valore);
    } else {
      (ricordami ? this.archivio : this.archivioTemporaneo).scrivi(CHIAVE_SESSIONE, valore);
    }
  }

  async avvia(): Promise<StatoAvvio> {
    const keyring = await this.leggiKeyringPubblico();
    if (!keyring) {
      return {
        tipo: 'primo_avvio',
        messaggio: `Il portachiavi degli accessi non è ancora presente in ${this.owner}/${this.repoAccessi}: completare la configurazione iniziale inserendo il token di accesso e creando l'amministratore.`,
      };
    }
    return { tipo: 'pronto' };
  }

  async primoAvvio(d: DatiPrimoAvvio): Promise<Sessione> {
    const username = normalizzaUsername(d.username);
    const problema = erroreUsername(username) ?? errorePassword(d.password) ?? (d.nome.trim() ? null : 'Indicare nome e cognome.');
    if (problema) throw new ErroreApp('VALIDAZIONE', problema);
    const token = d.token?.trim();
    if (!token) throw new ErroreApp('VALIDAZIONE', 'Indicare il token di accesso GitHub.');
    const api = new ApiGitHub(token, this.fetchFn, this.baseApi);

    const repoDati = await api.leggiRepository(this.owner, this.repoDati);
    if (!repoDati) throw new ErroreApp('CONFIGURAZIONE', `Repository dei dati ${this.owner}/${this.repoDati} non trovato, oppure il token non vi ha accesso.`);
    if (!repoDati.private) throw new ErroreApp('CONFIGURAZIONE', `Il repository dei dati ${this.owner}/${this.repoDati} è pubblico: renderlo privato prima di continuare.`);
    const repoAccessi = await api.leggiRepository(this.owner, this.repoAccessi);
    if (!repoAccessi) throw new ErroreApp('CONFIGURAZIONE', `Repository degli accessi ${this.owner}/${this.repoAccessi} non trovato, oppure il token non vi ha accesso.`);
    if (repoAccessi.private) {
      throw new ErroreApp('CONFIGURAZIONE', `Il repository degli accessi ${this.owner}/${this.repoAccessi} deve essere pubblico: contiene solo il portachiavi cifrato, letto prima dell'accesso.`);
    }
    if (await this.leggiKeyringAutenticato(api)) {
      throw new ErroreApp('CONFIGURAZIONE', 'Il portachiavi è già presente: accedere con le credenziali esistenti.');
    }

    // Repository dei dati: inizializzazione se vuoto
    this.api = api;
    if (!(await api.leggiRef(this.owner, this.repoDati, this.ramo))) {
      await api.scriviContenuto(this.owner, this.repoDati, 'README.md', bytesDaTesto(README_DATI), 'Inizializzazione del repository dei dati', undefined, this.ramo);
    }
    const dati = await this.caricaDati(true);
    const ora = adessoISO();
    let admin = dati.utenti.find((u) => u.username === username);
    if (dati.utenti.length > 0 && (!admin || admin.ruolo !== 'admin' || !admin.attivo)) {
      throw new ErroreApp('CONFIGURAZIONE', "Nel repository dei dati sono già presenti utenti: per ripristinare l'accesso indicare il nome utente di un amministratore attivo.");
    }
    if (!admin) {
      admin = { id: nuovoUuid(), username, nome: d.nome.trim(), ruolo: 'admin', attivo: true, permessi: { ...PERMESSI_TUTTI }, created_at: ora, updated_at: ora };
      const voce: VoceRegistro = {
        id: nuovoUuid(),
        ts: ora,
        utente_id: admin.id,
        username,
        entita: 'utente',
        entita_id: admin.id,
        pds_id: null,
        azione: 'creazione',
        riferimento: username,
        modifiche: { username: { da: null, a: username }, ruolo: { da: null, a: 'admin' } },
      };
      const nuoviDati = { ...datiVuoti(), ...dati, utenti: [admin] };
      await this.salvaEsito({ dati: nuoviDati, voci: [voce], effetti: [], risultato: {} }, `${username}: configurazione iniziale`, true);
      this.dati = nuoviDati;
    }
    const { keyring, chiavi } = await creaKeyring(token, username, d.password, this.iterazioni);
    await this.scriviKeyring(api, keyring, 'Configurazione iniziale del portachiavi');
    this.apriSessione(admin.id, chiavi, false);
    return { utente: admin };
  }

  async ripristinaSessione(): Promise<Sessione | null> {
    const grezza = this.archivioTemporaneo.leggi(CHIAVE_SESSIONE) ?? this.archivio.leggi(CHIAVE_SESSIONE);
    if (!grezza) return null;
    try {
      const s = JSON.parse(grezza) as SessioneSalvata;
      this.chiavi = s.chiavi;
      this.utenteId = s.utenteId;
      this.api = new ApiGitHub(s.chiavi.token, this.fetchFn, this.baseApi);
      const dati = await this.caricaDati();
      const utente = dati.utenti.find((u) => u.id === s.utenteId);
      if (!utente || !utente.attivo) {
        await this.esci();
        return null;
      }
      return { utente };
    } catch (e) {
      if (e instanceof ErroreApp && e.codice === 'RETE') throw e;
      await this.esci();
      return null;
    }
  }

  async accedi(username: string, password: string, ricordami: boolean): Promise<Sessione> {
    const u = normalizzaUsername(username);
    const keyring = await this.leggiKeyringPubblico();
    if (!keyring) throw new ErroreApp('CONFIGURAZIONE', 'Portachiavi degli accessi non trovato: completare la configurazione iniziale.');
    const chiavi = await sbloccaKeyring(keyring, u, password);
    this.api = new ApiGitHub(chiavi.token, this.fetchFn, this.baseApi);
    this.chiavi = chiavi;
    let dati: DatiCondivisi;
    try {
      dati = await this.caricaDati(true);
    } catch (e) {
      this.api = null;
      this.chiavi = null;
      if (e instanceof ErroreApp && e.codice === 'AUTENTICAZIONE') {
        throw chiavi.ka
          ? new ErroreApp('TOKEN_SCADUTO', 'Il token di accesso a GitHub è scaduto o è stato revocato. Come amministratore puoi inserire un nuovo token per ripristinare l’accesso di tutti gli utenti.')
          : new ErroreApp('AUTENTICAZIONE', "Il token di accesso a GitHub è scaduto o è stato revocato: l'amministratore deve rinnovarlo accedendo al gestionale.");
      }
      throw e;
    }
    const utente = dati.utenti.find((x) => x.username === u);
    if (!utente) {
      this.api = null;
      this.chiavi = null;
      throw new ErroreApp('AUTENTICAZIONE', "Utente non abilitato: rivolgersi all'amministratore.");
    }
    if (!utente.attivo) {
      this.api = null;
      this.chiavi = null;
      throw new ErroreApp('AUTENTICAZIONE', "Utente disattivato: rivolgersi all'amministratore.");
    }
    this.apriSessione(utente.id, chiavi, ricordami);
    return { utente };
  }

  async esci(): Promise<void> {
    this.api = null;
    this.chiavi = null;
    this.utenteId = null;
    this.dati = null;
    this.testa = null;
    this.shaFile = new Map();
    this.archivio.rimuovi(CHIAVE_SESSIONE);
    this.archivioTemporaneo.rimuovi(CHIAVE_SESSIONE);
  }

  async cambiaPassword(passwordAttuale: string, nuovaPassword: string): Promise<void> {
    const api = this.richiediApi();
    const chiavi = this.chiavi!;
    validaPassword(nuovaPassword);
    const attuale = await this.leggiKeyringAutenticato(api);
    if (!attuale) throw new ErroreApp('CONFIGURAZIONE', 'Portachiavi degli accessi non trovato.');
    try {
      await sbloccaKeyring(attuale.keyring, chiavi.username, passwordAttuale);
    } catch {
      throw new ErroreApp('AUTENTICAZIONE', 'La password attuale non è corretta.');
    }
    await this.aggiornaKeyring((k) => cambiaPasswordPropria(k, chiavi, nuovaPassword), `${chiavi.username}: cambio password`);
  }

  /**
   * Rinnovo del token scaduto dalla pagina di accesso: le credenziali dell'amministratore
   * sbloccano le chiavi amministrative anche se il token precedente non funziona più.
   */
  async rinnovaTokenEAccedi(username: string, password: string, nuovoToken: string, ricordami: boolean): Promise<Sessione> {
    const keyring = await this.leggiKeyringPubblico();
    if (!keyring) throw new ErroreApp('CONFIGURAZIONE', 'Portachiavi degli accessi non trovato.');
    const chiavi = await sbloccaKeyring(keyring, normalizzaUsername(username), password);
    if (!chiavi.ka) throw new ErroreApp('PERMESSO_NEGATO', "Solo un amministratore può rinnovare il token.");
    this.chiavi = chiavi;
    try {
      await this.sostituisciToken(chiavi, nuovoToken);
    } finally {
      this.chiavi = null;
      this.api = null;
    }
    return this.accedi(username, password, ricordami);
  }

  /** Sostituisce il token GitHub e rigenera le chiavi di accesso (solo amministratori). */
  async ruotaToken(nuovoToken: string): Promise<void> {
    const chiavi = this.chiavi;
    if (!chiavi?.ka) throw new ErroreApp('PERMESSO_NEGATO', "Operazione riservata all'amministratore.");
    const nuove = await this.sostituisciToken(chiavi, nuovoToken);
    if (nuove && this.utenteId) this.apriSessione(this.utenteId, nuove, null);
  }

  private async sostituisciToken(chiavi: ChiaviSessione, nuovoToken: string): Promise<ChiaviSessione | null> {
    const token = nuovoToken.trim();
    if (token.length < 20) throw new ErroreApp('VALIDAZIONE', 'Il token indicato non è valido.');
    const nuovaApi = new ApiGitHub(token, this.fetchFn, this.baseApi);
    // verifica che il nuovo token possa leggere e scrivere nel repository dei dati
    const testa = await nuovaApi.leggiRef(this.owner, this.repoDati, this.ramo);
    if (!testa) throw new ErroreApp('CONFIGURAZIONE', 'Con il nuovo token non è possibile leggere il repository dei dati.');
    await nuovaApi.creaBlob(this.owner, this.repoDati, bytesDaTesto('verifica token'));
    let nuoveChiavi: ChiaviSessione | null = null;
    await this.aggiornaKeyring(
      async (k) => {
        const r = await ruotaChiavi(k, chiavi, token);
        nuoveChiavi = r.chiavi;
        return r.keyring;
      },
      `${chiavi.username}: sostituzione del token e rigenerazione delle chiavi`,
      nuovaApi,
    );
    return nuoveChiavi;
  }

  // -------------------------------------------------------------------------
  // Dati
  // -------------------------------------------------------------------------

  private async leggiTesto(percorso: string, mappa = this.shaFile): Promise<string | null> {
    const sha = mappa.get(percorso);
    if (!sha) return null;
    const inCache = this.cacheTesti.get(sha);
    if (inCache != null) return inCache;
    const testo = testoDaBytes(await this.richiediApi().leggiBlob(this.owner, this.repoDati, sha));
    this.cacheTesti.set(sha, testo);
    return testo;
  }

  async caricaDati(forza = false): Promise<DatiCondivisi> {
    if (this.caricamento) return this.caricamento;
    this.caricamento = (async () => {
      const api = this.richiediApi();
      const commit = await api.leggiRef(this.owner, this.repoDati, this.ramo);
      if (!commit) {
        throw new ErroreApp('CONFIGURAZIONE', `Il repository dei dati ${this.owner}/${this.repoDati} è vuoto o il ramo "${this.ramo}" non esiste.`);
      }
      if (!forza && this.dati && this.testa?.commit === commit) return this.dati;
      const { albero } = await api.leggiCommit(this.owner, this.repoDati, commit);
      const elementi = await api.leggiAlbero(this.owner, this.repoDati, albero);
      const mappa = new Map(elementi.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
      const voci = await Promise.all(
        (Object.entries(PERCORSI) as [keyof DatiCondivisi, string][]).map(async ([chiave, percorso]) => {
          const testo = await this.leggiTesto(percorso, mappa);
          return [chiave, testo ? interpreta(testo, percorso) : []] as const;
        }),
      );
      const dati = Object.fromEntries(voci) as unknown as DatiCondivisi;
      this.shaFile = mappa;
      this.testa = { commit, albero };
      this.dati = dati;
      return dati;
    })();
    try {
      return await this.caricamento;
    } finally {
      this.caricamento = null;
    }
  }

  async ciSonoAggiornamenti(): Promise<boolean> {
    const api = this.richiediApi();
    const commit = await api.leggiRef(this.owner, this.repoDati, this.ramo);
    return commit != null && commit !== this.testa?.commit;
  }

  /** Scrive in un unico commit i file modificati, il registro e gli allegati. */
  private async salvaEsito(esito: EsitoMotore, messaggio: string, forzaTutti = false): Promise<void> {
    const api = this.richiediApi();
    if (!this.testa) await this.caricaDati(true);
    const precedenti = this.dati ?? datiVuoti();
    const voci: (VoceAlberoGit & { testo?: string })[] = [];
    for (const [chiave, percorso] of Object.entries(PERCORSI) as [keyof DatiCondivisi, string][]) {
      if (forzaTutti || esito.dati[chiave] !== precedenti[chiave]) {
        const testo = serializza(esito.dati[chiave]);
        voci.push({ path: percorso, mode: '100644', type: 'blob', content: testo, testo });
      }
    }
    const perMese = new Map<string, VoceRegistro[]>();
    for (const v of esito.voci) {
      const p = percorsoRegistro(v.ts);
      perMese.set(p, [...(perMese.get(p) ?? []), v]);
    }
    for (const [percorso, nuove] of perMese) {
      const esistente = await this.leggiTesto(percorso);
      const testo = serializza([...(esistente ? interpreta<VoceRegistro>(esistente, percorso) : []), ...nuove]);
      voci.push({ path: percorso, mode: '100644', type: 'blob', content: testo, testo });
    }
    for (const effetto of esito.effetti) {
      if (effetto.tipo === 'file.carica') {
        const bytes = new Uint8Array(await effetto.file.contenuto.arrayBuffer());
        const sha = await api.creaBlob(this.owner, this.repoDati, bytes);
        voci.push({ path: effetto.path, mode: '100644', type: 'blob', sha });
      } else if (effetto.tipo === 'file.elimina' && this.shaFile.has(effetto.path)) {
        voci.push({ path: effetto.path, mode: '100644', type: 'blob', sha: null });
      }
    }
    if (voci.length === 0) return;
    if (!forzaTutti && !this.shaFile.has('README.md')) {
      voci.push({ path: 'README.md', mode: '100644', type: 'blob', content: README_DATI, testo: README_DATI });
    }
    const alberoPrecedente = this.testa!.albero;
    const commitPrecedente = this.testa!.commit;
    const albero = await api.creaAlbero(this.owner, this.repoDati, alberoPrecedente, voci.map(({ testo: _t, ...v }) => v));
    const commit = await api.creaCommit(this.owner, this.repoDati, messaggio, albero, [commitPrecedente]);
    await api.aggiornaRef(this.owner, this.repoDati, this.ramo, commit);
    this.testa = { commit, albero };
    for (const v of voci) {
      if (v.testo != null) {
        const sha = await shaBlobGit(bytesDaTesto(v.testo));
        this.shaFile.set(v.path, sha);
        this.cacheTesti.set(sha, v.testo);
      } else if (v.sha === null) {
        this.shaFile.delete(v.path);
      } else if (v.sha) {
        this.shaFile.set(v.path, v.sha);
      }
    }
  }

  private messaggioCommit(esito: EsitoMotore): string {
    const autore = this.chiavi?.username ?? 'utente';
    if (esito.voci.length === 0) return `${autore}: aggiornamento dati`;
    const primo = titoloVoce(esito.voci[0]);
    return esito.voci.length > 1 ? `${autore}: ${primo} (+${esito.voci.length - 1})` : `${autore}: ${primo}`;
  }

  async esegui(comando: Comando): Promise<EsitoEsecuzione> {
    // i comandi dello stesso browser sono eseguiti uno alla volta
    const esecuzione = this.coda.then(() => this.eseguiOra(comando));
    this.coda = esecuzione.catch(() => undefined);
    return esecuzione;
  }

  private async eseguiOra(comando: Comando): Promise<EsitoEsecuzione> {
    this.richiediApi();
    if (!this.chiavi || !this.utenteId) throw new ErroreApp('AUTENTICAZIONE', 'Sessione scaduta: accedere di nuovo.');
    if (comando.tipo === 'allegato.crea' && comando.file && comando.file.dimensione > DIMENSIONE_MASSIMA_FILE) {
      throw new ErroreApp('VALIDAZIONE', 'Il file supera la dimensione massima consentita (20 MB).');
    }
    for (let tentativo = 0; tentativo < 5; tentativo++) {
      if (tentativo > 0 || !this.dati || !this.testa) await this.caricaDati(true);
      const esito = applicaComando(this.dati!, comando, {
        utenteId: this.utenteId!,
        ora: adessoISO(),
        nuovoId: nuovoUuid,
        percorsoFile: (pdsId, allegatoId, nome) => `file/${pdsId}/${allegatoId}/${nome.replace(/[\\/:*?"<>|#%]+/g, '_').slice(-120)}`,
      });
      try {
        await this.salvaEsito(esito, this.messaggioCommit(esito));
      } catch (e) {
        if (e instanceof ConflittoRef) continue;
        throw e;
      }
      this.dati = esito.dati;
      await this.applicaCredenziali(esito);
      return { risultato: esito.risultato, dati: esito.dati };
    }
    throw new ErroreApp('CONFLITTO', 'Molti salvataggi contemporanei da parte di altri utenti: ricaricare e riprovare.');
  }

  private async applicaCredenziali(esito: EsitoMotore) {
    const chiavi = this.chiavi!;
    try {
      for (const effetto of esito.effetti) {
        if (effetto.tipo === 'credenziali.imposta') {
          const { utente, password } = effetto;
          await this.aggiornaKeyring((k) => impostaCredenziali(k, chiavi, utente.username, password, utente.ruolo === 'admin'), `${chiavi.username}: credenziali di ${utente.username}`);
        } else if (effetto.tipo === 'credenziali.aggiorna') {
          const { utente } = effetto;
          if (!utente.attivo) {
            await this.aggiornaKeyring((k) => rimuoviUtente(k, utente.username), `${chiavi.username}: disattivazione di ${utente.username}`);
          } else {
            await this.aggiornaKeyring((k) => aggiornaRuolo(k, chiavi, utente.username, utente.ruolo === 'admin'), `${chiavi.username}: ruolo di ${utente.username}`);
          }
        } else if (effetto.tipo === 'credenziali.elimina') {
          const { utente } = effetto;
          await this.aggiornaKeyring((k) => rimuoviUtente(k, utente.username), `${chiavi.username}: eliminazione di ${utente.username}`);
        }
      }
    } catch (e) {
      throw new ErroreApp(
        'VINCOLO',
        `I dati dell'utente sono stati salvati, ma l'aggiornamento delle credenziali non è riuscito (${e instanceof Error ? e.message : 'errore'}). Ripetere l'operazione, ad esempio reimpostando la password.`,
      );
    }
  }

  async caricaRegistro(filtro: FiltroRegistro): Promise<VoceRegistro[]> {
    if (!this.testa) await this.caricaDati();
    const { da, a } = intervalloRegistro(filtro);
    const mesi = [...this.shaFile.keys()]
      .filter((p) => /^registro\/\d{4}-\d{2}\.json$/.test(p))
      .map((p) => p.slice(9, 16))
      .filter((m) => (!da || m >= da.slice(0, 7)) && (!a || m <= a.slice(0, 7)))
      .sort()
      .reverse();
    const raccolte: VoceRegistro[] = [];
    for (let i = 0; i < mesi.length; i += 6) {
      const blocco = await Promise.all(mesi.slice(i, i + 6).map(async (m) => interpreta<VoceRegistro>((await this.leggiTesto(`registro/${m}.json`)) ?? '{}', m)));
      for (const voci of blocco) raccolte.push(...voci);
      if (filtro.limite && filtraRegistro(raccolte, filtro).length >= filtro.limite) break;
    }
    return filtraRegistro(raccolte, filtro);
  }

  async scaricaFile(allegato: Allegato): Promise<Blob> {
    if (!allegato.file_path) throw new ErroreApp('NON_TROVATO', "L'allegato non contiene un file.");
    if (!this.testa) await this.caricaDati();
    let sha = this.shaFile.get(allegato.file_path);
    if (!sha) {
      await this.caricaDati(true);
      sha = this.shaFile.get(allegato.file_path);
    }
    if (!sha) throw new ErroreApp('NON_TROVATO', 'File non trovato nel repository dei dati.');
    const bytes = await this.richiediApi().leggiBlob(this.owner, this.repoDati, sha);
    return new Blob([bytes], { type: allegato.file_tipo || 'application/octet-stream' });
  }
}
