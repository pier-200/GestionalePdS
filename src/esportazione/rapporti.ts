import { importoImpegnato, scadenzaContrattuale, type VistaAccordo } from '../domain/accordi';
import type { PdsVista } from '../domain/calcoli';
import { euroDaCentesimi } from '../domain/importi';
import type { RigaSintesi, SintesiFinanziaria } from '../domain/sintesi';
import { ELENCO_STATI, STATI, type StatoPds } from '../domain/stato';
import { COLONNE_PDS, colonneSintesi, type ColonnaEsportazione, type Foglio } from './esportazione';
import type { DefinizioneGrafico } from './grafici';

/**
 * Rapporti esportabili: ogni sezione produce i propri fogli di dati e i grafici
 * che ne spiegano l'andamento finanziario.
 */
export interface Rapporto {
  base: string;
  fogli: Foglio<never>[];
  grafici: DefinizioneGrafico[];
}

const euro = (c: number | null | undefined) => (c == null ? null : euroDaCentesimi(c));

/** Colori delle serie, allineati a quelli dei grafici dell'applicazione. */
const COLORI = {
  finanziato: '94A3B8',
  trasmesso: '93C5FD',
  stipulato: '2563EB',
  pagato: '1E3A8A',
  residuo: '16A34A',
  capienza: '64748B',
};

function foglio<T>(nome: string, colonne: ColonnaEsportazione<T>[], righe: T[], totale?: T): Foglio<never> {
  return { nome, colonne, righe, totale } as unknown as Foglio<never>;
}

/** Il grafico si posiziona sotto i dati, lasciando due righe di respiro. */
function sotto(righe: number, conTotale = false): number {
  return righe + (conTotale ? 2 : 1) + 2;
}

// ---------------------------------------------------------------------------
// Elenco dei progetti di spesa
// ---------------------------------------------------------------------------

interface RigaCapitoloPds {
  capitolo: string;
  nPds: number;
  trasmesso: number;
  stipulato: number;
  pagato: number;
}

interface RigaStatoPds {
  stato: string;
  nPds: number;
  impegnato: number;
  pagato: number;
}

const COLONNE_RIEPILOGO_CAPITOLO: ColonnaEsportazione<RigaCapitoloPds>[] = [
  { titolo: 'Capitolo di spesa', tipo: 'testo', larghezza: 18, valore: (r) => r.capitolo },
  { titolo: 'N. PdS', tipo: 'numero', larghezza: 9, valore: (r) => r.nPds },
  { titolo: 'Impegnato (Trasmesso)', tipo: 'importo', larghezza: 18, valore: (r) => euro(r.trasmesso) },
  { titolo: 'Impegnato (Stipulato)', tipo: 'importo', larghezza: 18, valore: (r) => euro(r.stipulato) },
  { titolo: 'Pagato', tipo: 'importo', larghezza: 16, valore: (r) => euro(r.pagato) },
];

const COLONNE_RIEPILOGO_STATO: ColonnaEsportazione<RigaStatoPds>[] = [
  { titolo: 'Stato', tipo: 'testo', larghezza: 18, valore: (r) => r.stato },
  { titolo: 'N. PdS', tipo: 'numero', larghezza: 9, valore: (r) => r.nPds },
  { titolo: 'Impegnato', tipo: 'importo', larghezza: 18, valore: (r) => euro(r.impegnato) },
  { titolo: 'Pagato', tipo: 'importo', larghezza: 16, valore: (r) => euro(r.pagato) },
];

