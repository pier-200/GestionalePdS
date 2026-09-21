import { aggiungiGiorni, annoDi } from '../../domain/date';
import type {
  AccordoQuadro,
  Allegato,
  AttoAdesione,
  Capitolo,
  DataISO,
  DatiCondivisi,
  Pagamento,
  Pds,
  Utente,
  VoceRegistro,
} from '../../domain/tipi';
import { PERMESSI_NESSUNO, PERMESSI_TUTTI } from '../../domain/tipi';

/** Password comune degli utenti dimostrativi. */
export const PASSWORD_DEMO = 'demo-pds-2026';

export const UTENTI_DEMO = [
  { username: 'admin', descrizione: 'Amministratore' },
  { username: 'm.bianchi', descrizione: 'Dati, pagamenti e allegati sui capitoli 1181 e 7120' },
  { username: 'l.verdi', descrizione: 'Capitoli, accordi quadro, creazione e dati PdS' },
  { username: 'ospite', descrizione: 'Sola consultazione' },
];

const euro = (valore: number) => Math.round(valore * 100);

/**
 * Genera un insieme di dati realistico, con date relative a oggi, in modo che la
 * demo mostri sempre PdS in scadenza, scaduti, saldati, un capitolo con
 * superamento autorizzato, un PdS eliminato e accordi quadro con atti di adesione.
 */
