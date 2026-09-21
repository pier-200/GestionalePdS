import { Alert, Anchor, Button, Card, Checkbox, Code, Group, PasswordInput, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconAlertCircle, IconInfoCircle, IconLock, IconPlugConnected, IconUser } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import type { DemoBackend } from '../../backend/demo/DemoBackend';
import { PASSWORD_DEMO, UTENTI_DEMO } from '../../backend/demo/datiDimostrativi';
import { ErroreApp, messaggioErrore } from '../../domain/errori';
import { useApp } from '../../stato/store';
import { notificaErrore, notificaSuccesso } from '../componenti/azioni';
import { MarchioPds, PaginaPubblica } from '../layout/PaginaPubblica';
import { href } from '../router';

export function Accesso() {
  const backend = useApp((s) => s.backend);
  const nomeUfficio = useApp((s) => s.config?.nomeUfficio);
  const avviso = useApp((s) => s.avvisoAccesso);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [ricordami, setRicordami] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [tokenScaduto, setTokenScaduto] = useState(false);
  const [nuovoToken, setNuovoToken] = useState('');

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    setErrore(null);
    setInCorso(true);
    try {
      if (tokenScaduto) await useApp.getState().accediConNuovoToken(username, password, nuovoToken, ricordami);
      else await useApp.getState().accedi(username, password, ricordami);
    } catch (err) {
      if (err instanceof ErroreApp && err.codice === 'TOKEN_SCADUTO') setTokenScaduto(true);
      setErrore(messaggioErrore(err));
      setInCorso(false);
    }
  };

  const ripristinaDemo = async () => {
    try {
      await (backend as DemoBackend).ripristina();
      notificaSuccesso('Dati dimostrativi ripristinati.');
    } catch (err) {
      notificaErrore(err);
    }
  };

  return (
    <PaginaPubblica
      marchio={false}
      piede={
        <Group gap={6} justify="center" wrap="wrap">
          <span>Archivio dati: {backend?.nome ?? '—'}</span>
          <span aria-hidden>·</span>
          <Anchor href={href('/diagnostica')} fz="xs" c="white">
            <Group gap={4} component="span">
              <IconPlugConnected size={13} /> Verifica connessione
            </Group>
          </Anchor>
        </Group>
      }
    >
      <Card padding={32} radius="xl" className="scheda-accesso">
        <form onSubmit={invia} noValidate>
          <Stack gap="md">
            <MarchioPds size={32} />
            <div>
              <Title order={1} fz={26} fw={700} lh={1.2}>
                Gestionale PdS
              </Title>
              <Text c="dimmed" fz="sm">
                {nomeUfficio || 'Accedi con le credenziali fornite dall’amministratore'}
              </Text>
            </div>
            {avviso && (
              <Alert color="yellow" icon={<IconInfoCircle size={18} />} py="xs">
                {avviso}
              </Alert>
            )}
            {errore && (
              <Alert color="red" icon={<IconAlertCircle size={18} />} py="xs" role="alert">
                {errore}
              </Alert>
            )}
            <TextInput
              label="Nome utente"
              placeholder="Il tuo nome utente"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              leftSection={<IconUser size={16} />}
              required
              data-autofocus
              autoFocus
            />
            <PasswordInput
              label="Password"
              placeholder="La tua password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete="current-password"
              leftSection={<IconLock size={16} />}
              required
            />
            {tokenScaduto && (
              <PasswordInput
                label="Nuovo token di accesso GitHub"
                description="Crearlo su GitHub (Settings → Developer settings → Fine-grained tokens) con accesso Contents in lettura e scrittura ai due repository."
                value={nuovoToken}
                onChange={(e) => setNuovoToken(e.currentTarget.value)}
                autoComplete="off"
                required
              />
            )}
            <Checkbox
              label="Resta connesso su questo dispositivo"
              description="Sconsigliato su computer condivisi."
              checked={ricordami}
              onChange={(e) => setRicordami(e.currentTarget.checked)}
            />
            <Button
              type="submit"
              loading={inCorso}
              disabled={!username || !password || (tokenScaduto && nuovoToken.trim().length < 20)}
              leftSection={inCorso ? undefined : <IconLock size={16} />}
              fullWidth
              size="md"
            >
              {tokenScaduto ? 'Rinnova il token e accedi' : 'Accedi'}
            </Button>
          </Stack>
        </form>
      </Card>

      {backend?.tipo === 'demo' && (
        <Card mt="md" padding="lg" radius="lg">
          <Stack gap="xs">
            <Text fw={600} fz="sm">
              Modalità dimostrativa
            </Text>
            <Text fz="sm" c="dimmed">
              Dati di esempio salvati solo in questo browser. Password per tutti gli utenti: <Code>{PASSWORD_DEMO}</Code>
            </Text>
            <Table verticalSpacing={4} fz="sm">
              <Table.Tbody>
                {UTENTI_DEMO.map((u) => (
                  <Table.Tr key={u.username}>
                    <Table.Td>
                      <Anchor
                        component="button"
                        type="button"
                        fz="sm"
                        onClick={() => {
                          setUsername(u.username);
                          setPassword(PASSWORD_DEMO);
                        }}
                      >
                        {u.username}
                      </Anchor>
                    </Table.Td>
                    <Table.Td c="dimmed">{u.descrizione}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Group justify="flex-end">
              <Button variant="subtle" size="xs" color="gray" onClick={ripristinaDemo}>
                Ripristina dati dimostrativi
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
    </PaginaPubblica>
  );
}
