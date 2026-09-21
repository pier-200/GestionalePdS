// Edge Function "gestione-utenti" del Gestionale PdS (runtime Deno di Supabase).
//
// Operazioni riservate agli amministratori che richiedono la chiave di servizio:
// - crea: nuovo utente (Supabase Auth + profilo con ruolo e permessi);
// - password: reimpostazione della password di un utente;
// - elimina: eliminazione definitiva di un utente.
//
// La funzione verifica che il chiamante sia un amministratore attivo e registra
// ogni operazione nello storico. Da pubblicare con "Verify JWT" disattivato:
// l'autenticazione del chiamante è verificata qui dentro.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RE_USERNAME = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const RE_DOMINIO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const AREE = ['capitoli', 'pds_crea', 'pds_dati', 'pds_pagamenti', 'pds_allegati'] as const;

function risposta(stato: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), { status: stato, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
}

function errore(stato: number, messaggio: string): Response {
  return risposta(stato, { errore: messaggio });
}

function erroreSullaPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 10) return 'La password deve contenere almeno 10 caratteri';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'La password deve contenere almeno una lettera e una cifra';
  if (password.length > 128) return 'La password è troppo lunga (massimo 128 caratteri)';
  return null;
}

function normalizzaPermessi(p: unknown): Record<string, unknown> {
  const sorgente = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  const risultato: Record<string, unknown> = {};
  for (const area of AREE) risultato[area] = sorgente[area] === true;
  const ambito = sorgente.ambito_capitoli;
  risultato.ambito_capitoli = Array.isArray(ambito) ? [...new Set(ambito.map((c) => String(c).trim()).filter(Boolean))] : null;
  return risultato;
}

function chiaveServizio(): string | null {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const chiavi = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    return chiavi.default ?? Object.values(chiavi)[0] ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return errore(405, 'Metodo non consentito');

  const url = Deno.env.get('SUPABASE_URL');
  const chiave = chiaveServizio();
  if (!url || !chiave) return errore(500, 'Configurazione della funzione incompleta (URL o chiave di servizio mancanti)');
  const admin = createClient(url, chiave, { auth: { persistSession: false, autoRefreshToken: false } });

  // Chi chiama? Deve essere un amministratore attivo.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return errore(401, 'Accesso richiesto');
  const { data: datiUtente, error: erroreUtente } = await admin.auth.getUser(jwt);
  if (erroreUtente || !datiUtente?.user) return errore(401, 'Sessione non valida: accedere di nuovo');
  const { data: chiamante } = await admin.from('profili').select('id, username, ruolo, attivo').eq('id', datiUtente.user.id).maybeSingle();
  if (!chiamante || !chiamante.attivo || chiamante.ruolo !== 'admin') return errore(403, "Operazione riservata all'amministratore");

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return errore(400, 'Richiesta non valida');
  }

  const registra = (azione: 'creazione' | 'modifica' | 'eliminazione', entitaId: string, riferimento: string, modifiche: Record<string, unknown>) =>
    admin.from('registro').insert({ utente_id: chiamante.id, username: chiamante.username, entita: 'utente', entita_id: entitaId, azione, riferimento, modifiche });

  switch (corpo.azione) {
    case 'crea': {
      const username = String(corpo.username ?? '').trim().toLowerCase();
      const nome = String(corpo.nome ?? '').trim();
      const ruolo = corpo.ruolo === 'admin' ? 'admin' : 'utente';
      const attivo = corpo.attivo !== false;
      const permessi = normalizzaPermessi(corpo.permessi);
      const dominio = String(Deno.env.get('PDS_DOMINIO_EMAIL') ?? corpo.dominioEmail ?? 'pds.local').trim().toLowerCase();
      if (!RE_USERNAME.test(username)) return errore(400, 'Nome utente non valido: 3-40 caratteri tra lettere minuscole, cifre, punto e trattini');
      if (!nome || nome.length > 100) return errore(400, 'Indicare nome e cognome (massimo 100 caratteri)');
      if (!RE_DOMINIO.test(dominio)) return errore(400, `Dominio tecnico degli utenti non valido: ${dominio}`);
      const problema = erroreSullaPassword(corpo.password);
      if (problema) return errore(400, problema);

      const { data: esistente } = await admin.from('profili').select('id').eq('username', username).maybeSingle();
      if (esistente) return errore(409, `Il nome utente "${username}" è già in uso`);

      const { data: creato, error: erroreCreazione } = await admin.auth.admin.createUser({
        email: `${username}@${dominio}`,
        password: corpo.password as string,
        email_confirm: true,
        user_metadata: { username, nome },
      });
      if (erroreCreazione || !creato?.user) {
        const testo = erroreCreazione?.message ?? 'errore sconosciuto';
        if (/already|registered|exists/i.test(testo)) return errore(409, `Il nome utente "${username}" è già registrato in Supabase Auth`);
        if (/email/i.test(testo)) {
          return errore(400, `Supabase ha rifiutato l'indirizzo tecnico ${username}@${dominio} (${testo}). Impostare in config.json un "dominioEmail" diverso (es. il dominio email dell'ufficio).`);
        }
        return errore(400, `Creazione dell'utente non riuscita: ${testo}`);
      }
      const id = creato.user.id;
      const { error: erroreProfilo } = await admin.from('profili').insert({ id, username, nome, ruolo, attivo, permessi });
      if (erroreProfilo) {
        await admin.auth.admin.deleteUser(id);
        return errore(400, `Creazione del profilo non riuscita: ${erroreProfilo.message}`);
      }
      await registra('creazione', id, username, {
        username: { da: null, a: username },
        nome: { da: null, a: nome },
        ruolo: { da: null, a: ruolo },
        attivo: { da: null, a: attivo },
        permessi: { da: null, a: permessi },
      });
      return risposta(200, { id });
    }

    case 'password': {
      const id = String(corpo.id ?? '');
      const problema = erroreSullaPassword(corpo.password);
      if (problema) return errore(400, problema);
      const { data: profilo } = await admin.from('profili').select('id, username').eq('id', id).maybeSingle();
      if (!profilo) return errore(404, 'Utente non trovato');
      const { error } = await admin.auth.admin.updateUserById(id, { password: corpo.password as string });
      if (error) return errore(400, `Reimpostazione della password non riuscita: ${error.message}`);
      await registra('modifica', id, profilo.username, { password: { da: null, a: 'reimpostata' } });
      return risposta(200, { id });
    }

    case 'elimina': {
      const id = String(corpo.id ?? '');
      if (id === chiamante.id) return errore(400, 'Non puoi eliminare il tuo stesso utente');
      const { data: profilo } = await admin.from('profili').select('*').eq('id', id).maybeSingle();
      if (!profilo) return errore(404, 'Utente non trovato');
      if (profilo.ruolo === 'admin' && profilo.attivo) {
        const { count } = await admin.from('profili').select('id', { count: 'exact', head: true }).eq('ruolo', 'admin').eq('attivo', true).neq('id', id);
        if (!count) return errore(400, 'Deve restare almeno un amministratore attivo');
      }
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return errore(400, `Eliminazione non riuscita: ${error.message}`);
      await registra('eliminazione', id, profilo.username, {
        username: { da: profilo.username, a: null },
        nome: { da: profilo.nome, a: null },
        ruolo: { da: profilo.ruolo, a: null },
      });
      return risposta(200, { id });
    }

    default:
      return errore(400, 'Azione non riconosciuta');
  }
});
