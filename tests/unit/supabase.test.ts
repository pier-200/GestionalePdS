import { beforeAll, describe, expect, it } from 'vitest';
import { archivioMemoria } from '../../src/backend/archivi';
import { SupabaseBackend } from '../../src/backend/supabase/SupabaseBackend';
import { ErroreApp } from '../../src/domain/errori';
import { PERMESSI_NESSUNO } from '../../src/domain/tipi';
import { MockSupabase } from './mockSupabase';

/**
 * Test dell'adattatore Supabase e della Edge Function "gestione-utenti"
 * contro l'emulatore (PostgREST/Auth/Storage su PostgreSQL reale con lo schema del progetto).
 */

let sb: MockSupabase;
const PWD_ADMIN = 'password-admin-1';

function nuovoBackend() {
  return new SupabaseBackend(
    { tipo: 'supabase', url: sb.url, chiavePubblica: sb.chiavePubblica, dominioEmail: 'pds.local' },
    { fetch: sb.fetch as typeof fetch, archivio: archivioMemoria(), archivioTemporaneo: archivioMemoria() },
  );
}

async function erroreDi(p: Promise<unknown>): Promise<ErroreApp> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroreApp) return e;
    throw e;
  }
  throw new Error('Nessun errore sollevato');
}

async function accedi(username: string, password: string) {
  const b = nuovoBackend();
  const s = await b.accedi(username, password, false);
  await b.caricaDati();
  return { b, s };
}

let admin: SupabaseBackend;

beforeAll(async () => {
  sb = await MockSupabase.crea();
  // Edge Function reale, eseguita con un ambiente Deno simulato
  const env: Record<string, string> = { SUPABASE_URL: sb.url, SUPABASE_SECRET_KEYS: JSON.stringify({ default: sb.chiaveServizio }) };
  let gestore: ((req: Request) => Promise<Response>) | undefined;
  (globalThis as unknown as { Deno: unknown }).Deno = { serve: (h: typeof gestore) => (gestore = h), env: { get: (k: string) => env[k] } };
  globalThis.fetch = sb.fetch as typeof fetch;
  // percorso non tipizzato: il file è codice Deno, verificato a parte con `deno check`
  await import('../../supabase/functions/gestione-utenti/index.ts' as string);
  sb.funzioni.set('gestione-utenti', gestore!);
});

describe('backend Supabase: primo avvio e accesso', () => {
  it("rileva l'assenza di amministratori e configura il primo", async () => {
    const b = nuovoBackend();
    expect((await b.avvia()).tipo).toBe('primo_avvio');
    await sb.creaUtenteAuth('admin@pds.local', PWD_ADMIN);
    const s = await b.primoAvvio({ username: 'admin', nome: 'Anna Ferri', password: PWD_ADMIN });
    expect(s.utente).toMatchObject({ username: 'admin', ruolo: 'admin', nome: 'Anna Ferri' });
    expect((await nuovoBackend().avvia()).tipo).toBe('pronto');
    admin = b;
    await admin.caricaDati();
  });

  it('rifiuta credenziali errate e ripristina la sessione', async () => {
    expect((await erroreDi(nuovoBackend().accedi('admin', 'sbagliata-123', false))).codice).toBe('AUTENTICAZIONE');
    const archivio = archivioMemoria();
    const b1 = new SupabaseBackend(
      { tipo: 'supabase', url: sb.url, chiavePubblica: sb.chiavePubblica, dominioEmail: 'pds.local' },
      { fetch: sb.fetch as typeof fetch, archivio, archivioTemporaneo: archivioMemoria() },
    );
    await b1.accedi('admin', PWD_ADMIN, true);
    const b2 = new SupabaseBackend(
      { tipo: 'supabase', url: sb.url, chiavePubblica: sb.chiavePubblica, dominioEmail: 'pds.local' },
      { fetch: sb.fetch as typeof fetch, archivio, archivioTemporaneo: archivioMemoria() },
    );
    expect((await b2.ripristinaSessione())?.utente.username).toBe('admin');
  });
});

