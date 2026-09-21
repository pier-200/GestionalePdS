import { Anchor, Badge, Card, Group, NumberInput, SegmentedControl, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconClockExclamation } from '@tabler/icons-react';
import { useMemo, type ReactNode } from 'react';
import type { PdsVista } from '../../domain/calcoli';
import { formattaPercentuale } from '../../domain/importi';
import { stipulaAvvenuta } from '../../domain/stato';
import { useDerivati } from '../../stato/derivati';
import { useApp } from '../../stato/store';
import { BadgeStato, DataConScadenza, Importo, IntestazionePagina } from '../componenti/base';
import { Tabella, type Colonna } from '../componenti/Tabella';
import { href, naviga } from '../router';
import { SchedaPds } from './ElencoPds';

const colonne: Colonna<PdsVista>[] = [
  { chiave: 'scadenza', titolo: 'Scadenza', ordina: (v) => v.scadenza, render: (v) => <DataConScadenza data={v.scadenza} livello={v.avviso} giorni={v.giorniAllaScadenza} /> },
  {
    chiave: 'numero',
    titolo: 'N. PdS',
    ordina: (v) => `${v.esercizio ?? 0}|${v.pds.numero.padStart(8, '0')}`,
    render: (v) => (
      <Anchor href={href(`/pds/${v.pds.id}`)} fw={600} fz="sm" style={{ whiteSpace: 'nowrap' }}>
        {v.numeroCompleto}
      </Anchor>
    ),
  },
  { chiave: 'stato', titolo: 'Stato', render: (v) => <BadgeStato stato={v.stato} /> },
  {
    chiave: 'capitolo',
    titolo: 'Capitolo',
    ordina: (v) => v.capitolo?.codice,
    render: (v) => <Text fz="sm">{v.capitolo ? v.capitolo.codice : '—'}</Text>,
  },
  { chiave: 'ditta', titolo: 'Ditta', ordina: (v) => v.pds.ditta, render: (v) => <Text fz="sm">{v.pds.ditta ?? '—'}</Text> },
  { chiave: 'dec', titolo: 'Collaboratore/DEC', ordina: (v) => v.pds.dec, render: (v) => <Text fz="sm">{v.pds.dec ?? '—'}</Text> },
  { chiave: 'stipulato', titolo: 'Stipulato', allinea: 'right', ordina: (v) => v.pds.valore_stipula, render: (v) => <Importo valore={stipulaAvvenuta(v.pds) ? v.pds.valore_stipula : null} /> },
  {
    chiave: 'pagato',
    titolo: 'Pagato',
    allinea: 'right',
    ordina: (v) => v.totalePagato,
    render: (v) => (
      <div>
        <Importo valore={v.totalePagato} />
        {v.quotaPagata != null && (
          <Text fz="xs" c="dimmed" className="num">
            {formattaPercentuale(v.quotaPagata)}
          </Text>
        )}
      </div>
    ),
  },
];

function Sezione({ titolo, descrizione, icona, colore, righe, vuoto }: { titolo: string; descrizione: string; icona: ReactNode; colore: string; righe: PdsVista[]; vuoto: string }) {
  return (
    <Card padding={0}>
      <Group justify="space-between" p="md" pb="sm" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon color={colore} variant="light" size={34} radius="md">
            {icona}
          </ThemeIcon>
          <div>
            <Title order={3} fz="md">
              {titolo}
            </Title>
            <Text fz="xs" c="dimmed">
              {descrizione}
            </Text>
          </div>
        </Group>
        <Badge size="lg" color={colore} variant={righe.length ? 'filled' : 'light'} className="num">
          {righe.length}
        </Badge>
      </Group>
      {righe.length === 0 ? (
        <Group gap="sm" px="md" pb="md">
          <IconCircleCheck size={18} color="var(--pds-buono)" aria-hidden />
          <Text fz="sm">{vuoto}</Text>
        </Group>
      ) : (
        <Tabella
          etichetta={titolo}
          righe={righe}
          colonne={colonne}
          chiaveRiga={(v) => v.pds.id}
          ordinamentoIniziale={{ chiave: 'scadenza', direzione: 'asc' }}
          onClickRiga={(v) => naviga(`/pds/${v.pds.id}`)}
          classeRiga={(v) => (v.avviso === 'scaduto' ? 'riga-scaduto' : 'riga-in-scadenza')}
          classeScheda={(v) => (v.avviso === 'scaduto' ? 'card-scaduto' : 'card-in-scadenza')}
          scheda={(v) => <SchedaPds v={v} />}
          larghezzaMinima={860}
        />
      )}
    </Card>
  );
}

const SOGLIE = ['15', '30', '60', '90'];

export function Scadenze() {
  const { viste } = useDerivati();
  const soglia = useApp((s) => s.sogliaGiorni);
  const scaduti = useMemo(() => viste.filter((v) => v.avviso === 'scaduto'), [viste]);
  const inScadenza = useMemo(() => viste.filter((v) => v.avviso === 'in_scadenza'), [viste]);

  return (
    <>
      <IntestazionePagina
        titolo="Scadenze e avvisi"
        sottotitolo="PdS non saldati con termine di esecuzione superato o in avvicinamento."
        azioni={
          <Group gap="xs" align="flex-end">
            <Stack gap={2}>
              <Text fz="xs" c="dimmed">
                Avvisa nei prossimi (giorni)
              </Text>
              <Group gap="xs" wrap="nowrap">
                <SegmentedControl
                  data={SOGLIE}
                  value={SOGLIE.includes(String(soglia)) ? String(soglia) : ''}
                  onChange={(v) => useApp.getState().impostaSoglia(Number(v))}
                  aria-label="Soglia in giorni"
                />
                <NumberInput
                  aria-label="Soglia personalizzata in giorni"
                  value={soglia}
                  onChange={(v) => typeof v === 'number' && v >= 1 && v <= 365 && useApp.getState().impostaSoglia(Math.trunc(v))}
                  min={1}
                  max={365}
                  w={80}
                  allowDecimal={false}
                />
              </Group>
            </Stack>
          </Group>
        }
      />
      <Stack gap="md">
        <Sezione
          titolo="PdS scaduti non saldati"
          descrizione="Termine di esecuzione già superato e saldo non confermato"
          icona={<IconAlertTriangle size={20} />}
          colore="red"
          righe={scaduti}
          vuoto="Nessun PdS scaduto non saldato."
        />
        <Sezione
          titolo={`PdS in scadenza nei prossimi ${soglia} giorni`}
          descrizione="Termine di esecuzione entro la soglia indicata"
          icona={<IconClockExclamation size={20} />}
          colore="yellow"
          righe={inScadenza}
          vuoto={`Nessun PdS in scadenza nei prossimi ${soglia} giorni.`}
        />
      </Stack>
    </>
  );
}
