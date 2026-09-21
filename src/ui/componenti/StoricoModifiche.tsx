import { Anchor, Button, Card, Group, Loader, Stack, Text, ThemeIcon, Timeline } from '@mantine/core';
import { IconHistory, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { FiltroRegistro } from '../../backend/tipi';
import { etichettaCapitolo } from '../../domain/calcoli';
import { formattaIstante } from '../../domain/date';
import { messaggioErrore } from '../../domain/errori';
import { etichettaCampo, formattaValoreCampo, titoloVoce } from '../../domain/registro';
import type { VoceRegistro } from '../../domain/tipi';
import { useApp } from '../../stato/store';
import { href } from '../router';

const ICONE = { creazione: IconPlus, modifica: IconPencil, eliminazione: IconTrash };
const COLORI = { creazione: 'green', modifica: 'pds', eliminazione: 'red' };

export function useRegistro(filtro: FiltroRegistro, attivo = true) {
  const backend = useApp((s) => s.backend);
  const ultimoCaricamento = useApp((s) => s.ultimoCaricamento);
  const [voci, setVoci] = useState<VoceRegistro[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const chiave = JSON.stringify(filtro);
  useEffect(() => {
    if (!backend || !attivo) return;
    let annullato = false;
    backend
      .caricaRegistro(JSON.parse(chiave) as FiltroRegistro)
      .then((v) => {
        if (!annullato) {
          setVoci(v);
          setErrore(null);
        }
      })
      .catch((e) => !annullato && setErrore(messaggioErrore(e)));
    return () => {
      annullato = true;
    };
  }, [backend, chiave, ultimoCaricamento, attivo]);
  return { voci, errore };
}

export function DettaglioVoce({ voce }: { voce: VoceRegistro }) {
  const capitoli = useApp((s) => s.dati.capitoli);
  const risolvi = useMemo(() => {
    const perId = new Map(capitoli.map((c) => [c.id, c]));
    return (campo: string, id: string) => (campo === 'capitolo_id' && perId.get(id) ? etichettaCapitolo(perId.get(id)!) : null);
  }, [capitoli]);
  const campi = Object.entries(voce.modifiche ?? {});
  if (campi.length === 0) return null;
  return (
    <Stack gap={2} mt={4}>
      {campi.map(([campo, { da, a }]) => (
        <Text key={campo} fz="xs" style={{ overflowWrap: 'anywhere' }}>
          <Text span fz="xs" c="dimmed">
            {etichettaCampo(voce.entita, campo)}:{' '}
          </Text>
          {voce.azione === 'creazione' ? (
            formattaValoreCampo(voce.entita, campo, a, risolvi)
          ) : voce.azione === 'eliminazione' ? (
            formattaValoreCampo(voce.entita, campo, da, risolvi)
          ) : campo === 'password' ? (
            'reimpostata'
          ) : (
            <>
              <Text span fz="xs" td="line-through" c="dimmed">
                {formattaValoreCampo(voce.entita, campo, da, risolvi)}
              </Text>
              {' → '}
              {formattaValoreCampo(voce.entita, campo, a, risolvi)}
            </>
          )}
        </Text>
      ))}
    </Stack>
  );
}

export function TimelineRegistro({ voci, collegaPds = false }: { voci: VoceRegistro[]; collegaPds?: boolean }) {
  const pdsEsistenti = useApp((s) => s.dati.pds);
  const esistenti = useMemo(() => new Set(pdsEsistenti.map((p) => p.id)), [pdsEsistenti]);
  return (
    <Timeline bulletSize={24} lineWidth={2}>
      {voci.map((v) => {
        const Icona = ICONE[v.azione];
        return (
          <Timeline.Item
            key={v.id}
            bullet={
              <ThemeIcon size={24} radius="xl" color={COLORI[v.azione]} variant="light">
                <Icona size={13} />
              </ThemeIcon>
            }
            title={
              collegaPds && v.pds_id && esistenti.has(v.pds_id) ? (
                <Anchor href={href(`/pds/${v.pds_id}`)} fz="sm" fw={600}>
                  {titoloVoce(v)}
                </Anchor>
              ) : (
                <Text fz="sm" fw={600}>
                  {titoloVoce(v)}
                </Text>
              )
            }
          >
            <Text fz="xs" c="dimmed">
              {formattaIstante(v.ts)} · {v.username ?? 'utente non disponibile'}
            </Text>
            <DettaglioVoce voce={v} />
          </Timeline.Item>
        );
      })}
    </Timeline>
  );
}

export function StoricoModifiche({ pdsId }: { pdsId: string }) {
  const { voci, errore } = useRegistro({ pdsId });
  const [tutte, setTutte] = useState(false);
  const visibili = voci ? (tutte ? voci : voci.slice(0, 8)) : [];
  return (
    <Card style={{ gridColumn: '1 / -1' }}>
      <Group gap="xs" mb="md" wrap="nowrap">
        <ThemeIcon variant="light" size={30} radius="md">
          <IconHistory size={18} />
        </ThemeIcon>
        <Text fw={600} component="h3" m={0} fz="md">
          Storico modifiche
        </Text>
      </Group>
      {errore ? (
        <Text c="red" fz="sm">
          {errore}
        </Text>
      ) : voci == null ? (
        <Group gap="xs">
          <Loader size="xs" />
          <Text fz="sm" c="dimmed">
            Caricamento dello storico…
          </Text>
        </Group>
      ) : voci.length === 0 ? (
        <Text fz="sm" c="dimmed">
          Nessuna modifica registrata.
        </Text>
      ) : (
        <>
          <TimelineRegistro voci={visibili} />
          {voci.length > 8 && (
            <Button variant="subtle" size="compact-sm" mt="sm" onClick={() => setTutte((t) => !t)}>
              {tutte ? 'Mostra meno' : `Mostra tutte (${voci.length})`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
