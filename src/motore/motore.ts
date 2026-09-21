import { numeroPds } from '../domain/calcoli';
import type { Comando, DatiPds, FileAllegato, RisultatoComando } from '../domain/comandi';
import { isDataISO } from '../domain/date';
import { ErroreApp } from '../domain/errori';
import { CAMPI_DATI_PDS, isAdmin, puo } from '../domain/permessi';
import { differenze, etichettaCampo, istantanea, valoriUguali } from '../domain/registro';
import type {
  AccordoQuadro,
  AreaPermesso,
  AttoAdesione,
  Capitolo,
  DatiCondivisi,
  EntitaRegistro,
  ID,
  Istante,
  ModificaCampo,
  Pagamento,
  Pds,
  Utente,
  VoceRegistro,
  Allegato,
} from '../domain/tipi';
import {
  chiaveCapitolo,
  normalizzaTermine,
  validaDatiAccordo,
  validaDatiAllegato,
  validaDatiAtto,
  validaDatiCapitolo,
  validaDatiPagamento,
  validaDatiPds,
  validaDatiUtente,
  validaPassword,
} from '../domain/validazione';
import type { DatiUtente } from '../domain/comandi';

/**
 * Motore locale: applica un comando ai dati condivisi in modo puro (senza I/O),
 * verificando permessi, validazioni, conflitti e producendo le voci di registro.
 * È usato dai backend "demo" e "GitHub"; il backend Supabase applica le stesse
 * regole lato database.
 */

export interface ContestoComando {
  /** Utente che esegue il comando (i permessi sono riletti dai dati correnti). */
  utenteId: ID;
  ora: Istante;
  nuovoId: () => string;
  /** Percorso di archiviazione per un nuovo file allegato. */
  percorsoFile: (pdsId: ID, allegatoId: ID, nomeFile: string) => string;
}

export type Effetto =
  | { tipo: 'file.carica'; path: string; file: FileAllegato }
  | { tipo: 'file.elimina'; path: string }
  | { tipo: 'credenziali.imposta'; utente: Utente; password: string }
  | { tipo: 'credenziali.aggiorna'; utente: Utente }
  | { tipo: 'credenziali.elimina'; utente: Utente };

export interface EsitoMotore {
  dati: DatiCondivisi;
  voci: VoceRegistro[];
  effetti: Effetto[];
  risultato: RisultatoComando;
}

const CAMPI_CAPITOLO = ['esercizio', 'codice', 'descrizione', 'finanziato', 'sforamento_ignorato', 'sforamento_note'] as const;
/** Campi del capitolo riservati all'amministratore (autorizzazione del superamento del finanziato). */
const CAMPI_CAPITOLO_ADMIN = ['sforamento_ignorato', 'sforamento_note'] as const;
const CAMPI_PAGAMENTO = ['data', 'importo', 'riferimento', 'note'] as const;
const CAMPI_ALLEGATO = ['tipo', 'titolo', 'url', 'file_nome'] as const;
const CAMPI_UTENTE = ['username', 'nome', 'ruolo', 'attivo', 'permessi'] as const;
const CAMPI_SALDO = ['saldato', 'data_saldo', 'totale_pagato_saldo'] as const;
const CAMPI_ELIMINAZIONE = ['eliminato_at', 'eliminato_da'] as const;
const CAMPI_ACCORDO = ['numero', 'oggetto', 'ditta', 'dec', 'protocollo_stipula', 'data_stipula', 'durata_giorni', 'importo', 'note'] as const;
const CAMPI_ATTO = ['numero', 'oggetto', 'protocollo_stipula', 'data_stipula', 'durata_giorni', 'valore', 'note'] as const;

export function riferimentoCapitolo(c: Pick<Capitolo, 'codice' | 'esercizio'>): string {
  return `${c.codice} (${c.esercizio})`;
}

export function riferimentoAccordo(a: Pick<AccordoQuadro, 'numero'>): string {
  return a.numero;
}

export function riferimentoAtto(a: Pick<AttoAdesione, 'numero'>, accordo: Pick<AccordoQuadro, 'numero'> | undefined): string {
  return accordo ? `${a.numero} (AQ ${accordo.numero})` : a.numero;
}

export function riferimentoAllegato(a: Pick<Allegato, 'titolo'>, numero: string | undefined): string {
  return numero ? `"${a.titolo}" – PdS ${numero}` : `"${a.titolo}"`;
}

class Esecuzione {
  dati: DatiCondivisi;
  readonly voci: VoceRegistro[] = [];
  readonly effetti: Effetto[] = [];
  readonly utente: Utente;

  constructor(
    dati: DatiCondivisi,
    readonly ctx: ContestoComando,
  ) {
    this.dati = dati;
    const utente = dati.utenti.find((u) => u.id === ctx.utenteId);
    if (!utente || !utente.attivo) {
      throw new ErroreApp('PERMESSO_NEGATO', 'Utente non abilitato ad operare sui dati.');
    }
    this.utente = utente;
  }

