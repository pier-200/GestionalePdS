import { Anchor, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconClockExclamation } from '@tabler/icons-react';
import { useMemo } from 'react';
import { formattaData } from '../../domain/date';
import { etichettaCapitolo } from '../../domain/calcoli';
import { formattaEuro, formattaPercentuale } from '../../domain/importi';
import { calcolaSintesi } from '../../domain/sintesi';
import { ELENCO_STATI, STATI } from '../../domain/stato';
import { useDerivati } from '../../stato/derivati';
import { useApp } from '../../stato/store';
import { BadgeStato, IndicatoreScadenza, IntestazionePagina, Meter, MeterDoppio } from '../componenti/base';
import { RiquadroValore } from '../componenti/RiquadroValore';
import { SelettoreEsercizio, useEsercizioSelezionato } from '../componenti/SelettoreEsercizio';
import { href } from '../router';

export function Panoramica() {
  const { viste, oggi } = useDerivati();
  const capitoli = useApp((s) => s.dati.capitoli);
  const soglia = useApp((s) => s.sogliaGiorni);
  const utente = useApp((s) => s.sessione?.utente);
  const { anno } = useEsercizioSelezionato();

  const visteEsercizio = useMemo(() => viste.filter((v) => v.esercizio === anno), [viste, anno]);
  const capitoliEsercizio = useMemo(() => capitoli.filter((c) => c.esercizio === anno), [capitoli, anno]);
  const sintesi = useMemo(() => calcolaSintesi(capitoliEsercizio, visteEsercizio), [capitoliEsercizio, visteEsercizio]);

  // Gli avvisi di scadenza riguardano tutti gli esercizi: un PdS dell'anno precedente può essere ancora aperto.
  const scaduti = useMemo(() => viste.filter((v) => v.avviso === 'scaduto').sort((a, b) => (a.scadenza ?? '').localeCompare(b.scadenza ?? '')), [viste]);
  const inScadenza = useMemo(() => viste.filter((v) => v.avviso === 'in_scadenza').sort((a, b) => (a.scadenza ?? '').localeCompare(b.scadenza ?? '')), [viste]);
  const perStato = useMemo(() => {
    const conteggi = Object.fromEntries(ELENCO_STATI.map((s) => [s, 0])) as Record<string, number>;
    for (const v of visteEsercizio) conteggi[v.stato]++;
    return conteggi;
  }, [visteEsercizio]);
  const massimoStato = Math.max(1, ...Object.values(perStato));

  const t = sintesi.totale;
  const daAttenzionare = [...scaduti, ...inScadenza];

  return (
    <>
      <IntestazionePagina
        titolo="Panoramica"
        sottotitolo={
          <>
            Situazione al {formattaData(oggi)} · esercizio {anno}
            {utente?.nome ? ` · ${utente.nome}` : ''}
            <br />
            <Anchor href={href(`/pds?esercizio=${anno}`)} fz="xs" c="dimmed">
              {t.nPds} PdS registrati · {t.nStipulati} stipulati · {t.nSaldati} saldati · {t.nInPreparazione} in preparazione
            </Anchor>
          </>
        }
        azioni={<SelettoreEsercizio />}
      />

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing="md" mb="md">
        <RiquadroValore
          etichetta="Fondi impegnati"
          valore={formattaPercentuale(t.percStipulato)}
          sotto={<MeterDoppio inviato={t.percInviato} stipulato={t.percStipulato} etichetta="Fondi impegnati sul finanziato" />}
          dettaglio={
            <>
              Trasmesso {formattaEuro(t.inviato)} · Stipulato {formattaEuro(t.stipulato)}
              <br />
              su {formattaEuro(t.finanziato)} finanziati
            </>
          }
          icona={
            sintesi.capitoliInSforamento.length > 0 ? (
              <Tooltip label="Uno o più capitoli superano il finanziato">
                <ThemeIcon color="red" variant="light" size={26} radius="xl">
                  <IconAlertTriangle size={16} />
                </ThemeIcon>
              </Tooltip>
            ) : undefined
          }
          href={href(`/sintesi?esercizio=${anno}`)}
        />
        <RiquadroValore
          etichetta="Fondi pagati"
          valore={formattaPercentuale(t.percPagatoSuStipulato)}
          sotto={<Meter rapporto={t.percPagatoSuStipulato} etichetta="Fondi pagati sullo stipulato" />}
          dettaglio={`${formattaEuro(t.pagato)} su ${formattaEuro(t.stipulato)} stipulati`}
          href={href(`/sintesi?esercizio=${anno}`)}
        />
        <RiquadroValore
          etichetta="Avvisi sulle scadenze"
          valore={
            <Group gap="md" component="span">
              <Group gap={6} component="span">
                <IconAlertTriangle size={20} color="var(--pds-critico)" aria-hidden />
                <span>{scaduti.length}</span>
                <Text span fz="sm" c="dimmed" fw={400}>
                  scaduti
                </Text>
              </Group>
              <Group gap={6} component="span">
                <IconClockExclamation size={20} color="var(--pds-attenzione)" aria-hidden />
                <span>{inScadenza.length}</span>
                <Text span fz="sm" c="dimmed" fw={400}>
                  in scadenza
                </Text>
              </Group>
            </Group>
          }
          dettaglio={`PdS non saldati, scadenza entro ${soglia} giorni o già superata`}
          href={href('/scadenze')}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <Card>
          <Group justify="space-between" mb="sm">
            <Title order={3} fz="md">
              Da attenzionare
            </Title>
            <Anchor href={href('/scadenze')} fz="sm">
              Tutte le scadenze
            </Anchor>
          </Group>
          {daAttenzionare.length === 0 ? (
            <Group gap="sm">
              <ThemeIcon color="green" variant="light" radius="xl">
                <IconCircleCheck size={18} />
              </ThemeIcon>
              <Text fz="sm">Nessun PdS scaduto o in scadenza nei prossimi {soglia} giorni.</Text>
            </Group>
          ) : (
            <Stack gap={0}>
              {daAttenzionare.slice(0, 6).map((v) => (
                <Group
                  key={v.pds.id}
                  justify="space-between"
                  wrap="nowrap"
                  py={8}
                  gap="sm"
                  style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Anchor href={href(`/pds/${v.pds.id}`)} fw={600} fz="sm">
                      PdS {v.numeroCompleto}
                    </Anchor>
                    <Text fz="xs" c="dimmed" truncate>
                      {[
                        v.capitolo ? `Cap. ${etichettaCapitolo(v.capitolo, false)}` : 'Capitolo non trovato',
                        v.pds.ditta,
                        v.pds.dec,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </div>
                  <Stack gap={2} align="flex-end" style={{ flexShrink: 0 }}>
                    <IndicatoreScadenza livello={v.avviso} giorni={v.giorniAllaScadenza} />
                    <Text fz="xs" c="dimmed" className="num">
                      {formattaData(v.scadenza)}
                    </Text>
                  </Stack>
                </Group>
              ))}
              {daAttenzionare.length > 6 && (
                <Text fz="xs" c="dimmed" mt={8}>
                  e altri {daAttenzionare.length - 6}…
                </Text>
              )}
            </Stack>
          )}
        </Card>

        <Card>
          <Title order={3} fz="md" mb="sm">
            PdS per stato
          </Title>
          <Stack gap={10}>
            {ELENCO_STATI.map((s) => (
              <Anchor key={s} href={href(`/pds?stato=${s}&esercizio=${anno}`)} underline="never" c="inherit">
                <Group gap="sm" wrap="nowrap">
                  <div style={{ width: 132, flexShrink: 0 }}>
                    <BadgeStato stato={s} fullWidth />
                  </div>
                  <div style={{ flex: 1, height: 10, position: 'relative' }} aria-hidden>
                    <div
                      style={{
                        position: 'absolute',
                        inset: '0 auto 0 0',
                        width: `${(perStato[s] / massimoStato) * 100}%`,
                        minWidth: perStato[s] > 0 ? 4 : 0,
                        background: 'var(--pds-riempimento-meter)',
                        borderRadius: '0 4px 4px 0',
                      }}
                    />
                  </div>
                  <Text fz="sm" fw={600} className="num" w={32} ta="right" aria-label={`${STATI[s].etichetta}: ${perStato[s]}`}>
                    {perStato[s]}
                  </Text>
                </Group>
              </Anchor>
            ))}
          </Stack>
        </Card>
      </SimpleGrid>
    </>
  );
}
