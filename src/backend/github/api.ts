import { ErroreApp } from '../../domain/errori';
import { base64DaBytes, bytesDaBase64 } from '../crittografia';

/**
 * Client minimale delle API REST di GitHub usate dal backend:
 * - Git Database API (ref, commit, tree, blob) per salvare più file in un unico commit atomico;
 * - Contents API per il portachiavi (singolo file con controllo di concorrenza tramite sha).
 */

/** Il ref non è avanzabile (qualcun altro ha salvato nel frattempo): va ricaricato e ripetuto. */
export class ConflittoRef extends Error {
  constructor() {
    super('Il ramo è stato aggiornato da un altro salvataggio.');
    this.name = 'ConflittoRef';
  }
}

export interface VoceAlberoGit {
  path: string;
  mode: '100644';
  type: 'blob';
  /** Contenuto testuale (UTF-8) oppure sha di un blob esistente; sha null elimina il file. */
  content?: string;
  sha?: string | null;
}

export interface ElementoAlbero {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

export interface InfoRepository {
  private: boolean;
  default_branch: string;
  full_name: string;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const RIPETIBILI = new Set([500, 502, 503, 504]);

function percorsoUrl(percorso: string): string {
  return percorso.split('/').map(encodeURIComponent).join('/');
}

export class ApiGitHub {
  private readonly fetchFn: FetchFn;

  constructor(
    private readonly token: string | null,
    fetchFn?: FetchFn,
    private readonly base = 'https://api.github.com',
  ) {
    this.fetchFn = fetchFn ?? ((input, init) => fetch(input, init));
  }

  private async chiama(metodo: string, percorso: string, corpo?: unknown, accept = 'application/vnd.github+json'): Promise<Response> {
    const headers: Record<string, string> = { Accept: accept };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    const init: RequestInit = { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo), cache: 'no-store' };
    for (let tentativo = 0; ; tentativo++) {
      let risposta: Response;
      try {
        risposta = await this.fetchFn(`${this.base}${percorso}`, init);
      } catch {
        if (metodo === 'GET' && tentativo === 0) continue;
        throw new ErroreApp('RETE', 'Impossibile contattare GitHub (api.github.com): verificare la connessione o eventuali blocchi della rete.');
      }
      if (metodo === 'GET' && tentativo === 0 && RIPETIBILI.has(risposta.status)) {
        await new Promise((r) => setTimeout(r, 700));
        continue;
      }
      return risposta;
    }
  }

  private async errore(r: Response, contesto: string): Promise<ErroreApp> {
    let messaggio = '';
    try {
      messaggio = ((await r.json()) as { message?: string }).message ?? '';
    } catch {
      /* corpo non JSON */
    }
    if (r.status === 401) {
      return new ErroreApp('AUTENTICAZIONE', "Il token di accesso a GitHub non è valido, è scaduto o è stato revocato: rivolgersi all'amministratore.");
    }
    if ((r.status === 403 || r.status === 429) && (r.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(messaggio))) {
      return new ErroreApp('RETE', 'Limite di richieste verso GitHub raggiunto: riprovare tra qualche minuto.');
    }
    if (r.status === 403) {
      return new ErroreApp('PERMESSO_NEGATO', `${contesto}: il token non ha i permessi necessari su GitHub (serve "Contents: Read and write").`);
    }
    if (r.status === 404) {
      return new ErroreApp('NON_TROVATO', `${contesto}: elemento non trovato su GitHub (verificare nomi dei repository e permessi del token).`);
    }
    if (r.status === 409 || r.status === 422) {
      return new ErroreApp('CONFLITTO', `${contesto}: ${messaggio || 'conflitto con lo stato del repository'}.`);
    }
    return new ErroreApp('RETE', `${contesto}: errore di GitHub (HTTP ${r.status}${messaggio ? ` – ${messaggio}` : ''}).`);
  }

  private async json<T>(r: Response, contesto: string): Promise<T> {
    if (!r.ok) throw await this.errore(r, contesto);
    return (await r.json()) as T;
  }

  async leggiRepository(owner: string, repo: string): Promise<InfoRepository | null> {
    const r = await this.chiama('GET', `/repos/${owner}/${repo}`);
    if (r.status === 404) return null;
    return this.json<InfoRepository>(r, `Repository ${owner}/${repo}`);
  }

  /** Sha del commit in testa al ramo; null se il repository è vuoto o il ramo non esiste. */
  async leggiRef(owner: string, repo: string, ramo: string): Promise<string | null> {
    const r = await this.chiama('GET', `/repos/${owner}/${repo}/git/ref/heads/${percorsoUrl(ramo)}`);
    if (r.status === 404 || r.status === 409) return null;
    const dati = await this.json<{ object: { sha: string } }>(r, 'Lettura del ramo');
    return dati.object.sha;
  }

