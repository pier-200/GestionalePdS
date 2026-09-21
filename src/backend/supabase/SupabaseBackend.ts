import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import type { ConfigBackend } from '../../config';
import { numeroPds } from '../../domain/calcoli';
import type { Comando, DatiAccordo, DatiAtto, DatiPagamento } from '../../domain/comandi';
import { adessoISO } from '../../domain/date';
import { ErroreApp } from '../../domain/errori';
import { centesimiDaEuro, centesimiDaEuroNullable, euroDaCentesimiNullable } from '../../domain/importi';
import { CAMPI_DATI_PDS, normalizzaPermessi } from '../../domain/permessi';
import { valoriUguali } from '../../domain/registro';
import type { AccordoQuadro, Allegato, AttoAdesione, Capitolo, DatiCondivisi, EntitaRegistro, ID, Pagamento, Pds, Utente, VoceRegistro } from '../../domain/tipi';
import { normalizzaUsername, validaPassword } from '../../domain/validazione';
import { applicaComando, type EsitoMotore } from '../../motore/motore';
import { archivioBrowser, type ArchivioTesto } from '../archivi';
import { nuovoUuid } from '../crittografia';
import { intervalloRegistro } from '../registroLocale';
import type { Backend, DatiPrimoAvvio, EsitoEsecuzione, FiltroRegistro, Sessione, StatoAvvio } from '../tipi';

type ConfigSupabase = Extract<ConfigBackend, { tipo: 'supabase' }>;
type Riga = Record<string, unknown>;

const BUCKET = 'allegati';
const CHIAVE_RICORDA = 'gestionale-pds:supabase:ricordami';
const DIMENSIONE_MASSIMA_FILE = 20 * 1024 * 1024;
const CAMPI_IMPORTO: Partial<Record<EntitaRegistro, string[]>> = {
  capitolo: ['finanziato'],
  accordo: ['importo'],
  atto: ['valore'],
  pds: ['importo_inviato', 'valore_stipula', 'totale_pagato_saldo'],
  pagamento: ['importo'],
};

// ---------------------------------------------------------------------------
// Conversioni tra righe del database (importi in euro) e modello di dominio (centesimi)
// ---------------------------------------------------------------------------

const cent = (v: unknown) => centesimiDaEuroNullable(v as number | string | null);
const euro = (v: number | null | undefined) => euroDaCentesimiNullable(v);

function aCapitolo(r: Riga): Capitolo {
  return { ...(r as unknown as Capitolo), esercizio: Number(r.esercizio), finanziato: centesimiDaEuro(Number(r.finanziato)) };
}

function aAccordo(r: Riga): AccordoQuadro {
  return {
    ...(r as unknown as AccordoQuadro),
    importo: centesimiDaEuro(Number(r.importo)),
    durata_giorni: r.durata_giorni == null ? null : Number(r.durata_giorni),
  };
}

function aAtto(r: Riga): AttoAdesione {
  return {
    ...(r as unknown as AttoAdesione),
    valore: centesimiDaEuro(Number(r.valore)),
    durata_giorni: Number(r.durata_giorni),
  };
}

function aPds(r: Riga): Pds {
  return {
    ...(r as unknown as Pds),
    importo_inviato: cent(r.importo_inviato),
    valore_stipula: cent(r.valore_stipula),
    totale_pagato_saldo: cent(r.totale_pagato_saldo),
    durata: r.durata == null ? null : Number(r.durata),
  };
}

function aPagamento(r: Riga): Pagamento {
  return { ...(r as unknown as Pagamento), importo: centesimiDaEuro(Number(r.importo)) };
}

function aAllegato(r: Riga): Allegato {
  return { ...(r as unknown as Allegato), file_dimensione: r.file_dimensione == null ? null : Number(r.file_dimensione) };
}

