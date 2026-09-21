import { ActionIcon, Alert, Anchor, Badge, Card, Collapse, Group, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle, IconChevronDown, IconChevronRight, IconShieldCheck } from '@tabler/icons-react';
import { Fragment, useMemo, useState } from 'react';
import { formattaEuro, formattaPercentuale } from '../../domain/importi';
import { calcolaSintesi, inSforamento, sforamentoDaSegnalare, type RigaSintesi, type ValoriSintesi } from '../../domain/sintesi';
import { stipulaAvvenuta } from '../../domain/stato';
import { rapportoSintesi } from '../../esportazione/rapporti';
import { useDerivati } from '../../stato/derivati';
import { useApp } from '../../stato/store';
import { MenuEsporta } from '../componenti/MenuEsporta';
import { BadgeStato, Importo, IntestazionePagina, Meter, MeterDoppio, Percentuale, StatoVuoto } from '../componenti/base';
import { GraficoCapitoli } from '../componenti/GraficoCapitoli';
import { RiquadroValore } from '../componenti/RiquadroValore';
import { SelettoreEsercizio, useEsercizioSelezionato } from '../componenti/SelettoreEsercizio';
import { href } from '../router';

function testoSforamento(v: Pick<ValoriSintesi, 'sforamentoInviato' | 'sforamentoStipulato'>): string {
  return [
    v.sforamentoStipulato > 0 ? `stipulato oltre il finanziato di ${formattaEuro(v.sforamentoStipulato)}` : null,
    v.sforamentoInviato > 0 ? `trasmesso oltre il finanziato di ${formattaEuro(v.sforamentoInviato)}` : null,
  ]
    .filter(Boolean)
    .join('; ');
}

function IconaSforamento({ v, autorizzato = false }: { v: Pick<ValoriSintesi, 'sforamentoInviato' | 'sforamentoStipulato'>; autorizzato?: boolean }) {
  if (autorizzato || !inSforamento(v)) return null;
  const testo = testoSforamento(v);
  return (
    <Tooltip label={`Superamento: ${testo}`}>
      <IconAlertTriangle size={17} color="var(--pds-critico)" aria-label={`Superamento: ${testo}`} style={{ flexShrink: 0 }} />
    </Tooltip>
  );
}

function CelleValori({ v, forte = false }: { v: ValoriSintesi; forte?: boolean }) {
  return (
    <>
      <Table.Td ta="right">
        <Importo valore={v.finanziato} forte={forte} />
      </Table.Td>
      <Table.Td ta="right">
        <Importo valore={v.inviato} forte={forte} />
        <div>
          <Text span fz="xs" c={v.sforamentoInviato > 0 ? 'red.7' : 'dimmed'} fw={v.sforamentoInviato > 0 ? 600 : undefined} className="num">
            {formattaPercentuale(v.percInviato)}
          </Text>
        </div>
      </Table.Td>
      <Table.Td ta="right">
        <Importo valore={v.stipulato} forte={forte} />
        <div>
          <Text span fz="xs" c={v.sforamentoStipulato > 0 ? 'red.7' : 'dimmed'} fw={v.sforamentoStipulato > 0 ? 600 : undefined} className="num">
            {formattaPercentuale(v.percStipulato)}
          </Text>
        </div>
        {v.inviatoNonStipulato > 0 && (
          <Tooltip label="Importi trasmessi relativi a PdS non ancora stipulati">
            <Text fz="xs" c="dimmed" className="num">
              (+{formattaEuro(v.inviatoNonStipulato)})
            </Text>
          </Tooltip>
        )}
      </Table.Td>
      <Table.Td ta="right">
        <Importo valore={v.pagato} forte={forte} />
        <div>
          <Percentuale valore={v.percPagato} />
        </div>
        {v.percPagatoSuStipulato != null && (
          <Text fz="xs" c="dimmed" className="num">
            {formattaPercentuale(v.percPagatoSuStipulato)} dello stip.
          </Text>
        )}
      </Table.Td>
      <Table.Td ta="right">
        <Importo valore={v.disponibileDaImpegnare} forte={forte} c={v.disponibileDaImpegnare < 0 ? 'red.7' : undefined} />
      </Table.Td>
      <Table.Td ta="right">
        <Importo valore={v.residuoDaPagare} forte={forte} />
      </Table.Td>
    </>
  );
}

