import { ErroreApp } from '../../domain/errori';
import {
  base64DaBytes,
  bytesCasuali,
  bytesDaBase64,
  bytesDaTesto,
  cifra,
  decifra,
  derivaChiaveDaPassword,
  importaChiaveAes,
  sha256Hex,
  testoDaBytes,
  type Scatola,
} from '../crittografia';

/**
 * Portachiavi del backend GitHub (file pubblico `keyring.json`).
 *
 * Il token di accesso ai repository non è mai pubblicato in chiaro: è cifrato con
 * una chiave K. Ogni utente ha una propria chiave K_u, protetta dalla sua password
 * (PBKDF2-SHA256 + AES-GCM), che sblocca K. Gli amministratori ricevono anche una
 * chiave amministrativa KA, con cui è "custodita" la K_u di ogni utente: così un
 * amministratore può reimpostare password, cambiare ruoli e sostituire il token
 * (con nuove chiavi) senza conoscere le password degli altri utenti.
 * I nomi utente non compaiono in chiaro: le voci sono indicizzate con un hash.
 */

export const ITERAZIONI_PREDEFINITE = 600_000;
export const FORMATO_KEYRING = 1;

export interface VoceKeyring {
  salt: string;
  /** K_u cifrata con la chiave derivata dalla password. */
  chiave: Scatola;
  /** JSON { k, ka? } cifrato con K_u. */
  accesso: Scatola;
  /** K_u cifrata con la chiave amministrativa KA. */
  custodia: Scatola;
}

export interface Keyring {
  formato: number;
  revisione: number;
  aggiornato: string;
  kdf: { nome: 'PBKDF2-SHA256'; iterazioni: number };
  /** Token GitHub cifrato con K. */
  token: Scatola;
  utenti: Record<string, VoceKeyring>;
}

/** Materiale della sessione, ottenuto sbloccando il portachiavi. */
export interface ChiaviSessione {
  username: string;
  ku: string;
  k: string;
  ka: string | null;
  token: string;
}

interface Accesso {
  k: string;
  ka?: string;
}

export async function idVoce(username: string): Promise<string> {
  return sha256Hex(`gestionale-pds|${username.trim().toLowerCase()}`);
}

async function chiave(b64: string): Promise<CryptoKey> {
  return importaChiaveAes(bytesDaBase64(b64));
}

function nuovaChiave(): string {
  return base64DaBytes(bytesCasuali(32));
}

async function voce(password: string, ku: string, accesso: Accesso, ka: string, iterazioni: number): Promise<VoceKeyring> {
  const salt = bytesCasuali(16);
  const derivata = await derivaChiaveDaPassword(password, salt, iterazioni);
  return {
    salt: base64DaBytes(salt),
    chiave: await cifra(derivata, bytesDaBase64(ku)),
    accesso: await cifra(await chiave(ku), bytesDaTesto(JSON.stringify(accesso))),
    custodia: await cifra(await chiave(ka), bytesDaBase64(ku)),
  };
}

function successivo(k: Keyring, utenti: Record<string, VoceKeyring>, token?: Scatola): Keyring {
  return { ...k, revisione: k.revisione + 1, aggiornato: new Date().toISOString(), utenti, token: token ?? k.token };
}

export function validaKeyring(grezzo: unknown): Keyring {
  const k = grezzo as Keyring;
  if (!k || typeof k !== 'object' || typeof k.formato !== 'number' || !k.utenti || !k.token || !k.kdf) {
    throw new ErroreApp('CONFIGURAZIONE', 'Il portachiavi (keyring.json) non è valido.');
  }
  if (k.formato > FORMATO_KEYRING) {
    throw new ErroreApp('CONFIGURAZIONE', "Il portachiavi è stato creato da una versione più recente dell'applicazione: aggiornare l'applicazione.");
  }
  return k;
}

export async function creaKeyring(token: string, username: string, password: string, iterazioni = ITERAZIONI_PREDEFINITE): Promise<{ keyring: Keyring; chiavi: ChiaviSessione }> {
  const k = nuovaChiave();
  const ka = nuovaChiave();
  const ku = nuovaChiave();
  const base: Keyring = {
    formato: FORMATO_KEYRING,
    revisione: 1,
    aggiornato: new Date().toISOString(),
    kdf: { nome: 'PBKDF2-SHA256', iterazioni },
    token: await cifra(await chiave(k), bytesDaTesto(token)),
    utenti: { [await idVoce(username)]: await voce(password, ku, { k, ka }, ka, iterazioni) },
  };
  return { keyring: base, chiavi: { username, ku, k, ka, token } };
}

const ERRORE_CREDENZIALI = () => new ErroreApp('AUTENTICAZIONE', 'Nome utente o password non corretti.');

