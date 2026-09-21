import {
  ActionIcon,
  Alert,
  AppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlarm,
  IconBuildingBank,
  IconChartBar,
  IconChevronDown,
  IconFileInvoice,
  IconFileText,
  IconHistory,
  IconLayoutDashboard,
  IconLogout,
  IconMoon,
  IconPlugConnected,
  IconReceipt2,
  IconRefresh,
  IconSun,
  IconUserCircle,
  IconUsers,
} from '@tabler/icons-react';
import { useEffect, useMemo, type ComponentType } from 'react';
import { isAdmin } from '../../domain/permessi';
import { useDerivati } from '../../stato/derivati';
import { useApp } from '../../stato/store';
import { notificaErrore } from '../componenti/azioni';
import { Account } from '../pagine/Account';
import { AccordiQuadro } from '../pagine/AccordiQuadro';
import { Capitoli } from '../pagine/Capitoli';
import { DettaglioAccordo } from '../pagine/DettaglioAccordo';
import { DettaglioPds } from '../pagine/DettaglioPds';
import { Diagnostica } from '../pagine/Diagnostica';
import { ElencoPds } from '../pagine/ElencoPds';
import { NonTrovata } from '../pagine/NonTrovata';
import { Panoramica } from '../pagine/Panoramica';
import { PdsEliminati } from '../pagine/PdsEliminati';
import { Registro } from '../pagine/Registro';
import { Scadenze } from '../pagine/Scadenze';
import { Sintesi } from '../pagine/Sintesi';
import { Utenti } from '../pagine/Utenti';
import { corrisponde, href, naviga, usePosizione } from '../router';

interface Rotta {
  schema: string;
  componente: ComponentType<{ parametri: Record<string, string> }>;
  soloAdmin?: boolean;
}

const ROTTE: Rotta[] = [
  { schema: '/', componente: Panoramica },
  { schema: '/pds', componente: ElencoPds },
  { schema: '/pds-eliminati', componente: PdsEliminati, soloAdmin: true },
  { schema: '/pds/:id', componente: DettaglioPds },
  { schema: '/capitoli', componente: Capitoli },
  { schema: '/accordi', componente: AccordiQuadro },
  { schema: '/accordi/:id', componente: DettaglioAccordo },
  { schema: '/sintesi', componente: Sintesi },
  { schema: '/scadenze', componente: Scadenze },
  { schema: '/utenti', componente: Utenti, soloAdmin: true },
  { schema: '/registro', componente: Registro, soloAdmin: true },
  { schema: '/account', componente: Account },
  { schema: '/diagnostica', componente: Diagnostica },
];

const ETICHETTE_BACKEND = { demo: 'Demo', github: 'GitHub', supabase: 'Supabase' } as const;