function aUtente(r: Riga): Utente {
  return {
    id: String(r.id),
    username: String(r.username),
    nome: String(r.nome ?? ''),
    ruolo: r.ruolo === 'admin' ? 'admin' : 'utente',
    attivo: Boolean(r.attivo),
    permessi: normalizzaPermessi(r.permessi as Utente['permessi']),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

function aVoce(r: Riga): VoceRegistro {
  const entita = r.entita as EntitaRegistro;
  const importi = CAMPI_IMPORTO[entita] ?? [];
  const modifiche = (r.modifiche ?? null) as VoceRegistro['modifiche'];
  if (modifiche) {
    for (const campo of importi) {
      const m = modifiche[campo];
      if (m) modifiche[campo] = { da: cent(m.da), a: cent(m.a) };
    }
  }
  return {
    id: String(r.id),
    ts: new Date(String(r.ts)).toISOString(),
    utente_id: (r.utente_id as string) ?? null,
    username: (r.username as string) ?? null,
    entita,
    entita_id: (r.entita_id as string) ?? null,
    pds_id: (r.pds_id as string) ?? null,
    azione: r.azione as VoceRegistro['azione'],
    riferimento: (r.riferimento as string) ?? null,
    modifiche,
  };
}

/** Valore da scrivere nel database per un campo del dominio. */
function valoreDb(entita: 'capitolo' | 'accordo' | 'atto' | 'pds' | 'pagamento', campo: string, valore: unknown): unknown {
  return (CAMPI_IMPORTO[entita] ?? []).includes(campo) ? euro(valore as number | null) : valore;
}

function traduciErrore(e: PostgrestError | { message: string; code?: string } | null | undefined, contesto?: string): ErroreApp {
  const codice = e?.code ?? '';
  const messaggio = e?.message ?? 'errore sconosciuto';
  if (/row-level security/i.test(messaggio) || (codice === '42501' && /permission denied/i.test(messaggio))) {
    return new ErroreApp('PERMESSO_NEGATO', 'Non hai i permessi per questa operazione.');
  }
  if (codice === '42501') return new ErroreApp('PERMESSO_NEGATO', messaggio);
  if (codice === '23505') return new ErroreApp('DUPLICATO', contesto ? `${contesto}: elemento già esistente.` : 'Elemento già esistente.');
  if (codice === '23503') return new ErroreApp('VINCOLO', 'Operazione non consentita: esistono elementi collegati.');
  if (codice === '23514' || codice === '22P02' || codice === '22003') return new ErroreApp('VALIDAZIONE', `Dati non validi (${messaggio}).`);
  if (codice === 'P0001') return new ErroreApp('VINCOLO', messaggio);
  if (codice === 'PGRST301' || codice === 'PGRST303' || /JWT/i.test(messaggio)) {
    return new ErroreApp('AUTENTICAZIONE', 'Sessione scaduta: accedere di nuovo.');
  }
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(messaggio)) {
    return new ErroreApp('RETE', 'Impossibile contattare Supabase: verificare la connessione o eventuali blocchi della rete.');
  }
  return new ErroreApp('INTERNO', contesto ? `${contesto}: ${messaggio}` : messaggio);
}

function nomeFileSicuro(nome: string): string {
  return nome.normalize('NFKD').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(-120) || 'file';
}

/**
 * Backend Supabase: PostgreSQL con Row Level Security, autenticazione e archivio file.
 * I permessi sono applicati dal database; l'app ripete gli stessi controlli per
 * mostrare messaggi chiari prima di inviare le modifiche.
 */
export class SupabaseBackend implements Backend {
  readonly tipo = 'supabase' as const;
  readonly nome: string;
  readonly capacita = { permessiLatoServer: true, caricamentoFile: true, dimensioneMassimaFile: DIMENSIONE_MASSIMA_FILE };

  private readonly client: SupabaseClient;
  private readonly dominio: string;
  private readonly archivio: ArchivioTesto;
  private utenteId: ID | null = null;
  private dati: DatiCondivisi | null = null;
  private ultimaModifica: string | null = null;

  constructor(
    config: ConfigSupabase,
    opzioni: { fetch?: typeof fetch; archivio?: ArchivioTesto; archivioTemporaneo?: ArchivioTesto } = {},
  ) {
    this.dominio = config.dominioEmail ?? 'pds.local';
    this.nome = `Supabase (${new URL(config.url).hostname})`;
    this.archivio = opzioni.archivio ?? archivioBrowser('local');
    const temporaneo = opzioni.archivioTemporaneo ?? archivioBrowser('session');
    const archivio = this.archivio;
    // la sessione resta nel browser solo se l'utente ha scelto "Resta connesso"
    const memoria = {
      getItem: (k: string) => (archivio.leggi(CHIAVE_RICORDA) === '1' ? archivio.leggi(k) : temporaneo.leggi(k)),
      setItem: (k: string, v: string) => (archivio.leggi(CHIAVE_RICORDA) === '1' ? archivio.scrivi(k, v) : temporaneo.scrivi(k, v)),
      removeItem: (k: string) => {
        archivio.rimuovi(k);
        temporaneo.rimuovi(k);
      },
    };
    this.client = createClient(config.url, config.chiavePubblica, {
      auth: { storage: memoria, storageKey: 'gestionale-pds-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: opzioni.fetch ? { fetch: opzioni.fetch } : undefined,
    });
  }

  private email(username: string): string {
    const u = username.trim().toLowerCase();
    return u.includes('@') ? u : `${normalizzaUsername(u)}@${this.dominio}`;
  }

  // -------------------------------------------------------------------------
  // Avvio e sessione
  // -------------------------------------------------------------------------

  async avvia(): Promise<StatoAvvio> {
    const { data, error } = await this.client.rpc('stato_installazione');
    if (error) {
      if (/Could not find the function|PGRST202/i.test(`${error.code} ${error.message}`)) {
        throw new ErroreApp('CONFIGURAZIONE', 'Il database Supabase non è ancora configurato: eseguire lo script SQL del Gestionale PdS (vedi documentazione).');
      }
      throw traduciErrore(error);
    }
    if (!(data as { amministratori?: boolean })?.amministratori) {
      return {
        tipo: 'primo_avvio',
        messaggio: 'Nessun amministratore configurato: accedi con l’utente creato nella console di Supabase per diventare amministratore.',
      };
    }
    return { tipo: 'pronto' };
  }

  private async profilo(id: ID): Promise<Utente | null> {
    const { data, error } = await this.client.from('profili').select('*').eq('id', id).maybeSingle();
    if (error) throw traduciErrore(error);
    return data ? aUtente(data) : null;
  }

  private async entra(username: string, password: string): Promise<ID> {
    const { data, error } = await this.client.auth.signInWithPassword({ email: this.email(username), password });
    if (error || !data.user) {
      if (error && /invalid login|invalid credentials|email not confirmed/i.test(error.message)) {
        throw new ErroreApp('AUTENTICAZIONE', 'Nome utente o password non corretti.');
      }
      if (error && /fetch|network/i.test(error.message)) throw traduciErrore(error);
      throw new ErroreApp('AUTENTICAZIONE', error?.message ?? 'Accesso non riuscito.');
    }
    return data.user.id;
  }

  async primoAvvio(d: DatiPrimoAvvio): Promise<Sessione> {
    this.archivio.scrivi(CHIAVE_RICORDA, '0');
    const id = await this.entra(d.username, d.password);
    const { error } = await this.client.rpc('inizializza_amministratore', { p_nome: d.nome.trim() });
    if (error) {
      await this.client.auth.signOut({ scope: 'local' });
      throw traduciErrore(error);
    }
    const utente = await this.profilo(id);
    if (!utente) throw new ErroreApp('INTERNO', 'Profilo amministratore non creato.');
    this.utenteId = id;
    return { utente };
  }

  async ripristinaSessione(): Promise<Sessione | null> {
    const { data } = await this.client.auth.getSession();
    const id = data.session?.user.id;
    if (!id) return null;
    const utente = await this.profilo(id).catch((e) => {
      if (e instanceof ErroreApp && e.codice === 'RETE') throw e;
      return null;
    });
    if (!utente || !utente.attivo) {
      await this.esci();
      return null;
    }
    this.utenteId = id;
    return { utente };
  }

  async accedi(username: string, password: string, ricordami: boolean): Promise<Sessione> {
    this.archivio.scrivi(CHIAVE_RICORDA, ricordami ? '1' : '0');
    const id = await this.entra(username, password);
    const utente = await this.profilo(id);
    if (!utente || !utente.attivo) {
      await this.client.auth.signOut({ scope: 'local' });
      throw new ErroreApp('AUTENTICAZIONE', utente ? "Utente disattivato: rivolgersi all'amministratore." : "Utente non abilitato: rivolgersi all'amministratore.");
    }
    this.utenteId = id;
    return { utente };
  }

  async esci(): Promise<void> {
    this.utenteId = null;
    this.dati = null;
    await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  async cambiaPassword(passwordAttuale: string, nuovaPassword: string): Promise<void> {
    validaPassword(nuovaPassword);
    const { data } = await this.client.auth.getUser();
    const email = data.user?.email;
    if (!email) throw new ErroreApp('AUTENTICAZIONE', 'Sessione scaduta: accedere di nuovo.');
    const verifica = await this.client.auth.signInWithPassword({ email, password: passwordAttuale });
    if (verifica.error) throw new ErroreApp('AUTENTICAZIONE', 'La password attuale non è corretta.');
    const { error } = await this.client.auth.updateUser({ password: nuovaPassword });
    if (error) throw new ErroreApp('VALIDAZIONE', `Cambio password non riuscito: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // Lettura
  // -------------------------------------------------------------------------

  private async tutte(tabella: string): Promise<Riga[]> {
    const PASSO = 1000;
    const righe: Riga[] = [];
    for (let da = 0; ; da += PASSO) {
      const { data, error } = await this.client.from(tabella).select('*').order('created_at', { ascending: true }).order('id', { ascending: true }).range(da, da + PASSO - 1);
      if (error) throw traduciErrore(error, `Lettura di ${tabella}`);
      righe.push(...(data as Riga[]));
      if (!data || data.length < PASSO) return righe;
    }
  }

  async caricaDati(): Promise<DatiCondivisi> {
    const [capitoli, accordi, atti, pds, pagamenti, allegati, utenti, ultima] = await Promise.all([
      this.tutte('capitoli'),
      this.tutte('accordi'),
      this.tutte('atti'),
      this.tutte('pds'),
      this.tutte('pagamenti'),
      this.tutte('allegati'),
      this.tutte('profili'),
      this.client.rpc('ultimo_aggiornamento'),
    ]);
    this.ultimaModifica = (ultima.data as string | null) ?? null;
    this.dati = {
      capitoli: capitoli.map(aCapitolo),
      accordi: accordi.map(aAccordo),
      atti: atti.map(aAtto),
      pds: pds.map(aPds),
      pagamenti: pagamenti.map(aPagamento),
      allegati: allegati.map(aAllegato),
      utenti: utenti.map(aUtente),
    };
    return this.dati;
  }

  async ciSonoAggiornamenti(): Promise<boolean> {
    const { data, error } = await this.client.rpc('ultimo_aggiornamento');
    if (error) throw traduciErrore(error);
    return ((data as string | null) ?? null) !== this.ultimaModifica;
  }

  async caricaRegistro(filtro: FiltroRegistro): Promise<VoceRegistro[]> {
    let q = this.client.from('registro').select('*');
    if (filtro.pdsId) q = q.eq('pds_id', filtro.pdsId);
    if (filtro.entita) q = q.eq('entita', filtro.entita);
    if (filtro.utenteId) q = q.eq('utente_id', filtro.utenteId);
    const { da, a } = intervalloRegistro(filtro);
    if (da) q = q.gte('ts', da);
    if (a) q = q.lt('ts', a);
    const { data, error } = await q.order('ts', { ascending: false }).order('id', { ascending: false }).limit(filtro.limite ?? 1000);
    if (error) throw traduciErrore(error, 'Lettura del registro');
    return (data as Riga[]).map(aVoce);
  }

  async scaricaFile(allegato: Allegato): Promise<Blob> {
    if (!allegato.file_path) throw new ErroreApp('NON_TROVATO', "L'allegato non contiene un file.");
    const { data, error } = await this.client.storage.from(BUCKET).download(allegato.file_path);
    if (error || !data) throw new ErroreApp('NON_TROVATO', `File non disponibile: ${error?.message ?? 'errore sconosciuto'}`);
    return data;
  }

  // -------------------------------------------------------------------------
  // Scrittura
  // -------------------------------------------------------------------------

  /** Aggiornamento con controllo di concorrenza sui valori visti dall'utente. */
  private async aggiorna(
    tabella: 'capitoli' | 'accordi' | 'atti' | 'pds' | 'pagamenti',
    entita: 'capitolo' | 'accordo' | 'atto' | 'pds' | 'pagamento',
    id: ID,
    valori: Riga,
    originale: Riga,
  ) {
    if (Object.keys(valori).length === 0) return;
    const corpo = Object.fromEntries(Object.entries(valori).map(([k, v]) => [k, valoreDb(entita, k, v)]));
    let q = this.client.from(tabella).update(corpo).eq('id', id);
    for (const [campo, visto] of Object.entries(originale)) {
      const v = valoreDb(entita, campo, visto);
      q = v == null ? q.is(campo, null) : q.eq(campo, v as string | number | boolean);
    }
    const { data, error } = await q.select('id');
    if (error) throw traduciErrore(error);
    if (!data || data.length === 0) {
      const { data: esiste } = await this.client.from(tabella).select('id').eq('id', id).maybeSingle();
      if (!esiste) throw new ErroreApp('NON_TROVATO', 'Elemento non trovato (potrebbe essere stato eliminato).');
      throw new ErroreApp('CONFLITTO', 'Nel frattempo un altro utente ha modificato questi dati, oppure non hai i permessi necessari. Ricarica e riprova.');
    }
  }

  private async elimina(tabella: string, id: ID) {
    const { data, error } = await this.client.from(tabella).delete().eq('id', id).select('id');
    if (error) throw traduciErrore(error);
    if (!data || data.length === 0) throw new ErroreApp('PERMESSO_NEGATO', 'Eliminazione non eseguita: elemento non trovato o permessi insufficienti.');
  }

  private async inserisci(tabella: string, riga: Riga, contesto: string) {
    const { error } = await this.client.from(tabella).insert(riga);
    if (error) throw traduciErrore(error, contesto);
  }

  private async funzioneUtenti(corpo: Riga): Promise<ID> {
    const { data, error } = await this.client.functions.invoke('gestione-utenti', { body: corpo });
    if (error) {
      let messaggio = error.message;
      const contesto = (error as { context?: Response }).context;
      if (contesto && typeof contesto.json === 'function') {
        try {
          messaggio = ((await contesto.json()) as { errore?: string }).errore ?? messaggio;
        } catch {
          /* risposta non JSON */
        }
      } else if (/Failed to send|fetch/i.test(messaggio)) {
        messaggio = "Funzione 'gestione-utenti' non raggiungibile: verificare che sia pubblicata su Supabase (vedi documentazione).";
      }
      throw new ErroreApp('VINCOLO', messaggio);
    }
    return (data as { id: ID }).id;
  }

  async esegui(comando: Comando): Promise<EsitoEsecuzione> {
    if (!this.utenteId) throw new ErroreApp('AUTENTICAZIONE', 'Sessione scaduta: accedere di nuovo.');
    if (comando.tipo === 'allegato.crea' && comando.file && comando.file.dimensione > DIMENSIONE_MASSIMA_FILE) {
      throw new ErroreApp('VALIDAZIONE', 'Il file supera la dimensione massima consentita (20 MB).');
    }
    const dati = this.dati ?? (await this.caricaDati());
    // Validazione, permessi e normalizzazione con le stesse regole del database
    const esito = applicaComando(dati, comando, {
      utenteId: this.utenteId,
      ora: adessoISO(),
      nuovoId: nuovoUuid,
      percorsoFile: (pdsId, allegatoId, nome) => `${pdsId}/${allegatoId}/${nomeFileSicuro(nome)}`,
    });
    const risultato = { ...esito.risultato };
    await this.applica(comando, esito, dati, risultato);
    return { risultato, dati: await this.caricaDati() };
  }

  private async applica(c: Comando, esito: EsitoMotore, prima: DatiCondivisi, risultato: EsitoMotore['risultato']) {
    const dopo = esito.dati;
    switch (c.tipo) {
      case 'capitolo.crea': {
        const k = dopo.capitoli.find((x) => x.id === risultato.id)!;
        await this.inserisci(
          'capitoli',
          {
            id: k.id,
            esercizio: k.esercizio,
            codice: k.codice,
            descrizione: k.descrizione,
            finanziato: euro(k.finanziato),
            sforamento_ignorato: k.sforamento_ignorato,
            sforamento_note: k.sforamento_note,
          },
          `Capitolo ${k.codice}`,
        );
        return;
      }
      case 'capitolo.modifica': {
        const k = dopo.capitoli.find((x) => x.id === c.id)!;
        const campi = Object.keys(c.modifiche) as (keyof Capitolo)[];
        await this.aggiorna('capitoli', 'capitolo', c.id, Object.fromEntries(campi.map((f) => [f, k[f]])), c.originale as Riga);
        return;
      }
      case 'capitolo.elimina':
        return this.elimina('capitoli', c.id);
      case 'capitoli.copia': {
        const { data, error } = await this.client.rpc('copia_capitoli', { p_origine: c.esercizioOrigine, p_destinazione: c.esercizioDestinazione, p_copia_importi: c.copiaImporti });
        if (error) throw traduciErrore(error);
        risultato.conteggio = Number(data ?? 0);
        return;
      }
      case 'accordo.crea': {
        const a = dopo.accordi.find((x) => x.id === risultato.id)!;
        await this.inserisci(
          'accordi',
          {
            id: a.id,
            numero: a.numero,
            oggetto: a.oggetto,
            ditta: a.ditta,
            dec: a.dec,
            protocollo_stipula: a.protocollo_stipula,
            data_stipula: a.data_stipula,
            durata_giorni: a.durata_giorni,
            importo: euro(a.importo),
            note: a.note,
          },
          `Accordo quadro ${a.numero}`,
        );
        return;
      }
      case 'accordo.modifica': {
        const a = dopo.accordi.find((x) => x.id === c.id)!;
        const campi = Object.keys(c.modifiche) as (keyof DatiAccordo)[];
        await this.aggiorna('accordi', 'accordo', c.id, Object.fromEntries(campi.map((f) => [f, a[f]])), c.originale as Riga);
        return;
      }
      case 'accordo.elimina':
        return this.elimina('accordi', c.id);
      case 'atto.crea': {
        const a = dopo.atti.find((x) => x.id === risultato.id)!;
        await this.inserisci(
          'atti',
          {
            id: a.id,
            accordo_id: a.accordo_id,
            numero: a.numero,
            oggetto: a.oggetto,
            protocollo_stipula: a.protocollo_stipula,
            data_stipula: a.data_stipula,
            durata_giorni: a.durata_giorni,
            valore: euro(a.valore),
            note: a.note,
          },
          `Atto di adesione ${a.numero}`,
        );
        return;
      }
      case 'atto.modifica': {
        const a = dopo.atti.find((x) => x.id === c.id)!;
        const campi = Object.keys(c.modifiche) as (keyof DatiAtto)[];
        await this.aggiorna('atti', 'atto', c.id, Object.fromEntries(campi.map((f) => [f, a[f]])), c.originale as Riga);
        return;
      }
      case 'atto.elimina':
        return this.elimina('atti', c.id);
      case 'pds.crea': {
        const p = dopo.pds.find((x) => x.id === risultato.id)!;
        const riga: Riga = { id: p.id };
        for (const campo of CAMPI_DATI_PDS) riga[campo] = valoreDb('pds', campo, p[campo]);
        await this.inserisci('pds', riga, `PdS ${numeroPds(p, dopo.capitoli.find((k) => k.id === p.capitolo_id)?.esercizio ?? null)}`);
        return;
      }
      case 'pds.modifica': {
        const vecchio = prima.pds.find((x) => x.id === c.id)!;
        const nuovo = dopo.pds.find((x) => x.id === c.id)!;
        const valori: Riga = {};
        for (const campo of CAMPI_DATI_PDS) if (!valoriUguali(vecchio[campo], nuovo[campo])) valori[campo] = nuovo[campo];
        await this.aggiorna('pds', 'pds', c.id, valori, c.originale as Riga);
        return;
      }
      case 'pds.elimina': {
        // eliminazione logica: il trigger del database imposta istante e utente
        const p = dopo.pds.find((x) => x.id === c.id)!;
        await this.aggiorna('pds', 'pds', c.id, { eliminato_at: p.eliminato_at, eliminato_da: p.eliminato_da }, {});
        return;
      }
      case 'pds.ripristina':
        await this.aggiorna('pds', 'pds', c.id, { eliminato_at: null, eliminato_da: null }, {});
        return;
      case 'pds.elimina_definitivo': {
        const percorsi = esito.effetti.flatMap((e) => (e.tipo === 'file.elimina' ? [e.path] : []));
        if (percorsi.length) await this.client.storage.from(BUCKET).remove(percorsi);
        return this.elimina('pds', c.id);
      }
      case 'pagamento.crea': {
        const g = dopo.pagamenti.find((x) => x.id === risultato.id)!;
        await this.inserisci('pagamenti', { id: g.id, pds_id: g.pds_id, data: g.data, importo: euro(g.importo), riferimento: g.riferimento, note: g.note }, 'Pagamento');
        return;
      }
      case 'pagamento.modifica': {
        const g = dopo.pagamenti.find((x) => x.id === c.id)!;
        const campi = Object.keys(c.modifiche) as (keyof DatiPagamento)[];
        await this.aggiorna('pagamenti', 'pagamento', c.id, Object.fromEntries(campi.map((f) => [f, g[f]])), c.originale as Riga);
        return;
      }
      case 'pagamento.elimina':
        return this.elimina('pagamenti', c.id);
      case 'saldo.conferma': {
        const finale = c.pagamento_finale;
        const { error } = await this.client.rpc('conferma_saldo', {
          p_pds_id: c.pds_id,
          p_data_saldo: c.data_saldo,
          p_importo_finale: finale ? euro(finale.importo) : null,
          p_data_pagamento: finale?.data ?? null,
          p_riferimento: finale?.riferimento?.trim() || null,
        });
        if (error) throw traduciErrore(error);
        return;
      }
      case 'saldo.annulla': {
        const { error } = await this.client.rpc('annulla_saldo', { p_pds_id: c.pds_id });
        if (error) throw traduciErrore(error);
        return;
      }
      case 'allegato.crea': {
        const a = dopo.allegati.find((x) => x.id === risultato.id)!;
        const caricamento = esito.effetti.find((e) => e.tipo === 'file.carica');
        if (caricamento && caricamento.tipo === 'file.carica') {
          const { error } = await this.client.storage
            .from(BUCKET)
            .upload(caricamento.path, caricamento.file.contenuto, { contentType: caricamento.file.tipo || 'application/octet-stream', upsert: false });
          if (error) throw new ErroreApp('VINCOLO', `Caricamento del file non riuscito: ${error.message}`);
        }
        try {
          await this.inserisci(
            'allegati',
            { id: a.id, pds_id: a.pds_id, tipo: a.tipo, titolo: a.titolo, url: a.url, file_path: a.file_path, file_nome: a.file_nome, file_dimensione: a.file_dimensione, file_tipo: a.file_tipo },
            'Allegato',
          );
        } catch (e) {
          if (a.file_path) await this.client.storage.from(BUCKET).remove([a.file_path]);
          throw e;
        }
        return;
      }
      case 'allegato.elimina': {
        const a = prima.allegati.find((x) => x.id === c.id)!;
        await this.elimina('allegati', c.id);
        if (a.file_path) await this.client.storage.from(BUCKET).remove([a.file_path]);
        return;
      }
      case 'utente.crea': {
        const u = c.dati;
        risultato.id = await this.funzioneUtenti({
          azione: 'crea',
          username: normalizzaUsername(u.username),
          nome: u.nome.trim(),
          ruolo: u.ruolo,
          attivo: u.attivo,
          permessi: normalizzaPermessi(u.permessi),
          password: c.password,
          dominioEmail: this.dominio,
        });
        return;
      }
      case 'utente.modifica': {
        const u = dopo.utenti.find((x) => x.id === c.id)!;
        const { data, error } = await this.client
          .from('profili')
          .update({ nome: u.nome, ruolo: u.ruolo, attivo: u.attivo, permessi: u.permessi })
          .eq('id', c.id)
          .select('id');
        if (error) throw traduciErrore(error);
        if (!data?.length) throw new ErroreApp('PERMESSO_NEGATO', 'Modifica non eseguita: utente non trovato o permessi insufficienti.');
        return;
      }
      case 'utente.password':
        await this.funzioneUtenti({ azione: 'password', id: c.id, password: c.password });
        return;
      case 'utente.elimina':
        await this.funzioneUtenti({ azione: 'elimina', id: c.id });
        return;
    }
  }
}
