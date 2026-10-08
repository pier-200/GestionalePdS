import { ErroreApp } from './errori';
import { parseImporto } from './importi';
import type { RigaSiefin } from './tipi';

/**
 * Lettura dell'export SIEFIN ("Export_gg_mm_aaaa hh_mm_ss.xls"): nonostante
 * l'estensione è una tabella HTML. Le colonne sono cercate per intestazione,
 * così l'import non dipende dalla loro posizione.
 */

const COLONNE = {
  idv: 'IDV',
  voce: 'VOCE SPESA',
  cpt: 'CPT',
  art: 'ART',
  ptf: 'PTF',
  pc3: 'PC3',
  assegnato: 'ASSEGNATO',
  cod_attivita: 'CODATTIVITA',
  desc_attivita: 'DESCATTIVITA',
  decreto: 'DECRETO',
} as const;

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function testoCella(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (tutto, e: string) => {
      if (e[0] !== '#') return ENTITA[e.toLowerCase()] ?? tutto;
      const codice = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(codice) ? String.fromCodePoint(codice) : tutto;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function leggiExportSiefin(html: string): RigaSiefin[] {
  const tabella = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
    [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => testoCella(c[1])),
  );
  const intestazione = tabella[0]?.map((x) => x.toUpperCase()) ?? [];
  const indice = Object.fromEntries(Object.entries(COLONNE).map(([campo, titolo]) => [campo, intestazione.indexOf(titolo)])) as Record<keyof typeof COLONNE, number>;
  const mancanti = Object.entries(COLONNE)
    .filter(([campo]) => indice[campo as keyof typeof COLONNE] < 0)
    .map(([, titolo]) => titolo);
  if (mancanti.length) {
    throw new ErroreApp('VALIDAZIONE', `Il file non è un export SIEFIN valido: ${tabella.length ? `mancano le colonne ${mancanti.join(', ')}` : 'nessuna tabella trovata'}.`);
  }

  const righe: RigaSiefin[] = [];
  const visti = new Set<string>();
  for (const celle of tabella.slice(1)) {
    const idv = celle[indice.idv] ?? '';
    if (!idv) continue;
    if (visti.has(idv)) throw new ErroreApp('VALIDAZIONE', `Export SIEFIN: l'IDV ${idv} compare più volte.`);
    visti.add(idv);
    const assegnato = parseImporto(celle[indice.assegnato] ?? '');
    if (assegnato == null) throw new ErroreApp('VALIDAZIONE', `Export SIEFIN: importo assegnato non valido per l'IDV ${idv} ("${celle[indice.assegnato] ?? ''}").`);
    const [cpt, art, ptf] = [celle[indice.cpt], celle[indice.art], celle[indice.ptf]];
    if (!cpt || !art || !ptf) throw new ErroreApp('VALIDAZIONE', `Export SIEFIN: capitolo (CPT/ART/PTF) incompleto per l'IDV ${idv}.`);
    righe.push({
      idv,
      voce: celle[indice.voce] ?? '',
      codice: `${cpt}/${art}/${ptf}`,
      decreto: celle[indice.decreto] ?? '',
      pc3: celle[indice.pc3] ?? '',
      cod_attivita: celle[indice.cod_attivita] ?? '',
      desc_attivita: celle[indice.desc_attivita] ?? '',
      assegnato,
    });
  }
  if (righe.length === 0) throw new ErroreApp('VALIDAZIONE', 'Il file SIEFIN non contiene alcun IDV.');
  return righe;
}
