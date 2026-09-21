import { beforeEach, describe, expect, it } from 'vitest';
import { archivioMemoria } from '../../src/backend/archivi';
import { GitHubBackend } from '../../src/backend/github/GitHubBackend';
import { ErroreApp } from '../../src/domain/errori';
import { PERMESSI_NESSUNO } from '../../src/domain/tipi';
import { MockGitHub } from './mockGitHub';

const CONFIG = { tipo: 'github', owner: 'ufficio', repoDati: 'pds-dati', repoAccessi: 'pds-accessi', branch: 'main' } as const;
const TOKEN = 'github_pat_TOKEN_UNO_segreto';
const TOKEN_2 = 'github_pat_TOKEN_DUE_segreto';
const PWD_ADMIN = 'password-admin-1';

let gh: MockGitHub;

function nuovoBackend() {
  return new GitHubBackend(CONFIG, { fetch: gh.fetch, archivio: archivioMemoria(), archivioTemporaneo: archivioMemoria(), iterazioni: 1000 });
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

async function configura() {
  const b = nuovoBackend();
  expect((await b.avvia()).tipo).toBe('primo_avvio');
  const sessione = await b.primoAvvio({ token: TOKEN, username: 'Admin', nome: 'Anna Ferri', password: PWD_ADMIN });
  return { b, sessione };
}

async function accedi(username: string, password: string) {
  const b = nuovoBackend();
  expect((await b.avvia()).tipo).toBe('pronto');
  const s = await b.accedi(username, password, false);
  return { b, s };
}

beforeEach(() => {
  gh = new MockGitHub();
  gh.creaRepo('ufficio/pds-dati', true);
  gh.creaRepo('ufficio/pds-accessi', false);
  gh.tokenValidi.add(TOKEN);
});

describe('backend GitHub: configurazione e accesso', () => {
  it('configura il portachiavi senza esporre token e nomi utente', async () => {
    const { sessione } = await configura();
    expect(sessione.utente).toMatchObject({ username: 'admin', ruolo: 'admin', attivo: true });
    const keyring = gh.leggiFile('ufficio/pds-accessi', 'keyring.json')!;
    expect(keyring).not.toContain(TOKEN);
    expect(keyring).not.toContain('admin');
    expect(gh.elencoFile('ufficio/pds-dati')).toEqual(
      expect.arrayContaining(['README.md', 'db/utenti.json', 'db/capitoli.json', 'db/pds.json', 'db/pagamenti.json', 'db/allegati.json']),
    );
  });

  it('consente l’accesso solo con credenziali corrette', async () => {
    await configura();
    const { s } = await accedi('admin', PWD_ADMIN);
    expect(s.utente.nome).toBe('Anna Ferri');
    expect((await erroreDi(accedi('admin', 'password-sbagliata-1'))).codice).toBe('AUTENTICAZIONE');
    expect((await erroreDi(accedi('sconosciuto', PWD_ADMIN))).codice).toBe('AUTENTICAZIONE');
  });

  it('rifiuta un repository dei dati pubblico', async () => {
    gh.repos.get('ufficio/pds-dati')!.private = false;
    const b = nuovoBackend();
    const e = await erroreDi(b.primoAvvio({ token: TOKEN, username: 'admin', nome: 'A', password: PWD_ADMIN }));
    expect(e.codice).toBe('CONFIGURAZIONE');
    expect(e.message).toMatch(/pubblico/);
  });

  it('funziona anche se raw.githubusercontent.com è bloccato', async () => {
    await configura();
    gh.rawBloccato = true;
    const { s } = await accedi('admin', PWD_ADMIN);
    expect(s.utente.username).toBe('admin');
  });

  it('ripristina la sessione salvata', async () => {
    await configura();
    const archivio = archivioMemoria();
    const b1 = new GitHubBackend(CONFIG, { fetch: gh.fetch, archivio, archivioTemporaneo: archivioMemoria(), iterazioni: 1000 });
    await b1.accedi('admin', PWD_ADMIN, true);
    const b2 = new GitHubBackend(CONFIG, { fetch: gh.fetch, archivio, archivioTemporaneo: archivioMemoria(), iterazioni: 1000 });
    expect((await b2.ripristinaSessione())?.utente.username).toBe('admin');
  });
});

describe('backend GitHub: salvataggio dei dati', () => {
  it('salva in commit atomici leggibili da un altro browser, con registro', async () => {
    const { b } = await configura();
    const capitolo = (await b.esegui({ tipo: 'capitolo.crea', dati: { esercizio: 2026, codice: '1181', descrizione: 'Manutenzione', finanziato: 500_000_00, sforamento_ignorato: false, sforamento_note: '' } })).risultato.id!;
    const pds = (await b.esegui({ tipo: 'pds.crea', dati: { numero: '1', capitolo_id: capitolo, importo_inviato: 1000 } })).risultato.id!;
    await b.esegui({ tipo: 'pagamento.crea', pds_id: pds, dati: { data: '2026-03-01', importo: 500, riferimento: '0000101', note: null } });

    const { b: altro } = await accedi('admin', PWD_ADMIN);
    const dati = await altro.caricaDati();
    expect(dati.pds.map((p) => p.numero)).toEqual(['1']);
    expect(dati.pagamenti[0].importo).toBe(500);
    const registro = await altro.caricaRegistro({ pdsId: pds });
    expect(registro.map((v) => `${v.entita}:${v.azione}`)).toEqual(['pagamento:creazione', 'pds:creazione']);
    expect(gh.messaggiCommit('ufficio/pds-dati')[0]).toMatch(/^admin: Creazione – Pagamento PdS 1\/2026/);
    expect(await altro.ciSonoAggiornamenti()).toBe(false);
    await b.esegui({ tipo: 'capitolo.modifica', id: capitolo, modifiche: { descrizione: 'Nuova' }, originale: { descrizione: 'Manutenzione' } });
    expect(await altro.ciSonoAggiornamenti()).toBe(true);
  });

  it('unisce modifiche concorrenti a campi diversi', async () => {
    const { b } = await configura();
    const capitolo = (await b.esegui({ tipo: 'capitolo.crea', dati: { esercizio: 2026, codice: '1', descrizione: '', finanziato: 0, sforamento_ignorato: false, sforamento_note: '' } })).risultato.id!;
    const pds = (await b.esegui({ tipo: 'pds.crea', dati: { numero: '7', capitolo_id: capitolo } })).risultato.id!;
    const { b: secondo } = await accedi('admin', PWD_ADMIN);
    await secondo.caricaDati();
    await b.esegui({ tipo: 'pds.modifica', id: pds, modifiche: { note: 'dal primo' }, originale: { note: null } });
    // il secondo browser ha dati vecchi: il salvataggio viene ripetuto sui dati aggiornati
    await secondo.esegui({ tipo: 'pds.modifica', id: pds, modifiche: { ordinativo: 'ODA-1' }, originale: { ordinativo: null } });
    const { b: terzo } = await accedi('admin', PWD_ADMIN);
    const p = (await terzo.caricaDati()).pds[0];
    expect(p.note).toBe('dal primo');
    expect(p.ordinativo).toBe('ODA-1');
  });

  it('segnala il conflitto sullo stesso campo invece di sovrascrivere', async () => {
    const { b } = await configura();
    const capitolo = (await b.esegui({ tipo: 'capitolo.crea', dati: { esercizio: 2026, codice: '1', descrizione: '', finanziato: 0, sforamento_ignorato: false, sforamento_note: '' } })).risultato.id!;
    const pds = (await b.esegui({ tipo: 'pds.crea', dati: { numero: '7', capitolo_id: capitolo } })).risultato.id!;
    const { b: secondo } = await accedi('admin', PWD_ADMIN);
    await secondo.caricaDati();
    await b.esegui({ tipo: 'pds.modifica', id: pds, modifiche: { note: 'A' }, originale: { note: null } });
    const e = await erroreDi(secondo.esegui({ tipo: 'pds.modifica', id: pds, modifiche: { note: 'B' }, originale: { note: null } }));
    expect(e.codice).toBe('CONFLITTO');
  });

  it('carica e scarica file allegati e li rimuove con l\u2019eliminazione definitiva del PdS', async () => {
    const { b } = await configura();
    const capitolo = (await b.esegui({ tipo: 'capitolo.crea', dati: { esercizio: 2026, codice: '1', descrizione: '', finanziato: 0, sforamento_ignorato: false, sforamento_note: '' } })).risultato.id!;
    const pds = (await b.esegui({ tipo: 'pds.crea', dati: { numero: '7', capitolo_id: capitolo } })).risultato.id!;
    const contenuto = new Uint8Array([0, 1, 2, 250, 255, 37, 80, 68, 70]);
    const { dati } = await b.esegui({
      tipo: 'allegato.crea',
      pds_id: pds,
      dati: { tipo: 'fattura', titolo: 'Fattura', url: null },
      file: { nome: 'fattura 1.pdf', tipo: 'application/pdf', dimensione: contenuto.length, contenuto: new Blob([contenuto]) },
    });
    const allegato = dati!.allegati[0];
    expect(gh.elencoFile('ufficio/pds-dati')).toContain(allegato.file_path);
    const { b: altro } = await accedi('admin', PWD_ADMIN);
    const scaricato = new Uint8Array(await (await altro.scaricaFile(allegato)).arrayBuffer());
    expect([...scaricato]).toEqual([...contenuto]);
    await b.esegui({ tipo: 'pds.elimina', id: pds });
    expect(gh.elencoFile('ufficio/pds-dati')).toContain(allegato.file_path);
    await b.esegui({ tipo: 'pds.elimina_definitivo', id: pds });
    expect(gh.elencoFile('ufficio/pds-dati')).not.toContain(allegato.file_path);
  });
});

describe('backend GitHub: utenti e credenziali', () => {
  it('crea utenti, reimposta password, disattiva, riattiva ed elimina', async () => {
    const { b } = await configura();
    const nuovo = { username: 'mario.rossi', nome: 'Mario Rossi', ruolo: 'utente' as const, attivo: true, permessi: { ...PERMESSI_NESSUNO, pds_dati: true } };
    const id = (await b.esegui({ tipo: 'utente.crea', dati: nuovo, password: 'password-mario-1' })).risultato.id!;
    const { b: mario, s } = await accedi('mario.rossi', 'password-mario-1');
    expect(s.utente.permessi.pds_dati).toBe(true);
    expect((await erroreDi(mario.ruotaToken(TOKEN_2))).codice).toBe('PERMESSO_NEGATO');
    expect((await erroreDi(mario.esegui({ tipo: 'utente.password', id, password: 'altra-password-1' }))).codice).toBe('PERMESSO_NEGATO');

    await b.esegui({ tipo: 'utente.password', id, password: 'password-mario-2' });
    expect((await erroreDi(accedi('mario.rossi', 'password-mario-1'))).codice).toBe('AUTENTICAZIONE');
    await accedi('mario.rossi', 'password-mario-2');

    await b.esegui({ tipo: 'utente.modifica', id, modifiche: { attivo: false } });
    expect((await erroreDi(accedi('mario.rossi', 'password-mario-2'))).codice).toBe('AUTENTICAZIONE');

    await b.esegui({ tipo: 'utente.modifica', id, modifiche: { attivo: true, ruolo: 'admin' } });
    await b.esegui({ tipo: 'utente.password', id, password: 'password-mario-3' });
    const { b: marioAdmin } = await accedi('mario.rossi', 'password-mario-3');
    // da amministratore può gestire le credenziali altrui
    await marioAdmin.esegui({ tipo: 'utente.crea', dati: { ...nuovo, username: 'l.verdi', nome: 'Laura Verdi' }, password: 'password-laura-1' });
    await accedi('l.verdi', 'password-laura-1');

    await b.esegui({ tipo: 'utente.elimina', id });
    expect((await erroreDi(accedi('mario.rossi', 'password-mario-3'))).codice).toBe('AUTENTICAZIONE');
  });

  it("permette all'utente di cambiare la propria password", async () => {
    const { b } = await configura();
    await b.esegui({ tipo: 'utente.crea', dati: { username: 'ospite', nome: 'Ospite', ruolo: 'utente', attivo: true, permessi: { ...PERMESSI_NESSUNO } }, password: 'password-ospite-1' });
    const { b: ospite } = await accedi('ospite', 'password-ospite-1');
    expect((await erroreDi(ospite.cambiaPassword('errata-password-1', 'password-ospite-2'))).codice).toBe('AUTENTICAZIONE');
    await ospite.cambiaPassword('password-ospite-1', 'password-ospite-2');
    await accedi('ospite', 'password-ospite-2');
    expect((await erroreDi(accedi('ospite', 'password-ospite-1'))).codice).toBe('AUTENTICAZIONE');
  });

  it("con token scaduto l'amministratore lo rinnova dalla pagina di accesso", async () => {
    const { b } = await configura();
    await b.esegui({ tipo: 'utente.crea', dati: { username: 'ospite', nome: 'Ospite', ruolo: 'utente', attivo: true, permessi: { ...PERMESSI_NESSUNO } }, password: 'password-ospite-1' });
    gh.tokenValidi.delete(TOKEN); // il token scade
    expect((await erroreDi(accedi('ospite', 'password-ospite-1'))).message).toMatch(/l'amministratore deve rinnovarlo/);
    expect((await erroreDi(accedi('admin', PWD_ADMIN))).codice).toBe('TOKEN_SCADUTO');
    gh.tokenValidi.add(TOKEN_2);
    const nuovo = nuovoBackend();
    await nuovo.avvia();
    const s = await nuovo.rinnovaTokenEAccedi('admin', PWD_ADMIN, TOKEN_2, false);
    expect(s.utente.ruolo).toBe('admin');
    await accedi('ospite', 'password-ospite-1');
    expect((await erroreDi(nuovoBackend().rinnovaTokenEAccedi('ospite', 'password-ospite-1', TOKEN_2, false))).codice).toBe('PERMESSO_NEGATO');
  });

  it('sostituisce il token: le password restano valide e le vecchie sessioni decadono', async () => {
    const { b } = await configura();
    await b.esegui({ tipo: 'utente.crea', dati: { username: 'ospite', nome: 'Ospite', ruolo: 'utente', attivo: true, permessi: { ...PERMESSI_NESSUNO } }, password: 'password-ospite-1' });
    const { b: vecchiaSessione } = await accedi('ospite', 'password-ospite-1');
    const keyringPrima = gh.leggiFile('ufficio/pds-accessi', 'keyring.json')!;

    gh.tokenValidi.add(TOKEN_2);
    await b.ruotaToken(TOKEN_2);
    gh.tokenValidi.delete(TOKEN); // revoca del vecchio token su GitHub

    const keyringDopo = gh.leggiFile('ufficio/pds-accessi', 'keyring.json')!;
    expect(keyringDopo).not.toBe(keyringPrima);
    expect(keyringDopo).not.toContain(TOKEN_2);
    const { b: ospite } = await accedi('ospite', 'password-ospite-1');
    expect((await ospite.caricaDati()).utenti.length).toBe(2);
    // l'amministratore continua a lavorare con il nuovo token
    await b.esegui({ tipo: 'capitolo.crea', dati: { esercizio: 2026, codice: '9', descrizione: '', finanziato: 0, sforamento_ignorato: false, sforamento_note: '' } });
    expect((await erroreDi(vecchiaSessione.caricaDati(true))).codice).toBe('AUTENTICAZIONE');
  });
});
