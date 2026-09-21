import { useMemo, useSyncExternalStore } from 'react';
import { visteAccordi, type VistaAccordo } from '../domain/accordi';
import { indicizza, isEliminato, vistaPds, type IndiciDati, type PdsVista } from '../domain/calcoli';
import { oggiISO } from '../domain/date';
import type { DataISO, ID } from '../domain/tipi';
import { useApp } from './store';

// Data odierna condivisa, aggiornata al cambio di giorno.
let oggiCorrente = oggiISO();
const ascoltatori = new Set<() => void>();
function iscriviOggi(cb: () => void) {
  ascoltatori.add(cb);
  if (ascoltatori.size === 1) {
    const timer = window.setInterval(() => {
      const nuovo = oggiISO();
      if (nuovo !== oggiCorrente) {
        oggiCorrente = nuovo;
        ascoltatori.forEach((a) => a());
      }
    }, 60_000);
    (iscriviOggi as { timer?: number }).timer = timer;
  }
  return () => {
    ascoltatori.delete(cb);
    if (ascoltatori.size === 0) window.clearInterval((iscriviOggi as { timer?: number }).timer);
  };
}

export function useOggi(): DataISO {
  return useSyncExternalStore(iscriviOggi, () => oggiCorrente, () => oggiCorrente);
}

export interface Derivati {
  oggi: DataISO;
  indici: IndiciDati;
  /** PdS attivi: gli eliminati non compaiono in elenchi, totali, grafici ed export. */
  viste: PdsVista[];
  /** PdS spostati tra gli eliminati (visibili al solo amministratore). */
  visteEliminate: PdsVista[];
  /** Tutti i PdS, compresi gli eliminati: serve alla pagina di dettaglio. */
  vistePerId: Map<ID, PdsVista>;
  /** Situazione contrattuale degli accordi quadro (sui soli PdS attivi). */
  accordi: VistaAccordo[];
  accordiPerId: Map<ID, VistaAccordo>;
}

/** Dati derivati (stato, scadenze, totali) calcolati una sola volta per versione dei dati. */
export function useDerivati(): Derivati {
  const dati = useApp((s) => s.dati);
  const soglia = useApp((s) => s.sogliaGiorni);
  const oggi = useOggi();
  return useMemo(() => {
    const indici = indicizza(dati);
    const tutte = dati.pds.map((p) => vistaPds(p, indici, oggi, soglia));
    const attive = tutte.filter((v) => !isEliminato(v.pds));
    const accordi = visteAccordi(dati.accordi, dati.atti, attive, oggi);
    return {
      oggi,
      indici,
      viste: attive,
      visteEliminate: tutte.filter((v) => isEliminato(v.pds)),
      vistePerId: new Map(tutte.map((v) => [v.pds.id, v])),
      accordi,
      accordiPerId: new Map(accordi.map((a) => [a.accordo.id, a])),
    };
  }, [dati, soglia, oggi]);
}