function iniziali(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function Guscio() {
  const [aperto, { toggle, close }] = useDisclosure();
  const { percorso } = usePosizione();
  const utente = useApp((s) => s.sessione?.utente ?? null);
  const backend = useApp((s) => s.backend);
  const config = useApp((s) => s.config);
  const caricamento = useApp((s) => s.caricamento);
  const ultimoCaricamento = useApp((s) => s.ultimoCaricamento);
  const { viste } = useDerivati();
  const { setColorScheme } = useMantineColorScheme();
  const schema = useComputedColorScheme('light');

  // Aggiornamento automatico: ogni minuto e al ritorno sulla finestra.
  useEffect(() => {
    const controlla = () => void useApp.getState().controllaAggiornamenti();
    const timer = window.setInterval(controlla, 60_000);
    const visibilita = () => document.visibilityState === 'visible' && controlla();
    window.addEventListener('focus', controlla);
    document.addEventListener('visibilitychange', visibilita);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', controlla);
      document.removeEventListener('visibilitychange', visibilita);
    };
  }, []);

  useEffect(() => {
    close();
    window.scrollTo({ top: 0 });
  }, [percorso, close]);

  const avvisi = useMemo(() => viste.filter((v) => v.avviso != null).length, [viste]);
  const admin = isAdmin(utente);

  const trovata = ROTTE.map((r) => ({ rotta: r, parametri: corrisponde(r.schema, percorso) })).find((x) => x.parametri);
  const Pagina = trovata && (!trovata.rotta.soloAdmin || admin) ? trovata.rotta.componente : NonTrovata;

  const voci = [
    { a: '/', etichetta: 'Panoramica', icona: IconLayoutDashboard },
    { a: '/pds', etichetta: 'Progetti di spesa', icona: IconFileInvoice },
    { a: '/capitoli', etichetta: 'Capitoli di spesa', icona: IconBuildingBank },
    { a: '/accordi', etichetta: 'Accordi quadro', icona: IconFileText },
    { a: '/sintesi', etichetta: 'Sintesi finanziaria', icona: IconChartBar },
    { a: '/scadenze', etichetta: 'Scadenze e avvisi', icona: IconAlarm, badge: avvisi },
    // utenti, permessi e registro delle modifiche sono riservati all'amministratore
    ...(admin
      ? [
          { a: '/utenti', etichetta: 'Utenti e permessi', icona: IconUsers },
          { a: '/registro', etichetta: 'Registro modifiche', icona: IconHistory },
        ]
      : []),
  ];

  const attivo = (a: string) => (a === '/' ? percorso === '/' : percorso === a || percorso.startsWith(`${a}/`));

  const aggiorna = async () => {
    try {
      await useApp.getState().ricarica();
    } catch (e) {
      notificaErrore(e, 'Aggiornamento non riuscito');
    }
  };

  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 264, breakpoint: 'md', collapsed: { mobile: !aperto } }} padding={{ base: 'sm', sm: 'lg' }}>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <Burger opened={aperto} onClick={toggle} hiddenFrom="md" size="sm" aria-label="Apri il menu di navigazione" />
            <UnstyledButton component="a" href={href('/')} aria-label="Vai alla panoramica">
              <Group gap={10} wrap="nowrap">
                <ThemeIcon size={34} radius="md">
                  <IconReceipt2 size={20} />
                </ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                  <Text fw={700} lh={1.15} truncate>
                    Gestionale PdS
                  </Text>
                  {config?.nomeUfficio && (
                    <Text fz="xs" c="dimmed" lh={1.15} truncate visibleFrom="xs">
                      {config.nomeUfficio}
                    </Text>
                  )}
                </Box>
              </Group>
            </UnstyledButton>
          </Group>
          <Group gap={6} wrap="nowrap">
            <Tooltip label={`Aggiorna i dati${ultimoCaricamento ? ` (ultimo aggiornamento alle ${new Date(ultimoCaricamento).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })})` : ''}`}>
              <ActionIcon variant="subtle" color="gray" size="lg" onClick={aggiorna} loading={caricamento} aria-label="Aggiorna i dati">
                <IconRefresh size={20} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={schema === 'dark' ? 'Tema chiaro' : 'Tema scuro'}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                onClick={() => setColorScheme(schema === 'dark' ? 'light' : 'dark')}
                aria-label={schema === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
              >
                {schema === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
              </ActionIcon>
            </Tooltip>
            {utente && (
              <Menu position="bottom-end" width={240} shadow="md">
                <Menu.Target>
                  <UnstyledButton aria-label="Menu utente">
                    <Group gap={8} wrap="nowrap">
                      <Avatar color="pds" radius="xl" size={34}>
                        {iniziali(utente.nome || utente.username)}
                      </Avatar>
                      <Box visibleFrom="sm" style={{ maxWidth: 160 }}>
                        <Text fz="sm" fw={600} lh={1.2} truncate>
                          {utente.nome || utente.username}
                        </Text>
                        <Text fz="xs" c="dimmed" lh={1.2} truncate>
                          {utente.ruolo === 'admin' ? 'Amministratore' : utente.username}
                        </Text>
                      </Box>
                      <IconChevronDown size={14} />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{utente.username}</Menu.Label>
                  <Menu.Item component="a" href={href('/account')} leftSection={<IconUserCircle size={16} />}>
                    Profilo e password
                  </Menu.Item>
                  <Menu.Item component="a" href={href('/diagnostica')} leftSection={<IconPlugConnected size={16} />}>
                    Diagnostica connessione
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconLogout size={16} />}
                    onClick={() => {
                      // chi accede dopo non deve ritrovarsi sulla pagina dell'utente precedente
                      naviga('/', { sostituisci: true });
                      void useApp.getState().esci();
                    }}
                  >
                    Esci
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" aria-label="Navigazione principale">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={2}>
            {voci.map((v) => (
              <NavLink
                key={v.a}
                href={href(v.a)}
                label={v.etichetta}
                leftSection={<v.icona size={20} stroke={1.6} />}
                active={attivo(v.a)}
                rightSection={
                  'badge' in v && v.badge ? (
                    <Badge size="sm" color="red" variant="light" circle={v.badge < 10}>
                      {v.badge}
                    </Badge>
                  ) : undefined
                }
                styles={{ root: { borderRadius: 'var(--mantine-radius-md)' }, label: { fontWeight: 500 } }}
              />
            ))}
          </Stack>
        </AppShell.Section>
        <AppShell.Section pt="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <Group gap={6} px={6} wrap="nowrap">
            <Text fz="xs" c="dimmed">
              Archivio dati:
            </Text>
            <Badge size="sm" variant="light" color={backend?.tipo === 'demo' ? 'yellow' : 'pds'}>
              {backend ? ETICHETTE_BACKEND[backend.tipo] : '—'}
            </Badge>
          </Group>
          <NavLink href={href('/diagnostica')} label="Diagnostica connessione" leftSection={<IconPlugConnected size={18} stroke={1.6} />} active={percorso === '/diagnostica'} styles={{ root: { borderRadius: 'var(--mantine-radius-md)' } }} />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box maw={1480} mx="auto">
          {backend?.tipo === 'demo' && (
            <Alert color="yellow" variant="light" mb="md" py={8} className="no-stampa" title={null}>
              <Text fz="sm">
                <b>Modalità dimostrativa:</b> i dati sono di esempio e vengono salvati solo in questo browser. Per l'uso condiviso configurare il backend (vedi documentazione).
              </Text>
            </Alert>
          )}
          <Pagina parametri={trovata?.parametri ?? {}} />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
