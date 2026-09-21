/** Archivi chiave/valore e file usati dai backend che salvano nel browser. */

export interface ArchivioTesto {
  leggi(chiave: string): string | null;
  scrivi(chiave: string, valore: string): void;
  rimuovi(chiave: string): void;
}

export function archivioMemoria(): ArchivioTesto {
  const mappa = new Map<string, string>();
  return {
    leggi: (k) => mappa.get(k) ?? null,
    scrivi: (k, v) => void mappa.set(k, v),
    rimuovi: (k) => void mappa.delete(k),
  };
}

/**
 * localStorage/sessionStorage possono essere assenti o lanciare eccezioni
 * (navigazione privata, criteri aziendali): in quel caso si ripiega sulla memoria.
 */
export function archivioBrowser(tipo: 'local' | 'session'): ArchivioTesto {
  const riserva = archivioMemoria();
  const storage = (): Storage | null => {
    try {
      return tipo === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    leggi(k) {
      try {
        return storage()?.getItem(k) ?? riserva.leggi(k);
      } catch {
        return riserva.leggi(k);
      }
    },
    scrivi(k, v) {
      try {
        const s = storage();
        if (s) s.setItem(k, v);
        else riserva.scrivi(k, v);
      } catch (e) {
        if (e instanceof DOMException && /quota/i.test(e.name + e.message)) {
          throw new Error('Spazio di archiviazione del browser esaurito.');
        }
        riserva.scrivi(k, v);
      }
    },
    rimuovi(k) {
      try {
        storage()?.removeItem(k);
      } catch {
        /* ignorato */
      }
      riserva.rimuovi(k);
    },
  };
}

export interface ArchivioFile {
  salva(percorso: string, contenuto: Blob): Promise<void>;
  leggi(percorso: string): Promise<Blob | null>;
  elimina(percorso: string): Promise<void>;
  svuota(): Promise<void>;
}

export function archivioFileMemoria(): ArchivioFile {
  const mappa = new Map<string, Blob>();
  return {
    salva: async (p, b) => void mappa.set(p, b),
    leggi: async (p) => mappa.get(p) ?? null,
    elimina: async (p) => void mappa.delete(p),
    svuota: async () => mappa.clear(),
  };
}

/** Archivio file su IndexedDB (con ripiego in memoria se non disponibile). */
export function archivioFileIndexedDb(nomeDb: string): ArchivioFile {
  if (typeof indexedDB === 'undefined') return archivioFileMemoria();
  const NEGOZIO = 'file';
  let apertura: Promise<IDBDatabase> | null = null;
  const db = () => {
    apertura ??= new Promise<IDBDatabase>((risolvi, rifiuta) => {
      const richiesta = indexedDB.open(nomeDb, 1);
      richiesta.onupgradeneeded = () => richiesta.result.createObjectStore(NEGOZIO);
      richiesta.onsuccess = () => risolvi(richiesta.result);
      richiesta.onerror = () => rifiuta(richiesta.error);
    });
    return apertura;
  };
  const operazione = async <T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const d = await db();
    return new Promise<T>((risolvi, rifiuta) => {
      const tx = d.transaction(NEGOZIO, modo);
      const richiesta = fn(tx.objectStore(NEGOZIO));
      tx.oncomplete = () => risolvi(richiesta.result);
      tx.onerror = () => rifiuta(tx.error);
    });
  };
  return {
    salva: async (p, b) => void (await operazione('readwrite', (s) => s.put(b, p))),
    leggi: async (p) => ((await operazione('readonly', (s) => s.get(p))) as Blob | undefined) ?? null,
    elimina: async (p) => void (await operazione('readwrite', (s) => s.delete(p))),
    svuota: async () => void (await operazione('readwrite', (s) => s.clear())),
  };
}
