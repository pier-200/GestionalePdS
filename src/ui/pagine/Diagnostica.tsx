import { Alert, Anchor, Badge, Button, Card, CopyButton, Group, Loader, Stack, Table, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconCopy, IconInfoCircle, IconPlayerPlay, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConfigApp } from '../../config';
import { useApp } from '../../stato/store';
import { IntestazionePagina } from '../componenti/base';
import { href } from '../router';

type Esito = 'ok' | 'avviso' | 'errore';

interface Prova {
  id: string;
  nome: string;
  scopo: string;
  esegui: () => Promise<{ esito: Esito; dettaglio: string }>;
}

interface Risultato {
  stato: 'attesa' | 'in_corso' | Esito;
  dettaglio: string;
  ms?: number;
}

const TIMEOUT = 12_000;

async function richiesta(url: string, init: RequestInit = {}): Promise<Response> {
  const controllo = new AbortController();
  const timer = setTimeout(() => controllo.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...init, cache: 'no-store', signal: controllo.signal, credentials: 'omit' });
  } finally {
    clearTimeout(timer);
  }
}

function spiegaErrore(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return `Nessuna risposta entro ${TIMEOUT / 1000} secondi (probabile blocco di rete o proxy).`;
  return 'Connessione non riuscita: dominio bloccato dalla rete/proxy oppure non raggiungibile.';
}

/** Prova con CORS: una pagina di blocco del proxy non ha intestazioni CORS e viene correttamente rilevata come errore. */
function provaCors(url: string, init: RequestInit = {}, attesi: number[] = [200]) {
  return async () => {
    try {
      const r = await richiesta(url, { ...init, mode: 'cors' });
      if (attesi.includes(r.status)) return { esito: 'ok' as const, dettaglio: `Raggiungibile (HTTP ${r.status}).` };
      if (r.status === 403 || r.status === 429) return { esito: 'avviso' as const, dettaglio: `Raggiungibile ma la richiesta è stata limitata (HTTP ${r.status}).` };
      return { esito: 'avviso' as const, dettaglio: `Raggiungibile, risposta inattesa HTTP ${r.status}.` };
    } catch (e) {
      return { esito: 'errore' as const, dettaglio: spiegaErrore(e) };
    }
  };
}

/** Prova di sola raggiungibilità di rete (risposta opaca). */
function provaRete(url: string) {
  return async () => {
    try {
      await richiesta(url, { mode: 'no-cors' });
      return { esito: 'ok' as const, dettaglio: 'Il dominio risponde (verifica di rete di base).' };
    } catch (e) {
      return { esito: 'errore' as const, dettaglio: spiegaErrore(e) };
    }
  };
}

function proveDaConfig(config: ConfigApp | null, urlSupabase: string): Prova[] {
  const prove: Prova[] = [
    {
      id: 'github-api',
      nome: 'GitHub API (api.github.com)',
      scopo: 'Necessario per il backend "GitHub" (lettura e salvataggio dei dati).',
      esegui: provaCors('https://api.github.com/rate_limit'),
    },
    {
      id: 'github-raw',
      nome: 'GitHub contenuti (raw.githubusercontent.com)',
      scopo: 'Usato dal backend "GitHub" come fonte alternativa per il portachiavi degli accessi.',
      esegui: provaCors('https://raw.githubusercontent.com/github/gitignore/main/README.md'),
    },
    {
      id: 'github-pages',
      nome: 'GitHub Pages (github.io)',
      scopo: "Dominio su cui è pubblicata l'applicazione.",
      esegui: async () =>
        window.location.hostname.endsWith('github.io')
          ? { esito: 'ok', dettaglio: `Raggiungibile: questa pagina è servita da ${window.location.hostname}.` }
          : provaRete('https://github.io/')(),
    },
  ];
  const b = config?.backend;
  if (b?.tipo === 'github') {
    prove.push({
      id: 'github-keyring',
      nome: `Repository accessi (${b.owner}/${b.repoAccessi})`,
      scopo: 'Portachiavi cifrato letto prima del login.',
      esegui: provaCors(`https://api.github.com/repos/${encodeURIComponent(b.owner)}/${encodeURIComponent(b.repoAccessi)}/contents/keyring.json`, {}, [200, 404]),
    });
  }
  if (b?.tipo === 'supabase') {
    prove.push({
      id: 'supabase-progetto',
      nome: `Supabase – progetto configurato (${new URL(b.url).hostname})`,
      scopo: 'Necessario per il backend "Supabase" (autenticazione e dati).',
      esegui: provaCors(`${b.url}/auth/v1/settings`, { headers: { apikey: b.chiavePubblica } }, [200]),
    });
  }
  const url = urlSupabase.trim().replace(/\/+$/, '');
  if (url && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    prove.push({
      id: 'supabase-url',
      nome: `Supabase – ${new URL(url).hostname}`,
      scopo: 'Raggiungibilità del progetto indicato.',
      esegui: provaRete(`${url}/auth/v1/health`),
    });
  } else {
    prove.push({
      id: 'supabase-generico',
      nome: 'Supabase (supabase.co)',
      scopo: 'Indica se il backend "Supabase" potrebbe essere utilizzabile da questa rete.',
      esegui: provaRete('https://supabase.co/'),
    });
  }
  return prove;
}

