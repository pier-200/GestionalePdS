import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Verifica dello schema Supabase su un PostgreSQL reale (PGlite), con una
 * simulazione minima dell'ambiente Supabase: ruoli anon/authenticated,
 * schema auth con auth.uid() e schema storage.
 */

const STUB_SUPABASE = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  _parts := string_to_array(name, '/');
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
`;

const SCHEMA = readFileSync(resolve(__dirname, '../../supabase/migrations/20260917000000_gestionale_pds.sql'), 'utf8');

const U = {
  admin: '00000000-0000-4000-8000-000000000001',
  operatore: '00000000-0000-4000-8000-000000000002',
  lettore: '00000000-0000-4000-8000-000000000003',
  disattivato: '00000000-0000-4000-8000-000000000004',
  cassiere: '00000000-0000-4000-8000-000000000005',
  nuovo: '00000000-0000-4000-8000-000000000006',
  gestore: '00000000-0000-4000-8000-000000000007',
};

let db: PGlite;

/** Esegue una funzione come utente autenticato (o anonimo) in una transazione. */
async function come<T>(utente: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${utente ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [utente ?? '']);
    return fn(tx);
  });
}

async function righe<T = Record<string, unknown>>(utente: string | null, sql: string, parametri: unknown[] = []): Promise<T[]> {
  return come(utente, async (tx) => (await tx.query<T>(sql, parametri)).rows);
}

async function errore(utente: string | null, sql: string, parametri: unknown[] = []): Promise<string> {
  try {
    await righe(utente, sql, parametri);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`Nessun errore per: ${sql}`);
}

const PERMESSI = (p: Record<string, unknown>) =>
  JSON.stringify({ capitoli: false, pds_crea: false, pds_dati: false, pds_pagamenti: false, pds_allegati: false, ambito_capitoli: null, ...p });

let cap1181: string;
let cap7120: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB_SUPABASE);
  await db.exec(SCHEMA);
  // esecuzione ripetuta: lo script deve essere idempotente
  await db.exec(SCHEMA);
  for (const [nome, id] of Object.entries(U)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${nome}@pds.local`]);
  }
  const profilo = (id: string, username: string, ruolo: string, attivo: boolean, permessi: string) =>
    db.query('insert into public.profili (id, username, nome, ruolo, attivo, permessi) values ($1, $2, $3, $4, $5, $6::jsonb)', [id, username, username, ruolo, attivo, permessi]);
  await profilo(U.admin, 'admin', 'admin', true, PERMESSI({}));
  await profilo(U.operatore, 'operatore', 'utente', true, PERMESSI({ pds_crea: true, pds_dati: true, ambito_capitoli: ['1181'] }));
  await profilo(U.lettore, 'lettore', 'utente', true, PERMESSI({}));
  await profilo(U.disattivato, 'disattivato', 'utente', false, PERMESSI({ capitoli: true }));
  await profilo(U.cassiere, 'cassiere', 'utente', true, PERMESSI({ pds_pagamenti: true, pds_allegati: true }));
  await profilo(U.gestore, 'gestore', 'utente', true, PERMESSI({ capitoli: true, accordi: true }));

  cap1181 = (await righe<{ id: string }>(U.admin, `insert into public.capitoli (esercizio, codice, descrizione, finanziato) values (2026, '1181', 'Manutenzione', 100000) returning id`))[0].id;
  cap7120 = (await righe<{ id: string }>(U.admin, `insert into public.capitoli (esercizio, codice, descrizione, finanziato) values (2026, '7120', 'Impianti', 50000) returning id`))[0].id;
});

afterAll(async () => {
  await db.close();
});

describe('schema Supabase: lettura', () => {
  it('consente la lettura agli utenti attivi e la nega a disattivati e anonimi', async () => {
    expect((await righe(U.lettore, 'select * from public.capitoli')).length).toBe(2);
    expect((await righe(U.disattivato, 'select * from public.capitoli')).length).toBe(0);
    expect(await errore(null, 'select * from public.capitoli')).toMatch(/permission denied/);
  });

  it('registra automaticamente utente e data di creazione', async () => {
    const [c] = await righe<{ created_by: string; updated_by: string }>(U.lettore, 'select created_by, updated_by from public.capitoli where id = $1', [cap1181]);
    expect(c.created_by).toBe(U.admin);
    expect(c.updated_by).toBe(U.admin);
  });
});