  async leggiCommit(owner: string, repo: string, sha: string): Promise<{ albero: string }> {
    const r = await this.chiama('GET', `/repos/${owner}/${repo}/git/commits/${sha}`);
    const dati = await this.json<{ tree: { sha: string } }>(r, 'Lettura del commit');
    return { albero: dati.tree.sha };
  }

  async leggiAlbero(owner: string, repo: string, sha: string): Promise<ElementoAlbero[]> {
    const r = await this.chiama('GET', `/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`);
    const dati = await this.json<{ tree: ElementoAlbero[]; truncated: boolean }>(r, 'Lettura dei file');
    if (dati.truncated) {
      throw new ErroreApp('VINCOLO', 'Il repository dei dati contiene troppi file per essere letto in una sola richiesta.');
    }
    return dati.tree;
  }

  async leggiBlob(owner: string, repo: string, sha: string): Promise<Uint8Array<ArrayBuffer>> {
    const r = await this.chiama('GET', `/repos/${owner}/${repo}/git/blobs/${sha}`);
    const dati = await this.json<{ content: string; encoding: string }>(r, 'Lettura di un file');
    if (dati.encoding !== 'base64') throw new ErroreApp('INTERNO', `Codifica non supportata: ${dati.encoding}`);
    return bytesDaBase64(dati.content);
  }

  async creaBlob(owner: string, repo: string, contenuto: Uint8Array): Promise<string> {
    const r = await this.chiama('POST', `/repos/${owner}/${repo}/git/blobs`, { content: base64DaBytes(contenuto), encoding: 'base64' });
    return (await this.json<{ sha: string }>(r, 'Caricamento di un file')).sha;
  }

  async creaAlbero(owner: string, repo: string, base: string | null, voci: VoceAlberoGit[]): Promise<string> {
    const corpo: Record<string, unknown> = { tree: voci };
    if (base) corpo.base_tree = base;
    const r = await this.chiama('POST', `/repos/${owner}/${repo}/git/trees`, corpo);
    return (await this.json<{ sha: string }>(r, 'Preparazione del salvataggio')).sha;
  }

  async creaCommit(owner: string, repo: string, messaggio: string, albero: string, genitori: string[]): Promise<string> {
    const r = await this.chiama('POST', `/repos/${owner}/${repo}/git/commits`, { message: messaggio, tree: albero, parents: genitori });
    return (await this.json<{ sha: string }>(r, 'Salvataggio (commit)')).sha;
  }

  /** Avanza il ramo senza forzare: se nel frattempo è cambiato lancia ConflittoRef. */
  async aggiornaRef(owner: string, repo: string, ramo: string, sha: string): Promise<void> {
    const r = await this.chiama('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${percorsoUrl(ramo)}`, { sha, force: false });
    if (r.status === 422 || r.status === 409) throw new ConflittoRef();
    await this.json(r, 'Salvataggio (aggiornamento ramo)');
  }

  async leggiContenuto(owner: string, repo: string, percorso: string, ramo?: string): Promise<{ sha: string; bytes: Uint8Array<ArrayBuffer> } | null> {
    const query = ramo ? `?ref=${encodeURIComponent(ramo)}` : '';
    const r = await this.chiama('GET', `/repos/${owner}/${repo}/contents/${percorsoUrl(percorso)}${query}`);
    if (r.status === 404) return null;
    const dati = await this.json<{ sha: string; content: string; encoding: string }>(r, `Lettura di ${percorso}`);
    return { sha: dati.sha, bytes: bytesDaBase64(dati.content ?? '') };
  }

  /** Crea o aggiorna un file; con sha errato GitHub risponde 409 (ConflittoRef). */
  async scriviContenuto(owner: string, repo: string, percorso: string, contenuto: Uint8Array, messaggio: string, sha?: string, ramo?: string): Promise<string> {
    const corpo: Record<string, unknown> = { message: messaggio, content: base64DaBytes(contenuto) };
    if (sha) corpo.sha = sha;
    if (ramo) corpo.branch = ramo;
    const r = await this.chiama('PUT', `/repos/${owner}/${repo}/contents/${percorsoUrl(percorso)}`, corpo);
    if (r.status === 409 || (r.status === 422 && !sha)) throw new ConflittoRef();
    const dati = await this.json<{ content: { sha: string } }>(r, `Scrittura di ${percorso}`);
    return dati.content.sha;
  }
}
