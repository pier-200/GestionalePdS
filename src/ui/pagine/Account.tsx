import { Alert, Badge, Button, Card, Group, List, PasswordInput, SegmentedControl, SimpleGrid, Stack, Text, ThemeIcon, Title, useMantineColorScheme } from '@mantine/core';
import { IconCheck, IconInfoCircle, IconX } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import type { DemoBackend } from '../../backend/demo/DemoBackend';
import { AREE_PERMESSO } from '../../domain/permessi';
import { errorePassword } from '../../domain/validazione';
import { useApp } from '../../stato/store';
import { chiediConferma, notificaErrore, notificaSuccesso, useAzione } from '../componenti/azioni';
import { IntestazionePagina } from '../componenti/base';
import { naviga } from '../router';

export function Account() {
  const utente = useApp((s) => s.sessione?.utente);
  const backend = useApp((s) => s.backend);
  const soglia = useApp((s) => s.sogliaGiorni);
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [attuale, setAttuale] = useState('');
  const [nuova, setNuova] = useState('');
  const [conferma, setConferma] = useState('');
  const { inCorso, esegui } = useAzione();

  if (!utente) return null;

  const erroreNuova = nuova ? errorePassword(nuova) : null;
  const erroreConferma = conferma && conferma !== nuova ? 'Le password non coincidono' : null;

  const cambia = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await esegui(async () => {
      await backend!.cambiaPassword(attuale, nuova);
      return true;
    }, 'Password aggiornata.');
    if (ok) {
      setAttuale('');
      setNuova('');
      setConferma('');
    }
  };

  const ripristinaDemo = async () => {
    const ok = await chiediConferma({
      titolo: 'Ripristinare i dati dimostrativi?',
      messaggio: 'Tutte le modifiche fatte in questo browser saranno cancellate e verrà eseguita la disconnessione.',
      conferma: 'Ripristina',
      pericolosa: true,
    });
    if (!ok) return;
    try {
      await (backend as DemoBackend).ripristina();
      notificaSuccesso('Dati dimostrativi ripristinati.');
      naviga('/', { sostituisci: true });
      await useApp.getState().esci();
    } catch (e) {
      notificaErrore(e);
    }
  };

  return (
    <>
      <IntestazionePagina titolo="Profilo e password" sottotitolo={`${utente.nome} · ${utente.username}`} />
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <Card>
          <Title order={3} fz="md" mb="sm">
            I tuoi permessi
          </Title>
          <Group gap="xs" mb="sm">
            <Badge variant="light" color={utente.ruolo === 'admin' ? 'violet' : 'gray'}>
              {utente.ruolo === 'admin' ? 'Amministratore' : 'Utente'}
            </Badge>
            {utente.ruolo !== 'admin' && (
              <Text fz="xs" c="dimmed">
                Ambito PdS: {utente.permessi.ambito_capitoli == null ? 'tutti i capitoli' : `capitoli ${utente.permessi.ambito_capitoli.join(', ') || '(nessuno)'}`}
              </Text>
            )}
          </Group>
          <List spacing={6} center>
            {AREE_PERMESSO.map((a) => {
              const concesso = utente.ruolo === 'admin' || utente.permessi[a.area];
              return (
                <List.Item
                  key={a.area}
                  icon={
                    <ThemeIcon size={20} radius="xl" color={concesso ? 'green' : 'gray'} variant="light">
                      {concesso ? <IconCheck size={13} /> : <IconX size={13} />}
                    </ThemeIcon>
                  }
                >
                  <Text fz="sm" c={concesso ? undefined : 'dimmed'}>
                    {a.etichetta}
                  </Text>
                </List.Item>
              );
            })}
          </List>
          <Text fz="xs" c="dimmed" mt="sm">
            La consultazione dei dati è sempre consentita. Per modificare i permessi rivolgersi all'amministratore.
          </Text>
        </Card>

        <Card>
          <Title order={3} fz="md" mb="sm">
            Cambia password
          </Title>
          <form onSubmit={cambia}>
            <Stack gap="sm">
              <PasswordInput label="Password attuale" value={attuale} onChange={(e) => setAttuale(e.currentTarget.value)} autoComplete="current-password" required />
              <PasswordInput
                label="Nuova password"
                description="Almeno 10 caratteri, con lettere e cifre"
                value={nuova}
                onChange={(e) => setNuova(e.currentTarget.value)}
                error={erroreNuova}
                autoComplete="new-password"
                required
              />
              <PasswordInput label="Conferma nuova password" value={conferma} onChange={(e) => setConferma(e.currentTarget.value)} error={erroreConferma} autoComplete="new-password" required />
              <Group justify="flex-end">
                <Button type="submit" loading={inCorso} disabled={!attuale || !nuova || Boolean(erroreNuova) || conferma !== nuova}>
                  Aggiorna password
                </Button>
              </Group>
            </Stack>
          </form>
        </Card>

        <Card>
          <Title order={3} fz="md" mb="sm">
            Preferenze di visualizzazione
          </Title>
          <Stack gap="sm">
            <div>
              <Text fz="sm" fw={500} mb={4}>
                Tema
              </Text>
              <SegmentedControl
                value={colorScheme}
                onChange={(v) => setColorScheme(v as 'light' | 'dark' | 'auto')}
                data={[
                  { value: 'light', label: 'Chiaro' },
                  { value: 'dark', label: 'Scuro' },
                  { value: 'auto', label: 'Come il sistema' },
                ]}
              />
            </div>
            <Text fz="sm">
              Soglia per gli avvisi di scadenza: <b>{soglia} giorni</b> (modificabile dalla pagina «Scadenze e avvisi»).
            </Text>
            <Text fz="xs" c="dimmed">
              Le preferenze sono salvate solo su questo dispositivo.
            </Text>
          </Stack>
        </Card>

        {backend?.tipo === 'demo' && (
          <Card>
            <Title order={3} fz="md" mb="sm">
              Modalità dimostrativa
            </Title>
            <Alert color="yellow" variant="light" icon={<IconInfoCircle size={18} />} mb="sm">
              I dati sono salvati solo in questo browser e non sono condivisi con altri utenti.
            </Alert>
            <Button variant="light" color="red" onClick={ripristinaDemo}>
              Ripristina i dati dimostrativi
            </Button>
          </Card>
        )}
      </SimpleGrid>
    </>
  );
}
