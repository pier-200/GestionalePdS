-- =============================================================================
-- Gestionale PdS – schema del database per Supabase (PostgreSQL 15+)
--
-- Eseguire l'intero script nell'editor SQL del progetto Supabase
-- (Dashboard → SQL Editor → New query → incolla → Run), oppure con
-- `supabase db push`. Lo script può essere rieseguito: aggiorna funzioni,
-- trigger e policy senza toccare i dati.
--
-- Sicurezza:
-- - ogni tabella ha Row Level Security attiva;
-- - la lettura è consentita agli utenti con profilo attivo;
-- - le modifiche richiedono il permesso dell'area (e, per i PdS, l'ambito dei capitoli);
-- - i trigger controllano i permessi per gruppi di campi e registrano lo storico;
-- - le tabelle sono esposte alle API solo tramite GRANT espliciti.
-- =============================================================================

create schema if not exists app;
grant usage on schema app to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tabelle
-- -----------------------------------------------------------------------------

create table if not exists public.profili (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  nome text not null default '' check (char_length(nome) <= 100),
  ruolo text not null default 'utente' check (ruolo in ('admin', 'utente')),
  attivo boolean not null default true,
  permessi jsonb not null default '{"capitoli": false, "accordi": false, "pds_crea": false, "pds_dati": false, "pds_pagamenti": false, "pds_allegati": false, "ambito_capitoli": null}'::jsonb
    check (jsonb_typeof(permessi) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.capitoli (
  id uuid primary key default gen_random_uuid(),
  esercizio integer not null check (esercizio between 2000 and 2100),
  codice text not null check (char_length(btrim(codice)) between 1 and 50),
  descrizione text not null default '' check (char_length(descrizione) <= 300),
  finanziato numeric(15, 2) not null default 0 check (finanziato >= 0),
  -- superamento del finanziato autorizzato dall'amministratore, con motivazione
  sforamento_ignorato boolean not null default false,
  sforamento_note text not null default '' check (char_length(sforamento_note) <= 5000),
  created_at timestamptz not null default now(),
  created_by uuid references public.profili (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profili (id) on delete set null
);
create unique index if not exists capitoli_esercizio_codice_uk on public.capitoli (esercizio, lower(btrim(codice)));
alter table public.capitoli add column if not exists sforamento_ignorato boolean not null default false;
alter table public.capitoli add column if not exists sforamento_note text not null default '';

-- Accordo quadro: contenitore contrattuale con capienza propria.
create table if not exists public.accordi (
  id uuid primary key default gen_random_uuid(),
  numero text not null check (char_length(btrim(numero)) between 1 and 50),
  oggetto text not null check (char_length(btrim(oggetto)) between 1 and 300),
  ditta text not null check (char_length(btrim(ditta)) between 1 and 300),
  dec text check (char_length(dec) <= 100),
  protocollo_stipula text check (protocollo_stipula ~ '^[0-9]{1,20}$'),
  data_stipula date,
  durata_giorni integer check (durata_giorni > 0 and durata_giorni <= 36500),
  importo numeric(15, 2) not null default 0 check (importo >= 0),
  note text check (char_length(note) <= 5000),
  created_at timestamptz not null default now(),
  created_by uuid references public.profili (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profili (id) on delete set null
);
create unique index if not exists accordi_numero_uk on public.accordi (lower(btrim(numero)));

-- Atto di adesione a quantità indeterminata: impegna la capienza dell'accordo quadro.
create table if not exists public.atti (
  id uuid primary key default gen_random_uuid(),
  accordo_id uuid not null references public.accordi (id) on delete restrict,
  numero text not null check (char_length(btrim(numero)) between 1 and 50),
  oggetto text check (char_length(oggetto) <= 300),
  protocollo_stipula text check (protocollo_stipula ~ '^[0-9]{1,20}$'),
  data_stipula date,
  durata_giorni integer not null default 365 check (durata_giorni > 0 and durata_giorni <= 36500),
  valore numeric(15, 2) not null check (valore > 0),
  note text check (char_length(note) <= 5000),
  created_at timestamptz not null default now(),
  created_by uuid references public.profili (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profili (id) on delete set null
);
create unique index if not exists atti_accordo_numero_uk on public.atti (accordo_id, lower(btrim(numero)));

create table if not exists public.pds (
  id uuid primary key default gen_random_uuid(),
  numero text not null check (char_length(btrim(numero)) between 1 and 50),
  capitolo_id uuid not null references public.capitoli (id) on delete restrict,
  accordo_id uuid references public.accordi (id) on delete restrict,
  atto_adesione_id uuid references public.atti (id) on delete restrict,
  ditta text check (char_length(ditta) <= 300),
  ordinativo text check (char_length(ordinativo) <= 100),
  -- un PdS può essere collegato a più IDV: codici separati da virgola
  idv text check (char_length(idv) <= 300),
  dec text check (char_length(dec) <= 100),
  importo_inviato numeric(15, 2) check (importo_inviato >= 0),
  protocollo_invio text check (protocollo_invio ~ '^[0-9]{1,20}$'),
  data_invio date,
  protocollo_stipula text check (protocollo_stipula ~ '^[0-9]{1,20}$'),
  data_stipula date,
  valore_stipula numeric(15, 2) check (valore_stipula >= 0),
  modalita_termine text check (modalita_termine in ('durata', 'data')),
  durata integer check (durata > 0 and durata <= 36500),
  durata_unita text check (durata_unita in ('giorni', 'mesi')),
  data_termine date,
  saldato boolean not null default false,
  data_saldo date,
  totale_pagato_saldo numeric(15, 2),
  note text check (char_length(note) <= 5000),
  -- eliminazione logica: i PdS eliminati restano visibili al solo amministratore
  eliminato_at timestamptz,
  eliminato_da uuid references public.profili (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profili (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profili (id) on delete set null,
  constraint pds_saldo_coerente check (
    (saldato and data_saldo is not null and totale_pagato_saldo is not null)
    or (not saldato and data_saldo is null and totale_pagato_saldo is null)
  )
);
create index if not exists pds_capitolo_idx on public.pds (capitolo_id);
alter table public.pds add column if not exists ditta text;
alter table public.pds add column if not exists accordo_id uuid references public.accordi (id) on delete restrict;
alter table public.pds add column if not exists atto_adesione_id uuid references public.atti (id) on delete restrict;
create index if not exists pds_accordo_idx on public.pds (accordo_id);
create index if not exists pds_atto_idx on public.pds (atto_adesione_id);
alter table public.pds add column if not exists eliminato_at timestamptz;
alter table public.pds add column if not exists eliminato_da uuid references public.profili (id) on delete set null;
alter table public.pds drop constraint if exists pds_idv_check;
alter table public.pds add constraint pds_idv_check check (char_length(idv) <= 300);
alter table public.pds drop constraint if exists pds_ditta_check;
alter table public.pds add constraint pds_ditta_check check (char_length(ditta) <= 300);
alter table public.pds drop constraint if exists pds_protocollo_invio_check;
alter table public.pds add constraint pds_protocollo_invio_check check (protocollo_invio ~ '^[0-9]{1,20}$');
alter table public.pds drop constraint if exists pds_protocollo_stipula_check;
alter table public.pds add constraint pds_protocollo_stipula_check check (protocollo_stipula ~ '^[0-9]{1,20}$');
create index if not exists pds_eliminato_idx on public.pds (eliminato_at);

create table if not exists public.pagamenti (
  id uuid primary key default gen_random_uuid(),
  pds_id uuid not null references public.pds (id) on delete cascade,
  data date not null,
  importo numeric(15, 2) not null check (importo > 0),
  -- numero puro del protocollo del pagamento
  riferimento text check (riferimento ~ '^[0-9]{1,20}$'),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  created_by uuid references public.profili (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profili (id) on delete set null
);
create index if not exists pagamenti_pds_idx on public.pagamenti (pds_id);
alter table public.pagamenti drop constraint if exists pagamenti_riferimento_check;
alter table public.pagamenti add constraint pagamenti_riferimento_check check (riferimento ~ '^[0-9]{1,20}$');

create table if not exists public.allegati (
  id uuid primary key default gen_random_uuid(),
  pds_id uuid not null references public.pds (id) on delete cascade,
  tipo text not null check (tipo in ('protocollo_invio', 'protocollo_stipula', 'fattura', 'altro')),
  titolo text not null check (char_length(btrim(titolo)) between 1 and 300),
  url text check (url ~* '^https?://' and char_length(url) <= 2000),
  file_path text,
  file_nome text,
  file_dimensione bigint,
  file_tipo text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profili (id) on delete set null,
  constraint allegati_link_o_file check (url is not null or file_path is not null)
);
create index if not exists allegati_pds_idx on public.allegati (pds_id);

create table if not exists public.registro (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  utente_id uuid,
  username text,
  entita text not null check (entita in ('capitolo', 'accordo', 'atto', 'pds', 'pagamento', 'allegato', 'utente')),
  entita_id uuid,
  pds_id uuid,
  azione text not null check (azione in ('creazione', 'modifica', 'eliminazione')),
  riferimento text,
  modifiche jsonb
);
alter table public.registro drop constraint if exists registro_entita_check;
alter table public.registro add constraint registro_entita_check check (entita in ('capitolo', 'accordo', 'atto', 'pds', 'pagamento', 'allegato', 'utente'));
create index if not exists registro_ts_idx on public.registro (ts desc);
create index if not exists registro_pds_idx on public.registro (pds_id, ts desc);

-- -----------------------------------------------------------------------------
-- Funzioni di supporto ai permessi (schema privato "app", non esposto alle API)
-- -----------------------------------------------------------------------------

create or replace function app.utente_attivo()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profili p where p.id = auth.uid() and p.attivo);
$$;

create or replace function app.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profili p where p.id = auth.uid() and p.attivo and p.ruolo = 'admin');
$$;

create or replace function app.username_corrente()
returns text
language sql stable security definer
set search_path = ''
as $$
  select p.username from public.profili p where p.id = auth.uid();
$$;

-- Verifica un permesso di modifica; per le aree dei PdS considera l'ambito dei capitoli.
create or replace function app.puo(p_area text, p_capitolo_id uuid default null)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_profilo public.profili;
  v_codice text;
begin
  select * into v_profilo from public.profili p where p.id = auth.uid() and p.attivo;
  if not found then
    return false;
  end if;
  if v_profilo.ruolo = 'admin' then
    return true;
  end if;
  if coalesce((v_profilo.permessi ->> p_area)::boolean, false) is not true then
    return false;
  end if;
  if p_area in ('capitoli', 'accordi') or jsonb_typeof(v_profilo.permessi -> 'ambito_capitoli') is distinct from 'array' then
    return true;
  end if;
  select c.codice into v_codice from public.capitoli c where c.id = p_capitolo_id;
  if v_codice is null then
    return false;
  end if;
  return exists (
    select 1
    from jsonb_array_elements_text(v_profilo.permessi -> 'ambito_capitoli') as a (codice)
    where lower(btrim(a.codice)) = lower(btrim(v_codice))
  );
end;
$$;

create or replace function app.capitolo_di_pds(p_pds_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select d.capitolo_id from public.pds d where d.id = p_pds_id;
$$;

create or replace function app.uuid_o_null(p_testo text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return p_testo::uuid;
exception
  when others then
    return null;
end;
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated;

-- -----------------------------------------------------------------------------
-- Trigger: tracciamento, normalizzazione, vincoli e permessi per campo
-- -----------------------------------------------------------------------------

create or replace function app.traccia()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
    new.updated_at := now();
    new.updated_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function app.traccia_creazione()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  new.created_by := auth.uid();
  return new;
end;
$$;

create or replace function app.capitoli_controllo()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.codice := btrim(new.codice);
  new.descrizione := btrim(coalesce(new.descrizione, ''));
  new.sforamento_note := btrim(coalesce(new.sforamento_note, ''));
  if tg_op = 'UPDATE' and new.esercizio <> old.esercizio
     and exists (select 1 from public.pds d where d.capitolo_id = old.id) then
    raise exception 'Non è possibile cambiare l''esercizio di un capitolo a cui sono collegati dei PdS'
      using errcode = 'P0001';
  end if;
  -- l'autorizzazione al superamento del finanziato la concede solo l'amministratore, motivandola
  if auth.uid() is not null then
    if tg_op = 'INSERT' and new.sforamento_ignorato and not app.is_admin() then
      raise exception 'Solo l''amministratore può autorizzare il superamento del finanziato' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE'
       and (new.sforamento_ignorato, new.sforamento_note) is distinct from (old.sforamento_ignorato, old.sforamento_note)
       and not app.is_admin() then
      raise exception 'Solo l''amministratore può autorizzare il superamento del finanziato' using errcode = '42501';
    end if;
  end if;
  if new.sforamento_ignorato and new.sforamento_note = '' then
    raise exception 'Indicare la motivazione del superamento del finanziato' using errcode = 'P0001';
  end if;
  if not new.sforamento_ignorato then
    new.sforamento_note := '';
  end if;
  return new;
end;
$$;

create or replace function app.accordi_controllo()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.numero := btrim(new.numero);
  new.oggetto := btrim(new.oggetto);
  new.ditta := btrim(new.ditta);
  return new;
end;
$$;

create or replace function app.atti_controllo()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.numero := btrim(new.numero);
  if tg_op = 'UPDATE' and new.accordo_id <> old.accordo_id then
    raise exception 'Un atto di adesione non può essere spostato su un altro accordo quadro' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function app.pds_controllo()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_totale numeric(15, 2);
begin
  new.numero := btrim(new.numero);
  -- il numero contiene solo la parte numerica: l'anno deriva dall'esercizio del capitolo
  if tg_op = 'INSERT' or new.numero <> old.numero then
    if new.numero !~ '^[0-9]{1,20}$' then
      raise exception 'Numero PdS non valido: indicare solo il numero (l''anno viene aggiunto dall''esercizio finanziario)'
        using errcode = 'P0001';
    end if;
  end if;

  -- l'atto di adesione deve appartenere all'accordo quadro indicato
  if new.atto_adesione_id is not null then
    if new.accordo_id is null then
      raise exception 'Indicare l''accordo quadro dell''atto di adesione scelto' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.atti a where a.id = new.atto_adesione_id and a.accordo_id = new.accordo_id) then
      raise exception 'L''atto di adesione scelto appartiene a un altro accordo quadro' using errcode = 'P0001';
    end if;
  end if;

  -- tempi di esecuzione coerenti con la modalità scelta
  if new.modalita_termine = 'durata' then
    new.data_termine := null;
    if new.durata is not null and new.durata_unita is null then
      new.durata_unita := 'giorni';
    end if;
  elsif new.modalita_termine = 'data' then
    new.durata := null;
    new.durata_unita := null;
  else
    new.durata := null;
    new.durata_unita := null;
    new.data_termine := null;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.saldato := false;
      new.data_saldo := null;
      new.totale_pagato_saldo := null;
      new.eliminato_at := null;
      new.eliminato_da := null;
    end if;
    return new;
  end if;

  -- eliminazione logica: il PdS finisce tra i "PdS eliminati" e solo l'amministratore lo ripristina
  if new.eliminato_at is distinct from old.eliminato_at then
    if auth.uid() is not null then
      if new.eliminato_at is not null then
        if not app.puo('pds_crea', old.capitolo_id) then
          raise exception 'Non hai i permessi per eliminare questo PdS' using errcode = '42501';
        end if;
        new.eliminato_at := now();
        new.eliminato_da := auth.uid();
      else
        if not app.is_admin() then
          raise exception 'Solo l''amministratore può ripristinare un PdS eliminato' using errcode = '42501';
        end if;
        new.eliminato_da := null;
      end if;
    end if;
  elsif old.eliminato_at is not null and to_jsonb(new) - 'updated_at' - 'updated_by' is distinct from to_jsonb(old) - 'updated_at' - 'updated_by' then
    raise exception 'Il PdS è tra i PdS eliminati: ripristinarlo per poterlo modificare' using errcode = 'P0001';
  end if;

  -- permessi per gruppi di campi (non applicati alle operazioni di servizio senza utente)
  if auth.uid() is not null then
    if (new.numero, new.capitolo_id, new.accordo_id, new.atto_adesione_id, new.ditta, new.ordinativo, new.idv, new.dec,
        new.importo_inviato, new.protocollo_invio, new.data_invio,
        new.protocollo_stipula, new.data_stipula, new.valore_stipula,
        new.modalita_termine, new.durata, new.durata_unita, new.data_termine, new.note)
       is distinct from
       (old.numero, old.capitolo_id, old.accordo_id, old.atto_adesione_id, old.ditta, old.ordinativo, old.idv, old.dec,
        old.importo_inviato, old.protocollo_invio, old.data_invio,
        old.protocollo_stipula, old.data_stipula, old.valore_stipula,
        old.modalita_termine, old.durata, old.durata_unita, old.data_termine, old.note) then
      if not app.puo('pds_dati', old.capitolo_id) or not app.puo('pds_dati', new.capitolo_id) then
        raise exception 'Non hai i permessi per modificare i dati di questo PdS' using errcode = '42501';
      end if;
    end if;
    if (new.saldato, new.data_saldo, new.totale_pagato_saldo)
       is distinct from (old.saldato, old.data_saldo, old.totale_pagato_saldo)
       and not app.puo('pds_pagamenti', new.capitolo_id) then
      raise exception 'Non hai i permessi per confermare o annullare il saldo di questo PdS' using errcode = '42501';
    end if;
  end if;

  -- saldo: il totale pagato è sempre calcolato dai pagamenti registrati
  if new.saldato and not old.saldato then
    if new.data_stipula is null or new.valore_stipula is null then
      raise exception 'Per confermare il saldo occorre prima registrare la stipula (data e valore)' using errcode = 'P0001';
    end if;
    if new.data_saldo is null then
      raise exception 'La data del saldo è obbligatoria' using errcode = 'P0001';
    end if;
    select coalesce(sum(g.importo), 0) into v_totale from public.pagamenti g where g.pds_id = new.id;
    new.totale_pagato_saldo := v_totale;
  elsif not new.saldato then
    new.data_saldo := null;
    new.totale_pagato_saldo := null;
  else
    new.data_saldo := old.data_saldo;
    new.totale_pagato_saldo := old.totale_pagato_saldo;
  end if;
  return new;
end;
$$;

create or replace function app.pagamenti_controllo()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_pds uuid;
  v_saldato boolean;
begin
  -- nell'eliminazione in cascata il PdS non esiste più: nessun blocco
  v_pds := case when tg_op = 'DELETE' then old.pds_id else new.pds_id end;
  if tg_op = 'UPDATE' and new.pds_id <> old.pds_id then
    raise exception 'Un pagamento non può essere spostato su un altro PdS' using errcode = 'P0001';
  end if;
  select d.saldato into v_saldato from public.pds d where d.id = v_pds;
  if v_saldato then
    raise exception 'Il PdS risulta saldato: annullare il saldo per modificare i pagamenti' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pds d where d.id = v_pds and d.eliminato_at is not null) then
    raise exception 'Il PdS è tra i PdS eliminati: ripristinarlo per poterlo modificare' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function app.profili_controllo()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.username := old.username;
    new.created_at := old.created_at;
    new.updated_at := now();
    if old.ruolo = 'admin' and old.attivo and not (new.ruolo = 'admin' and new.attivo)
       and not exists (select 1 from public.profili p where p.id <> old.id and p.ruolo = 'admin' and p.attivo) then
      raise exception 'Deve restare almeno un amministratore attivo' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.ruolo = 'admin' and old.attivo
       and not exists (select 1 from public.profili p where p.id <> old.id and p.ruolo = 'admin' and p.attivo) then
      raise exception 'Deve restare almeno un amministratore attivo' using errcode = 'P0001';
    end if;
    return old;
  end if;
  return new;
end;
$$;

-- Storico modifiche: una voce per inserimento, modifica (solo campi cambiati) o eliminazione.
-- Argomenti: entità, elenco di campi da escludere separati da virgola.
create or replace function app.registra()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_entita text := tg_argv[0];
  v_escludi text[] := array['id', 'created_at', 'created_by', 'updated_at', 'updated_by']
    || string_to_array(coalesce(tg_argv[1], ''), ',');
  v_vecchio jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_nuovo jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_record jsonb := coalesce(v_nuovo, v_vecchio);
  v_modifiche jsonb := '{}'::jsonb;
  v_chiave text;
  v_valore jsonb;
  v_pds uuid;
  v_numero text;
  v_riferimento text;
begin
  -- pagamenti e allegati eliminati in cascata con il PdS non sono registrati singolarmente
  -- (quando il trigger viene eseguito il PdS non esiste più)
  if tg_op = 'DELETE' and v_entita in ('pagamento', 'allegato')
     and not exists (select 1 from public.pds d where d.id = (v_vecchio ->> 'pds_id')::uuid) then
    return null;
  end if;

  for v_chiave in select jsonb_object_keys(v_record) loop
    continue when v_chiave = any (v_escludi);
    if tg_op = 'UPDATE' then
      if (v_vecchio -> v_chiave) is distinct from (v_nuovo -> v_chiave) then
        v_modifiche := v_modifiche || jsonb_build_object(v_chiave, jsonb_build_object('da', v_vecchio -> v_chiave, 'a', v_nuovo -> v_chiave));
      end if;
    else
      v_valore := v_record -> v_chiave;
      if jsonb_typeof(v_valore) <> 'null' and v_valore <> 'false'::jsonb and v_valore <> '""'::jsonb then
        if tg_op = 'INSERT' then
          v_modifiche := v_modifiche || jsonb_build_object(v_chiave, jsonb_build_object('da', null, 'a', v_valore));
        else
          v_modifiche := v_modifiche || jsonb_build_object(v_chiave, jsonb_build_object('da', v_valore, 'a', null));
        end if;
      end if;
    end if;
  end loop;

  if tg_op = 'UPDATE' and v_modifiche = '{}'::jsonb then
    return null;
  end if;

  if v_entita = 'pds' then
    v_pds := (v_record ->> 'id')::uuid;
    select (v_record ->> 'numero') || '/' || c.esercizio into v_riferimento
    from public.capitoli c where c.id = (v_record ->> 'capitolo_id')::uuid;
    v_riferimento := coalesce(v_riferimento, v_record ->> 'numero');
  elsif v_entita in ('pagamento', 'allegato') then
    v_pds := (v_record ->> 'pds_id')::uuid;
    select d.numero || '/' || c.esercizio into v_numero
    from public.pds d join public.capitoli c on c.id = d.capitolo_id where d.id = v_pds;
    v_riferimento := case
      when v_entita = 'pagamento' then 'PdS ' || coalesce(v_numero, '?')
      else '"' || (v_record ->> 'titolo') || '" – PdS ' || coalesce(v_numero, '?')
    end;
  elsif v_entita = 'accordo' then
    v_riferimento := v_record ->> 'numero';
  elsif v_entita = 'atto' then
    select (v_record ->> 'numero') || ' (AQ ' || a.numero || ')' into v_riferimento
    from public.accordi a where a.id = (v_record ->> 'accordo_id')::uuid;
    v_riferimento := coalesce(v_riferimento, v_record ->> 'numero');
  elsif v_entita = 'capitolo' then
    v_riferimento := (v_record ->> 'codice') || ' (' || (v_record ->> 'esercizio') || ')';
  elsif v_entita = 'utente' then
    v_riferimento := v_record ->> 'username';
  end if;

  insert into public.registro (utente_id, username, entita, entita_id, pds_id, azione, riferimento, modifiche)
  values (
    auth.uid(),
    app.username_corrente(),
    v_entita,
    (v_record ->> 'id')::uuid,
    v_pds,
    case tg_op when 'INSERT' then 'creazione' when 'UPDATE' then 'modifica' else 'eliminazione' end,
    v_riferimento,
    v_modifiche
  );
  return null;
end;
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated;

-- Collegamento dei trigger (ricreati a ogni esecuzione dello script)
drop trigger if exists capitoli_traccia on public.capitoli;
create trigger capitoli_traccia before insert or update on public.capitoli for each row execute function app.traccia();
drop trigger if exists capitoli_controllo on public.capitoli;
create trigger capitoli_controllo before insert or update on public.capitoli for each row execute function app.capitoli_controllo();
drop trigger if exists capitoli_registro on public.capitoli;
create trigger capitoli_registro after insert or update or delete on public.capitoli for each row execute function app.registra('capitolo');

drop trigger if exists accordi_traccia on public.accordi;
create trigger accordi_traccia before insert or update on public.accordi for each row execute function app.traccia();
drop trigger if exists accordi_controllo on public.accordi;
create trigger accordi_controllo before insert or update on public.accordi for each row execute function app.accordi_controllo();
drop trigger if exists accordi_registro on public.accordi;
create trigger accordi_registro after insert or update or delete on public.accordi for each row execute function app.registra('accordo');

drop trigger if exists atti_traccia on public.atti;
create trigger atti_traccia before insert or update on public.atti for each row execute function app.traccia();
drop trigger if exists atti_controllo on public.atti;
create trigger atti_controllo before insert or update on public.atti for each row execute function app.atti_controllo();
drop trigger if exists atti_registro on public.atti;
create trigger atti_registro after insert or update or delete on public.atti for each row execute function app.registra('atto');

drop trigger if exists pds_traccia on public.pds;
create trigger pds_traccia before insert or update on public.pds for each row execute function app.traccia();
drop trigger if exists pds_controllo on public.pds;
create trigger pds_controllo before insert or update on public.pds for each row execute function app.pds_controllo();
drop trigger if exists pds_registro on public.pds;
create trigger pds_registro after insert or update or delete on public.pds for each row execute function app.registra('pds');

drop trigger if exists pagamenti_traccia on public.pagamenti;
create trigger pagamenti_traccia before insert or update on public.pagamenti for each row execute function app.traccia();
drop trigger if exists pagamenti_controllo on public.pagamenti;
create trigger pagamenti_controllo before insert or update or delete on public.pagamenti for each row execute function app.pagamenti_controllo();
drop trigger if exists pagamenti_registro on public.pagamenti;
create trigger pagamenti_registro after insert or update or delete on public.pagamenti for each row execute function app.registra('pagamento', 'pds_id');

drop trigger if exists allegati_traccia on public.allegati;
create trigger allegati_traccia before insert on public.allegati for each row execute function app.traccia_creazione();
drop trigger if exists allegati_registro on public.allegati;
create trigger allegati_registro after insert or delete on public.allegati for each row execute function app.registra('allegato', 'pds_id,file_path,file_dimensione,file_tipo');

drop trigger if exists profili_controllo on public.profili;
create trigger profili_controllo before update or delete on public.profili for each row execute function app.profili_controllo();
drop trigger if exists profili_registro on public.profili;
create trigger profili_registro after update on public.profili for each row execute function app.registra('utente');

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profili enable row level security;
alter table public.capitoli enable row level security;
alter table public.accordi enable row level security;
alter table public.atti enable row level security;
alter table public.pds enable row level security;
alter table public.pagamenti enable row level security;
alter table public.allegati enable row level security;
alter table public.registro enable row level security;

drop policy if exists profili_lettura on public.profili;
create policy profili_lettura on public.profili for select to authenticated
  using (app.utente_attivo() or id = auth.uid());
drop policy if exists profili_modifica on public.profili;
create policy profili_modifica on public.profili for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

drop policy if exists capitoli_lettura on public.capitoli;
create policy capitoli_lettura on public.capitoli for select to authenticated using (app.utente_attivo());
drop policy if exists capitoli_inserimento on public.capitoli;
create policy capitoli_inserimento on public.capitoli for insert to authenticated with check (app.puo('capitoli'));
drop policy if exists capitoli_modifica on public.capitoli;
create policy capitoli_modifica on public.capitoli for update to authenticated using (app.puo('capitoli')) with check (app.puo('capitoli'));
drop policy if exists capitoli_eliminazione on public.capitoli;
create policy capitoli_eliminazione on public.capitoli for delete to authenticated using (app.puo('capitoli'));

drop policy if exists accordi_lettura on public.accordi;
create policy accordi_lettura on public.accordi for select to authenticated using (app.utente_attivo());
drop policy if exists accordi_inserimento on public.accordi;
create policy accordi_inserimento on public.accordi for insert to authenticated with check (app.puo('accordi'));
drop policy if exists accordi_modifica on public.accordi;
create policy accordi_modifica on public.accordi for update to authenticated using (app.puo('accordi')) with check (app.puo('accordi'));
drop policy if exists accordi_eliminazione on public.accordi;
create policy accordi_eliminazione on public.accordi for delete to authenticated using (app.puo('accordi'));

drop policy if exists atti_lettura on public.atti;
create policy atti_lettura on public.atti for select to authenticated using (app.utente_attivo());
drop policy if exists atti_inserimento on public.atti;
create policy atti_inserimento on public.atti for insert to authenticated with check (app.puo('accordi'));
drop policy if exists atti_modifica on public.atti;
create policy atti_modifica on public.atti for update to authenticated using (app.puo('accordi')) with check (app.puo('accordi'));
drop policy if exists atti_eliminazione on public.atti;
create policy atti_eliminazione on public.atti for delete to authenticated using (app.puo('accordi'));

drop policy if exists pds_lettura on public.pds;
create policy pds_lettura on public.pds for select to authenticated using (app.utente_attivo());
drop policy if exists pds_inserimento on public.pds;
create policy pds_inserimento on public.pds for insert to authenticated with check (app.puo('pds_crea', capitolo_id));
drop policy if exists pds_modifica on public.pds;
-- pds_crea copre l'eliminazione logica, l'amministratore il ripristino
create policy pds_modifica on public.pds for update to authenticated
  using (app.puo('pds_dati', capitolo_id) or app.puo('pds_pagamenti', capitolo_id) or app.puo('pds_crea', capitolo_id) or app.is_admin())
  with check (app.puo('pds_dati', capitolo_id) or app.puo('pds_pagamenti', capitolo_id) or app.puo('pds_crea', capitolo_id) or app.is_admin());
drop policy if exists pds_eliminazione on public.pds;
-- l'eliminazione definitiva (con pagamenti e allegati) è riservata all'amministratore
create policy pds_eliminazione on public.pds for delete to authenticated using (app.is_admin());

drop policy if exists pagamenti_lettura on public.pagamenti;
create policy pagamenti_lettura on public.pagamenti for select to authenticated using (app.utente_attivo());
drop policy if exists pagamenti_inserimento on public.pagamenti;
create policy pagamenti_inserimento on public.pagamenti for insert to authenticated
  with check (app.puo('pds_pagamenti', app.capitolo_di_pds(pds_id)));
drop policy if exists pagamenti_modifica on public.pagamenti;
create policy pagamenti_modifica on public.pagamenti for update to authenticated
  using (app.puo('pds_pagamenti', app.capitolo_di_pds(pds_id)))
  with check (app.puo('pds_pagamenti', app.capitolo_di_pds(pds_id)));
drop policy if exists pagamenti_eliminazione on public.pagamenti;
create policy pagamenti_eliminazione on public.pagamenti for delete to authenticated
  using (app.puo('pds_pagamenti', app.capitolo_di_pds(pds_id)));

drop policy if exists allegati_lettura on public.allegati;
create policy allegati_lettura on public.allegati for select to authenticated using (app.utente_attivo());
drop policy if exists allegati_inserimento on public.allegati;
create policy allegati_inserimento on public.allegati for insert to authenticated
  with check (app.puo('pds_allegati', app.capitolo_di_pds(pds_id)));
drop policy if exists allegati_eliminazione on public.allegati;
create policy allegati_eliminazione on public.allegati for delete to authenticated
  using (app.puo('pds_allegati', app.capitolo_di_pds(pds_id)));

drop policy if exists registro_lettura on public.registro;
create policy registro_lettura on public.registro for select to authenticated
  using (app.utente_attivo() and (entita <> 'utente' or app.is_admin()));

-- -----------------------------------------------------------------------------
-- Esposizione alle API (i progetti Supabase recenti non concedono più nulla in automatico)
-- -----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
revoke all on public.profili, public.capitoli, public.accordi, public.atti, public.pds, public.pagamenti, public.allegati, public.registro from anon;
grant select on public.profili to authenticated;
grant update (nome, ruolo, attivo, permessi) on public.profili to authenticated;
grant select, insert, update, delete on public.capitoli, public.accordi, public.atti, public.pds, public.pagamenti to authenticated;
grant select, insert, delete on public.allegati to authenticated;
grant select on public.registro to authenticated;
-- chiave di servizio (usata solo dalla Edge Function "gestione-utenti")
grant usage on schema public to service_role;
grant select, insert, update, delete on public.profili, public.capitoli, public.accordi, public.atti, public.pds, public.pagamenti, public.allegati to service_role;
grant select, insert on public.registro to service_role;

-- -----------------------------------------------------------------------------
-- Funzioni richiamabili dall'applicazione (RPC)
-- -----------------------------------------------------------------------------

-- Conferma del saldo, con eventuale pagamento finale, in un'unica transazione.
create or replace function public.conferma_saldo(
  p_pds_id uuid,
  p_data_saldo date,
  p_importo_finale numeric default null,
  p_data_pagamento date default null,
  p_riferimento text default null
)
returns void
language plpgsql security invoker
set search_path = ''
as $$
begin
  if p_importo_finale is not null then
    insert into public.pagamenti (pds_id, data, importo, riferimento)
    values (p_pds_id, coalesce(p_data_pagamento, p_data_saldo), p_importo_finale, p_riferimento);
  end if;
  update public.pds set saldato = true, data_saldo = p_data_saldo where id = p_pds_id and not saldato;
  if not found then
    if exists (select 1 from public.pds where id = p_pds_id and saldato) then
      raise exception 'Il saldo di questo PdS è già stato confermato' using errcode = 'P0001';
    end if;
    raise exception 'PdS non trovato oppure permessi insufficienti per confermare il saldo' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.annulla_saldo(p_pds_id uuid)
returns void
language plpgsql security invoker
set search_path = ''
as $$
begin
  update public.pds set saldato = false where id = p_pds_id and saldato;
  if not found then
    if exists (select 1 from public.pds where id = p_pds_id and not saldato) then
      raise exception 'Il PdS non risulta saldato' using errcode = 'P0001';
    end if;
    raise exception 'PdS non trovato oppure permessi insufficienti per annullare il saldo' using errcode = '42501';
  end if;
end;
$$;

-- Copia i capitoli di un esercizio in un altro (senza duplicare quelli esistenti).
create or replace function public.copia_capitoli(p_origine integer, p_destinazione integer, p_copia_importi boolean)
returns integer
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_conteggio integer;
begin
  if p_origine = p_destinazione then
    raise exception 'L''esercizio di destinazione deve essere diverso da quello di origine' using errcode = 'P0001';
  end if;
  insert into public.capitoli (esercizio, codice, descrizione, finanziato, sforamento_ignorato, sforamento_note)
  select p_destinazione, c.codice, c.descrizione, case when p_copia_importi then c.finanziato else 0 end, false, ''
  from public.capitoli c
  where c.esercizio = p_origine
    and not exists (
      select 1 from public.capitoli x
      where x.esercizio = p_destinazione and lower(btrim(x.codice)) = lower(btrim(c.codice))
    );
  get diagnostics v_conteggio = row_count;
  return v_conteggio;
end;
$$;

-- Istante dell'ultima modifica registrata: controllo leggero degli aggiornamenti.
create or replace function public.ultimo_aggiornamento()
returns timestamptz
language sql stable security definer
set search_path = ''
as $$
  select case when app.utente_attivo() then (select max(r.ts) from public.registro r) end;
$$;

-- Indica (anche prima dell'accesso) se esiste già un amministratore.
create or replace function public.stato_installazione()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('amministratori', exists (select 1 from public.profili p where p.ruolo = 'admin' and p.attivo));
$$;

-- Primo avvio: l'utente autenticato diventa amministratore se non ne esiste ancora uno.
create or replace function public.inizializza_amministratore(p_nome text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text;
  v_username text;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(7349201);
  if exists (select 1 from public.profili p where p.ruolo = 'admin') then
    raise exception 'Esiste già un amministratore: chiedere a lui di abilitare questo utente' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  v_username := lower(split_part(coalesce(v_email, ''), '@', 1));
  if v_username !~ '^[a-z0-9][a-z0-9._-]{2,39}$' then
    raise exception 'Il nome utente "%" non è valido: usare un indirizzo che inizi con 3-40 caratteri tra lettere minuscole, cifre, punto e trattini', v_username
      using errcode = 'P0001';
  end if;
  insert into public.profili (id, username, nome, ruolo, attivo, permessi)
  values (
    auth.uid(), v_username, btrim(coalesce(p_nome, '')), 'admin', true,
    '{"capitoli": true, "accordi": true, "pds_crea": true, "pds_dati": true, "pds_pagamenti": true, "pds_allegati": true, "ambito_capitoli": null}'::jsonb
  )
  on conflict (id) do update set ruolo = 'admin', attivo = true, nome = excluded.nome, permessi = excluded.permessi;
  insert into public.registro (utente_id, username, entita, entita_id, azione, riferimento, modifiche)
  values (auth.uid(), v_username, 'utente', auth.uid(), 'creazione', v_username,
          jsonb_build_object('username', jsonb_build_object('da', null, 'a', v_username), 'ruolo', jsonb_build_object('da', null, 'a', 'admin')));
end;
$$;

-- Usata dal job di GitHub Actions che evita la sospensione dei progetti gratuiti inattivi.
create or replace function public.ping()
returns text
language sql stable
set search_path = ''
as $$
  select 'ok'::text;
$$;

revoke all on function public.conferma_saldo(uuid, date, numeric, date, text) from public, anon;
revoke all on function public.annulla_saldo(uuid) from public, anon;
revoke all on function public.copia_capitoli(integer, integer, boolean) from public, anon;
revoke all on function public.ultimo_aggiornamento() from public, anon;
revoke all on function public.inizializza_amministratore(text) from public, anon;
grant execute on function public.conferma_saldo(uuid, date, numeric, date, text) to authenticated;
grant execute on function public.annulla_saldo(uuid) to authenticated;
grant execute on function public.copia_capitoli(integer, integer, boolean) to authenticated;
grant execute on function public.ultimo_aggiornamento() to authenticated;
grant execute on function public.inizializza_amministratore(text) to authenticated;
grant execute on function public.stato_installazione() to anon, authenticated;
grant execute on function public.ping() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Archivio dei file allegati (Supabase Storage)
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('allegati', 'allegati', false, 20971520)
on conflict (id) do nothing;

-- Percorso dei file: <id PdS>/<id allegato>/<nome file>
drop policy if exists "pds allegati lettura" on storage.objects;
create policy "pds allegati lettura" on storage.objects for select to authenticated
  using (bucket_id = 'allegati' and app.utente_attivo());
drop policy if exists "pds allegati caricamento" on storage.objects;
create policy "pds allegati caricamento" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'allegati'
    and app.capitolo_di_pds(app.uuid_o_null((storage.foldername(name))[1])) is not null
    and app.puo('pds_allegati', app.capitolo_di_pds(app.uuid_o_null((storage.foldername(name))[1])))
  );
drop policy if exists "pds allegati eliminazione" on storage.objects;
create policy "pds allegati eliminazione" on storage.objects for delete to authenticated
  using (
    bucket_id = 'allegati'
    and app.capitolo_di_pds(app.uuid_o_null((storage.foldername(name))[1])) is not null
    and app.puo('pds_allegati', app.capitolo_di_pds(app.uuid_o_null((storage.foldername(name))[1])))
  );