export async function sbloccaKeyring(keyring: Keyring, username: string, password: string): Promise<ChiaviSessione> {
  const v = keyring.utenti[await idVoce(username)];
  const salt = v ? bytesDaBase64(v.salt) : bytesCasuali(16);
  // la derivazione avviene comunque, per non rivelare dai tempi se l'utente esiste
  const derivata = await derivaChiaveDaPassword(password, salt, keyring.kdf.iterazioni);
  if (!v) throw ERRORE_CREDENZIALI();
  let ku: string;
  try {
    ku = base64DaBytes(await decifra(derivata, v.chiave));
  } catch {
    throw ERRORE_CREDENZIALI();
  }
  try {
    const accesso = JSON.parse(testoDaBytes(await decifra(await chiave(ku), v.accesso))) as Accesso;
    const token = testoDaBytes(await decifra(await chiave(accesso.k), keyring.token));
    return { username: username.trim().toLowerCase(), ku, k: accesso.k, ka: accesso.ka ?? null, token };
  } catch {
    throw new ErroreApp('CONFIGURAZIONE', "Le credenziali sono corrette ma le chiavi di accesso non sono più valide: chiedere all'amministratore di reimpostare la password.");
  }
}

function richiediAdmin(chiavi: ChiaviSessione): string {
  if (!chiavi.ka) {
    throw new ErroreApp('PERMESSO_NEGATO', 'Chiavi amministrative non disponibili: uscire e accedere di nuovo con un utente amministratore.');
  }
  return chiavi.ka;
}

/** Crea le credenziali di un utente o ne reimposta la password (mantenendo la sua chiave). */
export async function impostaCredenziali(keyring: Keyring, admin: ChiaviSessione, username: string, password: string, amministratore: boolean): Promise<Keyring> {
  const ka = richiediAdmin(admin);
  const id = await idVoce(username);
  const esistente = keyring.utenti[id];
  const ku = esistente ? base64DaBytes(await decifra(await chiave(ka), esistente.custodia)) : nuovaChiave();
  const nuova = await voce(password, ku, amministratore ? { k: admin.k, ka } : { k: admin.k }, ka, keyring.kdf.iterazioni);
  return successivo(keyring, { ...keyring.utenti, [id]: nuova });
}

export async function cambiaPasswordPropria(keyring: Keyring, chiavi: ChiaviSessione, nuovaPassword: string): Promise<Keyring> {
  const id = await idVoce(chiavi.username);
  const esistente = keyring.utenti[id];
  if (!esistente) throw new ErroreApp('AUTENTICAZIONE', "Credenziali non trovate nel portachiavi: rivolgersi all'amministratore.");
  const salt = bytesCasuali(16);
  const derivata = await derivaChiaveDaPassword(nuovaPassword, salt, keyring.kdf.iterazioni);
  const aggiornata: VoceKeyring = { ...esistente, salt: base64DaBytes(salt), chiave: await cifra(derivata, bytesDaBase64(chiavi.ku)) };
  return successivo(keyring, { ...keyring.utenti, [id]: aggiornata });
}

/** Aggiorna il livello (amministratore o no) di un utente esistente. Restituisce null se l'utente non è nel portachiavi. */
export async function aggiornaRuolo(keyring: Keyring, admin: ChiaviSessione, username: string, amministratore: boolean): Promise<Keyring | null> {
  const ka = richiediAdmin(admin);
  const id = await idVoce(username);
  const esistente = keyring.utenti[id];
  if (!esistente) return null;
  const ku = base64DaBytes(await decifra(await chiave(ka), esistente.custodia));
  const accesso: Accesso = amministratore ? { k: admin.k, ka } : { k: admin.k };
  const aggiornata: VoceKeyring = { ...esistente, accesso: await cifra(await chiave(ku), bytesDaTesto(JSON.stringify(accesso))) };
  return successivo(keyring, { ...keyring.utenti, [id]: aggiornata });
}

export async function rimuoviUtente(keyring: Keyring, username: string): Promise<Keyring | null> {
  const id = await idVoce(username);
  if (!keyring.utenti[id]) return null;
  const utenti = { ...keyring.utenti };
  delete utenti[id];
  return successivo(keyring, utenti);
}

export async function haCredenziali(keyring: Keyring, username: string): Promise<boolean> {
  return Boolean(keyring.utenti[await idVoce(username)]);
}

/**
 * Sostituisce il token e rigenera K e KA per tutti gli utenti presenti.
 * Chi conservasse le chiavi precedenti non potrà decifrare il nuovo token.
 */
export async function ruotaChiavi(keyring: Keyring, admin: ChiaviSessione, nuovoToken: string): Promise<{ keyring: Keyring; chiavi: ChiaviSessione }> {
  const kaVecchia = richiediAdmin(admin);
  const k = nuovaChiave();
  const ka = nuovaChiave();
  const utenti: Record<string, VoceKeyring> = {};
  for (const [id, v] of Object.entries(keyring.utenti)) {
    let ku: string;
    let eraAdmin: boolean;
    try {
      ku = base64DaBytes(await decifra(await chiave(kaVecchia), v.custodia));
      const accesso = JSON.parse(testoDaBytes(await decifra(await chiave(ku), v.accesso))) as Accesso;
      eraAdmin = Boolean(accesso.ka);
    } catch {
      continue; // voce non più decifrabile: esclusa dal nuovo portachiavi
    }
    utenti[id] = {
      ...v,
      accesso: await cifra(await chiave(ku), bytesDaTesto(JSON.stringify(eraAdmin ? { k, ka } : { k }))),
      custodia: await cifra(await chiave(ka), bytesDaBase64(ku)),
    };
  }
  const token = await cifra(await chiave(k), bytesDaTesto(nuovoToken));
  return { keyring: successivo(keyring, utenti, token), chiavi: { ...admin, k, ka, token: nuovoToken } };
}