export function rapportoElencoPds(viste: PdsVista[], esercizio: number): Rapporto {
  const perCapitolo = new Map<string, RigaCapitoloPds>();
  for (const v of viste) {
    const codice = v.capitolo?.codice ?? 'senza capitolo';
    const r = perCapitolo.get(codice) ?? { capitolo: codice, nPds: 0, trasmesso: 0, stipulato: 0, pagato: 0 };
    r.nPds += 1;
    r.trasmesso += v.pds.data_invio || v.pds.data_stipula ? (v.pds.importo_inviato ?? 0) : 0;
    r.stipulato += v.pds.data_stipula ? (v.pds.valore_stipula ?? 0) : 0;
    r.pagato += v.totalePagato;
    perCapitolo.set(codice, r);
  }
  const righeCapitolo = [...perCapitolo.values()].sort((a, b) => a.capitolo.localeCompare(b.capitolo, 'it', { numeric: true }));

  const righeStato: RigaStatoPds[] = ELENCO_STATI.map((stato: StatoPds) => {
    const elenco = viste.filter((v) => v.stato === stato);
    return {
      stato: STATI[stato].etichetta,
      nPds: elenco.length,
      impegnato: elenco.reduce((t, v) => t + importoImpegnato(v), 0),
      pagato: elenco.reduce((t, v) => t + v.totalePagato, 0),
    };
  });

  return {
    base: `elenco_pds_${esercizio}`,
    fogli: [
      foglio('Progetti di spesa', COLONNE_PDS, viste),
      foglio('Riepilogo per capitolo', COLONNE_RIEPILOGO_CAPITOLO, righeCapitolo),
      foglio('Riepilogo per stato', COLONNE_RIEPILOGO_STATO, righeStato),
    ],
    grafici: [
      {
        foglio: 1,
        nomeFoglio: 'Riepilogo per capitolo',
        titolo: `Impegnato e pagato per capitolo · esercizio ${esercizio}`,
        tipo: 'barre',
        categorie: 0,
        serie: [
          { colonna: 2, colore: COLORI.trasmesso },
          { colonna: 3, colore: COLORI.stipulato },
          { colonna: 4, colore: COLORI.pagato },
        ],
        righe: righeCapitolo.length,
        ancoraRiga: sotto(righeCapitolo.length),
      },
      {
        foglio: 2,
        nomeFoglio: 'Riepilogo per stato',
        titolo: 'Progetti di spesa per stato',
        tipo: 'barreOrizzontali',
        categorie: 0,
        serie: [{ colonna: 1, colore: COLORI.stipulato }],
        righe: righeStato.length,
        ancoraRiga: sotto(righeStato.length),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Sintesi finanziaria
// ---------------------------------------------------------------------------

export function rapportoSintesi(sintesi: SintesiFinanziaria, esercizio: number): Rapporto {
  const righe = sintesi.righe.map((r) => ({ ...r, esercizio: r.capitolo.esercizio, codice: r.capitolo.codice }));
  const totale = { ...sintesi.totale, esercizio: null, codice: 'TOTALE' };
  const colonne = colonneSintesi();
  // le colonne del foglio sintesi: 0 esercizio, 1 capitolo, 2 finanziato, 3 trasmesso, 5 stipulato, 8 pagato, 12 disponibile
  return {
    base: `sintesi_finanziaria_${esercizio}`,
    fogli: [
      foglio('Sintesi per capitolo', colonne, righe, totale),
      foglio('PdS', COLONNE_PDS, sintesi.righe.flatMap((r) => r.pds)),
    ],
    grafici: [
      {
        foglio: 0,
        nomeFoglio: 'Sintesi per capitolo',
        titolo: `Finanziato, impegnato e pagato per capitolo · esercizio ${esercizio}`,
        tipo: 'barre',
        categorie: 1,
        serie: [
          { colonna: 2, colore: COLORI.finanziato },
          { colonna: 3, colore: COLORI.trasmesso },
          { colonna: 5, colore: COLORI.stipulato },
          { colonna: 8, colore: COLORI.pagato },
        ],
        righe: righe.length,
        ancoraRiga: sotto(righe.length, true),
      },
      {
        foglio: 0,
        nomeFoglio: 'Sintesi per capitolo',
        titolo: 'Disponibile da impegnare e residuo da pagare',
        tipo: 'barre',
        categorie: 1,
        serie: [
          { colonna: 12, colore: COLORI.residuo },
          { colonna: 13, colore: COLORI.trasmesso },
        ],
        righe: righe.length,
        ancoraRiga: sotto(righe.length, true) + 20,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Capitoli di spesa
// ---------------------------------------------------------------------------

const COLONNE_CAPITOLI: ColonnaEsportazione<RigaSintesi>[] = [
  { titolo: 'Capitolo di spesa', tipo: 'testo', larghezza: 18, valore: (r) => r.capitolo.codice },
  { titolo: 'Esercizio finanziario', tipo: 'numero', larghezza: 11, valore: (r) => r.capitolo.esercizio },
  { titolo: 'Totale finanziato', tipo: 'importo', larghezza: 17, valore: (r) => euro(r.finanziato) },
  { titolo: 'Impegnato (Trasmesso)', tipo: 'importo', larghezza: 18, valore: (r) => euro(r.inviato) },
  { titolo: 'Impegnato (Stipulato)', tipo: 'importo', larghezza: 18, valore: (r) => euro(r.stipulato) },
  { titolo: 'Pagato', tipo: 'importo', larghezza: 16, valore: (r) => euro(r.pagato) },
  { titolo: 'Disponibile da impegnare', tipo: 'importo', larghezza: 18, valore: (r) => euro(r.disponibileDaImpegnare) },
  { titolo: 'Residuo da pagare', tipo: 'importo', larghezza: 17, valore: (r) => euro(r.residuoDaPagare) },
  { titolo: 'N. PdS', tipo: 'numero', larghezza: 9, valore: (r) => r.nPds },
  { titolo: 'Superamento autorizzato', tipo: 'testo', larghezza: 12, valore: (r) => (r.capitolo.sforamento_ignorato ? 'Sì' : 'No') },
  { titolo: 'Motivazione del superamento', tipo: 'testo', larghezza: 40, valore: (r) => r.capitolo.sforamento_note || null },
];

export function rapportoCapitoli(sintesi: SintesiFinanziaria, esercizio: number): Rapporto {
  return {
    base: `capitoli_di_spesa_${esercizio}`,
    fogli: [foglio('Capitoli di spesa', COLONNE_CAPITOLI, sintesi.righe)],
    grafici: [
      {
        foglio: 0,
        nomeFoglio: 'Capitoli di spesa',
        titolo: `Finanziato, impegnato e pagato · esercizio ${esercizio}`,
        tipo: 'barre',
        categorie: 0,
        serie: [
          { colonna: 2, colore: COLORI.finanziato },
          { colonna: 3, colore: COLORI.trasmesso },
          { colonna: 4, colore: COLORI.stipulato },
          { colonna: 5, colore: COLORI.pagato },
        ],
        righe: sintesi.righe.length,
        ancoraRiga: sotto(sintesi.righe.length),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Accordi quadro
// ---------------------------------------------------------------------------

interface RigaAtto {
  accordo: string;
  atto: string;
  oggetto: string | null;
  protocollo: string | null;
  dataStipula: string | null;
  durata: number;
  scadenza: string | null;
  valore: number;
  ordinato: number;
  residuo: number;
  pagato: number;
  nPds: number;
}

interface RigaOrdinativo {
  accordo: string;
  atto: string;
  vista: PdsVista;
}

const COLONNE_ACCORDI: ColonnaEsportazione<VistaAccordo>[] = [
  { titolo: 'Accordo quadro', tipo: 'testo', larghezza: 16, valore: (v) => v.accordo.numero },
  { titolo: 'Oggetto', tipo: 'testo', larghezza: 40, valore: (v) => v.accordo.oggetto },
  { titolo: 'Ditta', tipo: 'testo', larghezza: 26, valore: (v) => v.accordo.ditta },
  { titolo: 'Collaboratore/DEC', tipo: 'testo', larghezza: 22, valore: (v) => v.accordo.dec },
  { titolo: 'Protocollo di stipula', tipo: 'testo', larghezza: 16, valore: (v) => v.accordo.protocollo_stipula },
  { titolo: 'Data di stipula', tipo: 'data', larghezza: 12, valore: (v) => v.accordo.data_stipula },
  { titolo: 'Durata (giorni)', tipo: 'numero', larghezza: 11, valore: (v) => v.accordo.durata_giorni },
  { titolo: 'Scadenza', tipo: 'data', larghezza: 12, valore: (v) => v.scadenza },
  { titolo: 'Capienza contrattuale', tipo: 'importo', larghezza: 18, valore: (v) => euro(v.accordo.importo) },
  { titolo: 'Impegnato (atti di adesione)', tipo: 'importo', larghezza: 18, valore: (v) => euro(v.impegnatoAtti) },
  { titolo: 'Impegnato (ordinativi diretti)', tipo: 'importo', larghezza: 18, valore: (v) => euro(v.impegnatoDiretto) },
  { titolo: 'Impegnato totale', tipo: 'importo', larghezza: 18, valore: (v) => euro(v.impegnato) },
  { titolo: 'Residuo ordinabile', tipo: 'importo', larghezza: 18, valore: (v) => euro(v.residuo) },
  { titolo: 'Pagato', tipo: 'importo', larghezza: 16, valore: (v) => euro(v.pagato) },
  { titolo: 'N. ordinativi', tipo: 'numero', larghezza: 10, valore: (v) => v.nPds },
];

const COLONNE_ATTI: ColonnaEsportazione<RigaAtto>[] = [
  { titolo: 'Accordo quadro', tipo: 'testo', larghezza: 16, valore: (r) => r.accordo },
  { titolo: 'Atto di adesione', tipo: 'testo', larghezza: 16, valore: (r) => r.atto },
  { titolo: 'Oggetto', tipo: 'testo', larghezza: 40, valore: (r) => r.oggetto },
  { titolo: 'Protocollo di stipula', tipo: 'testo', larghezza: 16, valore: (r) => r.protocollo },
  { titolo: 'Data di stipula', tipo: 'data', larghezza: 12, valore: (r) => r.dataStipula },
  { titolo: 'Durata (giorni)', tipo: 'numero', larghezza: 11, valore: (r) => r.durata },
  { titolo: 'Scadenza', tipo: 'data', larghezza: 12, valore: (r) => r.scadenza },
  { titolo: 'Valore stipulato', tipo: 'importo', larghezza: 18, valore: (r) => euro(r.valore) },
  { titolo: 'Ordinato', tipo: 'importo', larghezza: 16, valore: (r) => euro(r.ordinato) },
  { titolo: 'Residuo ordinabile', tipo: 'importo', larghezza: 18, valore: (r) => euro(r.residuo) },
  { titolo: 'Pagato', tipo: 'importo', larghezza: 16, valore: (r) => euro(r.pagato) },
  { titolo: 'N. ordinativi', tipo: 'numero', larghezza: 10, valore: (r) => r.nPds },
];

const COLONNE_ORDINATIVI: ColonnaEsportazione<RigaOrdinativo>[] = [
  { titolo: 'Accordo quadro', tipo: 'testo', larghezza: 16, valore: (r) => r.accordo },
  { titolo: 'Atto di adesione', tipo: 'testo', larghezza: 16, valore: (r) => r.atto },
  { titolo: 'Numero PdS', tipo: 'testo', larghezza: 14, valore: (r) => r.vista.numeroCompleto },
  { titolo: 'Stato', tipo: 'testo', larghezza: 16, valore: (r) => STATI[r.vista.stato].etichetta },
  { titolo: 'Ordinativo', tipo: 'testo', larghezza: 18, valore: (r) => r.vista.pds.ordinativo },
  { titolo: 'Capitolo di spesa', tipo: 'testo', larghezza: 14, valore: (r) => r.vista.capitolo?.codice ?? null },
  { titolo: 'Ditta', tipo: 'testo', larghezza: 26, valore: (r) => r.vista.pds.ditta },
  { titolo: 'Impegnato', tipo: 'importo', larghezza: 16, valore: (r) => euro(importoImpegnato(r.vista)) },
  { titolo: 'Pagato', tipo: 'importo', larghezza: 16, valore: (r) => euro(r.vista.totalePagato) },
  { titolo: 'Scadenza esecuzione', tipo: 'data', larghezza: 12, valore: (r) => r.vista.scadenza },
];

export function rapportoAccordi(accordi: VistaAccordo[]): Rapporto {
  const atti: RigaAtto[] = accordi.flatMap((a) =>
    a.atti.map((t) => ({
      accordo: a.accordo.numero,
      atto: t.atto.numero,
      oggetto: t.atto.oggetto,
      protocollo: t.atto.protocollo_stipula,
      dataStipula: t.atto.data_stipula,
      durata: t.atto.durata_giorni,
      scadenza: scadenzaContrattuale(t.atto.data_stipula, t.atto.durata_giorni),
      valore: t.atto.valore,
      ordinato: t.impegnato,
      residuo: t.residuo,
      pagato: t.pagato,
      nPds: t.pds.length,
    })),
  );
  const ordinativi: RigaOrdinativo[] = accordi.flatMap((a) =>
    a.pds.map((v) => ({
      accordo: a.accordo.numero,
      atto: a.atti.find((t) => t.atto.id === v.pds.atto_adesione_id)?.atto.numero ?? 'quantità determinata',
      vista: v,
    })),
  );

  return {
    base: 'accordi_quadro',
    fogli: [
      foglio('Accordi quadro', COLONNE_ACCORDI, accordi),
      foglio('Atti di adesione', COLONNE_ATTI, atti),
      foglio('Ordinativi', COLONNE_ORDINATIVI, ordinativi),
    ],
    grafici: [
      {
        foglio: 0,
        nomeFoglio: 'Accordi quadro',
        titolo: 'Capienza, impegnato e pagato per accordo quadro',
        tipo: 'barre',
        categorie: 0,
        serie: [
          { colonna: 8, colore: COLORI.capienza },
          { colonna: 11, colore: COLORI.stipulato },
          { colonna: 13, colore: COLORI.pagato },
        ],
        righe: accordi.length,
        ancoraRiga: sotto(accordi.length),
      },
      ...(atti.length
        ? [
            {
              foglio: 1,
              nomeFoglio: 'Atti di adesione',
              titolo: 'Valore stipulato e ordinato per atto di adesione',
              tipo: 'barre' as const,
              categorie: 1,
              serie: [
                { colonna: 7, colore: COLORI.capienza },
                { colonna: 8, colore: COLORI.stipulato },
                { colonna: 10, colore: COLORI.pagato },
              ],
              righe: atti.length,
              ancoraRiga: sotto(atti.length),
            },
          ]
        : []),
    ],
  };
}