function DettaglioPdsCapitolo({ riga }: { riga: RigaSintesi }) {
  if (riga.pds.length === 0) {
    return (
      <Text fz="sm" c="dimmed" p="sm">
        Nessun PdS collegato a questo capitolo.
      </Text>
    );
  }
  return (
    <Table.ScrollContainer minWidth={640}>
      <Table verticalSpacing={4} fz="sm" withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>N. PdS</Table.Th>
            <Table.Th>Stato</Table.Th>
            <Table.Th>Ditta</Table.Th>
            <Table.Th ta="right">Trasmesso</Table.Th>
            <Table.Th ta="right">Stipulato</Table.Th>
            <Table.Th ta="right">Pagato</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {[...riga.pds]
            .sort((a, b) => a.pds.numero.localeCompare(b.pds.numero, 'it', { numeric: true }))
            .map((v) => (
              <Table.Tr key={v.pds.id}>
                <Table.Td>
                  <Anchor href={href(`/pds/${v.pds.id}`)} fz="sm">
                    {v.numeroCompleto}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <BadgeStato stato={v.stato} size="sm" />
                </Table.Td>
                <Table.Td>{v.pds.ditta ?? '—'}</Table.Td>
                <Table.Td ta="right">
                  <Importo valore={v.pds.data_invio || v.pds.data_stipula ? v.pds.importo_inviato : null} />
                </Table.Td>
                <Table.Td ta="right">
                  {stipulaAvvenuta(v.pds) ? (
                    <Importo valore={v.pds.valore_stipula} />
                  ) : (
                    <Tooltip label="PdS non ancora stipulato: tra parentesi l'importo trasmesso, non conteggiato nello stipulato">
                      <Text span fz="sm" c="dimmed" className="num">
                        ({formattaEuro(v.pds.importo_inviato, 'n.d.')})
                      </Text>
                    </Tooltip>
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  <Importo valore={v.totalePagato} />
                </Table.Td>
              </Table.Tr>
            ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export function Sintesi() {
  const { viste } = useDerivati();
  const capitoli = useApp((s) => s.dati.capitoli);
  const { anno } = useEsercizioSelezionato();
  const stretto = useMediaQuery('(max-width: 62em)');
  const [espansi, setEspansi] = useState<Set<string>>(new Set());

  const capitoliFiltrati = useMemo(() => capitoli.filter((c) => c.esercizio === anno), [capitoli, anno]);
  const sintesi = useMemo(() => calcolaSintesi(capitoliFiltrati, viste), [capitoliFiltrati, viste]);
  const t = sintesi.totale;

  const cambia = (id: string) =>
    setEspansi((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <IntestazionePagina
        titolo="Sintesi finanziaria"
        sottotitolo={`Situazione per capitolo di spesa e complessiva · esercizio ${anno}`}
        azioni={
          <>
            <SelettoreEsercizio />
            <MenuEsporta rapporto={() => rapportoSintesi(sintesi, anno)} disabilitato={sintesi.righe.length === 0} />
          </>
        }
      />

      {sintesi.righe.length === 0 ? (
        <Card>
          <StatoVuoto titolo="Nessun capitolo di spesa" descrizione={`Non sono presenti capitoli per l'esercizio ${anno}.`} />
        </Card>
      ) : (
        <Stack gap="md">
          {(sintesi.capitoliInSforamento.length > 0 || t.sforamentoStipulato > 0 || t.sforamentoInviato > 0) && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="Impegnato superiore al finanziato">
              <Stack gap={4}>
                {sintesi.capitoliInSforamento.map((r) => (
                  <Text key={r.capitolo.id} fz="sm">
                    <b>{r.capitolo.codice}</b>: {testoSforamento(r)}
                  </Text>
                ))}
                {(t.sforamentoStipulato > 0 || t.sforamentoInviato > 0) && (
                  <Text fz="sm" fw={600}>
                    Anche il totale complessivo supera il finanziato ({formattaEuro(Math.max(t.sforamentoStipulato, t.sforamentoInviato))} oltre).
                  </Text>
                )}
              </Stack>
            </Alert>
          )}

          <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing="md">
            <RiquadroValore etichetta="Totale finanziato" valore={formattaEuro(t.finanziato)} dettaglio={`${sintesi.righe.length} capitoli · ${t.nPds} PdS`} />
            <RiquadroValore
              etichetta="Impegnato (Trasmesso)"
              valore={formattaEuro(t.inviato)}
              sotto={<Meter rapporto={t.percInviato} etichetta="Trasmesso sul finanziato" />}
              dettaglio={`${formattaPercentuale(t.percInviato)} del finanziato · ${t.nInviati} PdS`}
            />
            <RiquadroValore
              etichetta="Impegnato (Stipulato)"
              valore={formattaEuro(t.stipulato)}
              sotto={<MeterDoppio inviato={t.percInviato} stipulato={t.percStipulato} etichetta="Impegnato sul finanziato" />}
              dettaglio={`${formattaPercentuale(t.percStipulato)} del finanziato${t.inviatoNonStipulato > 0 ? ` · (+${formattaEuro(t.inviatoNonStipulato)} non ancora stipulati)` : ''}`}
            />
            <RiquadroValore
              etichetta="Effettivo pagato"
              valore={formattaEuro(t.pagato)}
              sotto={<Meter rapporto={t.percPagatoSuStipulato} etichetta="Pagato sullo stipulato" />}
              dettaglio={`${formattaPercentuale(t.percPagato)} del finanziato · ${formattaPercentuale(t.percPagatoSuStipulato)} dello stipulato`}
            />
            <RiquadroValore
              etichetta="Disponibile da impegnare"
              valore={formattaEuro(t.disponibileDaImpegnare)}
              dettaglio={`Finanziato meno stipulato, comprese le economie dei ${t.nSaldati} PdS saldati (${formattaEuro(t.economie)})`}
            />
            <RiquadroValore etichetta="Residuo da pagare" valore={formattaEuro(t.residuoDaPagare)} dettaglio="Stipulato non ancora pagato sui PdS aperti" />
          </SimpleGrid>

          <Card>
            <Title order={3} fz="md" mb="md">
              Confronto per capitolo
            </Title>
            <GraficoCapitoli righe={sintesi.righe} />
          </Card>

          <Card padding={stretto ? 'sm' : 0}>
            <Title order={3} fz="md" p={stretto ? 0 : 'md'} pb={stretto ? 'sm' : 0}>
              Dettaglio per capitolo
            </Title>
            {stretto ? (
              <Stack gap="sm">
                {sintesi.righe.map((r) => (
                  <Card key={r.capitolo.id} padding="sm" className={sforamentoDaSegnalare(r) ? 'card-scaduto' : undefined}>
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Group gap={6} wrap="nowrap">
                        <Text fw={700}>{r.capitolo.codice}</Text>
                        <IconaSforamento v={r} autorizzato={r.capitolo.sforamento_ignorato} />
                        {r.capitolo.sforamento_ignorato && inSforamento(r) && (
                          <Badge size="sm" variant="light" color="gray" leftSection={<IconShieldCheck size={12} />} style={{ maxWidth: 'none' }} styles={{ label: { overflow: 'visible' } }}>
                            Autorizzato
                          </Badge>
                        )}
                      </Group>
                      <ActionIcon variant="subtle" onClick={() => cambia(r.capitolo.id)} aria-label="Mostra i PdS del capitolo" aria-expanded={espansi.has(r.capitolo.id)}>
                        {espansi.has(r.capitolo.id) ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                      </ActionIcon>
                    </Group>
                    <SimpleGrid cols={2} spacing={6} mt={6}>
                      {[
                        ['Finanziato', formattaEuro(r.finanziato)],
                        ['Impegnato (Trasmesso)', `${formattaEuro(r.inviato)} (${formattaPercentuale(r.percInviato)})`],
                        ['Impegnato (Stipulato)', `${formattaEuro(r.stipulato)} (${formattaPercentuale(r.percStipulato)})`],
                        ['Pagato', `${formattaEuro(r.pagato)} (${formattaPercentuale(r.percPagato)})`],
                        ['Disponibile da impegnare', formattaEuro(r.disponibileDaImpegnare)],
                        ['Residuo da pagare', formattaEuro(r.residuoDaPagare)],
                      ].map(([e, v]) => (
                        <div key={e}>
                          <Text fz={11} c="dimmed">
                            {e}
                          </Text>
                          <Text fz="sm" className="num">
                            {v}
                          </Text>
                        </div>
                      ))}
                    </SimpleGrid>
                    <Collapse expanded={espansi.has(r.capitolo.id)}>
                      <DettaglioPdsCapitolo riga={r} />
                    </Collapse>
                  </Card>
                ))}
              </Stack>
            ) : (
              <Table.ScrollContainer minWidth={1050}>
                <Table verticalSpacing={8} horizontalSpacing="sm" highlightOnHover aria-label="Sintesi finanziaria per capitolo">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={36} />
                      <Table.Th>Capitolo di spesa</Table.Th>
                      <Table.Th ta="right">Totale finanziato</Table.Th>
                      <Table.Th ta="right">Impegnato (Trasmesso)</Table.Th>
                      <Table.Th ta="right">Impegnato (Stipulato)</Table.Th>
                      <Table.Th ta="right">Effettivo pagato</Table.Th>
                      <Table.Th ta="right">Disponibile da impegnare</Table.Th>
                      <Table.Th ta="right">Residuo da pagare</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {sintesi.righe.map((r) => {
                      const aperto = espansi.has(r.capitolo.id);
                      return (
                        <Fragment key={r.capitolo.id}>
                          <Table.Tr className={sforamentoDaSegnalare(r) ? 'riga-scaduto' : undefined}>
                            <Table.Td>
                              <ActionIcon variant="subtle" size="sm" onClick={() => cambia(r.capitolo.id)} aria-label={`${aperto ? 'Nascondi' : 'Mostra'} i PdS del capitolo ${r.capitolo.codice}`} aria-expanded={aperto}>
                                {aperto ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                              </ActionIcon>
                            </Table.Td>
                            <Table.Td>
                              <Group gap={6} wrap="nowrap">
                                <Text fz="sm" fw={600}>
                                  {r.capitolo.codice}
                                </Text>
                                <IconaSforamento v={r} autorizzato={r.capitolo.sforamento_ignorato} />
                                {r.capitolo.sforamento_ignorato && inSforamento(r) && (
                                  <Tooltip label={`Superamento autorizzato: ${r.capitolo.sforamento_note}`}>
                                    <Badge size="sm" variant="light" color="gray" leftSection={<IconShieldCheck size={12} />} style={{ maxWidth: 'none' }} styles={{ label: { overflow: 'visible' } }}>
                                      Autorizzato
                                    </Badge>
                                  </Tooltip>
                                )}
                              </Group>
                              <Text fz="xs" c="dimmed">
                                {r.nPds} PdS · {r.nStipulati} stipulati · {r.nSaldati} saldati
                              </Text>
                            </Table.Td>
                            <CelleValori v={r} />
                          </Table.Tr>
                          {aperto && (
                            <Table.Tr>
                              <Table.Td />
                              <Table.Td colSpan={7} bg="var(--mantine-color-default-hover)">
                                <DettaglioPdsCapitolo riga={r} />
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Table.Tbody>
                  <Table.Tfoot>
                    <Table.Tr style={{ borderTop: '2px solid var(--mantine-color-default-border)' }}>
                      <Table.Td />
                      <Table.Td>
                        <Group gap={6}>
                          <Text fw={700} fz="sm">
                            Totale complessivo
                          </Text>
                          <IconaSforamento v={t} />
                        </Group>
                      </Table.Td>
                      <CelleValori v={t} forte />
                    </Table.Tr>
                  </Table.Tfoot>
                </Table>
              </Table.ScrollContainer>
            )}
          </Card>
        </Stack>
      )}
    </>
  );
}