describe('backend Supabase: dati', () => {
  let capitolo: string;
  let pds: string;

  it('salva capitoli, PdS e pagamenti convertendo gli importi', async () => {
    capitolo = (await admin.esegui({ tipo: 'capitolo.crea', dati: { esercizio: 2026, codice: '1181', descrizione: 'Manutenzione', finanziato: 500_000_00, sforamento_ignorato: false, sforamento_note: '' } })).risultato.id!;
    const { risultato, dati } = await admin.esegui({
      tipo: 'pds.crea',
      dati: { numero: '1', capitolo_id: capitolo, importo_inviato: 1_234_56, data_invio: '2026-01-15', modalita_termine: 'durata', durata: 60 },
    });
    pds = risultato.id!;
    const p = dati!.pds.find((x) => x.id === pds)!;
    expect(p).toMatchObject({ importo_inviato: 1_234_56, data_invio: '2026-01-15', durata_unita: 'giorni', created_by: expect.any(String) });
    expect(dati!.capitoli[0].finanziato).toBe(500_000_00);
    await admin.esegui({ tipo: 'pds.modifica', id: pds, modifiche: { data_stipula: '2026-02-01', valore_stipula: 1_200_00 }, originale: { data_stipula: null, valore_stipula: null } });
    await admin.esegui({ tipo: 'pagamento.crea', pds_id: pds, dati: { data: '2026-03-01', importo: 400_10, riferimento: '0000101', note: null } });
    const registro = await admin.caricaRegistro({ pdsId: pds });
    expect(registro.map((v) => `${v.entita}:${v.azione}`)).toEqual(['pagamento:creazione', 'pds:modifica', 'pds:creazione']);
    expect(registro[1].modifiche!.valore_stipula).toEqual({ da: null, a: 1_200_00 });
    expect(registro[0].username).toBe('admin');
  });

  it('conferma e annulla il saldo con pagamento finale', async () => {
    const { dati } = await admin.esegui({ tipo: 'saldo.conferma', pds_id: pds, data_saldo: '2026-05-01', pagamento_finale: { data: '2026-05-01', importo: 799_90, riferimento: '0000102', note: null } });
    const p = dati!.pds.find((x) => x.id === pds)!;
    expect(p).toMatchObject({ saldato: true, totale_pagato_saldo: 1_200_00, data_saldo: '2026-05-01' });
    expect((await erroreDi(admin.esegui({ tipo: 'pagamento.crea', pds_id: pds, dati: { data: '2026-05-02', importo: 1, riferimento: null, note: null } }))).codice).toBe('VINCOLO');
    const dopo = await admin.esegui({ tipo: 'saldo.annulla', pds_id: pds });
    expect(dopo.dati!.pds.find((x) => x.id === pds)!.saldato).toBe(false);
  });

  it('rileva i conflitti e gli aggiornamenti di altri utenti', async () => {
    const { b: secondo } = await accedi('admin', PWD_ADMIN);
    expect(await secondo.ciSonoAggiornamenti()).toBe(false);
    await admin.esegui({ tipo: 'pds.modifica', id: pds, modifiche: { note: 'A' }, originale: { note: null } });
    expect(await secondo.ciSonoAggiornamenti()).toBe(true);
    const e = await erroreDi(secondo.esegui({ tipo: 'pds.modifica', id: pds, modifiche: { note: 'B' }, originale: { note: null } }));
    expect(e.codice).toBe('CONFLITTO');
  });

  it('carica, scarica ed elimina file allegati', async () => {
    const contenuto = new Uint8Array([37, 80, 68, 70, 0, 255]);
    const { dati } = await admin.esegui({
      tipo: 'allegato.crea',
      pds_id: pds,
      dati: { tipo: 'fattura', titolo: 'Fattura', url: null },
      file: { nome: 'fattura n.1.pdf', tipo: 'application/pdf', dimensione: contenuto.length, contenuto: new Blob([contenuto], { type: 'application/pdf' }) },
    });
    const allegato = dati!.allegati.find((a) => a.pds_id === pds)!;
    expect(allegato.file_path).toMatch(new RegExp(`^${pds}/`));
    const scaricato = new Uint8Array(await (await admin.scaricaFile(allegato)).arrayBuffer());
    expect([...scaricato]).toEqual([...contenuto]);
    await admin.esegui({ tipo: 'allegato.elimina', id: allegato.id });
    expect(sb.file.size).toBe(0);
  });
});

