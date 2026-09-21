import { Badge, Group, Stack, Text, ThemeIcon, Title, Tooltip, type BadgeProps } from '@mantine/core';
import { IconAlertTriangle, IconClockExclamation, IconInbox } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { protocollo } from '../../domain/calcoli';
import { descriviGiorni, formattaData } from '../../domain/date';
import { formattaEuro, formattaPercentuale } from '../../domain/importi';
import { STATI, type LivelloAvviso, type StatoPds } from '../../domain/stato';
import type { Centesimi } from '../../domain/tipi';

export function BadgeStato({ stato, ...props }: { stato: StatoPds } & BadgeProps) {
  const info = STATI[stato];
  return (
    <Tooltip label={info.descrizione} openDelay={300}>
      <Badge color={info.colore} variant="light" style={{ flexShrink: 0, maxWidth: 'none' }} styles={{ label: { overflow: 'visible' } }} {...props}>
        {info.etichetta}
      </Badge>
    </Tooltip>
  );
}

export function Importo({ valore, vuoto = '—', forte = false, dimensione = 'sm', c }: { valore: Centesimi | null | undefined; vuoto?: string; forte?: boolean; dimensione?: string; c?: string }) {
  return (
    <Text span className="num" fz={dimensione} fw={forte ? 600 : undefined} c={valore == null ? 'dimmed' : c}>
      {formattaEuro(valore, vuoto)}
    </Text>
  );
}

export function Percentuale({ valore, dimensione = 'xs' }: { valore: number | null | undefined; dimensione?: string }) {
  return (
    <Text span className="num" fz={dimensione} c="dimmed">
      {formattaPercentuale(valore)}
    </Text>
  );
}

/** Indicatore di avviso scadenza con icona ed etichetta (mai solo colore). */
export function IndicatoreScadenza({ livello, giorni, compatto = false }: { livello: LivelloAvviso | null; giorni: number | null; compatto?: boolean }) {
  if (!livello || giorni == null) return null;
  const scaduto = livello === 'scaduto';
  const testo = descriviGiorni(giorni);
  return (
    <Badge
      color={scaduto ? 'red' : 'yellow'}
      variant={scaduto ? 'filled' : 'light'}
      leftSection={scaduto ? <IconAlertTriangle size={12} /> : <IconClockExclamation size={12} />}
      styles={scaduto ? undefined : { root: { color: 'var(--mantine-color-yellow-9)' } }}
      style={{ flexShrink: 0 }}
    >
      {compatto ? (scaduto ? 'Scaduto' : 'In scadenza') : testo}
    </Badge>
  );
}

export function DataConScadenza({ data, livello, giorni }: { data: string | null; livello: LivelloAvviso | null; giorni: number | null }) {
  if (!data) return <Text span c="dimmed" fz="sm">—</Text>;
  return (
    <Stack gap={2} align="flex-start">
      <Text span className="num" fz="sm" fw={livello ? 600 : undefined}>
        {formattaData(data)}
      </Text>
      {livello && giorni != null && (
        <Text span fz="xs" c={livello === 'scaduto' ? 'red.7' : 'yellow.9'} fw={500} style={{ whiteSpace: 'nowrap' }}>
          {livello === 'scaduto' ? '⚠ ' : '◷ '}
          {descriviGiorni(giorni)}
        </Text>
      )}
    </Stack>
  );
}

/** Protocollo leggibile: "Prot. n. 0089567 del 15/01/2026". */
export function Protocollo({ numero, data }: { numero: string | null | undefined; data: string | null | undefined }) {
  const testo = protocollo(numero, data);
  if (!testo) return <Text span c="dimmed" fz="sm">—</Text>;
  return (
    <Text span fz="sm" className="num">
      {testo}
    </Text>
  );
}

export function Meter({ rapporto, etichetta }: { rapporto: number | null; etichetta: string }) {
  const valore = rapporto ?? 0;
  const oltre = valore > 1;
  return (
    <div
      className={`meter${oltre ? ' meter-oltre' : ''}`}
      role="meter"
      aria-label={etichetta}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(valore * 100)}
      aria-valuetext={formattaPercentuale(rapporto)}
    >
      <div className="meter-riempimento" style={{ width: `${Math.min(1, Math.max(0, valore)) * 100}%` }} />
    </div>
  );
}

/**
 * Barra a due colori sulla stessa traccia: la quota chiara è l'impegnato
 * trasmesso, quella scura l'impegnato stipulato (che è sempre anche trasmesso).
 */
export function MeterDoppio({
  inviato,
  stipulato,
  etichetta,
}: {
  inviato: number | null;
  stipulato: number | null;
  etichetta: string;
}) {
  const esterno = Math.max(inviato ?? 0, stipulato ?? 0);
  const interno = stipulato ?? 0;
  const larghezza = (v: number) => `${Math.min(1, Math.max(0, v)) * 100}%`;
  return (
    <div
      className={`meter${esterno > 1 ? ' meter-oltre' : ''}`}
      role="meter"
      aria-label={etichetta}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(interno * 100)}
      aria-valuetext={`Trasmesso ${formattaPercentuale(inviato)}, stipulato ${formattaPercentuale(stipulato)}`}
    >
      <div className="meter-riempimento-2" style={{ width: larghezza(esterno) }} />
      <div className="meter-riempimento" style={{ width: larghezza(interno) }} />
    </div>
  );
}

export function IntestazionePagina({ titolo, sottotitolo, azioni, sopra }: { titolo: ReactNode; sottotitolo?: ReactNode; azioni?: ReactNode; sopra?: ReactNode }) {
  return (
    <Stack gap={6} mb="lg">
      {sopra}
      <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
        <Stack gap={2} style={{ minWidth: 0, flex: '1 1 320px' }}>
          <Title order={2} fz={{ base: 22, sm: 26 }} fw={650} lh={1.2}>
            {titolo}
          </Title>
          {sottotitolo && (
            <Text c="dimmed" fz="sm" component="div">
              {sottotitolo}
            </Text>
          )}
        </Stack>
        {azioni && (
          <Group gap="xs" className="no-stampa" wrap="wrap">
            {azioni}
          </Group>
        )}
      </Group>
    </Stack>
  );
}

export function StatoVuoto({ titolo, descrizione, azione, icona }: { titolo: string; descrizione?: ReactNode; azione?: ReactNode; icona?: ReactNode }) {
  return (
    <Stack align="center" gap="xs" py="xl" px="md" ta="center">
      <ThemeIcon variant="light" color="gray" size={48} radius="xl">
        {icona ?? <IconInbox size={26} />}
      </ThemeIcon>
      <Text fw={600}>{titolo}</Text>
      {descrizione && (
        <Text c="dimmed" fz="sm" maw={460}>
          {descrizione}
        </Text>
      )}
      {azione}
    </Stack>
  );
}

/** Coppia etichetta/valore per le schede di dettaglio. */
export function Campo({ etichetta, children, largo = false }: { etichetta: string; children: ReactNode; largo?: boolean }) {
  return (
    <Stack gap={2} style={largo ? { gridColumn: '1 / -1' } : undefined}>
      <Text className="etichetta-campo" component="div">
        {etichetta}
      </Text>
      <div className="valore-campo">{children ?? <Text span c="dimmed">—</Text>}</div>
    </Stack>
  );
}

export function Testo({ valore }: { valore: string | null | undefined }) {
  if (valore == null || valore === '') return <Text span c="dimmed" fz="sm">—</Text>;
  return (
    <Text span fz="sm" className="testo-pre">
      {valore}
    </Text>
  );
}
