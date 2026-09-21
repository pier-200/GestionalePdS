import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { visteAccordi } from '../../src/domain/accordi';
import { vistePds } from '../../src/domain/calcoli';
import { calcolaSintesi } from '../../src/domain/sintesi';
import type { AccordoQuadro, AttoAdesione, Capitolo, DatiCondivisi, Pds } from '../../src/domain/tipi';
import { datiVuoti } from '../../src/domain/tipi';
import { aggiungiGrafici, lettereColonna, type DefinizioneGrafico } from '../../src/esportazione/grafici';
import { rapportoAccordi, rapportoCapitoli, rapportoElencoPds, rapportoSintesi, type Rapporto } from '../../src/esportazione/rapporti';

const T = '2026-01-01T00:00:00.000Z';
const OGGI = '2026-06-01';
const tracc = { created_at: T, created_by: null, updated_at: T, updated_by: null };

function capitolo(id: string, codice: string, finanziato: number): Capitolo {
  return { id, codice, esercizio: 2026, descrizione: '', finanziato, sforamento_ignorato: false, sforamento_note: '', ...tracc };
}

function accordo(id: string, numero: string, importo: number): AccordoQuadro {
  return {
    id,
    numero,
    oggetto: 'Manutenzioni',
    ditta: 'Edilquattro S.r.l.',
    dec: null,
    protocollo_stipula: '0004512',
    data_stipula: '2026-01-15',
    durata_giorni: 1095,
    importo,
    note: null,
    ...tracc,
  };
}

function atto(id: string, accordoId: string, numero: string, valore: number): AttoAdesione {
  return {
    id,
    accordo_id: accordoId,
    numero,
    oggetto: 'Manutenzioni a chiamata',
    protocollo_stipula: '0006120',
    data_stipula: '2026-02-01',
    durata_giorni: 365,
    valore,
    note: null,
    ...tracc,
  };
}

