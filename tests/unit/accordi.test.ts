import { beforeEach, describe, expect, it } from 'vitest';
import { importoImpegnato, scadenzaContrattuale, visteAccordi } from '../../src/domain/accordi';
import { vistePds } from '../../src/domain/calcoli';
import type { Comando } from '../../src/domain/comandi';
import { ErroreApp } from '../../src/domain/errori';
import type { DatiCondivisi, Utente } from '../../src/domain/tipi';
import { PERMESSI_NESSUNO, PERMESSI_TUTTI, datiVuoti } from '../../src/domain/tipi';
import { applicaComando, type ContestoComando, type EsitoMotore } from '../../src/motore/motore';

const T = '2026-01-01T00:00:00.000Z';
const OGGI = '2026-06-01';
let contatore = 0;

function ctx(utenteId: string): ContestoComando {
  return {
    utenteId,
    ora: '2026-06-01T10:00:00.000Z',
    nuovoId: () => `id-${++contatore}`,
    percorsoFile: (p, a, nome) => `file/${p}/${a}/${nome}`,
  };
}

function utente(id: string, parziale: Partial<Utente> = {}): Utente {
  return { id, username: id, nome: id, ruolo: 'utente', attivo: true, permessi: { ...PERMESSI_NESSUNO }, created_at: T, updated_at: T, ...parziale };
}

let dati: DatiCondivisi;

function esegui(utenteId: string, comando: Comando): EsitoMotore {
  const esito = applicaComando(dati, comando, ctx(utenteId));
  dati = esito.dati;
  return esito;
}

function errore(fn: () => unknown): ErroreApp {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErroreApp) return e;
    throw e;
  }
  throw new Error('Nessun errore sollevato');
}

const DATI_ACCORDO = {
  numero: 'AQ 1/2026',
  oggetto: 'Manutenzioni edili',
  ditta: 'Edilquattro S.r.l.',
  dec: 'Ing. Bianchi',
  protocollo_stipula: '0004512',
  data_stipula: '2026-01-15',
  durata_giorni: 1095,
  importo: 1_000_000_00,
  note: null,
};

const DATI_ATTO = {
  numero: 'AdA 1',
  oggetto: 'Manutenzioni a chiamata',
  protocollo_stipula: '0006120',
  data_stipula: '2026-02-01',
  durata_giorni: 365,
  valore: 300_000_00,
  note: null,
};

beforeEach(() => {
  contatore = 0;
  dati = {
    ...datiVuoti(),
    utenti: [
      utente('admin', { ruolo: 'admin', permessi: { ...PERMESSI_TUTTI } }),
      utente('contratti', { permessi: { ...PERMESSI_NESSUNO, accordi: true, pds_crea: true, pds_dati: true } }),
      utente('lettore'),
    ],
  };
});

function preparaBase() {
  const capitolo = esegui('admin', {
    tipo: 'capitolo.crea',
    dati: { esercizio: 2026, codice: '1181', descrizione: '', finanziato: 500_000_00, sforamento_ignorato: false, sforamento_note: '' },
  }).risultato.id!;
  const accordo = esegui('contratti', { tipo: 'accordo.crea', dati: DATI_ACCORDO }).risultato.id!;
  const atto = esegui('contratti', { tipo: 'atto.crea', accordo_id: accordo, dati: DATI_ATTO }).risultato.id!;
  return { capitolo, accordo, atto };
}