describe('backend Supabase: utenti e permessi lato server', () => {
  let idMario: string;

  it("crea utenti con la Edge Function e applica l'ambito dei permessi", async () => {
    const cap7120 = (await admin.esegui({ tipo: 'capitolo.crea', dati: { esercizio: 2026, codice: '7120', descrizione: '', finanziato: 0, sforamento_ignorato: false, sforamento_note: '' } })).risultato.id!;
    const pdsFuori = (await admin.esegui({ tipo: 'pds.crea', dati: { numero: '2', capitolo_id: cap7120 } })).risultato.id!;
    idMario = (
      await admin.esegui({
        tipo: 'utente.crea',
        dati: { username: 'mario.rossi', nome: 'Mario Rossi', ruolo: 'utente', attivo: true, permessi: { ...PERMESSI_NESSUNO, pds_dati: true, ambito_capitoli: ['1181'] } },
        password: 'password-mario-1',
      })
    ).risultato.id!;
    const { b: mario, s } = await accedi('mario.rossi', 'password-mario-1');
    expect(s.utente.permessi).toMatchObject({ pds_dati: true, ambito_capitoli: ['1181'] });
    const dati = await mario.caricaDati();
    const pdsDentro = dati.pds.find((p) => p.numero === '1')!;
    await mario.esegui({ tipo: 'pds.modifica', id: pdsDentro.id, modifiche: { ordinativo: 'ODA-9' }, originale: { ordinativo: null } });
    expect((await erroreDi(mario.esegui({ tipo: 'pds.modifica', id: pdsFuori, modifiche: { note: 'x' }, originale: { note: null } }))).codice).toBe('PERMESSO_NEGATO');
    expect((await erroreDi(mario.esegui({ tipo: 'capitolo.crea', dati: { esercizio: 2027, codice: '1', descrizione: '', finanziato: 0, sforamento_ignorato: false, sforamento_note: '' } }))).codice).toBe('PERMESSO_NEGATO');
    expect((await erroreDi(mario.esegui({ tipo: 'utente.password', id: idMario, password: 'altra-password-1' }))).codice).toBe('PERMESSO_NEGATO');
    // le operazioni sono passate davvero da Edge Function, Auth amministrativa e PostgREST
    expect(sb.richieste).toEqual(
      expect.arrayContaining([
        'POST /functions/v1/gestione-utenti',
        'POST /auth/v1/admin/users',
        expect.stringMatching(/^PATCH \/rest\/v1\/pds\?.*ordinativo=is\.null/),
        expect.stringMatching(/^POST \/rest\/v1\/rpc\/conferma_saldo/),
      ]),
    );
  });

  it('il database respinge le modifiche anche se i permessi nel browser non sono aggiornati', async () => {
    const { b: mario } = await accedi('mario.rossi', 'password-mario-1');
    const pdsDentro = (await mario.caricaDati()).pds.find((p) => p.numero === '1')!;
    // l'amministratore revoca il permesso; il browser di Mario ha ancora i dati vecchi
    await admin.esegui({ tipo: 'utente.modifica', id: idMario, modifiche: { permessi: { ...PERMESSI_NESSUNO } } });
    const e = await erroreDi(mario.esegui({ tipo: 'pds.modifica', id: pdsDentro.id, modifiche: { idv: 'IDV-1' }, originale: { idv: null } }));
    expect(['CONFLITTO', 'PERMESSO_NEGATO']).toContain(e.codice);
    const verifica = (await admin.caricaDati()).pds.find((p) => p.id === pdsDentro.id)!;
    expect(verifica.idv).toBeNull();
  });

  it('reimposta password, disattiva ed elimina utenti', async () => {
    await admin.esegui({ tipo: 'utente.password', id: idMario, password: 'password-mario-2' });
    expect((await erroreDi(accedi('mario.rossi', 'password-mario-1'))).codice).toBe('AUTENTICAZIONE');
    const { b: mario } = await accedi('mario.rossi', 'password-mario-2');
    await mario.cambiaPassword('password-mario-2', 'password-mario-3');
    await accedi('mario.rossi', 'password-mario-3');

    await admin.esegui({ tipo: 'utente.modifica', id: idMario, modifiche: { attivo: false } });
    const e = await erroreDi(accedi('mario.rossi', 'password-mario-3'));
    expect(e.message).toMatch(/disattivato/);

    const registroUtenti = await admin.caricaRegistro({ entita: 'utente' });
    expect(registroUtenti.some((v) => v.modifiche?.password)).toBe(true);

    await admin.esegui({ tipo: 'utente.elimina', id: idMario });
    expect((await erroreDi(accedi('mario.rossi', 'password-mario-3'))).codice).toBe('AUTENTICAZIONE');
    expect((await erroreDi(admin.esegui({ tipo: 'utente.elimina', id: (await admin.caricaDati()).utenti[0].id }))).codice).toBe('VINCOLO');
  });

  it("sposta il PdS tra gli eliminati e lo elimina definitivamente con i file", async () => {
    const dati = await admin.caricaDati();
    const p = dati.pds.find((x) => x.numero === '1')!;
    await admin.esegui({
      tipo: 'allegato.crea',
      pds_id: p.id,
      dati: { tipo: 'altro', titolo: 'Verbale', url: null },
      file: { nome: 'verbale.txt', tipo: 'text/plain', dimensione: 3, contenuto: new Blob(['abc']) },
    });
    expect(sb.file.size).toBe(1);
    // eliminazione logica: il PdS resta con i suoi file
    await admin.esegui({ tipo: 'pds.elimina', id: p.id });
    expect(sb.file.size).toBe(1);
    expect((await admin.caricaDati()).pds.find((x) => x.id === p.id)!.eliminato_at).not.toBeNull();
    // ripristino e poi eliminazione definitiva
    await admin.esegui({ tipo: 'pds.ripristina', id: p.id });
    expect((await admin.caricaDati()).pds.find((x) => x.id === p.id)!.eliminato_at).toBeNull();
    await admin.esegui({ tipo: 'pds.elimina', id: p.id });
    await admin.esegui({ tipo: 'pds.elimina_definitivo', id: p.id });
    expect(sb.file.size).toBe(0);
    expect((await admin.caricaDati()).pds.some((x) => x.id === p.id)).toBe(false);
  });
});
