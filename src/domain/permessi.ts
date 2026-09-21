import type { AreaPermesso, Capitolo, Pds, Permessi, Utente } from './tipi';

/**
 * Regole dei permessi (sez. 3), condivise da interfaccia e motore locale.
 * Il backend Supabase applica le stesse regole lato server (RLS e trigger).
 *
 * - Gli utenti attivi possono sempre visualizzare i dati condivisi.
 * - L'amministratore può tutto, compresa la gestione di utenti e permessi.
 * - Gli altri utenti possono modificare solo le aree concesse e, per i PdS,
 *   solo nell'ambito dei capitoli assegnati (se l'ambito è limitato).
 */

export const AREE_PERMESSO: { area: AreaPermesso; etichetta: string; descrizione: string }[] = [
  {
    area: 'capitoli',
    etichetta: 'Capitoli di spesa',
    descrizione: 'Creare, modificare ed eliminare i capitoli di spesa e i relativi finanziamenti',
  },
  {
    area: 'accordi',
    etichetta: 'Accordi quadro',
    descrizione: 'Creare, modificare ed eliminare accordi quadro e atti di adesione',
  },
  {
    area: 'pds_crea',
    etichetta: 'Creazione ed eliminazione PdS',
    descrizione: "Inserire nuovi progetti di spesa ed eliminarli (i PdS eliminati restano ripristinabili dall'amministratore)",
  },
  {
    area: 'pds_dati',
    etichetta: 'Dati del PdS',
    descrizione: 'Modificare dati identificativi, invio, stipula, tempi di esecuzione e note',
  },
  {
    area: 'pds_pagamenti',
    etichetta: 'Pagamenti e saldo',
    descrizione: 'Registrare i pagamenti e confermare o annullare il saldo',
  },
  {
    area: 'pds_allegati',
    etichetta: 'Allegati',
    descrizione: 'Aggiungere ed eliminare allegati e collegamenti ai documenti',
  },
];

/** Campi del PdS modificabili con il permesso `pds_dati`. */
export const CAMPI_DATI_PDS = [
  'numero',
  'capitolo_id',
  'accordo_id',
  'atto_adesione_id',
  'ditta',
  'ordinativo',
  'idv',
  'dec',
  'importo_inviato',
  'protocollo_invio',
  'data_invio',
  'protocollo_stipula',
  'data_stipula',
  'valore_stipula',
  'modalita_termine',
  'durata',
  'durata_unita',
  'data_termine',
  'note',
] as const satisfies readonly (keyof Pds)[];

/** Campi del saldo, modificabili solo tramite conferma/annullamento saldo. */
export const CAMPI_SALDO_PDS = ['saldato', 'data_saldo', 'totale_pagato_saldo'] as const satisfies readonly (keyof Pds)[];

export type CampoDatiPds = (typeof CAMPI_DATI_PDS)[number];

export function isAdmin(utente: Utente | null | undefined): boolean {
  return Boolean(utente && utente.attivo && utente.ruolo === 'admin');
}

export function ambitoComprende(permessi: Permessi, codiceCapitolo: string | null | undefined): boolean {
  if (permessi.ambito_capitoli == null) return true;
  if (!codiceCapitolo) return false;
  const codice = codiceCapitolo.trim().toLowerCase();
  return permessi.ambito_capitoli.some((c) => c.trim().toLowerCase() === codice);
}

/**
 * Verifica un permesso di modifica. Per le aree relative ai PdS va indicato il
 * capitolo interessato; senza capitolo si verifica solo il possesso dell'area
 * (utile per mostrare pulsanti come "Nuovo PdS").
 */
export function puo(
  utente: Utente | null | undefined,
  area: AreaPermesso,
  capitolo?: Pick<Capitolo, 'codice'> | null,
): boolean {
  if (!utente || !utente.attivo) return false;
  if (utente.ruolo === 'admin') return true;
  if (!utente.permessi[area]) return false;
  if (area === 'capitoli' || area === 'accordi' || capitolo === undefined) return true;
  return ambitoComprende(utente.permessi, capitolo?.codice);
}

/** L'utente ha almeno un permesso di modifica? */
export function haQualchePermesso(utente: Utente | null | undefined): boolean {
  if (!utente || !utente.attivo) return false;
  if (utente.ruolo === 'admin') return true;
  const p = utente.permessi;
  return p.capitoli || p.accordi || p.pds_crea || p.pds_dati || p.pds_pagamenti || p.pds_allegati;
}

export function normalizzaPermessi(p: Partial<Permessi> | null | undefined): Permessi {
  const ambito = p?.ambito_capitoli;
  return {
    capitoli: Boolean(p?.capitoli),
    accordi: Boolean(p?.accordi),
    pds_crea: Boolean(p?.pds_crea),
    pds_dati: Boolean(p?.pds_dati),
    pds_pagamenti: Boolean(p?.pds_pagamenti),
    pds_allegati: Boolean(p?.pds_allegati),
    ambito_capitoli: Array.isArray(ambito)
      ? [...new Set(ambito.map((c) => String(c).trim()).filter(Boolean))]
      : null,
  };
}

export function descriviPermessi(utente: Utente): string {
  if (utente.ruolo === 'admin') return 'Amministratore: tutti i permessi';
  const aree = AREE_PERMESSO.filter((a) => utente.permessi[a.area]).map((a) => a.etichetta);
  if (aree.length === 0) return 'Sola lettura';
  const ambito = utente.permessi.ambito_capitoli;
  const suffisso = ambito == null ? '' : ` (capitoli: ${ambito.length ? ambito.join(', ') : 'nessuno'})`;
  return aree.join(', ') + suffisso;
}
