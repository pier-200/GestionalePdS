import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Menu,
  Modal,
  PasswordInput,
  Radio,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconDots, IconInfoCircle, IconKey, IconPencil, IconPlus, IconShieldLock, IconTrash, IconUserCheck, IconUserOff } from '@tabler/icons-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { GitHubBackend } from '../../backend/github/GitHubBackend';
import type { DatiUtente } from '../../domain/comandi';
import { formattaIstante } from '../../domain/date';
import { AREE_PERMESSO, descriviPermessi } from '../../domain/permessi';
import { PERMESSI_NESSUNO, type Permessi, type Ruolo, type Utente } from '../../domain/tipi';
import { errorePassword, erroreUsername, normalizzaUsername } from '../../domain/validazione';
import { useApp } from '../../stato/store';
import { chiediConferma, useAzione } from '../componenti/azioni';
import { IntestazionePagina } from '../componenti/base';
import { Tabella, type Colonna } from '../componenti/Tabella';

function ModaleUtente({ utente, onClose }: { utente: Utente | null; onClose: () => void }) {
  const backend = useApp((s) => s.backend);
  const capitoli = useApp((s) => s.dati.capitoli);
  const io = useApp((s) => s.sessione?.utente);
  const codici = useMemo(() => [...new Set(capitoli.map((c) => c.codice))].sort((a, b) => a.localeCompare(b, 'it', { numeric: true })), [capitoli]);
  const [username, setUsername] = useState(utente?.username ?? '');
  const [nome, setNome] = useState(utente?.nome ?? '');
  const [password, setPassword] = useState('');
  const [ruolo, setRuolo] = useState<Ruolo>(utente?.ruolo ?? 'utente');
  const [attivo, setAttivo] = useState(utente?.attivo ?? true);
  const [permessi, setPermessi] = useState<Permessi>(utente?.permessi ?? { ...PERMESSI_NESSUNO });
  const { inCorso, esegui } = useAzione();

  // Nel backend GitHub la riattivazione ricrea le credenziali: serve una nuova password.
  const richiedePassword = !utente || (backend?.tipo === 'github' && !utente.attivo && attivo);
  const u = normalizzaUsername(username);
  const erroreU = !utente && username ? erroreUsername(u) : null;
  const erroreP = password ? errorePassword(password) : null;
  const valido = nome.trim() && (utente || (u && !erroreU)) && (!richiedePassword || (password && !erroreP));

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    const ok = await esegui(async () => {
      const stato = useApp.getState();
      if (!utente) {
        const dati: DatiUtente = { username: u, nome: nome.trim(), ruolo, attivo, permessi };
        await stato.esegui({ tipo: 'utente.crea', dati, password });
      } else {
        await stato.esegui({ tipo: 'utente.modifica', id: utente.id, modifiche: { nome: nome.trim(), ruolo, attivo, permessi } });
        if (richiedePassword && password) await stato.esegui({ tipo: 'utente.password', id: utente.id, password });
      }
      return true;
    }, utente ? 'Utente aggiornato.' : `Utente ${u} creato.`);
    if (ok) onClose();
  };

  const impostaArea = (area: keyof Permessi, valore: boolean) => setPermessi((p) => ({ ...p, [area]: valore }));

  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>{utente ? `Modifica utente ${utente.username}` : 'Nuovo utente'}</Text>} size="lg">
      <form onSubmit={invia}>
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput label="Nome e cognome" value={nome} onChange={(e) => setNome(e.currentTarget.value)} required maxLength={100} data-autofocus />
            <TextInput
              label="Nome utente"
              description={utente ? 'Non modificabile' : 'Minuscole, cifre, punto e trattini'}
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              error={erroreU}
              disabled={Boolean(utente)}
              autoCapitalize="none"
              autoComplete="off"
              required
            />
          </SimpleGrid>
          {richiedePassword && (
            <PasswordInput
              label={utente ? 'Nuova password (necessaria per la riattivazione)' : 'Password iniziale'}
              description="Almeno 10 caratteri, con lettere e cifre. Comunicarla all'utente in modo riservato."
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              error={erroreP}
              autoComplete="new-password"
              required
            />
          )}
          <Group gap="xl" align="flex-end">
            <Stack gap={4}>
              <Text fz="sm" fw={500}>
                Ruolo
              </Text>
              <SegmentedControl
                value={ruolo}
                onChange={(v) => setRuolo(v as Ruolo)}
                data={[
                  { value: 'utente', label: 'Utente' },
                  { value: 'admin', label: 'Amministratore' },
                ]}
              />
            </Stack>
            <Switch label="Utente attivo" checked={attivo} onChange={(e) => setAttivo(e.currentTarget.checked)} disabled={utente?.id === io?.id} />
          </Group>

          <Divider label="Permessi di modifica" labelPosition="left" mt="xs" />
          {ruolo === 'admin' ? (
            <Alert color="pds" variant="light" icon={<IconShieldLock size={18} />}>
              L'amministratore può modificare tutti i dati e gestire utenti e permessi.
            </Alert>
          ) : (
            <Stack gap="xs">
              <Text fz="xs" c="dimmed">
                Tutti gli utenti attivi possono consultare i dati condivisi. Le modifiche sono consentite solo nelle aree abilitate.
              </Text>
              {AREE_PERMESSO.map((a) => (
                <Switch
                  key={a.area}
                  label={a.etichetta}
                  description={a.descrizione}
                  checked={permessi[a.area]}
                  onChange={(e) => impostaArea(a.area, e.currentTarget.checked)}
                />
              ))}
              <Radio.Group
                label="Ambito dei permessi sui PdS"
                value={permessi.ambito_capitoli == null ? 'tutti' : 'selezionati'}
                onChange={(v) => setPermessi((p) => ({ ...p, ambito_capitoli: v === 'tutti' ? null : (p.ambito_capitoli ?? []) }))}
                mt="xs"
              >
                <Group gap="lg" mt={6}>
                  <Radio value="tutti" label="Tutti i capitoli" />
                  <Radio value="selezionati" label="Solo i capitoli indicati" />
                </Group>
              </Radio.Group>
              {permessi.ambito_capitoli != null && (
                <TagsInput
                  label="Codici dei capitoli"
                  description="Validi per tutti gli esercizi finanziari. Premere Invio dopo ogni codice."
                  data={codici}
                  value={permessi.ambito_capitoli}
                  onChange={(v) => setPermessi((p) => ({ ...p, ambito_capitoli: v }))}
                  clearable
                  comboboxProps={{ withinPortal: true }}
                />
              )}
            </Stack>
          )}
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={inCorso} disabled={!valido}>
              {utente ? 'Salva' : 'Crea utente'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function ModalePassword({ utente, onClose }: { utente: Utente; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const { inCorso, esegui } = useAzione();
  const errore = password ? errorePassword(password) : null;
  const invia = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await esegui(() => useApp.getState().esegui({ tipo: 'utente.password', id: utente.id, password }), `Password di ${utente.username} reimpostata.`);
    if (ok) onClose();
  };
  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>Reimposta password – {utente.username}</Text>}>
      <form onSubmit={invia}>
        <Stack gap="sm">
          <PasswordInput
            label="Nuova password"
            description="Almeno 10 caratteri, con lettere e cifre. Comunicarla all'utente in modo riservato."
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            error={errore}
            autoComplete="new-password"
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={inCorso} disabled={!password || Boolean(errore)}>
              Reimposta
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function ModaleToken({ onClose }: { onClose: () => void }) {
  const backend = useApp((s) => s.backend) as GitHubBackend | null;
  const [token, setToken] = useState('');
  const { inCorso, esegui } = useAzione();
  const invia = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await esegui(async () => {
      await backend!.ruotaToken(token.trim());
      return true;
    }, 'Token aggiornato e chiavi di accesso rigenerate.');
    if (ok) onClose();
  };
  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>Aggiorna il token di accesso GitHub</Text>} size="lg">
      <form onSubmit={invia}>
        <Stack gap="sm">
          <Text fz="sm">
            Il nuovo token viene cifrato con nuove chiavi per tutti gli utenti attivi: le password non cambiano. Dopo l'aggiornamento revocare il token precedente dalle impostazioni di GitHub, così un utente eliminato o disattivato non potrà più accedere ai dati neanche conservando una copia delle vecchie chiavi.
          </Text>
          <PasswordInput label="Nuovo token (github_pat_…)" value={token} onChange={(e) => setToken(e.currentTarget.value)} autoComplete="off" data-autofocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={inCorso} disabled={token.trim().length < 20}>
              Aggiorna token
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function Utenti() {
  const utenti = useApp((s) => s.dati.utenti);
  const io = useApp((s) => s.sessione?.utente);
  const backend = useApp((s) => s.backend);
  const [modale, setModale] = useState<Utente | 'nuovo' | null>(null);
  const [password, setPassword] = useState<Utente | null>(null);
  const [tokenAperto, setTokenAperto] = useState(false);
  const { esegui } = useAzione();

  const cambiaAttivo = async (u: Utente) => {
    if (u.attivo) {
      const ok = await chiediConferma({
        titolo: `Disattivare ${u.username}?`,
        messaggio: "L'utente non potrà più accedere finché non verrà riattivato. I dati inseriti e lo storico restano invariati.",
        conferma: 'Disattiva',
        pericolosa: true,
      });
      if (ok) await esegui(() => useApp.getState().esegui({ tipo: 'utente.modifica', id: u.id, modifiche: { attivo: false } }), `Utente ${u.username} disattivato.`);
    } else if (backend?.tipo === 'github') {
      setModale(u);
    } else {
      await esegui(() => useApp.getState().esegui({ tipo: 'utente.modifica', id: u.id, modifiche: { attivo: true } }), `Utente ${u.username} riattivato.`);
    }
  };

  const elimina = async (u: Utente) => {
    const ok = await chiediConferma({
      titolo: `Eliminare l'utente ${u.username}?`,
      messaggio: 'Le credenziali saranno rimosse definitivamente. Lo storico delle modifiche conserverà il nome utente. Per sospendere temporaneamente l\'accesso è preferibile disattivarlo.',
      conferma: 'Elimina',
      pericolosa: true,
    });
    if (ok) await esegui(() => useApp.getState().esegui({ tipo: 'utente.elimina', id: u.id }), `Utente ${u.username} eliminato.`);
  };

  const colonne: Colonna<Utente>[] = [
    {
      chiave: 'nome',
      titolo: 'Utente',
      ordina: (u) => u.nome,
      render: (u) => (
        <div>
          <Text fz="sm" fw={600}>
            {u.nome}
            {u.id === io?.id && (
              <Text span fz="xs" c="dimmed" fw={400}>
                {' '}
                (tu)
              </Text>
            )}
          </Text>
          <Text fz="xs" c="dimmed">
            {u.username}
          </Text>
        </div>
      ),
    },
    {
      chiave: 'ruolo',
      titolo: 'Ruolo',
      ordina: (u) => u.ruolo,
      render: (u) => (
        <Badge variant="light" color={u.ruolo === 'admin' ? 'violet' : 'gray'}>
          {u.ruolo === 'admin' ? 'Amministratore' : 'Utente'}
        </Badge>
      ),
    },
    {
      chiave: 'attivo',
      titolo: 'Stato',
      ordina: (u) => (u.attivo ? 0 : 1),
      render: (u) => (
        <Badge variant="dot" color={u.attivo ? 'green' : 'red'}>
          {u.attivo ? 'Attivo' : 'Disattivato'}
        </Badge>
      ),
    },
    { chiave: 'permessi', titolo: 'Permessi di modifica', render: (u) => <Text fz="sm">{descriviPermessi(u)}</Text> },
    { chiave: 'aggiornato', titolo: 'Ultima modifica', ordina: (u) => u.updated_at, render: (u) => <Text fz="xs" c="dimmed" className="num">{formattaIstante(u.updated_at)}</Text> },
    {
      chiave: 'azioni',
      titolo: '',
      allinea: 'right',
      render: (u) => (
        <Group gap={2} justify="flex-end" wrap="nowrap">
          <Tooltip label="Modifica">
            <ActionIcon variant="subtle" color="gray" onClick={() => setModale(u)} aria-label={`Modifica ${u.username}`}>
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label={`Altre azioni per ${u.username}`}>
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconKey size={16} />} onClick={() => setPassword(u)} disabled={!u.attivo && backend?.tipo === 'github'}>
                Reimposta password
              </Menu.Item>
              {u.id !== io?.id && (
                <Menu.Item leftSection={u.attivo ? <IconUserOff size={16} /> : <IconUserCheck size={16} />} onClick={() => cambiaAttivo(u)}>
                  {u.attivo ? 'Disattiva' : 'Riattiva'}
                </Menu.Item>
              )}
              {u.id !== io?.id && (
                <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => elimina(u)}>
                  Elimina
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      ),
    },
  ];

  return (
    <>
      <IntestazionePagina
        titolo="Utenti e permessi"
        sottotitolo="Gestione degli accessi e dei permessi di modifica. Tutti gli utenti attivi possono consultare i dati."
        azioni={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setModale('nuovo')}>
            Nuovo utente
          </Button>
        }
      />
      {backend && !backend.capacita.permessiLatoServer && (
        <Alert color="yellow" variant="light" icon={<IconInfoCircle size={18} />} mb="md" title="Come sono applicati i permessi">
          {backend.tipo === 'github' ? (
            <>
              Con l'archivio su GitHub i permessi sono applicati dall'applicazione, mentre GitHub consente l'accesso a chiunque disponga del token cifrato nel portachiavi. È adeguato per un gruppo di colleghi fidati; per un controllo lato server usare Supabase. Quando un utente lascia l'ufficio, dopo averlo eliminato{' '}
              <Anchor component="button" type="button" fz="sm" onClick={() => setTokenAperto(true)}>
                aggiorna il token
              </Anchor>
              .
            </>
          ) : (
            "In modalità dimostrativa utenti e permessi sono simulati nel browser."
          )}
        </Alert>
      )}
      <Card padding={0}>
        <Tabella
          etichetta="Utenti"
          righe={utenti}
          colonne={colonne}
          chiaveRiga={(u) => u.id}
          ordinamentoIniziale={{ chiave: 'nome', direzione: 'asc' }}
          larghezzaMinima={900}
          paginazione={false}
          scheda={(u) => (
            <Stack gap={4}>
              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text fw={600}>{u.nome}</Text>
                  <Text fz="xs" c="dimmed">
                    {u.username} · {u.ruolo === 'admin' ? 'Amministratore' : 'Utente'} · {u.attivo ? 'attivo' : 'disattivato'}
                  </Text>
                </div>
                {colonne[colonne.length - 1].render(u)}
              </Group>
              <Text fz="sm">{descriviPermessi(u)}</Text>
            </Stack>
          )}
        />
      </Card>
      {modale && <ModaleUtente utente={modale === 'nuovo' ? null : modale} onClose={() => setModale(null)} />}
      {password && <ModalePassword utente={password} onClose={() => setPassword(null)} />}
      {tokenAperto && <ModaleToken onClose={() => setTokenAperto(false)} />}
      {backend?.tipo === 'github' && (
        <Group justify="flex-end" mt="md">
          <Button variant="default" leftSection={<IconKey size={16} />} onClick={() => setTokenAperto(true)}>
            Aggiorna token GitHub
          </Button>
        </Group>
      )}
    </>
  );
}