describe('accordi quadro: comandi', () => {
  it('crea accordo e atto di adesione registrando l’operazione', () => {
    const esitoAccordo = esegui('contratti', { tipo: 'accordo.crea', dati: DATI_ACCORDO });
    expect(dati.accordi).toHaveLength(1);
    expect(esitoAccordo.voci[0]).toMatchObject({ entita: 'accordo', azione: 'creazione', riferimento: 'AQ 1/2026' });

    const esitoAtto = esegui('contratti', { tipo: 'atto.crea', accordo_id: esitoAccordo.risultato.id!, dati: DATI_ATTO });
    expect(dati.atti).toHaveLength(1);
    expect(dati.atti[0].durata_giorni).toBe(365);
    expect(esitoAtto.voci[0]).toMatchObject({ entita: 'atto', azione: 'creazione', riferimento: 'AdA 1 (AQ AQ 1/2026)' });
  });

  it('richiede il permesso sugli accordi quadro', () => {
    expect(errore(() => esegui('lettore', { tipo: 'accordo.crea', dati: DATI_ACCORDO })).codice).toBe('PERMESSO_NEGATO');
  });

  it('impedisce numeri duplicati', () => {
    esegui('contratti', { tipo: 'accordo.crea', dati: DATI_ACCORDO });
    expect(errore(() => esegui('contratti', { tipo: 'accordo.crea', dati: DATI_ACCORDO })).codice).toBe('DUPLICATO');
    const accordo = dati.accordi[0].id;
    esegui('contratti', { tipo: 'atto.crea', accordo_id: accordo, dati: DATI_ATTO });
    expect(errore(() => esegui('contratti', { tipo: 'atto.crea', accordo_id: accordo, dati: DATI_ATTO })).codice).toBe('DUPLICATO');
  });

  it('rifiuta protocolli non numerici', () => {
    const e = errore(() => esegui('contratti', { tipo: 'accordo.crea', dati: { ...DATI_ACCORDO, protocollo_stipula: 'Prot. 4512/2026' } }));
    expect(e.codice).toBe('VALIDAZIONE');
    expect(e.message).toMatch(/solo il numero di protocollo/);
  });

  it('non elimina accordi e atti ancora collegati', () => {
    const { capitolo, accordo, atto } = preparaBase();
    esegui('contratti', { tipo: 'pds.crea', dati: { numero: '1', capitolo_id: capitolo, accordo_id: accordo, atto_adesione_id: atto } });
    expect(errore(() => esegui('contratti', { tipo: 'atto.elimina', id: atto })).codice).toBe('VINCOLO');
    expect(errore(() => esegui('contratti', { tipo: 'accordo.elimina', id: accordo })).codice).toBe('VINCOLO');
  });

  it('accetta un atto di adesione solo sull’accordo quadro indicato', () => {
    const { capitolo, accordo, atto } = preparaBase();
    const altro = esegui('contratti', { tipo: 'accordo.crea', dati: { ...DATI_ACCORDO, numero: 'AQ 2/2026' } }).risultato.id!;
    expect(
      errore(() => esegui('contratti', { tipo: 'pds.crea', dati: { numero: '2', capitolo_id: capitolo, accordo_id: altro, atto_adesione_id: atto } })).message,
    ).toMatch(/altro accordo quadro/);
    expect(errore(() => esegui('contratti', { tipo: 'pds.crea', dati: { numero: '3', capitolo_id: capitolo, atto_adesione_id: atto } })).message).toMatch(
      /Indicare l'accordo quadro/,
    );
    // togliendo l'accordo quadro si scollega anche l'atto di adesione
    const id = esegui('contratti', { tipo: 'pds.crea', dati: { numero: '4', capitolo_id: capitolo, accordo_id: accordo, atto_adesione_id: atto } }).risultato.id!;
    esegui('contratti', { tipo: 'pds.modifica', id, modifiche: { accordo_id: null }, originale: { accordo_id: accordo } });
    const p = dati.pds.find((x) => x.id === id)!;
    expect(p.accordo_id).toBeNull();
    expect(p.atto_adesione_id).toBeNull();
  });
});

describe('accordi quadro: situazione contrattuale', () => {
  it('impegna la capienza con gli atti e con gli ordinativi diretti', () => {
    const { capitolo, accordo, atto } = preparaBase();
    // ordinativo sull'atto di adesione: consuma la quota dell'atto, non altra capienza
    esegui('contratti', {
      tipo: 'pds.crea',
      dati: {
        numero: '1',
        capitolo_id: capitolo,
        accordo_id: accordo,
        atto_adesione_id: atto,
        importo_inviato: 120_000_00,
        data_invio: '2026-03-01',
        valore_stipula: 115_000_00,
        data_stipula: '2026-03-20',
      },
    });
    // atto di adesione a quantità determinata: PdS collegato direttamente all'AQ
    esegui('contratti', {
      tipo: 'pds.crea',
      dati: { numero: '2', capitolo_id: capitolo, accordo_id: accordo, importo_inviato: 80_000_00, data_invio: '2026-04-01' },
    });

    const viste = vistePds(dati, OGGI, 30);
    const [v] = visteAccordi(dati.accordi, dati.atti, viste, OGGI);

    expect(v.impegnatoAtti).toBe(300_000_00);
    expect(v.impegnatoDiretto).toBe(80_000_00);
    expect(v.impegnato).toBe(380_000_00);
    expect(v.residuo).toBe(620_000_00);
    expect(v.nPds).toBe(2);
    expect(v.atti[0].impegnato).toBe(115_000_00);
    expect(v.atti[0].residuo).toBe(185_000_00);
    expect(v.scadenza).toBe(scadenzaContrattuale('2026-01-15', 1095));
    expect(v.atti[0].scadenza).toBe('2027-02-01');
  });

  it('segnala il superamento della capienza contrattuale', () => {
    const { capitolo, accordo } = preparaBase();
    esegui('contratti', {
      tipo: 'pds.crea',
      dati: { numero: '9', capitolo_id: capitolo, accordo_id: accordo, importo_inviato: 800_000_00, data_invio: '2026-04-01' },
    });
    const [v] = visteAccordi(dati.accordi, dati.atti, vistePds(dati, OGGI, 30), OGGI);
    expect(v.impegnato).toBe(1_100_000_00);
    expect(v.superamento).toBe(100_000_00);
    expect(v.residuo).toBe(-100_000_00);
  });

  it('usa il valore di stipula quando c’è, altrimenti l’importo trasmesso', () => {
    const { capitolo, accordo } = preparaBase();
    const soloInviato = esegui('contratti', {
      tipo: 'pds.crea',
      dati: { numero: '5', capitolo_id: capitolo, accordo_id: accordo, importo_inviato: 50_000_00, data_invio: '2026-04-01', valore_stipula: 48_000_00 },
    }).risultato.id!;
    const viste = vistePds(dati, OGGI, 30);
    const v = viste.find((x) => x.pds.id === soloInviato)!;
    // senza data di stipula vale l'importo trasmesso
    expect(importoImpegnato(v)).toBe(50_000_00);
    esegui('contratti', { tipo: 'pds.modifica', id: soloInviato, modifiche: { data_stipula: '2026-04-20' }, originale: { data_stipula: null } });
    const dopo = vistePds(dati, OGGI, 30).find((x) => x.pds.id === soloInviato)!;
    expect(importoImpegnato(dopo)).toBe(48_000_00);
  });
});
