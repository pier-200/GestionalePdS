import { create } from 'zustand';
import type { Backend, DatiPrimoAvvio, Sessione } from '../backend/tipi';
import { caricaConfig, type ConfigApp } from '../config';
import type { Comando, RisultatoComando } from '../domain/comandi';
import { ErroreApp, messaggioErrore } from '../domain/errori';
import { datiVuoti, type DatiCondivisi, type Utente } from '../domain/tipi';

export type Fase = 'avvio' | 'errore' | 'primo_avvio' | 'accesso' | 'pronto';

const CHIAVE_SOGLIA = 'gestionale-pds:soglia-scadenze';

function leggiSogliaSalvata(): number | null {
  try {
    const v = Number(window.localStorage.getItem(CHIAVE_SOGLIA));
    return Number.isInteger(v) && v > 0 && v <= 365 ? v : null;
  } catch {
    return null;
  }
}

export async function creaBackend(config: ConfigApp): Promise<Backend> {
  const b = config.backend;
  switch (b.tipo) {
    case 'demo': {
      const { DemoBackend } = await import('../backend/demo/DemoBackend');
      return new DemoBackend();
    }
    case 'github': {
      const { GitHubBackend } = await import('../backend/github/GitHubBackend');
      return new GitHubBackend(b);
    }
    case 'supabase': {
      const { SupabaseBackend } = await import('../backend/supabase/SupabaseBackend');
      return new SupabaseBackend(b);
    }
  }
}

interface StatoApp {
  fase: Fase;
  config: ConfigApp | null;
  backend: Backend | null;
  erroreAvvio: string | null;
  messaggioPrimoAvvio: string | null;
  /** Messaggio mostrato nella pagina di accesso (es. sessione scaduta). */
  avvisoAccesso: string | null;
  sessione: Sessione | null;
  dati: DatiCondivisi;
  caricamento: boolean;
  ultimoCaricamento: number | null;
  sogliaGiorni: number;

  avvia(): Promise<void>;
  accedi(username: string, password: string, ricordami: boolean): Promise<void>;
  /** Solo backend GitHub: rinnova il token scaduto e accede. */
  accediConNuovoToken(username: string, password: string, token: string, ricordami: boolean): Promise<void>;
  completaPrimoAvvio(dati: DatiPrimoAvvio): Promise<void>;
  esci(avviso?: string): Promise<void>;
  ricarica(silenzioso?: boolean): Promise<void>;
  controllaAggiornamenti(): Promise<void>;
  esegui(comando: Comando): Promise<RisultatoComando>;
  impostaSoglia(giorni: number): void;
}