describe('schema Supabase: permessi di modifica', () => {
  it('riserva i capitoli a chi ha il permesso', async () => {
    expect(await errore(U.lettore, `insert into public.capitoli (esercizio, codice) values (2026, '9999')`)).toMatch(/row-level security/);
    expect(await errore(U.disattivato, `insert into public.capitoli (esercizio, codice) values (2026, '9999')`)).toMatch(/row-level security/);
    expect(await errore(U.admin, `insert into public.capitoli (esercizio, codice) values (2026, ' 1181 ')`)).toMatch(/duplicate key/);
  });

  it("applica l'ambito dei capitoli ai PdS", async () => {
    expect(await errore(U.operatore, `insert into public.pds (numero, capitolo_id) values ('1', $1)`, [cap7120])).toMatch(/row-level security/);
    const [p] = await righe<{ id: string; saldato: boolean }>(U.operatore, `insert into public.pds (numero, capitolo_id, saldato, data_saldo, totale_pagato_saldo) values (' 1 ', $1, true, '2026-01-01', 5) returning id, saldato`, [cap1181]);
    expect(p.saldato).toBe(false); // il saldo non si imposta in creazione
    const pdsAltro = (await righe<{ id: string }>(U.admin, `insert into public.pds (numero, capitolo_id) values ('2', $1) returning id`, [cap7120]))[0].id;
    // fuori ambito: la modifica non trova righe
    expect((await righe(U.operatore, `update public.pds set note = 'x' where id = $1 returning id`, [pdsAltro])).length).toBe(0);
    expect((await righe(U.operatore, `update public.pds set note = 'ok' where id = $1 returning id`, [p.id])).length).toBe(1);
    // spostare il PdS su un capitolo fuori ambito non è consentito
    expect(await errore(U.operatore, `update public.pds set capitolo_id = $1 where id = $2`, [cap7120, p.id])).toMatch(/row-level security|permessi/);
  });

  it('controlla i permessi per gruppi di campi', async () => {
    const id = (await righe<{ id: string }>(U.admin, `insert into public.pds (numero, capitolo_id, data_stipula, valore_stipula) values ('3', $1, '2026-02-01', 1000) returning id`, [cap1181]))[0].id;
    // il cassiere gestisce pagamenti e saldo, ma non i dati del PdS
    expect(await errore(U.cassiere, `update public.pds set note = 'no' where id = $1`, [id])).toMatch(/permessi per modificare i dati/);
    // l'operatore gestisce i dati ma non il saldo
    expect(await errore(U.operatore, `select public.conferma_saldo($1, '2026-05-01')`, [id])).toMatch(/permessi/);
  });

  it('normalizza i tempi di esecuzione', async () => {
    const [p] = await righe<{ durata_unita: string; data_termine: string | null }>(
      U.admin,
      `insert into public.pds (numero, capitolo_id, modalita_termine, durata, data_termine) values ('4', $1, 'durata', 30, '2026-12-31') returning durata_unita, data_termine`,
      [cap1181],
    );
    expect(p).toEqual({ durata_unita: 'giorni', data_termine: null });
  });
});

describe('schema Supabase: pagamenti e saldo', () => {
  it('calcola il totale a saldo e blocca i pagamenti dopo la conferma', async () => {
    const id = (await righe<{ id: string }>(U.admin, `insert into public.pds (numero, capitolo_id, data_stipula, valore_stipula) values ('5', $1, '2026-02-01', 10000) returning id`, [cap7120]))[0].id;
    await righe(U.cassiere, `insert into public.pagamenti (pds_id, data, importo, riferimento) values ($1, '2026-03-01', 4000.50, '0000101')`, [id]);
    await righe(U.cassiere, `select public.conferma_saldo($1, '2026-05-10', 5000, null, '0000102')`, [id]);
    const [p] = await righe<{ saldato: boolean; totale_pagato_saldo: string; data_saldo: string }>(U.lettore, 'select saldato, totale_pagato_saldo, data_saldo::text from public.pds where id = $1', [id]);
    expect(p.saldato).toBe(true);
    expect(Number(p.totale_pagato_saldo)).toBe(9000.5);
    expect(await errore(U.cassiere, `insert into public.pagamenti (pds_id, data, importo) values ($1, '2026-06-01', 1)`, [id])).toMatch(/saldato/);
    expect(await errore(U.cassiere, `select public.conferma_saldo($1, '2026-05-11')`, [id])).toMatch(/già stato confermato/);
    // il totale a saldo non si altera con una modifica diretta
    await righe(U.admin, `update public.pds set totale_pagato_saldo = 1 where id = $1`, [id]);
    expect(Number((await righe<{ t: string }>(U.admin, 'select totale_pagato_saldo t from public.pds where id = $1', [id]))[0].t)).toBe(9000.5);
    await righe(U.cassiere, `select public.annulla_saldo($1)`, [id]);
    await righe(U.cassiere, `insert into public.pagamenti (pds_id, data, importo) values ($1, '2026-06-01', 1)`, [id]);
    const [dopo] = await righe<{ saldato: boolean; totale_pagato_saldo: string | null }>(U.admin, 'select saldato, totale_pagato_saldo from public.pds where id = $1', [id]);
    expect(dopo).toEqual({ saldato: false, totale_pagato_saldo: null });
  });

  it('richiede la stipula per il saldo', async () => {
    const id = (await righe<{ id: string }>(U.admin, `insert into public.pds (numero, capitolo_id) values ('6', $1) returning id`, [cap7120]))[0].id;
    expect(await errore(U.admin, `select public.conferma_saldo($1, '2026-05-10')`, [id])).toMatch(/stipula/);
  });
});