  registra(
    entita: EntitaRegistro,
    entitaId: ID | null,
    pdsId: ID | null,
    azione: VoceRegistro['azione'],
    riferimento: string | null,
    modifiche: Record<string, ModificaCampo> | null,
  ) {
    this.voci.push({
      id: this.ctx.nuovoId(),
      ts: this.ctx.ora,
      utente_id: this.utente.id,
      username: this.utente.username,
      entita,
      entita_id: entitaId,
      pds_id: pdsId,
      azione,
      riferimento,
      modifiche,
    });
  }

  richiedi(area: AreaPermesso, capitolo: Capitolo | undefined | null, descrizione: string) {
    if (!puo(this.utente, area, capitolo === undefined ? null : capitolo)) {
      const ambito = capitolo && area !== 'capitoli' ? ` sul capitolo ${capitolo.codice}` : '';
      throw new ErroreApp('PERMESSO_NEGATO', `Non hai i permessi per ${descrizione}${ambito}.`);
    }
  }

  richiediAdmin() {
    if (!isAdmin(this.utente)) {
      throw new ErroreApp('PERMESSO_NEGATO', "Operazione riservata all'amministratore.");
    }
  }

  capitolo(id: ID): Capitolo {
    const c = this.dati.capitoli.find((x) => x.id === id);
    if (!c) throw new ErroreApp('NON_TROVATO', 'Capitolo di spesa non trovato (potrebbe essere stato eliminato).');
    return c;
  }

  pds(id: ID): Pds {
    const p = this.dati.pds.find((x) => x.id === id);
    if (!p) throw new ErroreApp('NON_TROVATO', 'PdS non trovato (potrebbe essere stato eliminato).');
    return p;
  }

  /** Numero del PdS come lo vede l'utente ("18/2026"), usato nelle voci di registro. */
  riferimentoPds(p: Pick<Pds, 'numero' | 'capitolo_id'>): string {
    return numeroPds(p, this.dati.capitoli.find((k) => k.id === p.capitolo_id)?.esercizio ?? null);
  }

  accordo(id: ID): AccordoQuadro {
    const a = this.dati.accordi.find((x) => x.id === id);
    if (!a) throw new ErroreApp('NON_TROVATO', 'Accordo quadro non trovato (potrebbe essere stato eliminato).');
    return a;
  }

  atto(id: ID): AttoAdesione {
    const a = this.dati.atti.find((x) => x.id === id);
    if (!a) throw new ErroreApp('NON_TROVATO', 'Atto di adesione non trovato (potrebbe essere stato eliminato).');
    return a;
  }

  /** Accordo quadro e atto di adesione devono essere coerenti fra loro. */
  verificaCollegamentoAccordo(p: Pick<Pds, 'accordo_id' | 'atto_adesione_id'>) {
    if (p.atto_adesione_id != null && p.accordo_id == null) {
      throw new ErroreApp('VALIDAZIONE', "Indicare l'accordo quadro dell'atto di adesione scelto.");
    }
    if (p.accordo_id != null) this.accordo(p.accordo_id);
    if (p.atto_adesione_id != null) {
      const atto = this.atto(p.atto_adesione_id);
      if (atto.accordo_id !== p.accordo_id) {
        throw new ErroreApp('VALIDAZIONE', "L'atto di adesione scelto appartiene a un altro accordo quadro.");
      }
    }
  }

  pagamento(id: ID): Pagamento {
    const p = this.dati.pagamenti.find((x) => x.id === id);
    if (!p) throw new ErroreApp('NON_TROVATO', 'Pagamento non trovato (potrebbe essere stato eliminato).');
    return p;
  }

  tracciaNuovo() {
    return { created_at: this.ctx.ora, created_by: this.utente.id, updated_at: this.ctx.ora, updated_by: this.utente.id };
  }

  tracciaModifica() {
    return { updated_at: this.ctx.ora, updated_by: this.utente.id };
  }
}

/** Respinge la modifica se i campi toccati sono cambiati rispetto a quanto visto dall'utente. */
function verificaConflitto(entita: EntitaRegistro, corrente: object, modifiche: object, originale: object) {
  const cambiati: string[] = [];
  for (const campo of Object.keys(modifiche)) {
    if (!Object.prototype.hasOwnProperty.call(originale, campo)) continue;
    const attuale = (corrente as Record<string, unknown>)[campo];
    const visto = (originale as Record<string, unknown>)[campo];
    if (!valoriUguali(attuale, visto)) cambiati.push(etichettaCampo(entita, campo));
  }
  if (cambiati.length) {
    throw new ErroreApp(
      'CONFLITTO',
      `Nel frattempo un altro utente ha modificato: ${cambiati.join(', ')}. Ricarica i dati e ripeti la modifica.`,
    );
  }
}