export const useApp = create<StatoApp>((set, get) => ({
  fase: 'avvio',
  config: null,
  backend: null,
  erroreAvvio: null,
  messaggioPrimoAvvio: null,
  avvisoAccesso: null,
  sessione: null,
  dati: datiVuoti(),
  caricamento: false,
  ultimoCaricamento: null,
  sogliaGiorni: 30,

  async avvia() {
    try {
      const config = await caricaConfig();
      const backend = await creaBackend(config);
      set({ config, backend, sogliaGiorni: leggiSogliaSalvata() ?? config.sogliaScadenzaGiorni });
      const stato = await backend.avvia();
      if (stato.tipo === 'primo_avvio') {
        set({ fase: 'primo_avvio', messaggioPrimoAvvio: stato.messaggio });
        return;
      }
      const sessione = await backend.ripristinaSessione().catch(() => null);
      if (!sessione) {
        set({ fase: 'accesso' });
        return;
      }
      set({ sessione });
      await get().ricarica();
      if (get().sessione) set({ fase: 'pronto' });
    } catch (e) {
      set({ fase: 'errore', erroreAvvio: messaggioErrore(e) });
    }
  },

  async accedi(username, password, ricordami) {
    const backend = get().backend;
    if (!backend) throw new ErroreApp('CONFIGURAZIONE', 'Applicazione non inizializzata.');
    const sessione = await backend.accedi(username, password, ricordami);
    set({ sessione, avvisoAccesso: null });
    try {
      await get().ricarica();
    } catch (e) {
      await backend.esci().catch(() => undefined);
      set({ sessione: null });
      throw e;
    }
    if (get().sessione) set({ fase: 'pronto' });
  },

  async accediConNuovoToken(username, password, token, ricordami) {
    const backend = get().backend;
    if (backend?.tipo !== 'github') throw new ErroreApp('CONFIGURAZIONE', 'Operazione disponibile solo con il backend GitHub.');
    const { GitHubBackend } = await import('../backend/github/GitHubBackend');
    const sessione = await (backend as InstanceType<typeof GitHubBackend>).rinnovaTokenEAccedi(username, password, token, ricordami);
    set({ sessione, avvisoAccesso: null });
    await get().ricarica();
    if (get().sessione) set({ fase: 'pronto' });
  },

  async completaPrimoAvvio(dati) {
    const backend = get().backend;
    if (!backend) throw new ErroreApp('CONFIGURAZIONE', 'Applicazione non inizializzata.');
    const sessione = await backend.primoAvvio(dati);
    set({ sessione, messaggioPrimoAvvio: null });
    await get().ricarica();
    set({ fase: 'pronto' });
  },

  async esci(avviso) {
    await get().backend?.esci().catch(() => undefined);
    set({ sessione: null, dati: datiVuoti(), fase: 'accesso', ultimoCaricamento: null, avvisoAccesso: avviso ?? null });
  },

  async ricarica(silenzioso = false) {
    const { backend, sessione } = get();
    if (!backend || !sessione) return;
    if (!silenzioso) set({ caricamento: true });
    try {
      const dati = await backend.caricaDati();
      const profilo = dati.utenti.find((u) => u.id === sessione.utente.id);
      if (profilo && !profilo.attivo) {
        await get().esci("Il tuo utente è stato disattivato. Rivolgiti all'amministratore.");
        return;
      }
      set({
        dati,
        ultimoCaricamento: Date.now(),
        sessione: profilo ? { ...sessione, utente: profilo } : sessione,
      });
    } catch (e) {
      if (e instanceof ErroreApp && e.codice === 'AUTENTICAZIONE') {
        await get().esci(e.message);
        return;
      }
      throw e;
    } finally {
      set({ caricamento: false });
    }
  },

  async controllaAggiornamenti() {
    const { backend, sessione, fase } = get();
    if (!backend || !sessione || fase !== 'pronto') return;
    try {
      if (await backend.ciSonoAggiornamenti()) await get().ricarica(true);
    } catch {
      /* controllo in background: gli errori verranno mostrati al prossimo caricamento esplicito */
    }
  },

  async esegui(comando) {
    const { backend } = get();
    if (!backend) throw new ErroreApp('CONFIGURAZIONE', 'Applicazione non inizializzata.');
    try {
      const esito = await backend.esegui(comando);
      if (esito.dati) {
        const sessione = get().sessione;
        const profilo = sessione ? esito.dati.utenti.find((u) => u.id === sessione.utente.id) : undefined;
        set({ dati: esito.dati, ultimoCaricamento: Date.now(), sessione: sessione && profilo ? { ...sessione, utente: profilo } : sessione });
      } else {
        await get().ricarica(true);
      }
      return esito.risultato;
    } catch (e) {
      if (e instanceof ErroreApp && e.codice === 'AUTENTICAZIONE') {
        await get().esci(e.message);
      } else if (!(e instanceof ErroreApp && (e.codice === 'VALIDAZIONE' || e.codice === 'PERMESSO_NEGATO'))) {
        // conflitti o salvataggi parziali: si riallinea la vista allo stato reale dei dati
        await get().ricarica(true).catch(() => undefined);
      }
      throw e;
    }
  },

  impostaSoglia(giorni) {
    set({ sogliaGiorni: giorni });
    try {
      window.localStorage.setItem(CHIAVE_SOGLIA, String(giorni));
    } catch {
      /* preferenza non persistente */
    }
  },
}));

export function useUtenteCorrente(): Utente | null {
  return useApp((s) => s.sessione?.utente ?? null);
}
