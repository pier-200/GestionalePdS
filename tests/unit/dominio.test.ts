import { describe, expect, it } from 'vitest';
import { numeroPds, vistePds } from '../../src/domain/calcoli';
import { aggiungiDurata, aggiungiMesi, differenzaGiorni, formattaData, isDataISO, oggiISO } from '../../src/domain/date';
import { centesimiDaEuro, formattaEuro, formattaEuroCompatto, formattaPercentuale, parseImporto, valoreImportoDaInput } from '../../src/domain/importi';
import { puo } from '../../src/domain/permessi';
import { calcolaSintesi, sforamentoDaSegnalare } from '../../src/domain/sintesi';
import { avvisoScadenza, dataScadenza, statoPds } from '../../src/domain/stato';
import type { Capitolo, DatiCondivisi, Pagamento, Pds, Utente } from '../../src/domain/tipi';
import { PERMESSI_NESSUNO } from '../../src/domain/tipi';
import { avvisiCoerenzaPds, errorePassword, validaDatiCapitolo, validaDatiPds } from '../../src/domain/validazione';

const T = '2026-01-01T00:00:00.000Z';
const tracc = { created_at: T, created_by: null, updated_at: T, updated_by: null };

function capitolo(id: string, codice: string, esercizio: number, finanziato: number, sforamentoNote = ''): Capitolo {
  return { id, codice, esercizio, descrizione: '', finanziato, sforamento_ignorato: sforamentoNote !== '', sforamento_note: sforamentoNote, ...tracc };
}

function pds(parziale: Partial<Pds> & Pick<Pds, 'id' | 'capitolo_id'>): Pds {
  return {
    numero: parziale.id,
    accordo_id: null,
    atto_adesione_id: null,
    ditta: null,
    ordinativo: null,
    idv: null,
    dec: null,
    importo_inviato: null,
    protocollo_invio: null,
    data_invio: null,
    protocollo_stipula: null,
    data_stipula: null,
    valore_stipula: null,
    modalita_termine: null,
    durata: null,
    durata_unita: null,
    data_termine: null,
    saldato: false,
    data_saldo: null,
    totale_pagato_saldo: null,
    note: null,
    eliminato_at: null,
    eliminato_da: null,
    ...tracc,
    ...parziale,
  };
}

function pagamento(id: string, pds_id: string, importo: number, data = '2026-03-01'): Pagamento {
  return { id, pds_id, importo, data, riferimento: null, note: null, ...tracc };
}

describe('importi', () => {
  it('formatta in euro con separatori italiani anche sotto 10.000', () => {
    expect(formattaEuro(123456)).toBe('1.234,56 €');
    expect(formattaEuro(1234567890)).toBe('12.345.678,90 €');
    expect(formattaEuro(5)).toBe('0,05 €');
    expect(formattaEuro(-150)).toBe('-1,50 €');
    expect(formattaEuro(null)).toBe('—');
  });

  it('converte da euro a centesimi senza errori binari', () => {
    expect(centesimiDaEuro(1.005)).toBe(101);
    expect(centesimiDaEuro(0.1 + 0.2)).toBe(30);
    expect(centesimiDaEuro(19.99)).toBe(1999);
  });

  it('converte il valore del campo importo senza moltiplicarlo', () => {
    expect(valoreImportoDaInput(8000)).toBe(800000);
    expect(valoreImportoDaInput('8000.00')).toBe(800000);
    expect(valoreImportoDaInput('1234.5')).toBe(123450);
    expect(valoreImportoDaInput('12.')).toBe(1200);
    expect(valoreImportoDaInput('')).toBeNull();
    expect(valoreImportoDaInput('-')).toBeNull();
  });

  it('interpreta importi digitati', () => {
    expect(parseImporto('1.234,56')).toBe(123456);
    expect(parseImporto('€ 1.234')).toBe(123400);
    expect(parseImporto('1234,5')).toBe(123450);
    expect(parseImporto('1234.56')).toBe(123456);
    expect(parseImporto('12.50')).toBe(1250);
    expect(parseImporto('1.234.567,00')).toBe(123456700);
    expect(parseImporto('abc')).toBeNull();
    expect(parseImporto('1,234,5')).toBeNull();
    expect(parseImporto('1,234')).toBeNull();
  });

  it('formatta percentuali e importi compatti', () => {
    expect(formattaPercentuale(0.1234)).toBe('12,3%');
    expect(formattaPercentuale(null)).toBe('—');
    expect(formattaEuroCompatto(125_000_000)).toBe('1,3 mln €');
    expect(formattaEuroCompatto(35_000_000)).toBe('350 mila €');
  });
});

