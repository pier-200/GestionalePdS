import { confrontoNaturale, type PdsVista } from './calcoli';
import { rapporto } from './importi';
import { invioAvvenuto, stipulaAvvenuta } from './stato';
import type { Capitolo, Centesimi } from './tipi';

/**
 * Sintesi finanziaria (sez. 6).
 * - Impegnato (Trasmesso): somma degli importi inviati dei PdS inviati.
 * - Impegnato (Stipulato): somma dei valori di stipula dei soli PdS stipulati;
 *   gli importi dei PdS inviati ma non ancora stipulati sono riportati a parte
 *   ("tra parentesi"). Un PdS scaduto resta conteggiato tra gli stipulati.
 * - Effettivo pagato: somma di tutti i pagamenti registrati.
 * - Economie: somma di (stipulato − pagato a saldo) sui PdS saldati; non sono
 *   esposte come voce a sé ma rientrano nel disponibile da impegnare.
 */
export interface ValoriSintesi {
  finanziato: Centesimi;
  inviato: Centesimi;
  stipulato: Centesimi;
  /** Importi inviati relativi a PdS non ancora stipulati. */
  inviatoNonStipulato: Centesimi;
  pagato: Centesimi;
  economie: Centesimi;
  /** Quanto resta da pagare sui PdS stipulati e non ancora saldati. */
  residuoDaPagare: Centesimi;
  /** Finanziato non ancora impegnato con stipula (negativo in caso di sforamento). */
  disponibileSuStipulato: Centesimi;
  /** Importo ancora impegnabile sul capitolo: finanziato − stipulato + economie. */
  disponibileDaImpegnare: Centesimi;
  percInviato: number | null;
  percStipulato: number | null;
  percPagato: number | null;
  /** Pagato rispetto allo stipulato: tende al 100% (meno le economie) a chiusura. */
  percPagatoSuStipulato: number | null;
  sforamentoInviato: Centesimi;
  sforamentoStipulato: Centesimi;
  nPds: number;
  nInPreparazione: number;
  nInviati: number;
  nStipulati: number;
  nSaldati: number;
}

export interface RigaSintesi extends ValoriSintesi {
  capitolo: Capitolo;
  pds: PdsVista[];
}

export interface SintesiFinanziaria {
  righe: RigaSintesi[];
  totale: ValoriSintesi;
  capitoliInSforamento: RigaSintesi[];
}

function completa(
  v: Omit<
    ValoriSintesi,
    'percInviato' | 'percStipulato' | 'percPagato' | 'percPagatoSuStipulato' | 'sforamentoInviato' | 'sforamentoStipulato' | 'disponibileSuStipulato' | 'disponibileDaImpegnare'
  >,
): ValoriSintesi {
  return {
    ...v,
    disponibileSuStipulato: v.finanziato - v.stipulato,
    disponibileDaImpegnare: v.finanziato - v.stipulato + v.economie,
    percInviato: rapporto(v.inviato, v.finanziato),
    percStipulato: rapporto(v.stipulato, v.finanziato),
    percPagato: rapporto(v.pagato, v.finanziato),
    percPagatoSuStipulato: rapporto(v.pagato, v.stipulato),
    sforamentoInviato: Math.max(0, v.inviato - v.finanziato),
    sforamentoStipulato: Math.max(0, v.stipulato - v.finanziato),
  };
}

export function valoriCapitolo(finanziato: Centesimi, elenco: PdsVista[]): ValoriSintesi {
  let inviato = 0;
  let stipulato = 0;
  let inviatoNonStipulato = 0;
  let pagato = 0;
  let economie = 0;
  let residuoDaPagare = 0;
  let nInPreparazione = 0;
  let nInviati = 0;
  let nStipulati = 0;
  let nSaldati = 0;
  for (const v of elenco) {
    const p = v.pds;
    pagato += v.totalePagato;
    if (invioAvvenuto(p)) {
      nInviati++;
      inviato += p.importo_inviato ?? 0;
    } else {
      nInPreparazione++;
    }
    if (stipulaAvvenuta(p)) {
      nStipulati++;
      stipulato += p.valore_stipula ?? 0;
      if (!p.saldato) residuoDaPagare += Math.max(0, (p.valore_stipula ?? 0) - v.totalePagato);
    } else if (invioAvvenuto(p)) {
      inviatoNonStipulato += p.importo_inviato ?? 0;
    }
    if (p.saldato) {
      nSaldati++;
      economie += v.economia ?? 0;
    }
  }
  return completa({
    finanziato,
    inviato,
    stipulato,
    inviatoNonStipulato,
    pagato,
    economie,
    residuoDaPagare,
    nPds: elenco.length,
    nInPreparazione,
    nInviati,
    nStipulati,
    nSaldati,
  });
}

export function inSforamento(v: Pick<ValoriSintesi, 'sforamentoInviato' | 'sforamentoStipulato'>): boolean {
  return v.sforamentoInviato > 0 || v.sforamentoStipulato > 0;
}

/**
 * Sforamento da segnalare all'utente: l'amministratore può autorizzare il
 * superamento del finanziato di un capitolo, motivandolo nelle note.
 */
export function sforamentoDaSegnalare(r: RigaSintesi): boolean {
  return inSforamento(r) && !r.capitolo.sforamento_ignorato;
}

/**
 * Calcola la sintesi per i capitoli indicati (già filtrati per esercizio).
 * I PdS vengono associati al capitolo tramite `capitolo_id`.
 */
export function calcolaSintesi(capitoli: Capitolo[], viste: PdsVista[]): SintesiFinanziaria {
  const perCapitolo = new Map<string, PdsVista[]>();
  for (const v of viste) {
    const elenco = perCapitolo.get(v.pds.capitolo_id);
    if (elenco) elenco.push(v);
    else perCapitolo.set(v.pds.capitolo_id, [v]);
  }
  const righe: RigaSintesi[] = [...capitoli]
    .sort((a, b) => b.esercizio - a.esercizio || confrontoNaturale(a.codice, b.codice))
    .map((capitolo) => {
      const pds = perCapitolo.get(capitolo.id) ?? [];
      return { capitolo, pds, ...valoriCapitolo(capitolo.finanziato, pds) };
    });

  const somma = (campo: keyof ValoriSintesi) => righe.reduce((t, r) => t + (r[campo] as number), 0);
  const totale = completa({
    finanziato: somma('finanziato'),
    inviato: somma('inviato'),
    stipulato: somma('stipulato'),
    inviatoNonStipulato: somma('inviatoNonStipulato'),
    pagato: somma('pagato'),
    economie: somma('economie'),
    residuoDaPagare: somma('residuoDaPagare'),
    nPds: somma('nPds'),
    nInPreparazione: somma('nInPreparazione'),
    nInviati: somma('nInviati'),
    nStipulati: somma('nStipulati'),
    nSaldati: somma('nSaldati'),
  });
  return { righe, totale, capitoliInSforamento: righe.filter(sforamentoDaSegnalare) };
}