describe('schema Supabase: storico modifiche', () => {
  it('registra creazione, campi modificati ed eliminazione', async () => {
    const id = (await righe<{ id: string }>(U.admin, `insert into public.pds (numero, capitolo_id, importo_inviato) values ('7', $1, 1234.56) returning id`, [cap1181]))[0].id;
    await righe(U.operatore, `update public.pds set importo_inviato = 2000, note = 'aggiornato', numero = '7' where id = $1`, [id]);
    await righe(U.cassiere, `insert into public.pagamenti (pds_id, data, importo) values ($1, '2026-03-01', 10)`, [id]);
    const voci = await righe<{ azione: string; entita: string; username: string; riferimento: string; modifiche: Record<string, { da: unknown; a: unknown }> }>(
      U.lettore,
      'select azione, entita, username, riferimento, modifiche from public.registro where pds_id = $1 order by id',
      [id],
    );
    expect(voci.map((v) => `${v.entita}:${v.azione}:${v.username}`)).toEqual(['pds:creazione:admin', 'pds:modifica:operatore', 'pagamento:creazione:cassiere']);
    expect(voci[0].modifiche.importo_inviato).toEqual({ da: null, a: 1234.56 });
    expect(Object.keys(voci[1].modifiche).sort()).toEqual(['importo_inviato', 'note']);
    expect(voci[2].riferimento).toBe('PdS 7/2026');

    // l'eliminazione definitiva è riservata all'amministratore
    expect((await righe(U.operatore, 'delete from public.pds where id = $1 returning id', [id])).length).toBe(0);
    await righe(U.admin, 'delete from public.pds where id = $1', [id]);
    const dopo = await righe<{ entita: string; azione: string }>(U.admin, 'select entita, azione from public.registro where pds_id = $1 order by id', [id]);
    // il pagamento eliminato in cascata non genera una voce separata
    expect(dopo.map((v) => `${v.entita}:${v.azione}`)).toEqual(['pds:creazione', 'pds:modifica', 'pagamento:creazione', 'pds:eliminazione']);
  });

  it('registra l\u2019eliminazione logica e il ripristino del PdS', async () => {
    const id = (await righe<{ id: string }>(U.admin, `insert into public.pds (numero, capitolo_id) values ('9', $1) returning id`, [cap1181]))[0].id;
    // l'operatore ha pds_crea sul capitolo: può spostare il PdS tra gli eliminati
    await righe(U.operatore, 'update public.pds set eliminato_at = now() where id = $1', [id]);
    const [p] = await righe<{ eliminato_at: string | null; eliminato_da: string | null }>(U.admin, 'select eliminato_at, eliminato_da from public.pds where id = $1', [id]);
    expect(p.eliminato_at).not.toBeNull();
    expect(p.eliminato_da).toBe(U.operatore);
    // un PdS eliminato non è modificabile e solo l'amministratore lo ripristina
    expect(await errore(U.operatore, `update public.pds set note = 'x' where id = $1`, [id])).toMatch(/PdS eliminati/);
    expect(await errore(U.operatore, 'update public.pds set eliminato_at = null where id = $1', [id])).toMatch(/amministratore/);
    await righe(U.admin, 'update public.pds set eliminato_at = null where id = $1', [id]);
    expect((await righe<{ eliminato_da: string | null }>(U.admin, 'select eliminato_da from public.pds where id = $1', [id]))[0].eliminato_da).toBeNull();
  });

  it('riserva all\u2019amministratore l\u2019autorizzazione al superamento del finanziato', async () => {
    expect(
      await errore(U.gestore, `update public.capitoli set sforamento_ignorato = true, sforamento_note = 'variazione' where id = $1`, [cap1181]),
    ).toMatch(/row-level security|amministratore/);
    expect(await errore(U.admin, `update public.capitoli set sforamento_ignorato = true where id = $1`, [cap1181])).toMatch(/motivazione/i);
    await righe(U.admin, `update public.capitoli set sforamento_ignorato = true, sforamento_note = ' variazione n. 12 ' where id = $1`, [cap1181]);
    const [c] = await righe<{ sforamento_ignorato: boolean; sforamento_note: string }>(U.lettore, 'select sforamento_ignorato, sforamento_note from public.capitoli where id = $1', [cap1181]);
    expect(c.sforamento_ignorato).toBe(true);
    expect(c.sforamento_note).toBe('variazione n. 12');
    await righe(U.admin, `update public.capitoli set sforamento_ignorato = false where id = $1`, [cap1181]);
    expect((await righe<{ sforamento_note: string }>(U.admin, 'select sforamento_note from public.capitoli where id = $1', [cap1181]))[0].sforamento_note).toBe('');
  });

  it('mostra le voci sugli utenti solo agli amministratori', async () => {
    await righe(U.admin, `update public.profili set nome = 'Lettore Uno' where id = $1`, [U.lettore]);
    expect((await righe(U.admin, `select * from public.registro where entita = 'utente'`)).length).toBeGreaterThan(0);
    expect((await righe(U.lettore, `select * from public.registro where entita = 'utente'`)).length).toBe(0);
  });

  it("espone l'istante dell'ultima modifica solo agli utenti attivi", async () => {
    expect((await righe<{ t: string | null }>(U.lettore, 'select public.ultimo_aggiornamento() t'))[0].t).not.toBeNull();
    expect((await righe<{ t: string | null }>(U.disattivato, 'select public.ultimo_aggiornamento() t'))[0].t).toBeNull();
  });
});

