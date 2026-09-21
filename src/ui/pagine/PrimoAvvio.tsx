import { Alert, Anchor, Button, Card, List, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { messaggioErrore } from '../../domain/errori';
import { errorePassword, erroreUsername, normalizzaUsername } from '../../domain/validazione';
import { useApp } from '../../stato/store';
import { PaginaPubblica } from '../layout/PaginaPubblica';
import { href } from '../router';

/**
 * Configurazione al primo utilizzo:
 * - GitHub: si inserisce il token di accesso ai repository e si crea l'amministratore;
 * - Supabase: un utente creato dalla console di Supabase diventa amministratore.
 */
export function PrimoAvvio() {
  const backend = useApp((s) => s.backend);
  const config = useApp((s) => s.config);
  const messaggio = useApp((s) => s.messaggioPrimoAvvio);
  const github = backend?.tipo === 'github';
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [nome, setNome] = useState('');
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const u = normalizzaUsername(username);
  const erroreU = username ? erroreUsername(u) : null;
  const erroreP = github && password ? errorePassword(password) : null;
  const erroreC = github && conferma && conferma !== password ? 'Le password non coincidono' : null;
  const valido = Boolean(u && !erroreU && nome.trim() && password && !erroreP && (!github || (token.trim() && conferma === password)));

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    setErrore(null);
    setInCorso(true);
    try {
      await useApp.getState().completaPrimoAvvio({ username: u, nome: nome.trim(), password, token: github ? token.trim() : undefined });
    } catch (err) {
      setErrore(messaggioErrore(err));
      setInCorso(false);
    }
  };

  const cfg = config?.backend;

  return (
    <PaginaPubblica larga>
      <Card padding="xl" radius="lg" shadow="sm" maw={620} mx="auto">
        <form onSubmit={invia} noValidate>
          <Stack gap="md">
            <div>
              <Title order={1} fz={22} fw={650}>
                Configurazione iniziale
              </Title>
              <Text c="dimmed" fz="sm">
                {messaggio}
              </Text>
            </div>
            {github && cfg?.tipo === 'github' && (
              <Alert color="pds" variant="light" icon={<IconInfoCircle size={18} />}>
                <Text fz="sm" mb={6}>
                  Prima di procedere verificare di aver creato:
                </Text>
                <List fz="sm" spacing={2}>
                  <List.Item>
                    il repository <b>privato</b> dei dati <b>{cfg.owner}/{cfg.repoDati}</b>;
                  </List.Item>
                  <List.Item>
                    il repository degli accessi <b>{cfg.owner}/{cfg.repoAccessi}</b>;
                  </List.Item>
                  <List.Item>un token "fine-grained" con permesso Contents in lettura e scrittura su entrambi.</List.Item>
                </List>
                <Text fz="xs" mt={6} c="dimmed">
                  Il token viene cifrato con la password di ciascun utente e non è mai salvato in chiaro.
                </Text>
              </Alert>
            )}
            {!github && (
              <Alert color="pds" variant="light" icon={<IconInfoCircle size={18} />}>
                <Text fz="sm">
                  Accedi con l'utente creato nella console di Supabase (Authentication → Users): il nome utente è la parte dell'indirizzo prima della "@". Questo utente diventerà l'amministratore del gestionale.
                </Text>
              </Alert>
            )}
            {errore && (
              <Alert color="red" icon={<IconAlertCircle size={18} />} role="alert">
                {errore}
              </Alert>
            )}
            {github && (
              <PasswordInput
                label="Token di accesso GitHub"
                description="Inizia con github_pat_…"
                value={token}
                onChange={(e) => setToken(e.currentTarget.value)}
                autoComplete="off"
                required
              />
            )}
            <TextInput
              label="Nome utente dell'amministratore"
              description="Lettere minuscole, cifre, punto, trattino (es. mario.rossi)"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              error={erroreU}
              autoCapitalize="none"
              autoComplete="username"
              required
            />
            <TextInput label="Nome e cognome" value={nome} onChange={(e) => setNome(e.currentTarget.value)} required autoComplete="name" />
            <PasswordInput
              label="Password"
              description={github ? 'Almeno 10 caratteri, con lettere e cifre' : "Password dell'utente creato in Supabase"}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              error={erroreP}
              autoComplete={github ? 'new-password' : 'current-password'}
              required
            />
            {github && (
              <PasswordInput label="Conferma password" value={conferma} onChange={(e) => setConferma(e.currentTarget.value)} error={erroreC} autoComplete="new-password" required />
            )}
            <Button type="submit" loading={inCorso} disabled={!valido}>
              {github ? 'Configura e accedi' : 'Diventa amministratore'}
            </Button>
            <Anchor href={href('/diagnostica')} fz="xs" ta="center">
              Verifica la connessione ai servizi
            </Anchor>
          </Stack>
        </form>
      </Card>
    </PaginaPubblica>
  );
}