export function creaDatiDimostrativi(oggi: DataISO): { dati: DatiCondivisi; registro: VoceRegistro[] } {
  const Y = annoDi(oggi);
  const P = Y - 1;
  const g = (giorni: number) => aggiungiGiorni(oggi, giorni);
  const ts = (data: DataISO, ora = '08:30') => `${data}T${ora}:00.000Z`;
  let contatore = 0;
  const id = (prefisso: string) => `${prefisso}-${(++contatore).toString().padStart(4, '0')}-demo`;

  const utenti: Utente[] = [
    { id: 'u-admin', username: 'admin', nome: 'Anna Ferri', ruolo: 'admin', attivo: true, permessi: { ...PERMESSI_TUTTI }, created_at: ts(`${P}-01-02`), updated_at: ts(`${P}-01-02`) },
    {
      id: 'u-bianchi',
      username: 'm.bianchi',
      nome: 'Marco Bianchi',
      ruolo: 'utente',
      attivo: true,
      permessi: { ...PERMESSI_NESSUNO, pds_dati: true, pds_pagamenti: true, pds_allegati: true, ambito_capitoli: ['1181', '7120'] },
      created_at: ts(`${P}-01-03`),
      updated_at: ts(`${P}-01-03`),
    },
    {
      id: 'u-verdi',
      username: 'l.verdi',
      nome: 'Laura Verdi',
      ruolo: 'utente',
      attivo: true,
      permessi: { ...PERMESSI_NESSUNO, capitoli: true, accordi: true, pds_crea: true, pds_dati: true, pds_allegati: true },
      created_at: ts(`${P}-01-03`),
      updated_at: ts(`${P}-01-03`),
    },
    { id: 'u-ospite', username: 'ospite', nome: 'Utente in consultazione', ruolo: 'utente', attivo: true, permessi: { ...PERMESSI_NESSUNO }, created_at: ts(`${P}-01-04`), updated_at: ts(`${P}-01-04`) },
  ];

  const tracciaCreazione = (data: DataISO, utente = 'u-admin') => ({ created_at: ts(data), created_by: utente, updated_at: ts(data), updated_by: utente });

  // ---- Capitoli di spesa ----------------------------------------------------
  const capitolo = (esercizio: number, codice: string, descrizione: string, finanziato: number, sforamentoNote = ''): Capitolo => ({
    id: `cap-${esercizio}-${codice}`,
    esercizio,
    codice,
    descrizione,
    finanziato: euro(finanziato),
    sforamento_ignorato: sforamentoNote !== '',
    sforamento_note: sforamentoNote,
    ...tracciaCreazione(`${esercizio}-01-05`, 'u-verdi'),
  });

  const capitoli: Capitolo[] = [
    capitolo(P, '1181', 'Manutenzione ordinaria degli immobili', 450_000),
    capitolo(P, '1188', 'Acquisto di beni di consumo e materiali', 180_000),
    capitolo(P, '7120', 'Ammodernamento degli impianti tecnologici', 900_000),
    capitolo(Y, '1181', 'Manutenzione ordinaria degli immobili', 500_000),
    capitolo(Y, '1188', 'Acquisto di beni di consumo e materiali', 200_000),
    capitolo(Y, '1245', 'Servizi di pulizia e igiene ambientale', 120_000, 'Variazione di bilancio n. 12 già approvata: il finanziato sarà adeguato a 200.000 €.'),
    capitolo(Y, '7120', 'Ammodernamento degli impianti tecnologici', 750_000),
  ];

  // ---- Accordi quadro e atti di adesione ------------------------------------
  const accordi: AccordoQuadro[] = [];
  const atti: AttoAdesione[] = [];

  const accordo = (
    chiave: string,
    dati: Omit<AccordoQuadro, 'id' | 'created_at' | 'created_by' | 'updated_at' | 'updated_by'>,
    creazione: DataISO,
  ): AccordoQuadro => {
    const a: AccordoQuadro = { id: `aq-${chiave}`, ...dati, ...tracciaCreazione(creazione, 'u-verdi') };
    accordi.push(a);
    return a;
  };

  const atto = (
    chiave: string,
    accordoQuadro: AccordoQuadro,
    dati: Omit<AttoAdesione, 'id' | 'accordo_id' | 'created_at' | 'created_by' | 'updated_at' | 'updated_by'>,
    creazione: DataISO,
  ): AttoAdesione => {
    const a: AttoAdesione = { id: `ada-${chiave}`, accordo_id: accordoQuadro.id, ...dati, ...tracciaCreazione(creazione, 'u-verdi') };
    atti.push(a);
    return a;
  };

  const aqFacility = accordo(
    'facility',
    {
      numero: `AQ 4/${P}`,
      oggetto: 'Facility management e manutenzioni edili',
      ditta: 'Edilquattro S.r.l.',
      dec: 'Ing. Marco Bianchi',
      protocollo_stipula: '0004512',
      data_stipula: `${P}-02-01`,
      durata_giorni: 1095,
      importo: euro(1_200_000),
      note: 'Lotto 6 – sedi del comprensorio nord.',
    },
    `${P}-02-01`,
  );
  const adaFacility1 = atto(
    'facility-1',
    aqFacility,
    {
      numero: 'AdA 1',
      oggetto: 'Manutenzioni a chiamata della sede centrale',
      protocollo_stipula: '0006120',
      data_stipula: `${P}-03-01`,
      durata_giorni: 365,
      valore: euro(300_000),
      note: null,
    },
    `${P}-03-01`,
  );
  const adaFacility2 = atto(
    'facility-2',
    aqFacility,
    {
      numero: 'AdA 2',
      oggetto: 'Manutenzione degli impianti antincendio',
      protocollo_stipula: '0007330',
      data_stipula: g(-150),
      durata_giorni: 365,
      valore: euro(250_000),
      note: null,
    },
    g(-150),
  );

  const aqImpianti = accordo(
    'impianti',
    {
      numero: `AQ 9/${P}`,
      oggetto: 'Impianti tecnologici e climatizzazione',
      ditta: 'Termotecnica Alpina S.r.l.',
      dec: 'Geom. Paolo Neri',
      protocollo_stipula: '0008120',
      data_stipula: `${P}-04-01`,
      durata_giorni: 730,
      importo: euro(1_500_000),
      note: null,
    },
    `${P}-04-01`,
  );
  const adaImpianti = atto(
    'impianti-1',
    aqImpianti,
    {
      numero: 'AdA 1',
      oggetto: 'Conduzione e manutenzione degli impianti di climatizzazione',
      protocollo_stipula: '0011020',
      data_stipula: g(-200),
      durata_giorni: 365,
      valore: euro(500_000),
      note: null,
    },
    g(-200),
  );

  const aqPulizie = accordo(
    'pulizie',
    {
      numero: `AQ 2/${Y}`,
      oggetto: 'Servizi di pulizia e igiene ambientale',
      ditta: 'Pulizie Integrate S.r.l.',
      dec: 'Dott.ssa Laura Verdi',
      protocollo_stipula: '0001450',
      data_stipula: g(-140),
      durata_giorni: 365,
      importo: euro(300_000),
      note: null,
    },
    g(-140),
  );

  // ---- Progetti di spesa ----------------------------------------------------
  const pds: Pds[] = [];
  const pagamenti: Pagamento[] = [];
  const allegati: Allegato[] = [];

  const nuovoPds = (
    esercizioCapitolo: number,
    codice: string,
    dati: Partial<Pds> & Pick<Pds, 'numero'>,
    elencoPagamenti: [DataISO, number, string][] = [],
    saldo?: DataISO,
  ): Pds => {
    const creazione = aggiungiGiorni(dati.data_invio ?? dati.data_stipula ?? g(-10), -7);
    const p: Pds = {
      id: id('pds'),
      capitolo_id: `cap-${esercizioCapitolo}-${codice}`,
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
      ...tracciaCreazione(creazione, 'u-verdi'),
      ...dati,
    };
    let totale = 0;
    for (const [data, importo, protocollo] of elencoPagamenti) {
      totale += euro(importo);
      pagamenti.push({ id: id('pag'), pds_id: p.id, data, importo: euro(importo), riferimento: protocollo, note: null, ...tracciaCreazione(data, 'u-bianchi') });
    }
    if (saldo) {
      p.saldato = true;
      p.data_saldo = saldo;
      p.totale_pagato_saldo = totale;
      p.updated_at = ts(saldo, '15:10');
      p.updated_by = 'u-bianchi';
    }
    pds.push(p);
    return p;
  };

  // ---- Esercizio precedente -------------------------------------------------
  const p1 = nuovoPds(
    P,
    '1181',
    {
      numero: '14',
      accordo_id: aqFacility.id,
      atto_adesione_id: adaFacility1.id,
      ditta: 'Edilquattro S.r.l.',
      ordinativo: `ODA-${P}-0112`,
      idv: 'IDV-2231, IDV-2232',
      dec: 'Ing. Marco Bianchi',
      importo_inviato: euro(120_000),
      protocollo_invio: '0004512',
      data_invio: `${P}-02-12`,
      protocollo_stipula: '0006120',
      data_stipula: `${P}-03-10`,
      valore_stipula: euro(115_000),
      modalita_termine: 'durata',
      durata: 90,
      durata_unita: 'giorni',
      note: 'Interventi su coperture e infissi della sede centrale.',
    },
    [
      [`${P}-05-20`, 50_000, '0011801'],
      [`${P}-07-15`, 64_200, '0016402'],
    ],
    `${P}-07-30`,
  );
  nuovoPds(
    P,
    '1188',
    {
      numero: '21',
      ditta: 'Forniture Adriatiche S.p.A.',
      ordinativo: `ODA-${P}-0140`,
      dec: 'Dott.ssa Laura Verdi',
      importo_inviato: euro(60_000),
      protocollo_invio: '0005230',
      data_invio: `${P}-03-01`,
      protocollo_stipula: '0006604',
      data_stipula: `${P}-03-28`,
      valore_stipula: euro(58_500),
      modalita_termine: 'durata',
      durata: 6,
      durata_unita: 'mesi',
    },
    [
      [`${P}-06-30`, 20_000, '0007701'],
      [`${P}-10-15`, 38_500, '0013102'],
    ],
    `${P}-10-31`,
  );
  const p3 = nuovoPds(
    P,
    '7120',
    {
      numero: '33',
      accordo_id: aqImpianti.id,
      ditta: 'Termotecnica Alpina S.r.l.',
      ordinativo: `ODA-${P}-0201`,
      idv: 'IDV-2270, IDV-2271, IDV-2272',
      dec: 'Geom. Paolo Neri',
      importo_inviato: euro(500_000),
      protocollo_invio: '0007011',
      data_invio: `${P}-04-10`,
      protocollo_stipula: '0008120',
      data_stipula: `${P}-05-20`,
      valore_stipula: euro(480_000),
      modalita_termine: 'data',
      data_termine: `${P}-12-31`,
      note: 'Collaudo parziale eseguito; in attesa della documentazione finale.',
    },
    [
      [`${P}-09-30`, 150_000, '0021001'],
      [`${P}-12-15`, 150_000, '0028802'],
    ],
  );
  nuovoPds(
    P,
    '7120',
    {
      numero: '34',
      accordo_id: aqImpianti.id,
      dec: 'Geom. Paolo Neri',
      ditta: 'Termotecnica Alpina S.r.l.',
      ordinativo: `ODA-${P}-0205`,
      importo_inviato: euro(450_000),
      protocollo_invio: '0007102',
      data_invio: `${P}-04-15`,
      protocollo_stipula: '0008870',
      data_stipula: `${P}-06-01`,
      valore_stipula: euro(470_000),
      modalita_termine: 'durata',
      durata: 4,
      durata_unita: 'mesi',
    },
    [
      [`${P}-08-30`, 200_000, '0019001'],
      [`${P}-10-30`, 269_000, '0024702'],
    ],
    `${P}-11-20`,
  );

  // ---- Esercizio corrente ---------------------------------------------------
  const p5 = nuovoPds(
    Y,
    '1181',
    {
      numero: '3',
      accordo_id: aqFacility.id,
      atto_adesione_id: adaFacility2.id,
      ditta: 'Edilquattro S.r.l.',
      ordinativo: `ODA-${Y}-0021`,
      idv: 'IDV-2410, IDV-2411',
      dec: 'Ing. Marco Bianchi',
      importo_inviato: euro(200_000),
      protocollo_invio: '0001204',
      data_invio: g(-120),
      protocollo_stipula: '0001987',
      data_stipula: g(-90),
      valore_stipula: euro(195_000),
      modalita_termine: 'durata',
      durata: 120,
      durata_unita: 'giorni',
    },
    [[g(-30), 80_000, '0004501']],
  );
  nuovoPds(Y, '1181', {
    numero: '5',
    ditta: 'Manutenzioni Riunite S.c.a.r.l.',
    ordinativo: `ODA-${Y}-0034`,
    dec: 'Ing. Marco Bianchi',
    importo_inviato: euro(180_000),
    protocollo_invio: '0002210',
    data_invio: g(-60),
    protocollo_stipula: '0002675',
    data_stipula: g(-40),
    valore_stipula: euro(178_000),
    modalita_termine: 'data',
    data_termine: g(10),
  });
  nuovoPds(Y, '1188', {
    numero: '8',
    ditta: 'Forniture Adriatiche S.p.A.',
    dec: 'Dott.ssa Laura Verdi',
    importo_inviato: euro(90_000),
    protocollo_invio: '0003120',
    data_invio: g(-20),
  });
  nuovoPds(Y, '1188', {
    numero: '9',
    dec: 'Dott.ssa Laura Verdi',
    importo_inviato: euro(45_000),
    note: "In attesa del parere tecnico prima dell'invio.",
  });
  const p9 = nuovoPds(
    Y,
    '7120',
    {
      numero: '11',
      accordo_id: aqImpianti.id,
      atto_adesione_id: adaImpianti.id,
      ditta: 'Termotecnica Alpina S.r.l.',
      ordinativo: `ODA-${Y}-0077`,
      idv: 'IDV-2455, IDV-2456',
      dec: 'Geom. Paolo Neri',
      importo_inviato: euro(400_000),
      protocollo_invio: '0000890',
      data_invio: g(-200),
      protocollo_stipula: '0001102',
      data_stipula: g(-170),
      valore_stipula: euro(390_000),
      modalita_termine: 'durata',
      durata: 5,
      durata_unita: 'mesi',
    },
    [[g(-60), 200_000, '0006101']],
  );
  nuovoPds(Y, '7120', {
    numero: '12',
    ditta: 'Impianti Futura S.r.l.',
    dec: 'Geom. Paolo Neri',
    importo_inviato: euro(380_000),
    protocollo_invio: '0002890',
    data_invio: g(-45),
    note: 'Importo superiore alla disponibilità residua del capitolo: richiesta variazione di bilancio.',
  });
  nuovoPds(
    Y,
    '1245',
    {
      numero: '15',
      accordo_id: aqPulizie.id,
      ditta: 'Pulizie Integrate S.r.l.',
      ordinativo: `ODA-${Y}-0102`,
      dec: 'Dott.ssa Laura Verdi',
      importo_inviato: euro(60_000),
      protocollo_invio: '0001450',
      data_invio: g(-130),
      protocollo_stipula: '0001733',
      data_stipula: g(-100),
      valore_stipula: euro(59_000),
      modalita_termine: 'durata',
      durata: 12,
      durata_unita: 'mesi',
    },
    [
      [g(-70), 4_916.67, '0005001'],
      [g(-40), 4_916.67, '0005002'],
      [g(-10), 4_916.67, '0005003'],
    ],
  );
  nuovoPds(
    Y,
    '1245',
    {
      numero: '16',
      ditta: 'Pulizie Integrate S.r.l.',
      dec: 'Dott.ssa Laura Verdi',
      importo_inviato: euro(30_000),
      protocollo_invio: '0001301',
      data_invio: g(-150),
      protocollo_stipula: '0001422',
      data_stipula: g(-140),
      valore_stipula: euro(29_500),
      modalita_termine: 'durata',
      durata: 60,
      durata_unita: 'giorni',
    },
    [[g(-60), 29_100, '0005801']],
    g(-50),
  );
  nuovoPds(Y, '1181', {
    numero: '18',
    accordo_id: aqFacility.id,
    ditta: 'Edilquattro S.r.l.',
    dec: 'Ing. Marco Bianchi',
    importo_inviato: euro(75_000),
    protocollo_invio: '0003302',
    data_invio: g(-25),
    protocollo_stipula: '0003511',
    data_stipula: g(-5),
    valore_stipula: euro(72_300),
  });
  nuovoPds(
    Y,
    '1245',
    {
      numero: '19',
      ditta: 'Igiene Ambientale Nord S.r.l.',
      ordinativo: `ODA-${Y}-0118`,
      idv: 'IDV-2501',
      dec: 'Dott.ssa Laura Verdi',
      importo_inviato: euro(80_000),
      protocollo_invio: '0003890',
      data_invio: g(-18),
      protocollo_stipula: '0003990',
      data_stipula: g(-9),
      valore_stipula: euro(78_000),
      modalita_termine: 'durata',
      durata: 8,
      durata_unita: 'mesi',
      note: 'Porta il capitolo 1245 oltre il finanziato: superamento autorizzato in attesa della variazione di bilancio.',
    },
    [[g(-2), 9_000, '0009101']],
  );
  const pEliminato = nuovoPds(Y, '1188', {
    numero: '20',
    ditta: 'Cartotecnica Centro S.r.l.',
    dec: 'Dott.ssa Laura Verdi',
    importo_inviato: euro(12_000),
    note: 'Inserito per errore: spostato tra i PdS eliminati.',
  });
  pEliminato.eliminato_at = ts(g(-3), '11:20');
  pEliminato.eliminato_da = 'u-verdi';

  // ---- Allegati -------------------------------------------------------------
  const collegamento = (p: Pds, tipo: Allegato['tipo'], titolo: string, url: string) =>
    allegati.push({
      id: id('all'),
      pds_id: p.id,
      tipo,
      titolo,
      url,
      file_path: null,
      file_nome: null,
      file_dimensione: null,
      file_tipo: null,
      created_at: p.created_at,
      created_by: 'u-bianchi',
    });
  collegamento(p1, 'protocollo_invio', 'Nota di trasmissione del progetto', 'https://intranet.example.com/protocollo/4512');
  collegamento(p1, 'protocollo_stipula', 'Contratto stipulato', 'https://intranet.example.com/protocollo/6120');
  collegamento(p3, 'fattura', 'Fattura SAL 2', 'https://intranet.example.com/fatture/288');
  collegamento(p5, 'protocollo_stipula', 'Contratto stipulato', 'https://intranet.example.com/protocollo/1987');
  collegamento(p9, 'altro', 'Verbale di sopralluogo', 'https://intranet.example.com/documenti/verbale-sopralluogo');

  // ---- Registro delle modifiche --------------------------------------------
  const utentiPerId = new Map(utenti.map((u) => [u.id, u]));
  const esercizioDi = new Map(capitoli.map((c) => [c.id, c.esercizio]));
  const numeroCompleto = (p: Pds) => `${p.numero}/${esercizioDi.get(p.capitolo_id) ?? Y}`;
  const registro: VoceRegistro[] = [];

  for (const a of accordi) {
    registro.push({
      id: id('reg'),
      ts: a.created_at,
      utente_id: a.created_by,
      username: utentiPerId.get(a.created_by ?? '')?.username ?? null,
      entita: 'accordo',
      entita_id: a.id,
      pds_id: null,
      azione: 'creazione',
      riferimento: a.numero,
      modifiche: { numero: { da: null, a: a.numero }, oggetto: { da: null, a: a.oggetto }, importo: { da: null, a: a.importo } },
    });
  }
  for (const a of atti) {
    registro.push({
      id: id('reg'),
      ts: a.created_at,
      utente_id: a.created_by,
      username: utentiPerId.get(a.created_by ?? '')?.username ?? null,
      entita: 'atto',
      entita_id: a.id,
      pds_id: null,
      azione: 'creazione',
      riferimento: a.numero,
      modifiche: { numero: { da: null, a: a.numero }, valore: { da: null, a: a.valore } },
    });
  }
  for (const p of pds) {
    registro.push({
      id: id('reg'),
      ts: p.created_at,
      utente_id: p.created_by,
      username: utentiPerId.get(p.created_by ?? '')?.username ?? null,
      entita: 'pds',
      entita_id: p.id,
      pds_id: p.id,
      azione: 'creazione',
      riferimento: numeroCompleto(p),
      modifiche: { numero: { da: null, a: p.numero }, capitolo_id: { da: null, a: p.capitolo_id } },
    });
    if (p.saldato) {
      registro.push({
        id: id('reg'),
        ts: p.updated_at,
        utente_id: 'u-bianchi',
        username: 'm.bianchi',
        entita: 'pds',
        entita_id: p.id,
        pds_id: p.id,
        azione: 'modifica',
        riferimento: numeroCompleto(p),
        modifiche: {
          saldato: { da: false, a: true },
          data_saldo: { da: null, a: p.data_saldo },
          totale_pagato_saldo: { da: null, a: p.totale_pagato_saldo },
        },
      });
    }
  }
  for (const pag of pagamenti) {
    const p = pds.find((x) => x.id === pag.pds_id)!;
    registro.push({
      id: id('reg'),
      ts: pag.created_at,
      utente_id: 'u-bianchi',
      username: 'm.bianchi',
      entita: 'pagamento',
      entita_id: pag.id,
      pds_id: p.id,
      azione: 'creazione',
      riferimento: `PdS ${numeroCompleto(p)}`,
      modifiche: { data: { da: null, a: pag.data }, importo: { da: null, a: pag.importo }, riferimento: { da: null, a: pag.riferimento } },
    });
  }

  return { dati: { capitoli, accordi, atti, pds, pagamenti, allegati, utenti }, registro };
}
