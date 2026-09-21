import { PGlite, type Transaction } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Emulatore minimale di Supabase per i test: PostgREST, Auth, Storage e Functions
 * sopra un PostgreSQL reale (PGlite) con lo schema del Gestionale PdS.
 * Le policy RLS, i trigger e le funzioni SQL sono quindi quelli veri.
 */

export const STUB_SUPABASE = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid, unique (bucket_id, name));
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  _parts := string_to_array(name, '/');
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
`;

const SCHEMA = readFileSync(fileURLToPath(new URL('../../supabase/migrations/20260917000000_gestionale_pds.sql', import.meta.url)), 'utf8');

type Ruolo = { ruolo: 'anon' | 'authenticated' | 'service_role'; sub: string | null };
type Gestore = (req: Request) => Promise<Response>;

const RE_IDENT = /^[a-z_][a-z0-9_]*$/;

function json(stato: number, corpo: unknown, headers: Record<string, string> = {}): Response {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), { status: stato, headers: { 'content-type': 'application/json', ...headers } });
}

function base64url(testo: string) {
  return Buffer.from(testo).toString('base64url');
}

function erroreHttp(e: unknown): Response {
  const err = e as { code?: string; message?: string; detail?: string; hint?: string };
  const codice = err.code ?? '';
  const stato = codice === '42501' ? 403 : codice === '23505' || codice === '23503' ? 409 : 400;
  return json(stato, { code: codice, message: err.message ?? String(e), details: err.detail ?? null, hint: err.hint ?? null });
}

export class MockSupabase {
  readonly url = 'https://progettotest.supabase.co';
  readonly chiavePubblica = 'sb_publishable_TEST';
  readonly chiaveServizio = 'sb_secret_TEST';
  readonly password = new Map<string, string>(); // id utente → password
  readonly token = new Map<string, string>(); // access/refresh token → id utente
  readonly file = new Map<string, Blob>();
  readonly funzioni = new Map<string, Gestore>();
  richieste: string[] = [];

  private constructor(readonly db: PGlite) {}

  static async crea(): Promise<MockSupabase> {
    const db = new PGlite();
    await db.exec(STUB_SUPABASE);
    await db.exec(SCHEMA);
    return new MockSupabase(db);
  }

  /** Crea un utente di Supabase Auth (come dalla console). */
  async creaUtenteAuth(email: string, password: string): Promise<string> {
    const id = randomUUID();
    await this.db.query('insert into auth.users (id, email) values ($1, $2)', [id, email.toLowerCase()]);
    this.password.set(id, password);
    return id;
  }

  private async conRuolo<T>(r: Ruolo, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.exec(`set local role ${r.ruolo}`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [r.sub ?? '']);
      return fn(tx);
    });
  }

  private ruolo(req: Request): Ruolo | null {
    const apikey = req.headers.get('apikey');
    if (apikey !== this.chiavePubblica && apikey !== this.chiaveServizio) return null;
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const sub = this.token.get(bearer);
    if (sub) return { ruolo: 'authenticated', sub };
    if (apikey === this.chiaveServizio || bearer === this.chiaveServizio) return { ruolo: 'service_role', sub: null };
    return { ruolo: 'anon', sub: null };
  }

  private async sessione(id: string) {
    const { rows } = await this.db.query<{ email: string }>('select email from auth.users where id = $1', [id]);
    const access = `${base64url('{"alg":"none","typ":"JWT"}')}.${base64url(JSON.stringify({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }))}.firma${randomUUID()}`;
    const refresh = `refresh-${randomUUID()}`;
    this.token.set(access, id);
    this.token.set(refresh, id);
    return {
      access_token: access,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: refresh,
      user: this.utenteAuth(id, rows[0]?.email ?? ''),
    };
  }

  private utenteAuth(id: string, email: string) {
    return { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  }

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    this.richieste.push(`${req.method} ${url.pathname}${url.search}`);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
    const r = this.ruolo(req);
    if (!r) return json(401, { message: 'Invalid API key' });
    try {
      if (url.pathname.startsWith('/rest/v1/rpc/')) return await this.rpc(r, url.pathname.slice('/rest/v1/rpc/'.length), req);
      if (url.pathname.startsWith('/rest/v1/')) return await this.tabella(r, url.pathname.slice('/rest/v1/'.length), url, req);
      if (url.pathname.startsWith('/auth/v1/')) return await this.auth(r, url.pathname.slice('/auth/v1/'.length), url, req);
      if (url.pathname.startsWith('/storage/v1/object/')) return await this.storage(r, url.pathname.slice('/storage/v1/object/'.length), req);
      if (url.pathname.startsWith('/functions/v1/')) {
        const gestore = this.funzioni.get(url.pathname.slice('/functions/v1/'.length));
        return gestore ? await gestore(req) : json(404, { message: 'Function not found' });
      }
    } catch (e) {
      return erroreHttp(e);
    }
    return json(404, { message: `Percorso non simulato: ${url.pathname}` });
  };

  // ---------------------------------------------------------------------------
  // PostgREST
  // ---------------------------------------------------------------------------

  private filtri(url: URL, parametri: unknown[]): string {
    const condizioni: string[] = [];
    for (const [chiave, valore] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(chiave)) continue;
      if (!RE_IDENT.test(chiave)) throw new Error(`Colonna non valida: ${chiave}`);
      const punto = valore.indexOf('.');
      const op = valore.slice(0, punto);
      const v = valore.slice(punto + 1);
      if (op === 'is') {
        if (!['null', 'true', 'false'].includes(v)) throw new Error('Valore is non valido');
        condizioni.push(`${chiave} is ${v}`);
        continue;
      }
      const operatori: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
      if (!operatori[op]) throw new Error(`Operatore non simulato: ${op}`);
      parametri.push(v);
      condizioni.push(`${chiave} ${operatori[op]} $${parametri.length}`);
    }
    return condizioni.length ? ` where ${condizioni.join(' and ')}` : '';
  }

  private colonne(url: URL): string {
    const s = url.searchParams.get('select') ?? '*';
    if (s === '*') return '*';
    return s
      .split(',')
      .map((c) => c.trim())
      .map((c) => {
        if (!RE_IDENT.test(c)) throw new Error(`Colonna non valida: ${c}`);
        return c;
      })
      .join(', ');
  }

  private async tabella(r: Ruolo, tabella: string, url: URL, req: Request): Promise<Response> {
    if (!RE_IDENT.test(tabella)) return json(404, { message: 'Tabella non valida' });
    const parametri: unknown[] = [];
    const prefer = req.headers.get('prefer') ?? '';
    const rappresentazione = prefer.includes('return=representation');
    const nome = `public.${tabella}`;
    const serializza = (v: unknown) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);

    if (req.method === 'GET' || req.method === 'HEAD') {
      const where = this.filtri(url, parametri);
      if (req.method === 'HEAD') {
        const n = await this.conRuolo(r, async (tx) => (await tx.query<{ n: number }>(`select count(*)::int n from ${nome}${where}`, parametri)).rows[0].n);
        return new Response(null, { status: 200, headers: { 'content-range': `*/${n}` } });
      }
      const ordine = (url.searchParams.get('order') ?? '')
        .split(',')
        .filter(Boolean)
        .map((o) => {
          const [col, dir] = o.split('.');
          if (!RE_IDENT.test(col)) throw new Error('Ordinamento non valido');
          return `${col} ${dir === 'desc' ? 'desc' : 'asc'}`;
        });
      const limite = url.searchParams.get('limit');
      const salto = url.searchParams.get('offset');
      const sql = `select coalesce(json_agg(t), '[]'::json) r from (select ${this.colonne(url)} from ${nome}${where}${ordine.length ? ` order by ${ordine.join(', ')}` : ''}${limite ? ` limit ${Number(limite)}` : ''}${salto ? ` offset ${Number(salto)}` : ''}) t`;
      const righe = await this.conRuolo(r, async (tx) => (await tx.query<{ r: unknown }>(sql, parametri)).rows[0].r);
      return json(200, righe);
    }

    if (req.method === 'POST') {
      const corpo = (await req.json()) as Record<string, unknown> | Record<string, unknown>[];
      const elenco = Array.isArray(corpo) ? corpo : [corpo];
      const colonne = Object.keys(elenco[0]);
      colonne.forEach((c) => {
        if (!RE_IDENT.test(c)) throw new Error(`Colonna non valida: ${c}`);
      });
      const valori = elenco.map((riga) => `(${colonne.map((c) => {
        parametri.push(serializza(riga[c]));
        return `$${parametri.length}`;
      }).join(', ')})`);
      const sql = `with t as (insert into ${nome} (${colonne.join(', ')}) values ${valori.join(', ')} returning ${this.colonne(url)}) select coalesce(json_agg(t), '[]'::json) r from t`;
      const righe = await this.conRuolo(r, async (tx) => (await tx.query<{ r: unknown }>(sql, parametri)).rows[0].r);
      return rappresentazione ? json(201, righe) : new Response(null, { status: 201 });
    }

    if (req.method === 'PATCH') {
      const corpo = (await req.json()) as Record<string, unknown>;
      const assegnazioni = Object.entries(corpo).map(([c, v]) => {
        if (!RE_IDENT.test(c)) throw new Error(`Colonna non valida: ${c}`);
        parametri.push(serializza(v));
        return `${c} = $${parametri.length}`;
      });
      const where = this.filtri(url, parametri);
      const sql = `with t as (update ${nome} set ${assegnazioni.join(', ')}${where} returning ${this.colonne(url)}) select coalesce(json_agg(t), '[]'::json) r from t`;
      const righe = await this.conRuolo(r, async (tx) => (await tx.query<{ r: unknown }>(sql, parametri)).rows[0].r);
      return rappresentazione ? json(200, righe) : new Response(null, { status: 204 });
    }

    if (req.method === 'DELETE') {
      const where = this.filtri(url, parametri);
      const sql = `with t as (delete from ${nome}${where} returning ${this.colonne(url)}) select coalesce(json_agg(t), '[]'::json) r from t`;
      const righe = await this.conRuolo(r, async (tx) => (await tx.query<{ r: unknown }>(sql, parametri)).rows[0].r);
      return rappresentazione ? json(200, righe) : new Response(null, { status: 204 });
    }
    return json(405, { message: 'Metodo non supportato' });
  }

  private async rpc(r: Ruolo, funzione: string, req: Request): Promise<Response> {
    if (!RE_IDENT.test(funzione)) return json(404, { message: 'Funzione non valida' });
    const testo = await req.text();
    const argomenti = testo ? (JSON.parse(testo) as Record<string, unknown>) : {};
    const parametri: unknown[] = [];
    const lista = Object.entries(argomenti).map(([k, v]) => {
      if (!RE_IDENT.test(k)) throw new Error('Argomento non valido');
      parametri.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
      return `${k} => $${parametri.length}`;
    });
    const esiste = await this.db.query('select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2', ['public', funzione]);
    if (!esiste.rows.length) return json(404, { code: 'PGRST202', message: `Could not find the function public.${funzione}` });
    const risultato = await this.conRuolo(r, async (tx) => (await tx.query<{ r: unknown }>(`select to_json(public.${funzione}(${lista.join(', ')})) r`, parametri)).rows[0].r);
    return json(200, risultato ?? null);
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  private async auth(r: Ruolo, percorso: string, url: URL, req: Request): Promise<Response> {
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (percorso === 'token' && url.searchParams.get('grant_type') === 'password') {
      const { email, password } = (await req.json()) as { email: string; password: string };
      const { rows } = await this.db.query<{ id: string }>('select id from auth.users where email = $1', [String(email).toLowerCase()]);
      const id = rows[0]?.id;
      if (!id || this.password.get(id) !== password) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return json(200, await this.sessione(id));
    }
    if (percorso === 'token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const { refresh_token } = (await req.json()) as { refresh_token: string };
      const id = this.token.get(refresh_token);
      if (!id) return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      return json(200, await this.sessione(id));
    }
    if (percorso === 'user') {
      const id = this.token.get(bearer);
      if (!id) return json(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
      const { rows } = await this.db.query<{ email: string }>('select email from auth.users where id = $1', [id]);
      if (!rows.length) return json(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
      if (req.method === 'PUT') {
        const { password } = (await req.json()) as { password?: string };
        if (password) this.password.set(id, password);
      }
      return json(200, this.utenteAuth(id, rows[0].email));
    }
    if (percorso === 'logout') {
      this.token.delete(bearer);
      return new Response(null, { status: 204 });
    }
    if (percorso.startsWith('admin/users')) {
      if (r.ruolo !== 'service_role') return json(403, { code: 403, error_code: 'not_admin', msg: 'User not allowed' });
      const id = percorso.split('/')[2];
      if (req.method === 'POST' && !id) {
        const corpo = (await req.json()) as { email: string; password: string };
        const email = corpo.email.toLowerCase();
        const esistente = await this.db.query('select 1 from auth.users where email = $1', [email]);
        if (esistente.rows.length) return json(422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
        const nuovo = await this.creaUtenteAuth(email, corpo.password);
        return json(200, this.utenteAuth(nuovo, email));
      }
      if (req.method === 'PUT' && id) {
        const corpo = (await req.json()) as { password?: string };
        if (corpo.password) this.password.set(id, corpo.password);
        return json(200, this.utenteAuth(id, ''));
      }
      if (req.method === 'DELETE' && id) {
        try {
          await this.db.query('delete from auth.users where id = $1', [id]);
        } catch (e) {
          return json(500, { code: 500, error_code: 'unexpected_failure', msg: `Database error deleting user: ${(e as Error).message}` });
        }
        this.password.delete(id);
        return json(200, this.utenteAuth(id, ''));
      }
    }
    return json(404, { message: `Auth non simulata: ${percorso}` });
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  private async storage(r: Ruolo, percorso: string, req: Request): Promise<Response> {
    const [bucket, ...resto] = percorso.split('/');
    const nome = decodeURIComponent(resto.join('/'));
    const chiave = `${bucket}/${nome}`;
    const erroreStorage = (e: unknown) => json(400, { statusCode: '403', error: 'Unauthorized', message: (e as Error).message });
    if (req.method === 'POST' && nome) {
      const form = await req.formData();
      const file = [...form.values()].find((v) => v instanceof Blob) as Blob | undefined;
      if (!file) return json(400, { statusCode: '400', error: 'Bad Request', message: 'File mancante' });
      try {
        await this.conRuolo(r, (tx) => tx.query('insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)', [bucket, nome, r.sub]));
      } catch (e) {
        return erroreStorage(e);
      }
      this.file.set(chiave, file);
      return json(200, { Key: chiave, Id: randomUUID() });
    }
    if (req.method === 'GET' && nome) {
      const visibile = await this.conRuolo(r, async (tx) => (await tx.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, nome])).rows.length > 0);
      const file = this.file.get(chiave);
      if (!visibile || !file) return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return new Response(file, { status: 200, headers: { 'content-type': file.type || 'application/octet-stream' } });
    }
    if (req.method === 'DELETE' && !nome) {
      const { prefixes } = (await req.json()) as { prefixes: string[] };
      const rimossi = await this.conRuolo(r, async (tx) => (await tx.query<{ name: string }>('delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name', [bucket, prefixes])).rows);
      for (const x of rimossi) this.file.delete(`${bucket}/${x.name}`);
      return json(200, rimossi);
    }
    return json(404, { message: 'Storage non simulato' });
  }
}
