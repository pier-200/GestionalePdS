/**
 * Primitive crittografiche basate su WebCrypto (disponibile in tutti i browser
 * moderni e in Node): PBKDF2-SHA256 per derivare chiavi dalle password e
 * AES-GCM a 256 bit per cifrare.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesDaTesto(testo: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(testo) as Uint8Array<ArrayBuffer>;
}

export function testoDaBytes(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function base64DaBytes(bytes: Uint8Array): string {
  let binario = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + passo));
  }
  return btoa(binario);
}

export function bytesDaBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binario = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export function base64DaTesto(testo: string): string {
  return base64DaBytes(bytesDaTesto(testo));
}

export function testoDaBase64(b64: string): string {
  return testoDaBytes(bytesDaBase64(b64));
}

export function bytesCasuali(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function nuovoUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = bytesCasuali(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function sha256Hex(testo: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytesDaTesto(testo));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** SHA-1 di un blob git ("blob <len>\0<contenuto>"), identico a quello calcolato da GitHub. */
export async function shaBlobGit(contenuto: Uint8Array): Promise<string> {
  const intestazione = bytesDaTesto(`blob ${contenuto.length}\0`);
  const dati = new Uint8Array(intestazione.length + contenuto.length);
  dati.set(intestazione, 0);
  dati.set(contenuto, intestazione.length);
  const digest = await crypto.subtle.digest('SHA-1', dati);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function derivaChiaveDaPassword(password: string, salt: Uint8Array<ArrayBuffer>, iterazioni: number): Promise<CryptoKey> {
  const materiale = await crypto.subtle.importKey('raw', bytesDaTesto(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iterazioni },
    materiale,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function hashPassword(password: string, salt: Uint8Array<ArrayBuffer>, iterazioni: number): Promise<string> {
  const materiale = await crypto.subtle.importKey('raw', bytesDaTesto(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iterazioni }, materiale, 256);
  return base64DaBytes(new Uint8Array(bits));
}

export function uguaglianzaCostante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function importaChiaveAes(grezza: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', grezza, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Contenitore cifrato serializzabile. */
export interface Scatola {
  iv: string;
  ct: string;
}

export async function cifra(chiave: CryptoKey, dati: Uint8Array<ArrayBuffer>): Promise<Scatola> {
  const iv = bytesCasuali(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chiave, dati);
  return { iv: base64DaBytes(iv), ct: base64DaBytes(new Uint8Array(ct)) };
}

/** Decifra; lancia un'eccezione se la chiave è errata o il contenuto è stato alterato. */
export async function decifra(chiave: CryptoKey, scatola: Scatola): Promise<Uint8Array<ArrayBuffer>> {
  const chiaro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesDaBase64(scatola.iv) }, chiave, bytesDaBase64(scatola.ct));
  return new Uint8Array(chiaro);
}