function ambiente(): { nome: string; ok: boolean; dettaglio: string }[] {
  const verifica = (fn: () => boolean) => {
    try {
      return fn();
    } catch {
      return false;
    }
  };
  return [
    { nome: 'Contesto sicuro (HTTPS)', ok: window.isSecureContext, dettaglio: window.location.origin },
    { nome: 'Crittografia del browser (WebCrypto)', ok: verifica(() => Boolean(crypto?.subtle)), dettaglio: 'Necessaria per password e cifratura' },
    {
      nome: 'Archiviazione locale',
      ok: verifica(() => {
        localStorage.setItem('gestionale-pds:prova', '1');
        localStorage.removeItem('gestionale-pds:prova');
        return true;
      }),
      dettaglio: 'Sessione e preferenze',
    },
    { nome: 'IndexedDB', ok: verifica(() => typeof indexedDB !== 'undefined'), dettaglio: 'Allegati in modalità dimostrativa' },
  ];
}

const ICONE = {
  ok: { colore: 'green', icona: IconCheck, testo: 'OK' },
  avviso: { colore: 'yellow', icona: IconAlertTriangle, testo: 'Attenzione' },
  errore: { colore: 'red', icona: IconX, testo: 'Bloccato' },
} as const;

export function Diagnostica() {
  const config = useApp((s) => s.config);
  const fase = useApp((s) => s.fase);
  const [urlSupabase, setUrlSupabase] = useState('');
  const prove = useMemo(() => proveDaConfig(config, urlSupabase), [config, urlSupabase]);
  const [risultati, setRisultati] = useState<Record<string, Risultato>>({});
  const [inCorso, setInCorso] = useState(false);
  const verifiche = useMemo(ambiente, []);

  const avviaProve = useCallback(async () => {
    setInCorso(true);
    setRisultati(Object.fromEntries(prove.map((p) => [p.id, { stato: 'in_corso', dettaglio: '' } satisfies Risultato])));
    await Promise.all(
      prove.map(async (p) => {
        const inizio = performance.now();
        const r = await p.esegui();
        setRisultati((prec) => ({ ...prec, [p.id]: { stato: r.esito, dettaglio: r.dettaglio, ms: Math.round(performance.now() - inizio) } }));
      }),
    );
    setInCorso(false);
  }, [prove]);

  // Le prove partono automaticamente solo all'apertura della pagina.
  const [avviate, setAvviate] = useState(false);
  useEffect(() => {
    if (avviate) return;
    setAvviate(true);
    void avviaProve();
  }, [avviate, avviaProve]);

  const rapporto = [
    `Diagnostica Gestionale PdS – ${new Date().toLocaleString('it-IT')}`,
    `Pagina: ${window.location.origin}${window.location.pathname}`,
    `Backend configurato: ${config?.backend.tipo ?? 'n.d.'}`,
    `Browser: ${navigator.userAgent}`,
    ...prove.map((p) => {
      const r = risultati[p.id];
      return `- ${p.nome}: ${r ? `${r.stato}${r.ms != null ? ` (${r.ms} ms)` : ''} – ${r.dettaglio}` : 'non eseguita'}`;
    }),
    ...verifiche.map((v) => `- ${v.nome}: ${v.ok ? 'sì' : 'no'}`),
  ].join('\n');

  const esitoGitHub = risultati['github-api']?.stato;
  const esitoSupabase = (risultati['supabase-progetto'] ?? risultati['supabase-url'] ?? risultati['supabase-generico'])?.stato;

  return (
    <Stack gap="md">
      <IntestazionePagina
        titolo="Diagnostica della connessione"
        sottotitolo="Verifica quali servizi sono raggiungibili dalla rete di questo dispositivo: utile per scegliere e controllare l'archivio dati."
        azioni={
          <>
            <CopyButton value={rapporto}>
              {({ copied, copy }) => (
                <Button variant="default" leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />} onClick={copy}>
                  {copied ? 'Copiato' : 'Copia risultati'}
                </Button>
              )}
            </CopyButton>
            <Button leftSection={<IconPlayerPlay size={16} />} onClick={avviaProve} loading={inCorso}>
              Ripeti le prove
            </Button>
          </>
        }
      />

      {esitoGitHub && esitoSupabase && esitoGitHub !== 'in_corso' && esitoSupabase !== 'in_corso' && (
        <Alert
          color={esitoGitHub === 'errore' && esitoSupabase === 'errore' ? 'red' : 'pds'}
          icon={<IconInfoCircle size={18} />}
          title="Indicazione"
        >
          {esitoSupabase === 'ok'
            ? 'Supabase risulta raggiungibile: è possibile usare il backend "Supabase", che applica i permessi anche lato server.'
            : esitoGitHub === 'ok'
              ? 'Supabase non risulta raggiungibile ma GitHub sì: da questa rete usare il backend "GitHub".'
              : 'Né GitHub API né Supabase risultano raggiungibili: contattare il referente informatico per sbloccare almeno api.github.com.'}
        </Alert>
      )}

      <Card padding="md">
        <Title order={3} fz="md" mb="sm">
          Servizi
        </Title>
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={130}>Esito</Table.Th>
                <Table.Th>Servizio</Table.Th>
                <Table.Th>Dettaglio</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {prove.map((p) => {
                const r = risultati[p.id];
                const info = r && r.stato !== 'attesa' && r.stato !== 'in_corso' ? ICONE[r.stato] : null;
                return (
                  <Table.Tr key={p.id}>
                    <Table.Td>
                      {r?.stato === 'in_corso' ? (
                        <Group gap={6}>
                          <Loader size={14} />
                          <Text fz="sm">Verifica…</Text>
                        </Group>
                      ) : info ? (
                        <Badge color={info.colore} variant="light" leftSection={<info.icona size={12} />}>
                          {info.testo}
                        </Badge>
                      ) : (
                        <Text c="dimmed" fz="sm">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" fw={600}>
                        {p.nome}
                      </Text>
                      <Text fz="xs" c="dimmed">
                        {p.scopo}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm">{r?.dettaglio}</Text>
                      {r?.ms != null && (
                        <Text fz="xs" c="dimmed" className="num">
                          {r.ms} ms
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {config?.backend.tipo !== 'supabase' && (
          <TextInput
            mt="md"
            label="Verifica un progetto Supabase specifico (facoltativo)"
            placeholder="https://abcdefghijkl.supabase.co"
            value={urlSupabase}
            onChange={(e) => setUrlSupabase(e.currentTarget.value)}
            description="Dopo aver inserito l'indirizzo premere «Ripeti le prove»."
            maw={520}
          />
        )}
      </Card>

      <Card padding="md">
        <Title order={3} fz="md" mb="sm">
          Browser
        </Title>
        <Stack gap={8}>
          {verifiche.map((v) => (
            <Group key={v.nome} gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon size={22} radius="xl" color={v.ok ? 'green' : 'red'} variant="light">
                {v.ok ? <IconCheck size={14} /> : <IconX size={14} />}
              </ThemeIcon>
              <div>
                <Text fz="sm" fw={500}>
                  {v.nome}: {v.ok ? 'disponibile' : 'non disponibile'}
                </Text>
                <Text fz="xs" c="dimmed">
                  {v.dettaglio}
                </Text>
              </div>
            </Group>
          ))}
        </Stack>
      </Card>

      {fase !== 'pronto' && (
        <Anchor href={href('/')} fz="sm">
          ← Torna all'accesso
        </Anchor>
      )}
    </Stack>
  );
}