describe('schema Supabase: utenti e capitoli', () => {
  it('consente la gestione dei profili solo agli amministratori e mantiene un admin attivo', async () => {
    expect((await righe(U.operatore, `update public.profili set ruolo = 'admin' where id = $1 returning id`, [U.operatore])).length).toBe(0);
    expect(await errore(U.admin, `update public.profili set username = 'altro' where id = $1`, [U.lettore])).toMatch(/permission denied/);
    expect(await errore(U.admin, `update public.profili set ruolo = 'utente' where id = $1`, [U.admin])).toMatch(/almeno un amministratore/);
  });

  it('inizializza il primo amministratore solo se non ne esiste uno', async () => {
    expect(await errore(U.nuovo, `select public.inizializza_amministratore('Nuovo')`)).toMatch(/Esiste già un amministratore/);
    expect((await righe<{ s: { amministratori: boolean } }>(null, 'select public.stato_installazione() s'))[0].s.amministratori).toBe(true);
  });

  it('impedisce di cambiare esercizio a un capitolo con PdS e copia i capitoli', async () => {
    expect(await errore(U.admin, 'update public.capitoli set esercizio = 2027 where id = $1', [cap1181])).toMatch(/esercizio/);
    const [{ n }] = await righe<{ n: number }>(U.admin, 'select public.copia_capitoli(2026, 2027, false) n');
    expect(n).toBe(2);
    const [{ n: ancora }] = await righe<{ n: number }>(U.admin, 'select public.copia_capitoli(2026, 2027, true) n');
    expect(ancora).toBe(0);
    expect(await errore(U.lettore, 'select public.copia_capitoli(2026, 2028, false)')).toMatch(/row-level security/);
  });
});

