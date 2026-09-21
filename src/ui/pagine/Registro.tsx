import { Alert, Button, Card, Group, Loader, Select, Text } from '@mantine/core';
import { IconFilterOff, IconInfoCircle } from '@tabler/icons-react';
import { useState } from 'react';
import type { FiltroRegistro } from '../../backend/tipi';
import { ETICHETTE_ENTITA } from '../../domain/registro';
import type { DataISO, EntitaRegistro } from '../../domain/tipi';
import { useApp } from '../../stato/store';
import { IntestazionePagina, StatoVuoto } from '../componenti/base';
import { CampoData } from '../componenti/campi';
import { TimelineRegistro, useRegistro } from '../componenti/StoricoModifiche';

const LIMITE = 300;

/** Registro delle modifiche: la pagina è riservata all'amministratore (vedi ROTTE). */
export function Registro() {
  const utenti = useApp((s) => s.dati.utenti);
  const [entita, setEntita] = useState<EntitaRegistro | null>(null);
  const [utenteId, setUtenteId] = useState<string | null>(null);
  const [dal, setDal] = useState<DataISO | null>(null);
  const [al, setAl] = useState<DataISO | null>(null);

  const filtro: FiltroRegistro = { entita: entita ?? undefined, utenteId: utenteId ?? undefined, dal: dal ?? undefined, al: al ?? undefined, limite: LIMITE };
  const { voci, errore } = useRegistro(filtro);
  const visibili = voci ?? [];
  const entitaDisponibili = Object.keys(ETICHETTE_ENTITA) as EntitaRegistro[];
  const filtriAttivi = Boolean(entita || utenteId || dal || al);

  return (
    <>
      <IntestazionePagina
        titolo="Registro modifiche"
        sottotitolo="Chi ha inserito, modificato o eliminato i dati, e quando. Sezione visibile solo all’amministratore."
      />
      <Card padding="sm" mb="md">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select
            label="Oggetto"
            placeholder="Tutti"
            data={entitaDisponibili.map((e) => ({ value: e, label: ETICHETTE_ENTITA[e] }))}
            value={entita}
            onChange={(v) => setEntita(v as EntitaRegistro | null)}
            clearable
            w={190}
          />
          <Select
            label="Utente"
            placeholder="Tutti"
            data={utenti.map((u) => ({ value: u.id, label: `${u.nome} (${u.username})` }))}
            value={utenteId}
            onChange={setUtenteId}
            clearable
            searchable
            w={240}
          />
          <CampoData label="Dal" value={dal} onChange={setDal} w={160} />
          <CampoData label="Al" value={al} onChange={setAl} w={160} />
          {filtriAttivi && (
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconFilterOff size={16} />}
              onClick={() => {
                setEntita(null);
                setUtenteId(null);
                setDal(null);
                setAl(null);
              }}
            >
              Azzera filtri
            </Button>
          )}
        </Group>
      </Card>
      <Card>
        {errore ? (
          <Alert color="red">{errore}</Alert>
        ) : voci == null ? (
          <Group gap="xs">
            <Loader size="sm" />
            <Text fz="sm" c="dimmed">
              Caricamento del registro…
            </Text>
          </Group>
        ) : visibili.length === 0 ? (
          <StatoVuoto titolo="Nessuna voce" descrizione={filtriAttivi ? 'Nessuna modifica corrisponde ai filtri.' : 'Non sono ancora state registrate modifiche.'} />
        ) : (
          <>
            {voci.length >= LIMITE && (
              <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />} mb="md">
                Sono mostrate le {LIMITE} modifiche più recenti: usare i filtri per restringere la ricerca.
              </Alert>
            )}
            <TimelineRegistro voci={visibili} collegaPds />
          </>
        )}
      </Card>
    </>
  );
}
