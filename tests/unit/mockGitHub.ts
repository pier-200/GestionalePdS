import { createHash, randomUUID } from 'node:crypto';

/**
 * Simulazione in memoria delle API di GitHub usate dal backend (Git Database API,
 * Contents API, raw.githubusercontent.com), con repository privati/pubblici,
 * token validi/revocati e controllo "fast-forward" sui ref.
 */

interface Repo {
  private: boolean;
  blobs: Map<string, Buffer>;
  trees: Map<string, Map<string, string>>; // albero: percorso completo → sha blob
  commits: Map<string, { tree: string; parents: string[]; message: string }>;
  refs: Map<string, string>;
}

function shaBlob(contenuto: Buffer): string {
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${contenuto.length}\0`), contenuto])).digest('hex');
}

function risposta(status: number, corpo?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(corpo === undefined ? null : typeof corpo === 'string' ? corpo : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export class MockGitHub {
  readonly repos = new Map<string, Repo>();
  readonly tokenValidi = new Set<string>();
  richieste = 0;
  /** Se impostato, simula l'irraggiungibilità di raw.githubusercontent.com. */
  rawBloccato = false;

  creaRepo(nome: string, privato: boolean) {
    this.repos.set(nome, { private: privato, blobs: new Map(), trees: new Map(), commits: new Map(), refs: new Map() });
  }

  private scriviFile(repo: Repo, ramo: string, percorso: string, contenuto: Buffer, messaggio: string) {
    const testa = repo.refs.get(ramo);
    const alberoBase = testa ? repo.trees.get(repo.commits.get(testa)!.tree)! : new Map<string, string>();
    const sha = shaBlob(contenuto);
    repo.blobs.set(sha, contenuto);
    const albero = new Map(alberoBase);
    albero.set(percorso, sha);
    const shaAlbero = randomUUID().replace(/-/g, '');
    repo.trees.set(shaAlbero, albero);
    const shaCommit = randomUUID().replace(/-/g, '');
    repo.commits.set(shaCommit, { tree: shaAlbero, parents: testa ? [testa] : [], message: messaggio });
    repo.refs.set(ramo, shaCommit);
    return sha;
  }

  leggiFile(nomeRepo: string, percorso: string, ramo = 'main'): string | null {
    const repo = this.repos.get(nomeRepo)!;
    const testa = repo.refs.get(ramo);
    if (!testa) return null;
    const sha = repo.trees.get(repo.commits.get(testa)!.tree)!.get(percorso);
    return sha ? repo.blobs.get(sha)!.toString('utf8') : null;
  }

  elencoFile(nomeRepo: string, ramo = 'main'): string[] {
    const repo = this.repos.get(nomeRepo)!;
    const testa = repo.refs.get(ramo);
    if (!testa) return [];
    return [...repo.trees.get(repo.commits.get(testa)!.tree)!.keys()].sort();
  }

  messaggiCommit(nomeRepo: string, ramo = 'main'): string[] {
    const repo = this.repos.get(nomeRepo)!;
    const out: string[] = [];
    let c = repo.refs.get(ramo);
    while (c) {
      const commit = repo.commits.get(c)!;
      out.push(commit.message);
      c = commit.parents[0];
    }
    return out;
  }

  readonly fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    this.richieste++;
    const url = new URL(input);
    const metodo = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const auth = headers.get('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token && !this.tokenValidi.has(token)) return risposta(401, { message: 'Bad credentials' });

    if (url.hostname === 'raw.githubusercontent.com') {
      if (this.rawBloccato) throw new TypeError('Failed to fetch');
      const [, owner, repo, ramo, ...resto] = url.pathname.split('/');
      const r = this.repos.get(`${owner}/${repo}`);
      if (!r || r.private) return risposta(404, 'Not Found');
      const contenuto = this.leggiFile(`${owner}/${repo}`, resto.join('/'), ramo);
      return contenuto == null ? risposta(404, 'Not Found') : risposta(200, contenuto);
    }

    const parti = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parti[0] !== 'repos') return risposta(404, { message: 'Not Found' });
    const nomeRepo = `${parti[1]}/${parti[2]}`;
    const repo = this.repos.get(nomeRepo);
    if (!repo || (repo.private && !token)) return risposta(404, { message: 'Not Found' });
    const testoCorpo = init.body == null ? '' : typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    const corpo = testoCorpo ? JSON.parse(testoCorpo) : undefined;
    const scrittura = metodo !== 'GET';
    if (scrittura && !token) return risposta(404, { message: 'Not Found' });
    const [, , , sezione, ...resto] = parti;

    if (!sezione && metodo === 'GET') return risposta(200, { private: repo.private, default_branch: 'main', full_name: nomeRepo });

    if (sezione === 'contents') {
      const percorso = resto.join('/');
      const ramo = url.searchParams.get('ref') ?? corpo?.branch ?? 'main';
      if (metodo === 'GET') {
        const contenuto = this.leggiFile(nomeRepo, percorso, ramo);
        if (contenuto == null) return risposta(404, { message: 'Not Found' });
        const buffer = Buffer.from(contenuto, 'utf8');
        return risposta(200, { sha: shaBlob(buffer), content: buffer.toString('base64'), encoding: 'base64' });
      }
      if (metodo === 'PUT') {
        const esistente = this.leggiFile(nomeRepo, percorso, ramo);
        const shaEsistente = esistente == null ? null : shaBlob(Buffer.from(esistente, 'utf8'));
        if (shaEsistente && !corpo.sha) return risposta(422, { message: '"sha" wasn\'t supplied.' });
        if (shaEsistente && corpo.sha !== shaEsistente) return risposta(409, { message: 'does not match' });
        const sha = this.scriviFile(repo, ramo, percorso, Buffer.from(corpo.content, 'base64'), corpo.message);
        return risposta(esistente == null ? 201 : 200, { content: { sha } });
      }
    }

    if (sezione === 'git') {
      const [tipo, ...altro] = resto;
      if (tipo === 'ref' && metodo === 'GET') {
        const ramo = altro.slice(1).join('/');
        if (repo.refs.size === 0) return risposta(409, { message: 'Git Repository is empty.' });
        const sha = repo.refs.get(ramo);
        return sha ? risposta(200, { object: { sha } }) : risposta(404, { message: 'Not Found' });
      }
      if (tipo === 'refs' && metodo === 'PATCH') {
        const ramo = altro.slice(1).join('/');
        const attuale = repo.refs.get(ramo);
        const nuovo = repo.commits.get(corpo.sha);
        if (!attuale || !nuovo) return risposta(422, { message: 'Reference does not exist' });
        if (!nuovo.parents.includes(attuale) && !corpo.force) return risposta(422, { message: 'Update is not a fast forward' });
        repo.refs.set(ramo, corpo.sha);
        return risposta(200, { object: { sha: corpo.sha } });
      }
      if (tipo === 'commits' && metodo === 'GET') {
        const c = repo.commits.get(altro[0]);
        return c ? risposta(200, { tree: { sha: c.tree } }) : risposta(404, { message: 'Not Found' });
      }
      if (tipo === 'commits' && metodo === 'POST') {
        if (!repo.trees.has(corpo.tree)) return risposta(422, { message: 'Tree not found' });
        const sha = randomUUID().replace(/-/g, '');
        repo.commits.set(sha, { tree: corpo.tree, parents: corpo.parents, message: corpo.message });
        return risposta(201, { sha });
      }
      if (tipo === 'trees' && metodo === 'GET') {
        const t = repo.trees.get(altro[0]);
        if (!t) return risposta(404, { message: 'Not Found' });
        const cartelle = new Set<string>();
        for (const p of t.keys()) {
          const segmenti = p.split('/');
          for (let i = 1; i < segmenti.length; i++) cartelle.add(segmenti.slice(0, i).join('/'));
        }
        const tree = [
          ...[...cartelle].map((p) => ({ path: p, type: 'tree', sha: 'cartella' })),
          ...[...t.entries()].map(([p, sha]) => ({ path: p, type: 'blob', sha, size: repo.blobs.get(sha)!.length })),
        ];
        return risposta(200, { tree, truncated: false });
      }
      if (tipo === 'trees' && metodo === 'POST') {
        const base = corpo.base_tree ? repo.trees.get(corpo.base_tree) : new Map<string, string>();
        if (!base) return risposta(422, { message: 'base_tree not found' });
        const albero = new Map(base);
        for (const v of corpo.tree as { path: string; sha?: string | null; content?: string }[]) {
          if (v.sha === null) albero.delete(v.path);
          else if (v.content != null) {
            const buffer = Buffer.from(v.content, 'utf8');
            const sha = shaBlob(buffer);
            repo.blobs.set(sha, buffer);
            albero.set(v.path, sha);
          } else if (v.sha) {
            if (!repo.blobs.has(v.sha)) return risposta(422, { message: 'blob not found' });
            albero.set(v.path, v.sha);
          }
        }
        const sha = randomUUID().replace(/-/g, '');
        repo.trees.set(sha, albero);
        return risposta(201, { sha });
      }
      if (tipo === 'blobs' && metodo === 'GET') {
        const b = repo.blobs.get(altro[0]);
        return b ? risposta(200, { content: b.toString('base64'), encoding: 'base64' }) : risposta(404, { message: 'Not Found' });
      }
      if (tipo === 'blobs' && metodo === 'POST') {
        const buffer = Buffer.from(corpo.content, corpo.encoding === 'base64' ? 'base64' : 'utf8');
        const sha = shaBlob(buffer);
        repo.blobs.set(sha, buffer);
        return risposta(201, { sha });
      }
    }
    return risposta(404, { message: `Endpoint non simulato: ${metodo} ${url.pathname}` });
  };
}