describe('schema Supabase: accordi quadro', () => {
  let accordo: string;
  let atto: string;

  it('riserva accordi quadro e atti di adesione a chi ha il permesso', async () => {
    expect(
      await errore(U.operatore, `insert into public.accordi (numero, oggetto, ditta, importo) values ('AQ 1/2026', 'Manutenzioni', 'Edilquattro', 100000)`),
    ).toMatch(/row-level security/);
    accordo = (
      await righe<{ id: string }>(
        U.gestore,
        `insert into public.accordi (numero, oggetto, ditta, protocollo_stipula, data_stipula, durata_giorni, importo)
         values (' AQ 1/2026 ', 'Manutenzioni edili', 'Edilquattro S.r.l.', '0004512', '2026-01-15', 1095, 1000000) returning id`,
      )
    )[0].id;
    // il trigger normalizza gli spazi
    expect((await righe<{ numero: string }>(U.lettore, 'select numero from public.accordi where id = $1', [accordo]))[0].numero).toBe('AQ 1/2026');
    // il protocollo si inserisce come numero puro
    expect(
      await errore(U.gestore, `update public.accordi set protocollo_stipula = 'Prot. 4512' where id = $1`, [accordo]),
    ).toMatch(/violates check constraint/);

    atto = (
      await righe<{ id: string }>(
        U.gestore,
        `insert into public.atti (accordo_id, numero, oggetto, valore) values ($1, 'AdA 1', 'Manutenzioni a chiamata', 300000) returning id`,
        [accordo],
      )
    )[0].id;
    // durata predefinita di 365 giorni
    expect((await righe<{ durata_giorni: number }>(U.lettore, 'select durata_giorni from public.atti where id = $1', [atto]))[0].durata_giorni).toBe(365);
    // senza permesso la modifica non trova righe (RLS) invece di sollevare un errore
    expect((await righe(U.operatore, `update public.atti set valore = 1 where id = $1 returning id`, [atto])).length).toBe(0);
  });

  it('lega il PdS a un atto di adesione del suo stesso accordo quadro', async () => {
    const altro = (
      await righe<{ id: string }>(U.gestore, `insert into public.accordi (numero, oggetto, ditta, importo) values ('AQ 2/2026', 'Impianti', 'Termotecnica', 500000) returning id`)
    )[0].id;
    expect(
      await errore(U.admin, `insert into public.pds (numero, capitolo_id, accordo_id, atto_adesione_id) values ('30', $1, $2, $3)`, [cap1181, altro, atto]),
    ).toMatch(/altro accordo quadro/);
    expect(await errore(U.admin, `insert into public.pds (numero, capitolo_id, atto_adesione_id) values ('31', $1, $2)`, [cap1181, atto])).toMatch(
      /accordo quadro dell'atto/,
    );
    const id = (
      await righe<{ id: string }>(U.admin, `insert into public.pds (numero, capitolo_id, accordo_id, atto_adesione_id) values ('32', $1, $2, $3) returning id`, [
        cap1181,
        accordo,
        atto,
      ])
    )[0].id;
    expect(id).toBeTruthy();
    // un atto di adesione non si sposta su un altro accordo quadro
    expect(await errore(U.gestore, `update public.atti set accordo_id = $1 where id = $2`, [altro, atto])).toMatch(/altro accordo quadro/);
    // l'accordo quadro con PdS collegati non si elimina
    expect(await errore(U.gestore, 'delete from public.accordi where id = $1', [accordo])).toMatch(/foreign key constraint/);
    await righe(U.admin, 'delete from public.pds where id = $1', [id]);
    await righe(U.gestore, 'delete from public.atti where id = $1', [atto]);
    await righe(U.gestore, 'delete from public.accordi where id = $1', [accordo]);
    await righe(U.gestore, 'delete from public.accordi where id = $1', [altro]);
  });
});

describe('schema Supabase: archivio file', () => {
  it('consente il caricamento solo nei PdS su cui si hanno i permessi', async () => {
    const id = (await righe<{ id: string }>(U.admin, `insert into public.pds (numero, capitolo_id) values ('8', $1) returning id`, [cap1181]))[0].id;
    await righe(U.cassiere, `insert into storage.objects (bucket_id, name) values ('allegati', $1)`, [`${id}/abc/fattura.pdf`]);
    expect(await errore(U.lettore, `insert into storage.objects (bucket_id, name) values ('allegati', $1)`, [`${id}/def/fattura.pdf`])).toMatch(/row-level security/);
    expect(await errore(U.cassiere, `insert into storage.objects (bucket_id, name) values ('allegati', 'non-uuid/x/y.pdf')`)).toMatch(/row-level security/);
    expect((await righe(U.lettore, `select * from storage.objects where bucket_id = 'allegati'`)).length).toBe(1);
  });
});