function sostituisci<T extends { id: ID }>(elenco: T[], nuovo: T): T[] {
  return elenco.map((x) => (x.id === nuovo.id ? nuovo : x));
}

function verificaNonSaldato(p: Pds, numero: string) {
  if (p.saldato) {
    throw new ErroreApp('VINCOLO', `Il PdS ${numero} risulta saldato: annulla il saldo per modificare i pagamenti.`);
  }
}

/** Sui PdS spostati tra gli eliminati non si può operare: va prima ripristinato. */
function verificaNonEliminato(p: Pds, numero: string) {
  if (p.eliminato_at != null) {
    throw new ErroreApp('VINCOLO', `Il PdS ${numero} è tra i PdS eliminati: ripristinalo per poterlo modificare.`);
  }
}

function adminAttiviDopo(utenti: Utente[]): number {
  return utenti.filter((u) => u.attivo && u.ruolo === 'admin').length;
}

export function applicaComando(dati: DatiCondivisi, comando: Comando, ctx: ContestoComando): EsitoMotore {
  const x = new Esecuzione(dati, ctx);
  const risultato = esegui(x, comando);
  return { dati: x.dati, voci: x.voci, effetti: x.effetti, risultato };
}

function esegui(x: Esecuzione, c: Comando): RisultatoComando {
  switch (c.tipo) {
    // -----------------------------------------------------------------------
    case 'capitolo.crea': {
      x.richiedi('capitoli', undefined, 'gestire i capitoli di spesa');
      const d = validaDatiCapitolo(c.dati) as Required<ReturnType<typeof validaDatiCapitolo>>;
      if (d.sforamento_ignorato) x.richiediAdmin();
      const chiave = chiaveCapitolo(d.esercizio, d.codice);
      if (x.dati.capitoli.some((k) => chiaveCapitolo(k.esercizio, k.codice) === chiave)) {
        throw new ErroreApp('DUPLICATO', `Il capitolo ${d.codice} esiste già per l'esercizio ${d.esercizio}.`);
      }
      const nuovo: Capitolo = { id: x.ctx.nuovoId(), ...d, ...x.tracciaNuovo() };
      x.dati = { ...x.dati, capitoli: [...x.dati.capitoli, nuovo] };
      x.registra('capitolo', nuovo.id, null, 'creazione', riferimentoCapitolo(nuovo), istantanea(nuovo, CAMPI_CAPITOLO, true));
      return { id: nuovo.id };
    }

    case 'capitolo.modifica': {
      x.richiedi('capitoli', undefined, 'gestire i capitoli di spesa');
      const corrente = x.capitolo(c.id);
      verificaConflitto('capitolo', corrente, c.modifiche, c.originale);
      const d = validaDatiCapitolo(c.modifiche, true);
      const aggiornato: Capitolo = { ...corrente, ...d };
      const diff = differenze(corrente, aggiornato, CAMPI_CAPITOLO);
      if (Object.keys(diff).length === 0) return { id: corrente.id };
      // l'autorizzazione al superamento del finanziato la concede solo l'amministratore
      if (CAMPI_CAPITOLO_ADMIN.some((k) => diff[k])) x.richiediAdmin();
      if (diff.esercizio || diff.codice) {
        const chiave = chiaveCapitolo(aggiornato.esercizio, aggiornato.codice);
        if (x.dati.capitoli.some((k) => k.id !== corrente.id && chiaveCapitolo(k.esercizio, k.codice) === chiave)) {
          throw new ErroreApp('DUPLICATO', `Il capitolo ${aggiornato.codice} esiste già per l'esercizio ${aggiornato.esercizio}.`);
        }
      }
      if (diff.esercizio && x.dati.pds.some((p) => p.capitolo_id === corrente.id)) {
        throw new ErroreApp('VINCOLO', "Non è possibile cambiare l'esercizio di un capitolo a cui sono collegati dei PdS.");
      }
      const finale = { ...aggiornato, ...x.tracciaModifica() };
      x.dati = { ...x.dati, capitoli: sostituisci(x.dati.capitoli, finale) };
      x.registra('capitolo', finale.id, null, 'modifica', riferimentoCapitolo(finale), diff);
      return { id: finale.id };
    }

    case 'capitolo.elimina': {
      x.richiedi('capitoli', undefined, 'gestire i capitoli di spesa');
      const corrente = x.capitolo(c.id);
      const collegati = x.dati.pds.filter((p) => p.capitolo_id === corrente.id).length;
      if (collegati > 0) {
        throw new ErroreApp(
          'VINCOLO',
          `Il capitolo ${corrente.codice} (${corrente.esercizio}) ha ${collegati} PdS collegat${collegati === 1 ? 'o' : 'i'}: eliminali o spostali su un altro capitolo prima di eliminarlo.`,
        );
      }
      x.dati = { ...x.dati, capitoli: x.dati.capitoli.filter((k) => k.id !== corrente.id) };
      x.registra('capitolo', corrente.id, null, 'eliminazione', riferimentoCapitolo(corrente), istantanea(corrente, CAMPI_CAPITOLO, false));
      return { id: corrente.id };
    }

    case 'capitoli.copia': {
      x.richiedi('capitoli', undefined, 'gestire i capitoli di spesa');
      if (c.esercizioOrigine === c.esercizioDestinazione) {
        throw new ErroreApp('VALIDAZIONE', "L'esercizio di destinazione deve essere diverso da quello di origine.");
      }
      validaDatiCapitolo({ esercizio: c.esercizioDestinazione }, true);
      const esistenti = new Set(x.dati.capitoli.map((k) => chiaveCapitolo(k.esercizio, k.codice)));
      const origine = x.dati.capitoli.filter((k) => k.esercizio === c.esercizioOrigine);
      const nuovi: Capitolo[] = [];
      for (const k of origine) {
        if (esistenti.has(chiaveCapitolo(c.esercizioDestinazione, k.codice))) continue;
        nuovi.push({
          id: x.ctx.nuovoId(),
          esercizio: c.esercizioDestinazione,
          codice: k.codice,
          descrizione: k.descrizione,
          finanziato: c.copiaImporti ? k.finanziato : 0,
          sforamento_ignorato: false,
          sforamento_note: '',
          ...x.tracciaNuovo(),
        });
      }
      x.dati = { ...x.dati, capitoli: [...x.dati.capitoli, ...nuovi] };
      for (const n of nuovi) {
        x.registra('capitolo', n.id, null, 'creazione', riferimentoCapitolo(n), istantanea(n, CAMPI_CAPITOLO, true));
      }
      return { conteggio: nuovi.length };
    }

    // -----------------------------------------------------------------------
    case 'accordo.crea': {
      x.richiedi('accordi', undefined, 'gestire gli accordi quadro');
      const d = validaDatiAccordo(c.dati) as Required<ReturnType<typeof validaDatiAccordo>>;
      if (x.dati.accordi.some((a) => a.numero.trim().toLowerCase() === d.numero.trim().toLowerCase())) {
        throw new ErroreApp('DUPLICATO', `L'accordo quadro ${d.numero} esiste già.`);
      }
      const nuovo: AccordoQuadro = { id: x.ctx.nuovoId(), ...d, ...x.tracciaNuovo() };
      x.dati = { ...x.dati, accordi: [...x.dati.accordi, nuovo] };
      x.registra('accordo', nuovo.id, null, 'creazione', riferimentoAccordo(nuovo), istantanea(nuovo, CAMPI_ACCORDO, true));
      return { id: nuovo.id };
    }

    case 'accordo.modifica': {
      x.richiedi('accordi', undefined, 'gestire gli accordi quadro');
      const corrente = x.accordo(c.id);
      verificaConflitto('accordo', corrente, c.modifiche, c.originale);
      const d = validaDatiAccordo(c.modifiche, true);
      const aggiornato: AccordoQuadro = { ...corrente, ...d };
      const diff = differenze(corrente, aggiornato, CAMPI_ACCORDO);
      if (Object.keys(diff).length === 0) return { id: corrente.id };
      if (diff.numero && x.dati.accordi.some((a) => a.id !== corrente.id && a.numero.trim().toLowerCase() === aggiornato.numero.trim().toLowerCase())) {
        throw new ErroreApp('DUPLICATO', `L'accordo quadro ${aggiornato.numero} esiste già.`);
      }
      const finale = { ...aggiornato, ...x.tracciaModifica() };
      x.dati = { ...x.dati, accordi: sostituisci(x.dati.accordi, finale) };
      x.registra('accordo', finale.id, null, 'modifica', riferimentoAccordo(finale), diff);
      return { id: finale.id };
    }

    case 'accordo.elimina': {
      x.richiedi('accordi', undefined, 'gestire gli accordi quadro');
      const corrente = x.accordo(c.id);
      const atti = x.dati.atti.filter((a) => a.accordo_id === corrente.id).length;
      const pds = x.dati.pds.filter((p) => p.accordo_id === corrente.id).length;
      if (atti > 0 || pds > 0) {
        throw new ErroreApp(
          'VINCOLO',
          `All'accordo quadro ${corrente.numero} sono collegati ${atti} atti di adesione e ${pds} PdS: scollegali prima di eliminarlo.`,
        );
      }
      x.dati = { ...x.dati, accordi: x.dati.accordi.filter((a) => a.id !== corrente.id) };
      x.registra('accordo', corrente.id, null, 'eliminazione', riferimentoAccordo(corrente), istantanea(corrente, CAMPI_ACCORDO, false));
      return { id: corrente.id };
    }

    case 'atto.crea': {
      x.richiedi('accordi', undefined, 'gestire gli atti di adesione');
      const accordo = x.accordo(c.accordo_id);
      const d = validaDatiAtto(c.dati) as Required<ReturnType<typeof validaDatiAtto>>;
      if (x.dati.atti.some((a) => a.accordo_id === accordo.id && a.numero.trim().toLowerCase() === d.numero.trim().toLowerCase())) {
        throw new ErroreApp('DUPLICATO', `L'atto di adesione ${d.numero} esiste già su questo accordo quadro.`);
      }
      const nuovo: AttoAdesione = { id: x.ctx.nuovoId(), accordo_id: accordo.id, ...d, ...x.tracciaNuovo() };
      x.dati = { ...x.dati, atti: [...x.dati.atti, nuovo] };
      x.registra('atto', nuovo.id, null, 'creazione', riferimentoAtto(nuovo, accordo), istantanea(nuovo, CAMPI_ATTO, true));
      return { id: nuovo.id };
    }

    case 'atto.modifica': {
      x.richiedi('accordi', undefined, 'gestire gli atti di adesione');
      const corrente = x.atto(c.id);
      const accordo = x.accordo(corrente.accordo_id);
      verificaConflitto('atto', corrente, c.modifiche, c.originale);
      const d = validaDatiAtto(c.modifiche, true);
      const aggiornato: AttoAdesione = { ...corrente, ...d };
      const diff = differenze(corrente, aggiornato, CAMPI_ATTO);
      if (Object.keys(diff).length === 0) return { id: corrente.id };
      if (
        diff.numero &&
        x.dati.atti.some((a) => a.id !== corrente.id && a.accordo_id === accordo.id && a.numero.trim().toLowerCase() === aggiornato.numero.trim().toLowerCase())
      ) {
        throw new ErroreApp('DUPLICATO', `L'atto di adesione ${aggiornato.numero} esiste già su questo accordo quadro.`);
      }
      const finale = { ...aggiornato, ...x.tracciaModifica() };
      x.dati = { ...x.dati, atti: sostituisci(x.dati.atti, finale) };
      x.registra('atto', finale.id, null, 'modifica', riferimentoAtto(finale, accordo), diff);
      return { id: finale.id };
    }

    case 'atto.elimina': {
      x.richiedi('accordi', undefined, 'gestire gli atti di adesione');
      const corrente = x.atto(c.id);
      const accordo = x.dati.accordi.find((a) => a.id === corrente.accordo_id);
      const collegati = x.dati.pds.filter((p) => p.atto_adesione_id === corrente.id).length;
      if (collegati > 0) {
        throw new ErroreApp('VINCOLO', `All'atto di adesione ${corrente.numero} sono collegati ${collegati} PdS: scollegali prima di eliminarlo.`);
      }
      x.dati = { ...x.dati, atti: x.dati.atti.filter((a) => a.id !== corrente.id) };
      x.registra('atto', corrente.id, null, 'eliminazione', riferimentoAtto(corrente, accordo), istantanea(corrente, CAMPI_ATTO, false));
      return { id: corrente.id };
    }

    // -----------------------------------------------------------------------
    case 'pds.crea': {
      const d = validaDatiPds(
        { ...Object.fromEntries(CAMPI_DATI_PDS.map((k) => [k, null])), ...c.dati } as Partial<DatiPds>,
        false,
      ) as DatiPds;
      const capitolo = x.capitolo(d.capitolo_id);
      x.richiedi('pds_crea', capitolo, 'creare PdS');
      x.verificaCollegamentoAccordo(d);
      const base = normalizzaTermine(d);
      const nuovo: Pds = {
        id: x.ctx.nuovoId(),
        ...base,
        saldato: false,
        data_saldo: null,
        totale_pagato_saldo: null,
        eliminato_at: null,
        eliminato_da: null,
        ...x.tracciaNuovo(),
      };
      x.dati = { ...x.dati, pds: [...x.dati.pds, nuovo] };
      x.registra('pds', nuovo.id, nuovo.id, 'creazione', x.riferimentoPds(nuovo), istantanea(nuovo, CAMPI_DATI_PDS, true));
      return { id: nuovo.id };
    }

    case 'pds.modifica': {
      const corrente = x.pds(c.id);
      const nonAmmessi = Object.keys(c.modifiche).filter((k) => !(CAMPI_DATI_PDS as readonly string[]).includes(k));
      if (nonAmmessi.length) {
        throw new ErroreApp('VALIDAZIONE', `Campi non modificabili direttamente: ${nonAmmessi.join(', ')}.`);
      }
      const capitoloAttuale = x.capitolo(corrente.capitolo_id);
      x.richiedi('pds_dati', capitoloAttuale, 'modificare i dati del PdS');
      verificaNonEliminato(corrente, x.riferimentoPds(corrente));
      verificaConflitto('pds', corrente, c.modifiche, c.originale);
      const d = validaDatiPds(c.modifiche, true);
      if (d.capitolo_id && d.capitolo_id !== corrente.capitolo_id) {
        x.richiedi('pds_dati', x.capitolo(d.capitolo_id), 'spostare il PdS');
      }
      const aggiornato: Pds = normalizzaTermine({ ...corrente, ...d });
      if (aggiornato.accordo_id == null) aggiornato.atto_adesione_id = null;
      x.verificaCollegamentoAccordo(aggiornato);
      const diff = differenze(corrente, aggiornato, CAMPI_DATI_PDS);
      if (Object.keys(diff).length === 0) return { id: corrente.id };
      const finale = { ...aggiornato, ...x.tracciaModifica() };
      x.dati = { ...x.dati, pds: sostituisci(x.dati.pds, finale) };
      x.registra('pds', finale.id, finale.id, 'modifica', x.riferimentoPds(finale), diff);
      return { id: finale.id };
    }

    case 'pds.elimina': {
      const corrente = x.pds(c.id);
      x.richiedi('pds_crea', x.dati.capitoli.find((k) => k.id === corrente.capitolo_id) ?? null, 'eliminare PdS');
      if (corrente.eliminato_at != null) return { id: corrente.id };
      // Eliminazione logica: pagamenti e allegati restano e il PdS resta ripristinabile dall'amministratore.
      const finale: Pds = { ...corrente, eliminato_at: x.ctx.ora, eliminato_da: x.utente.id, ...x.tracciaModifica() };
      x.dati = { ...x.dati, pds: sostituisci(x.dati.pds, finale) };
      x.registra('pds', finale.id, finale.id, 'modifica', x.riferimentoPds(finale), differenze(corrente, finale, CAMPI_ELIMINAZIONE));
      return { id: finale.id };
    }

    case 'pds.ripristina': {
      x.richiediAdmin();
      const corrente = x.pds(c.id);
      const riferimento = x.riferimentoPds(corrente);
      if (corrente.eliminato_at == null) throw new ErroreApp('VINCOLO', `Il PdS ${riferimento} non è tra i PdS eliminati.`);
      const finale: Pds = { ...corrente, eliminato_at: null, eliminato_da: null, ...x.tracciaModifica() };
      x.dati = { ...x.dati, pds: sostituisci(x.dati.pds, finale) };
      x.registra('pds', finale.id, finale.id, 'modifica', riferimento, differenze(corrente, finale, CAMPI_ELIMINAZIONE));
      return { id: finale.id };
    }

    case 'pds.elimina_definitivo': {
      x.richiediAdmin();
      const corrente = x.pds(c.id);
      const riferimento = x.riferimentoPds(corrente);
      if (corrente.eliminato_at == null) {
        throw new ErroreApp('VINCOLO', `Il PdS ${riferimento} va prima spostato tra i PdS eliminati.`);
      }
      for (const a of x.dati.allegati) {
        if (a.pds_id === corrente.id && a.file_path) x.effetti.push({ tipo: 'file.elimina', path: a.file_path });
      }
      x.dati = {
        ...x.dati,
        pds: x.dati.pds.filter((p) => p.id !== corrente.id),
        pagamenti: x.dati.pagamenti.filter((p) => p.pds_id !== corrente.id),
        allegati: x.dati.allegati.filter((a) => a.pds_id !== corrente.id),
      };
      x.registra('pds', corrente.id, corrente.id, 'eliminazione', riferimento, istantanea(corrente, [...CAMPI_DATI_PDS, ...CAMPI_SALDO], false));
      return { id: corrente.id };
    }

    // -----------------------------------------------------------------------
    case 'pagamento.crea': {
      const p = x.pds(c.pds_id);
      const rif = x.riferimentoPds(p);
      x.richiedi('pds_pagamenti', x.capitolo(p.capitolo_id), 'registrare pagamenti');
      verificaNonEliminato(p, rif);
      verificaNonSaldato(p, rif);
      const d = validaDatiPagamento(c.dati) as Required<ReturnType<typeof validaDatiPagamento>>;
      const nuovo: Pagamento = { id: x.ctx.nuovoId(), pds_id: p.id, ...d, ...x.tracciaNuovo() };
      x.dati = { ...x.dati, pagamenti: [...x.dati.pagamenti, nuovo] };
      x.registra('pagamento', nuovo.id, p.id, 'creazione', `PdS ${rif}`, istantanea(nuovo, CAMPI_PAGAMENTO, true));
      return { id: nuovo.id };
    }

    case 'pagamento.modifica': {
      const corrente = x.pagamento(c.id);
      const p = x.pds(corrente.pds_id);
      const rif = x.riferimentoPds(p);
      x.richiedi('pds_pagamenti', x.capitolo(p.capitolo_id), 'modificare pagamenti');
      verificaNonEliminato(p, rif);
      verificaNonSaldato(p, rif);
      verificaConflitto('pagamento', corrente, c.modifiche, c.originale);
      const d = validaDatiPagamento(c.modifiche, true);
      const aggiornato: Pagamento = { ...corrente, ...d };
      const diff = differenze(corrente, aggiornato, CAMPI_PAGAMENTO);
      if (Object.keys(diff).length === 0) return { id: corrente.id };
      const finale = { ...aggiornato, ...x.tracciaModifica() };
      x.dati = { ...x.dati, pagamenti: sostituisci(x.dati.pagamenti, finale) };
      x.registra('pagamento', finale.id, p.id, 'modifica', `PdS ${rif}`, diff);
      return { id: finale.id };
    }

    case 'pagamento.elimina': {
      const corrente = x.pagamento(c.id);
      const p = x.pds(corrente.pds_id);
      const rif = x.riferimentoPds(p);
      x.richiedi('pds_pagamenti', x.capitolo(p.capitolo_id), 'eliminare pagamenti');
      verificaNonEliminato(p, rif);
      verificaNonSaldato(p, rif);
      x.dati = { ...x.dati, pagamenti: x.dati.pagamenti.filter((k) => k.id !== corrente.id) };
      x.registra('pagamento', corrente.id, p.id, 'eliminazione', `PdS ${rif}`, istantanea(corrente, CAMPI_PAGAMENTO, false));
      return { id: corrente.id };
    }

    case 'saldo.conferma': {
      const p = x.pds(c.pds_id);
      const rif = x.riferimentoPds(p);
      x.richiedi('pds_pagamenti', x.capitolo(p.capitolo_id), 'confermare il saldo');
      verificaNonEliminato(p, rif);
      if (p.saldato) throw new ErroreApp('VINCOLO', `Il saldo del PdS ${rif} è già stato confermato.`);
      if (!p.data_stipula || p.valore_stipula == null) {
        throw new ErroreApp('VINCOLO', 'Per confermare il saldo occorre prima registrare la stipula (data e valore).');
      }
      if (!isDataISO(c.data_saldo)) throw new ErroreApp('VALIDAZIONE', 'Data del saldo: indicare una data valida.');
      const data_saldo = c.data_saldo;
      if (c.pagamento_finale) {
        const d = validaDatiPagamento(c.pagamento_finale) as Required<ReturnType<typeof validaDatiPagamento>>;
        const nuovo: Pagamento = { id: x.ctx.nuovoId(), pds_id: p.id, ...d, ...x.tracciaNuovo() };
        x.dati = { ...x.dati, pagamenti: [...x.dati.pagamenti, nuovo] };
        x.registra('pagamento', nuovo.id, p.id, 'creazione', `PdS ${rif}`, istantanea(nuovo, CAMPI_PAGAMENTO, true));
      }
      const totale = x.dati.pagamenti.filter((k) => k.pds_id === p.id).reduce((t, k) => t + k.importo, 0);
      const finale: Pds = { ...p, saldato: true, data_saldo, totale_pagato_saldo: totale, ...x.tracciaModifica() };
      x.dati = { ...x.dati, pds: sostituisci(x.dati.pds, finale) };
      x.registra('pds', p.id, p.id, 'modifica', rif, differenze(p, finale, CAMPI_SALDO));
      return { id: p.id };
    }

    case 'saldo.annulla': {
      const p = x.pds(c.pds_id);
      const rif = x.riferimentoPds(p);
      x.richiedi('pds_pagamenti', x.capitolo(p.capitolo_id), 'annullare il saldo');
      verificaNonEliminato(p, rif);
      if (!p.saldato) throw new ErroreApp('VINCOLO', `Il PdS ${rif} non risulta saldato.`);
      const finale: Pds = { ...p, saldato: false, data_saldo: null, totale_pagato_saldo: null, ...x.tracciaModifica() };
      x.dati = { ...x.dati, pds: sostituisci(x.dati.pds, finale) };
      x.registra('pds', p.id, p.id, 'modifica', rif, differenze(p, finale, CAMPI_SALDO));
      return { id: p.id };
    }

    // -----------------------------------------------------------------------
    case 'allegato.crea': {
      const p = x.pds(c.pds_id);
      x.richiedi('pds_allegati', x.capitolo(p.capitolo_id), 'gestire gli allegati');
      verificaNonEliminato(p, x.riferimentoPds(p));
      const d = validaDatiAllegato(c.dati, c.file != null);
      const id = x.ctx.nuovoId();
      const path = c.file ? x.ctx.percorsoFile(p.id, id, c.file.nome) : null;
      const nuovo: Allegato = {
        id,
        pds_id: p.id,
        ...d,
        file_path: path,
        file_nome: c.file?.nome ?? null,
        file_dimensione: c.file?.dimensione ?? null,
        file_tipo: c.file?.tipo || null,
        created_at: x.ctx.ora,
        created_by: x.utente.id,
      };
      if (c.file && path) x.effetti.push({ tipo: 'file.carica', path, file: c.file });
      x.dati = { ...x.dati, allegati: [...x.dati.allegati, nuovo] };
      x.registra('allegato', id, p.id, 'creazione', riferimentoAllegato(nuovo, x.riferimentoPds(p)), istantanea(nuovo, CAMPI_ALLEGATO, true));
      return { id };
    }

    case 'allegato.elimina': {
      const a = x.dati.allegati.find((k) => k.id === c.id);
      if (!a) throw new ErroreApp('NON_TROVATO', 'Allegato non trovato (potrebbe essere stato eliminato).');
      const p = x.pds(a.pds_id);
      x.richiedi('pds_allegati', x.capitolo(p.capitolo_id), 'gestire gli allegati');
      if (a.file_path) x.effetti.push({ tipo: 'file.elimina', path: a.file_path });
      x.dati = { ...x.dati, allegati: x.dati.allegati.filter((k) => k.id !== a.id) };
      x.registra('allegato', a.id, p.id, 'eliminazione', riferimentoAllegato(a, x.riferimentoPds(p)), istantanea(a, CAMPI_ALLEGATO, false));
      return { id: a.id };
    }

    // -----------------------------------------------------------------------
    case 'utente.crea': {
      x.richiediAdmin();
      const d = validaDatiUtente(c.dati) as Required<DatiUtente>;
      validaPassword(c.password);
      if (x.dati.utenti.some((u) => u.username.toLowerCase() === d.username)) {
        throw new ErroreApp('DUPLICATO', `Il nome utente "${d.username}" è già in uso.`);
      }
      const nuovo: Utente = { id: x.ctx.nuovoId(), ...d, created_at: x.ctx.ora, updated_at: x.ctx.ora };
      x.dati = { ...x.dati, utenti: [...x.dati.utenti, nuovo] };
      x.effetti.push({ tipo: 'credenziali.imposta', utente: nuovo, password: c.password });
      x.registra('utente', nuovo.id, null, 'creazione', nuovo.username, istantanea(nuovo, CAMPI_UTENTE, true));
      return { id: nuovo.id };
    }

    case 'utente.modifica': {
      x.richiediAdmin();
      const corrente = x.dati.utenti.find((u) => u.id === c.id);
      if (!corrente) throw new ErroreApp('NON_TROVATO', 'Utente non trovato.');
      const d = validaDatiUtente(c.modifiche, true);
      delete d.username;
      const aggiornato: Utente = { ...corrente, ...d };
      const diff = differenze(corrente, aggiornato, CAMPI_UTENTE);
      if (Object.keys(diff).length === 0) return { id: corrente.id };
      const utenti = sostituisci(x.dati.utenti, { ...aggiornato, updated_at: x.ctx.ora });
      if (adminAttiviDopo(utenti) === 0) {
        throw new ErroreApp('VINCOLO', 'Deve restare almeno un amministratore attivo.');
      }
      x.dati = { ...x.dati, utenti };
      if (diff.ruolo || diff.attivo) x.effetti.push({ tipo: 'credenziali.aggiorna', utente: aggiornato });
      x.registra('utente', corrente.id, null, 'modifica', corrente.username, diff);
      return { id: corrente.id };
    }

    case 'utente.password': {
      x.richiediAdmin();
      const corrente = x.dati.utenti.find((u) => u.id === c.id);
      if (!corrente) throw new ErroreApp('NON_TROVATO', 'Utente non trovato.');
      validaPassword(c.password);
      x.effetti.push({ tipo: 'credenziali.imposta', utente: corrente, password: c.password });
      x.registra('utente', corrente.id, null, 'modifica', corrente.username, { password: { da: null, a: 'reimpostata' } });
      return { id: corrente.id };
    }

    case 'utente.elimina': {
      x.richiediAdmin();
      const corrente = x.dati.utenti.find((u) => u.id === c.id);
      if (!corrente) throw new ErroreApp('NON_TROVATO', 'Utente non trovato.');
      if (corrente.id === x.utente.id) throw new ErroreApp('VINCOLO', 'Non puoi eliminare il tuo stesso utente.');
      const utenti = x.dati.utenti.filter((u) => u.id !== corrente.id);
      if (adminAttiviDopo(utenti) === 0) throw new ErroreApp('VINCOLO', 'Deve restare almeno un amministratore attivo.');
      x.dati = { ...x.dati, utenti };
      x.effetti.push({ tipo: 'credenziali.elimina', utente: corrente });
      x.registra('utente', corrente.id, null, 'eliminazione', corrente.username, istantanea(corrente, CAMPI_UTENTE, false));
      return { id: corrente.id };
    }
  }
}
