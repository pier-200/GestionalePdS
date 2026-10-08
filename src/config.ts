import { ErroreApp } from './domain/errori';

/**
 * Configurazione letta a runtime da `config.json` (accanto a index.html):
 * si può cambiare backend o intestazione modificando il file nel repository,
 * senza ricompilare l'applicazione.
 */

export type ConfigBackend =
  | { tipo: 'demo' }
  | {
      tipo: 'github';
      /** Proprietario (utente o organizzazione) dei repository. */
      owner: string;
      /** Repository PRIVATO che contiene i dati. */
      repoDati: string;
      /** Repository pubblico che contiene solo il portachiavi cifrato (keyring.json). */
      repoAccessi: string;
      branch?: string;
      /** URL GitHub Pages del keyring (facoltativo, usato come fonte aggiuntiva). */
      urlKeyringPages?: string;
    };

export interface ConfigApp {
  /** Nome dell'ufficio mostrato nell'intestazione. */
  nomeUfficio: string;
  /** Soglia predefinita (giorni) per gli avvisi di scadenza. */
  sogliaScadenzaGiorni: number;
  backend: ConfigBackend;
}

export const CONFIG_PREDEFINITA: ConfigApp = {
  nomeUfficio: '',
  sogliaScadenzaGiorni: 30,
  backend: { tipo: 'demo' },
};

function stringa(v: unknown, nome: string): string {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new ErroreApp('CONFIGURAZIONE', `config.json: il campo "${nome}" è obbligatorio.`);
  }
  return v.trim();
}

export function interpretaConfig(grezza: unknown): ConfigApp {
  if (!grezza || typeof grezza !== 'object') return CONFIG_PREDEFINITA;
  const g = grezza as Record<string, unknown>;
  const b = (g.backend ?? { tipo: 'demo' }) as Record<string, unknown>;
  let backend: ConfigBackend;
  switch (b.tipo) {
    case undefined:
    case 'demo':
      backend = { tipo: 'demo' };
      break;
    case 'github':
      backend = {
        tipo: 'github',
        owner: stringa(b.owner, 'backend.owner'),
        repoDati: stringa(b.repoDati, 'backend.repoDati'),
        repoAccessi: stringa(b.repoAccessi, 'backend.repoAccessi'),
        branch: typeof b.branch === 'string' && b.branch.trim() ? b.branch.trim() : 'main',
        urlKeyringPages: typeof b.urlKeyringPages === 'string' && b.urlKeyringPages.trim() ? b.urlKeyringPages.trim() : undefined,
      };
      break;
    default:
      throw new ErroreApp('CONFIGURAZIONE', `config.json: backend "${String(b.tipo)}" non riconosciuto (valori ammessi: demo, github).`);
  }
  const soglia = Number(g.sogliaScadenzaGiorni);
  return {
    nomeUfficio: typeof g.nomeUfficio === 'string' ? g.nomeUfficio.trim() : '',
    sogliaScadenzaGiorni: Number.isInteger(soglia) && soglia > 0 && soglia <= 365 ? soglia : 30,
    backend,
  };
}

export async function caricaConfig(): Promise<ConfigApp> {
  let risposta: Response;
  try {
    risposta = await fetch('./config.json', { cache: 'no-store' });
  } catch {
    return CONFIG_PREDEFINITA;
  }
  if (risposta.status === 404) return CONFIG_PREDEFINITA;
  if (!risposta.ok) throw new ErroreApp('CONFIGURAZIONE', `Impossibile leggere config.json (HTTP ${risposta.status}).`);
  let json: unknown;
  try {
    json = await risposta.json();
  } catch {
    throw new ErroreApp('CONFIGURAZIONE', 'config.json non è un JSON valido.');
  }
  return interpretaConfig(json);
}