describe('date', () => {
  it('valida le date ISO', () => {
    expect(isDataISO('2026-02-28')).toBe(true);
    expect(isDataISO('2026-02-29')).toBe(false);
    expect(isDataISO('2028-02-29')).toBe(true);
    expect(isDataISO('2026-13-01')).toBe(false);
    expect(isDataISO('17/09/2026')).toBe(false);
  });

  it('calcola i termini in giorni escludendo il giorno iniziale', () => {
    expect(aggiungiDurata('2026-01-10', 30, 'giorni')).toBe('2026-02-09');
    expect(aggiungiDurata('2026-12-20', 15, 'giorni')).toBe('2027-01-04');
  });

  it("calcola i termini in mesi con fine mese (art. 2963 c.c.)", () => {
    expect(aggiungiMesi('2026-01-31', 1)).toBe('2026-02-28');
    expect(aggiungiMesi('2028-01-31', 1)).toBe('2028-02-29');
    expect(aggiungiMesi('2026-03-15', 12)).toBe('2027-03-15');
    expect(aggiungiMesi('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('calcola differenze e formati', () => {
    expect(differenzaGiorni('2026-01-01', '2026-03-01')).toBe(59);
    expect(differenzaGiorni('2026-03-29', '2026-03-30')).toBe(1); // cambio ora legale
    expect(formattaData('2026-09-17')).toBe('17/09/2026');
    expect(oggiISO(new Date(2026, 8, 17, 23, 59))).toBe('2026-09-17');
  });
});

describe('stato del PdS', () => {
  const oggi = '2026-06-15';

  it('segue il ciclo di vita', () => {
    const base = pds({ id: 'a', capitolo_id: 'c' });
    expect(statoPds(base, oggi)).toBe('in_preparazione');
    expect(statoPds({ ...base, data_invio: '2026-01-10' }, oggi)).toBe('inviato');
    expect(statoPds({ ...base, data_invio: '2026-01-10', data_stipula: '2026-02-01' }, oggi)).toBe('stipulato');
    // "in esecuzione" non esiste più: un PdS con la stipula registrata resta "stipulato"
    const inEsecuzione = { ...base, data_stipula: '2026-02-01', modalita_termine: 'durata' as const, durata: 6, durata_unita: 'mesi' as const };
    expect(dataScadenza(inEsecuzione)).toBe('2026-08-01');
    expect(statoPds(inEsecuzione, oggi)).toBe('stipulato');
    expect(statoPds({ ...inEsecuzione, durata: 3 }, oggi)).toBe('scaduto');
    expect(statoPds({ ...inEsecuzione, durata: 3, saldato: true }, oggi)).toBe('saldato');
  });

  it('considera scaduto anche un termine a data fissa superato', () => {
    const p = pds({ id: 'a', capitolo_id: 'c', data_invio: '2026-01-01', modalita_termine: 'data', data_termine: '2026-06-14' });
    expect(statoPds(p, oggi)).toBe('scaduto');
    expect(statoPds({ ...p, data_termine: '2026-06-15' }, oggi)).toBe('inviato');
  });

  it('senza data di stipula la durata non produce scadenza', () => {
    const p = pds({ id: 'a', capitolo_id: 'c', modalita_termine: 'durata', durata: 30, durata_unita: 'giorni' });
    expect(dataScadenza(p)).toBeNull();
  });

  it('segnala scadenze vicine e superate solo per i PdS non saldati', () => {
    const p = pds({ id: 'a', capitolo_id: 'c', data_stipula: '2026-01-01', modalita_termine: 'data', data_termine: '2026-07-10' });
    expect(avvisoScadenza(p, oggi, 30)).toEqual({ livello: 'in_scadenza', giorni: 25 });
    expect(avvisoScadenza(p, oggi, 20)).toEqual({ livello: null, giorni: 25 });
    expect(avvisoScadenza({ ...p, data_termine: '2026-06-01' }, oggi, 30)).toEqual({ livello: 'scaduto', giorni: -14 });
    expect(avvisoScadenza({ ...p, data_termine: '2026-06-01', saldato: true }, oggi, 30).livello).toBeNull();
  });
});

describe('sintesi finanziaria', () => {
  const c1 = capitolo('c1', '1181', 2026, 100_000_00);
  const c2 = capitolo('c2', '7120', 2026, 50_000_00);
  const dati: DatiCondivisi = {
    capitoli: [c1, c2],
    accordi: [],
    atti: [],
    pds: [
      // stipulato e saldato con economia
      pds({ id: 'p1', capitolo_id: 'c1', importo_inviato: 40_000_00, data_invio: '2026-01-10', data_stipula: '2026-02-01', valore_stipula: 38_000_00, saldato: true, data_saldo: '2026-05-01', totale_pagato_saldo: 37_500_00 }),
      // stipulato non saldato, pagamento parziale
      pds({ id: 'p2', capitolo_id: 'c1', importo_inviato: 30_000_00, data_invio: '2026-02-10', data_stipula: '2026-03-01', valore_stipula: 30_000_00 }),
      // inviato non stipulato
      pds({ id: 'p3', capitolo_id: 'c1', importo_inviato: 20_000_00, data_invio: '2026-04-01', valore_stipula: 19_000_00 }),
      // in preparazione (non conteggiato)
      pds({ id: 'p4', capitolo_id: 'c1', importo_inviato: 99_000_00 }),
      // capitolo 2 in sforamento
      pds({ id: 'p5', capitolo_id: 'c2', importo_inviato: 60_000_00, data_invio: '2026-01-05', data_stipula: '2026-02-05', valore_stipula: 55_000_00 }),
    ],
    pagamenti: [
      pagamento('g1', 'p1', 20_000_00),
      pagamento('g2', 'p1', 17_500_00),
      pagamento('g3', 'p2', 10_000_00),
    ],
    allegati: [],
    utenti: [],
  };

  const viste = vistePds(dati, '2026-06-01', 30);
  const s = calcolaSintesi(dati.capitoli, viste);
  const r1 = s.righe.find((r) => r.capitolo.id === 'c1')!;
  const r2 = s.righe.find((r) => r.capitolo.id === 'c2')!;

  it('calcola impegnato, stipulato, pagato ed economie per capitolo', () => {
    expect(r1.inviato).toBe(90_000_00);
    expect(r1.stipulato).toBe(68_000_00);
    expect(r1.inviatoNonStipulato).toBe(20_000_00);
    expect(r1.pagato).toBe(47_500_00);
    expect(r1.economie).toBe(500_00);
    expect(r1.residuoDaPagare).toBe(20_000_00);
    expect(r1.percInviato).toBeCloseTo(0.9);
    expect(r1.percStipulato).toBeCloseTo(0.68);
    expect(r1.percPagato).toBeCloseTo(0.475);
    expect(r1.nInPreparazione).toBe(1);
    expect(r1.nInviati).toBe(3);
    expect(r1.nStipulati).toBe(2);
    expect(r1.nSaldati).toBe(1);
  });

  it('segnala lo sforamento senza bloccarlo', () => {
    expect(r1.sforamentoInviato).toBe(0);
    expect(r2.sforamentoInviato).toBe(10_000_00);
    expect(r2.sforamentoStipulato).toBe(5_000_00);
    expect(s.capitoliInSforamento.map((r) => r.capitolo.codice)).toEqual(['7120']);
  });

  it("l'amministratore può autorizzare il superamento del finanziato", () => {
    const autorizzato = calcolaSintesi([capitolo('c2', '7120', 2026, 50_000_00, 'Variazione di bilancio richiesta')], viste);
    expect(autorizzato.righe[0].sforamentoStipulato).toBe(5_000_00);
    expect(sforamentoDaSegnalare(autorizzato.righe[0])).toBe(false);
    expect(autorizzato.capitoliInSforamento).toEqual([]);
  });

  it('conteggia le economie nel disponibile da impegnare', () => {
    // 100.000 finanziati - 68.000 stipulati + 500 di economie
    expect(r1.disponibileDaImpegnare).toBe(32_500_00);
    expect(r2.disponibileDaImpegnare).toBe(-5_000_00);
  });

  it('aggrega il totale complessivo', () => {
    expect(s.totale.finanziato).toBe(150_000_00);
    expect(s.totale.inviato).toBe(150_000_00);
    expect(s.totale.stipulato).toBe(123_000_00);
    expect(s.totale.pagato).toBe(47_500_00);
    expect(s.totale.percPagatoSuStipulato).toBeCloseTo(47_500 / 123_000);
  });

  it('mostra il numero del PdS con l’anno dell’esercizio', () => {
    expect(numeroPds({ numero: '18' }, 2026)).toBe('18/2026');
    expect(numeroPds({ numero: '18' }, null)).toBe('18');
    expect(viste.find((v) => v.pds.id === 'p1')!.numeroCompleto).toBe('p1/2026');
  });

  it('esclude i PdS eliminati dal conteggio del capitolo', () => {
    const conEliminato: DatiCondivisi = {
      ...dati,
      pds: [...dati.pds, pds({ id: 'p6', capitolo_id: 'c1', importo_inviato: 10_000_00, data_invio: '2026-05-01', eliminato_at: T, eliminato_da: 'u' })],
    };
    const tutte = vistePds(conEliminato, '2026-06-01', 30);
    const attive = tutte.filter((v) => v.pds.eliminato_at == null);
    expect(calcolaSintesi(conEliminato.capitoli, attive).righe.find((r) => r.capitolo.id === 'c1')!.inviato).toBe(90_000_00);
    expect(calcolaSintesi(conEliminato.capitoli, tutte).righe.find((r) => r.capitolo.id === 'c1')!.inviato).toBe(100_000_00);
  });

  it("calcola l'economia del singolo PdS", () => {
    const v1 = viste.find((v) => v.pds.id === 'p1')!;
    expect(v1.economia).toBe(500_00);
    expect(v1.totalePagato).toBe(37_500_00);
    expect(viste.find((v) => v.pds.id === 'p2')!.economia).toBeNull();
  });
});

describe('permessi', () => {
  const utente = (parziale: Partial<Utente>): Utente => ({
    id: 'u',
    username: 'u',
    nome: 'U',
    ruolo: 'utente',
    attivo: true,
    permessi: { ...PERMESSI_NESSUNO },
    created_at: T,
    updated_at: T,
    ...parziale,
  });

  it("l'amministratore può tutto, l'utente disattivato nulla", () => {
    expect(puo(utente({ ruolo: 'admin' }), 'capitoli')).toBe(true);
    expect(puo(utente({ ruolo: 'admin', attivo: false }), 'capitoli')).toBe(false);
  });

  it("applica aree e ambito dei capitoli", () => {
    const u = utente({ permessi: { ...PERMESSI_NESSUNO, pds_dati: true, ambito_capitoli: ['1181'] } });
    expect(puo(u, 'pds_dati', { codice: '1181' })).toBe(true);
    expect(puo(u, 'pds_dati', { codice: ' 1181 ' })).toBe(true);
    expect(puo(u, 'pds_dati', { codice: '7120' })).toBe(false);
    expect(puo(u, 'pds_dati')).toBe(true);
    expect(puo(u, 'pds_pagamenti', { codice: '1181' })).toBe(false);
    expect(puo(u, 'capitoli')).toBe(false);
  });
});

describe('validazioni', () => {
  it('richiede numero e capitolo del PdS', () => {
    expect(() => validaDatiPds({ numero: ' ', capitolo_id: '' })).toThrow(/obbligatorio/);
    expect(() => validaDatiPds({ importo_inviato: -1 }, true)).toThrow(/positivo/);
    expect(validaDatiPds({ numero: ' 12 ', capitolo_id: 'c' }, true)).toEqual({ numero: '12', capitolo_id: 'c' });
    // l'anno lo aggiunge l'esercizio del capitolo: nel numero si inserisce solo la parte numerica
    expect(() => validaDatiPds({ numero: '12/2026' }, true)).toThrow(/solo il numero/);
  });

  it('accetta più IDV separati da virgola', () => {
    expect(validaDatiPds({ idv: ' IDV-1, IDV-2 ' }, true)).toEqual({ idv: 'IDV-1, IDV-2' });
  });

  it('richiede la motivazione per ignorare il superamento del finanziato', () => {
    expect(() => validaDatiCapitolo({ sforamento_ignorato: true, sforamento_note: '  ' }, true)).toThrow(/Motivazione/);
    expect(validaDatiCapitolo({ sforamento_ignorato: true, sforamento_note: 'Variazione richiesta' }, true)).toEqual({
      sforamento_ignorato: true,
      sforamento_note: 'Variazione richiesta',
    });
  });

  it('applica la politica delle password', () => {
    expect(errorePassword('breve1')).toMatch(/almeno 10/);
    expect(errorePassword('soloLettereLunghe')).toMatch(/cifra/);
    expect(errorePassword('password2026')).toBeNull();
  });

  it('produce avvisi di coerenza non bloccanti', () => {
    const c = capitolo('c', '1', 2026, 0);
    const p = pds({ id: 'x', capitolo_id: 'c', numero: '5', importo_inviato: 100, valore_stipula: 100 });
    const altro = pds({ id: 'y', capitolo_id: 'c', numero: '5' });
    const avvisi = avvisiCoerenzaPds(p, { pagamenti: [], altriPds: [p, altro], capitoli: new Map([['c', c]]) });
    expect(avvisi.some((a) => a.includes('Esiste un altro PdS'))).toBe(true);
    expect(avvisi.some((a) => a.includes('data di invio'))).toBe(true);
    expect(avvisi.some((a) => a.includes('data di stipula'))).toBe(true);
  });
});