function pds(parziale: Partial<Pds> & Pick<Pds, 'id' | 'capitolo_id' | 'numero'>): Pds {
  return {
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

const c1 = capitolo('c1', '1181', 500_000_00);
const aq = accordo('aq1', 'AQ 1/2026', 1_000_000_00);
const ada = atto('ada1', 'aq1', 'AdA 1', 300_000_00);

const dati: DatiCondivisi = {
  ...datiVuoti(),
  capitoli: [c1],
  accordi: [aq],
  atti: [ada],
  pds: [
    pds({ id: 'p1', numero: '1', capitolo_id: 'c1', accordo_id: 'aq1', atto_adesione_id: 'ada1', importo_inviato: 120_000_00, data_invio: '2026-02-10', data_stipula: '2026-03-01', valore_stipula: 115_000_00 }),
    pds({ id: 'p2', numero: '2', capitolo_id: 'c1', accordo_id: 'aq1', importo_inviato: 80_000_00, data_invio: '2026-04-01' }),
    pds({ id: 'p3', numero: '3', capitolo_id: 'c1', importo_inviato: 40_000_00, data_invio: '2026-04-10' }),
  ],
  pagamenti: [{ id: 'g1', pds_id: 'p1', data: '2026-05-01', importo: 50_000_00, riferimento: '0000101', note: null, ...tracc }],
};

const viste = vistePds(dati, OGGI, 30);
const sintesi = calcolaSintesi(dati.capitoli, viste);
const accordi = visteAccordi(dati.accordi, dati.atti, viste, OGGI);

/** Ogni serie deve puntare a una colonna numerica del foglio indicato. */
function verificaRiferimenti(r: Rapporto) {
  for (const g of r.grafici) {
    const foglio = r.fogli[g.foglio];
    expect(foglio, `foglio ${g.foglio} di ${r.base}`).toBeDefined();
    expect(foglio.nome).toBe(g.nomeFoglio);
    expect(g.righe).toBe(foglio.righe.length);
    expect(foglio.colonne[g.categorie]).toBeDefined();
    for (const s of g.serie) {
      const colonna = foglio.colonne[s.colonna];
      expect(colonna, `${r.base}: colonna ${s.colonna} del foglio ${foglio.nome}`).toBeDefined();
      expect(['importo', 'numero', 'percentuale']).toContain(colonna.tipo);
      expect(s.colore).toMatch(/^[0-9A-F]{6}$/);
    }
  }
}

describe('rapporti esportabili', () => {
  it('le serie dei grafici puntano a colonne numeriche esistenti', () => {
    verificaRiferimenti(rapportoElencoPds(viste, 2026));
    verificaRiferimenti(rapportoSintesi(sintesi, 2026));
    verificaRiferimenti(rapportoCapitoli(sintesi, 2026));
    verificaRiferimenti(rapportoAccordi(accordi));
  });

  it("il rapporto dell'elenco PdS riepiloga per capitolo e per stato", () => {
    const r = rapportoElencoPds(viste, 2026);
    expect(r.fogli.map((f) => f.nome)).toEqual(['Progetti di spesa', 'Riepilogo per capitolo', 'Riepilogo per stato']);
    const perCapitolo = r.fogli[1];
    expect(perCapitolo.righe).toHaveLength(1);
    // 120.000 + 80.000 + 40.000 trasmessi sul capitolo 1181
    expect(perCapitolo.colonne[2].valore(perCapitolo.righe[0] as never)).toBe(240_000);
    expect(perCapitolo.colonne[3].valore(perCapitolo.righe[0] as never)).toBe(115_000);
  });

  it('il rapporto degli accordi quadro elenca atti e ordinativi', () => {
    const r = rapportoAccordi(accordi);
    expect(r.fogli.map((f) => f.nome)).toEqual(['Accordi quadro', 'Atti di adesione', 'Ordinativi']);
    expect(r.fogli[1].righe).toHaveLength(1);
    // il PdS senza accordo quadro non compare tra gli ordinativi
    expect(r.fogli[2].righe).toHaveLength(2);
    const foglioAccordi = r.fogli[0];
    expect(foglioAccordi.colonne[11].titolo).toBe('Impegnato totale');
    expect(foglioAccordi.colonne[11].valore(foglioAccordi.righe[0] as never)).toBe(380_000);
  });
});

describe('grafici nei file Excel', () => {
  const grafico: DefinizioneGrafico = {
    foglio: 0,
    nomeFoglio: "Riepilogo dell'anno",
    titolo: 'Impegnato & pagato',
    tipo: 'barre',
    categorie: 0,
    serie: [
      { colonna: 1, colore: '2563EB' },
      { colonna: 2, colore: '1E3A8A' },
    ],
    righe: 3,
    ancoraRiga: 6,
  };

  async function xlsxConGrafici() {
    const data = [
      [
        { value: 'Capitolo', type: String },
        { value: 'Impegnato', type: String },
        { value: 'Pagato', type: String },
      ],
      ...[1, 2, 3].map((n) => [{ value: `C${n}`, type: String }, { value: n * 100, type: Number }, { value: n * 50, type: Number }]),
    ];
    const buffer = await writeXlsxFile([{ data, sheet: "Riepilogo dell'anno" }] as never).toBuffer();
    return unzipSync(aggiungiGrafici(new Uint8Array(buffer), [grafico]));
  }

  it('converte gli indici di colonna in lettere', () => {
    expect(lettereColonna(0)).toBe('A');
    expect(lettereColonna(25)).toBe('Z');
    expect(lettereColonna(26)).toBe('AA');
    expect(lettereColonna(27)).toBe('AB');
  });

  it('aggiunge chart, drawing e relazioni al pacchetto xlsx', async () => {
    const file = await xlsxConGrafici();
    expect(Object.keys(file)).toEqual(
      expect.arrayContaining([
        'xl/charts/chart1.xml',
        'xl/drawings/drawing1.xml',
        'xl/drawings/_rels/drawing1.xml.rels',
        'xl/worksheets/_rels/sheet1.xml.rels',
      ]),
    );
    const testo = (percorso: string) => Buffer.from(file[percorso]).toString('utf8');

    // il foglio dichiara il disegno e la relazione punta al file giusto
    expect(testo('xl/worksheets/sheet1.xml')).toContain('<drawing r:id="rIdDrawing"/></worksheet>');
    expect(testo('xl/worksheets/_rels/sheet1.xml.rels')).toContain('Target="../drawings/drawing1.xml"');
    expect(testo('xl/drawings/_rels/drawing1.xml.rels')).toContain('Target="../charts/chart1.xml"');

    // i tipi di contenuto dichiarano le nuove parti
    const tipi = testo('[Content_Types].xml');
    expect(tipi).toContain('PartName="/xl/charts/chart1.xml"');
    expect(tipi).toContain('PartName="/xl/drawings/drawing1.xml"');

    const chart = testo('xl/charts/chart1.xml');
    expect(chart.match(/<c:ser>/g)).toHaveLength(2);
    // le serie citano le celle del foglio, con il nome quotato e senza intestazione
    expect(chart).toContain("'Riepilogo dell''anno'!$B$2:$B$4");
    expect(chart).toContain("'Riepilogo dell''anno'!$A$2:$A$4");
    expect(chart).toContain("'Riepilogo dell''anno'!$B$1");
    expect(chart).toContain('<a:srgbClr val="2563EB"/>');
    // il titolo è messo al sicuro dai caratteri speciali
    expect(chart).toContain('Impegnato &amp; pagato');
    expect(testo('xl/drawings/drawing1.xml')).toContain('<xdr:row>6</xdr:row>');
  });

  it('lascia il file invariato quando non ci sono grafici', async () => {
    const data = [[{ value: 'A', type: String }]];
    const buffer = new Uint8Array(await writeXlsxFile([{ data, sheet: 'Uno' }] as never).toBuffer());
    expect(aggiungiGrafici(buffer, [])).toBe(buffer);
  });
});
