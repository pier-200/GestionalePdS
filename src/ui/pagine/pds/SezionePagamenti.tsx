import { ActionIcon, Alert, Button, Card, Checkbox, Divider, Group, Modal, SimpleGrid, Stack, Table, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core';
import { IconCash, IconCircleCheck, IconLockOpen, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import type { PdsVista } from '../../../domain/calcoli';
import type { DatiPagamento } from '../../../domain/comandi';
import { formattaData, oggiISO } from '../../../domain/date';
import { formattaEuro, formattaPercentuale } from '../../../domain/importi';
import { puo } from '../../../domain/permessi';
import { stipulaAvvenuta } from '../../../domain/stato';
import type { Centesimi, DataISO, Pagamento } from '../../../domain/tipi';
import { useApp } from '../../../stato/store';
import { chiediConferma, useAzione } from '../../componenti/azioni';
import { Importo, Meter, Protocollo } from '../../componenti/base';
import { CampoData, CampoImporto, CampoProtocollo } from '../../componenti/campi';

function ModalePagamento({ vista, pagamento, onClose }: { vista: PdsVista; pagamento: Pagamento | 'nuovo'; onClose: () => void }) {
  const esistente = pagamento === 'nuovo' ? null : pagamento;
  const [data, setData] = useState<DataISO | null>(esistente?.data ?? oggiISO());
  const [importo, setImporto] = useState<Centesimi | null>(esistente?.importo ?? null);
  const [riferimento, setRiferimento] = useState<string | null>(esistente?.riferimento ?? null);
  const [note, setNote] = useState(esistente?.note ?? '');
  const { inCorso, esegui } = useAzione();

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    if (!data || !importo) return;
    const dati: DatiPagamento = { data, importo, riferimento, note: note.trim() || null };
    const ok = await esegui(async () => {
      if (esistente) {
        const modifiche: Partial<DatiPagamento> = {};
        const originale: Partial<DatiPagamento> = {};
        for (const k of ['data', 'importo', 'riferimento', 'note'] as const) {
          if ((dati[k] ?? null) !== (esistente[k] ?? null)) {
            (modifiche as Record<string, unknown>)[k] = dati[k];
            (originale as Record<string, unknown>)[k] = esistente[k];
          }
        }
        if (Object.keys(modifiche).length) await useApp.getState().esegui({ tipo: 'pagamento.modifica', id: esistente.id, modifiche, originale });
      } else {
        await useApp.getState().esegui({ tipo: 'pagamento.crea', pds_id: vista.pds.id, dati });
      }
      return true;
    }, esistente ? 'Pagamento aggiornato.' : 'Pagamento registrato.');
    if (ok) onClose();
  };

  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>{esistente ? 'Modifica pagamento' : 'Registra pagamento'}</Text>}>
      <form onSubmit={invia}>
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <CampoData label="Data del pagamento" value={data} onChange={setData} required clearable={false} />
            <CampoImporto label="Importo" value={importo} onChange={setImporto} required data-autofocus />
          </SimpleGrid>
          <CampoProtocollo label="Numero di protocollo" description="Solo il numero: la data è quella del pagamento" value={riferimento} onChange={setRiferimento} />
          <TextInput label="Note" value={note} onChange={(e) => setNote(e.currentTarget.value)} maxLength={300} />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={inCorso} disabled={!data || !importo}>
              Salva
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function ModaleSaldo({ vista, onClose }: { vista: PdsVista; onClose: () => void }) {
  const p = vista.pds;
  const stipulato = p.valore_stipula ?? 0;
  const residuo = Math.max(0, stipulato - vista.totalePagato);
  const [dataSaldo, setDataSaldo] = useState<DataISO | null>(oggiISO());
  const [registraFinale, setRegistraFinale] = useState(residuo > 0);
  const [importoFinale, setImportoFinale] = useState<Centesimi | null>(residuo > 0 ? residuo : null);
  const [riferimento, setRiferimento] = useState<string | null>(null);
  const { inCorso, esegui } = useAzione();

  const totaleFinale = vista.totalePagato + (registraFinale && importoFinale ? importoFinale : 0);
  const economia = stipulato - totaleFinale;

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    if (!dataSaldo) return;
    const ok = await esegui(
      () =>
        useApp.getState().esegui({
          tipo: 'saldo.conferma',
          pds_id: p.id,
          data_saldo: dataSaldo,
          pagamento_finale: registraFinale && importoFinale ? { data: dataSaldo, importo: importoFinale, riferimento, note: null } : null,
        }),
      `Saldo del PdS ${vista.numeroCompleto} confermato.`,
    );
    if (ok) onClose();
  };

  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>Conferma saldo – PdS {vista.numeroCompleto}</Text>} size="lg">
      <form onSubmit={invia}>
        <Stack gap="sm">
          <Text fz="sm">
            Confermando il saldo il PdS viene chiuso: si registra il valore complessivo finale pagato e si calcola l'economia rispetto al valore stipulato. I pagamenti non saranno più modificabili, salvo annullamento del saldo.
          </Text>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
            <div>
              <Text fz="xs" c="dimmed">
                Valore stipulato
              </Text>
              <Importo valore={p.valore_stipula} forte />
            </div>
            <div>
              <Text fz="xs" c="dimmed">
                Pagamenti già registrati ({vista.pagamenti.length})
              </Text>
              <Importo valore={vista.totalePagato} forte />
            </div>
          </SimpleGrid>
          <CampoData label="Data del saldo" value={dataSaldo} onChange={setDataSaldo} required clearable={false} maw={240} />
          <Divider />
          <Checkbox label="Registra anche il pagamento a saldo" checked={registraFinale} onChange={(e) => setRegistraFinale(e.currentTarget.checked)} />
          {registraFinale && (
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
              <CampoImporto label="Importo del pagamento a saldo" value={importoFinale} onChange={setImportoFinale} />
              <CampoProtocollo label="Numero di protocollo" value={riferimento} onChange={setRiferimento} />
            </SimpleGrid>
          )}
          <Card withBorder padding="sm" bg="var(--mantine-color-default-hover)">
            <SimpleGrid cols={2} spacing="xs">
              <div>
                <Text fz="xs" c="dimmed">
                  Valore complessivo finale pagato
                </Text>
                <Text fw={700} className="num">
                  {formattaEuro(totaleFinale)}
                </Text>
              </div>
              <div>
                <Text fz="xs" c="dimmed">
                  Economia
                </Text>
                <Text fw={700} className="num" c={economia < 0 ? 'red.7' : undefined}>
                  {formattaEuro(economia)}
                </Text>
              </div>
            </SimpleGrid>
            {economia < 0 && (
              <Text fz="xs" c="red.7" mt={4}>
                Il pagato supera il valore stipulato.
              </Text>
            )}
            {totaleFinale === 0 && (
              <Text fz="xs" c="dimmed" mt={4}>
                Nessun pagamento: l'intero valore stipulato risulterà come economia.
              </Text>
            )}
          </Card>
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" color="green" loading={inCorso} disabled={!dataSaldo || (registraFinale && !importoFinale)} leftSection={<IconCircleCheck size={16} />}>
              Conferma saldo
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function SezionePagamenti({ vista }: { vista: PdsVista }) {
  const utente = useApp((s) => s.sessione?.utente);
  const p = vista.pds;
  const puoPagamenti = puo(utente, 'pds_pagamenti', vista.capitolo);
  const [modale, setModale] = useState<Pagamento | 'nuovo' | null>(null);
  const [saldoAperto, setSaldoAperto] = useState(false);
  const { inCorso, esegui } = useAzione();

  const elimina = async (pag: Pagamento) => {
    const ok = await chiediConferma({
      titolo: 'Eliminare il pagamento?',
      messaggio: `Il pagamento di ${formattaEuro(pag.importo)} del ${formattaData(pag.data)} sarà eliminato.`,
      conferma: 'Elimina',
      pericolosa: true,
    });
    if (ok) await esegui(() => useApp.getState().esegui({ tipo: 'pagamento.elimina', id: pag.id }), 'Pagamento eliminato.');
  };

  const annullaSaldo = async () => {
    const ok = await chiediConferma({
      titolo: 'Annullare il saldo?',
      messaggio: 'Il PdS tornerà aperto: i pagamenti diventeranno di nuovo modificabili e il valore finale e l\'economia registrati saranno rimossi.',
      conferma: 'Annulla saldo',
      pericolosa: true,
    });
    if (ok) await esegui(() => useApp.getState().esegui({ tipo: 'saldo.annulla', pds_id: p.id }), 'Saldo annullato.');
  };

  const residuo = p.valore_stipula != null && stipulaAvvenuta(p) ? p.valore_stipula - vista.totalePagato : null;

  return (
    <Card style={{ gridColumn: '1 / -1' }}>
      <Group justify="space-between" mb="md" gap="xs">
        <Group gap="xs" wrap="nowrap">
          <ThemeIcon variant="light" size={30} radius="md">
            <IconCash size={18} />
          </ThemeIcon>
          <Text fw={600} component="h3" m={0} fz="md">
            Pagamenti e saldo
          </Text>
        </Group>
        {puoPagamenti && (
          <Group gap="xs" className="no-stampa">
            {!p.saldato && (
              <Button variant="light" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={() => setModale('nuovo')}>
                Registra pagamento
              </Button>
            )}
            {!p.saldato && (
              <Tooltip label="Per confermare il saldo occorre la stipula (data e valore)" disabled={stipulaAvvenuta(p) && p.valore_stipula != null}>
                <Button
                  color="green"
                  size="compact-sm"
                  leftSection={<IconCircleCheck size={14} />}
                  onClick={() => setSaldoAperto(true)}
                  disabled={!stipulaAvvenuta(p) || p.valore_stipula == null}
                >
                  Conferma saldo
                </Button>
              </Tooltip>
            )}
            {p.saldato && (
              <Button variant="subtle" color="red" size="compact-sm" leftSection={<IconLockOpen size={14} />} onClick={annullaSaldo} loading={inCorso}>
                Annulla saldo
              </Button>
            )}
          </Group>
        )}
      </Group>

      {p.saldato && (
        <Alert color="green" variant="light" icon={<IconCircleCheck size={18} />} mb="md" title={`Saldo confermato il ${formattaData(p.data_saldo)}`}>
          <Group gap="xl">
            <div>
              <Text fz="xs" c="dimmed">
                Valore complessivo finale pagato
              </Text>
              <Importo valore={p.totale_pagato_saldo} forte />
            </div>
            <div>
              <Text fz="xs" c="dimmed">
                Valore stipulato
              </Text>
              <Importo valore={p.valore_stipula} />
            </div>
            <div>
              <Text fz="xs" c="dimmed">
                Economia
              </Text>
              <Importo valore={vista.economia} forte c={vista.economia != null && vista.economia < 0 ? 'red.7' : undefined} />
            </div>
          </Group>
        </Alert>
      )}

      {vista.pagamenti.length === 0 ? (
        <Text fz="sm" c="dimmed">
          Nessun pagamento registrato.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing={6} highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Data</Table.Th>
                <Table.Th ta="right">Importo</Table.Th>
                <Table.Th>Protocollo</Table.Th>
                <Table.Th>Note</Table.Th>
                {puoPagamenti && !p.saldato && <Table.Th w={80} />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {vista.pagamenti.map((pag) => (
                <Table.Tr key={pag.id}>
                  <Table.Td className="num">{formattaData(pag.data)}</Table.Td>
                  <Table.Td ta="right">
                    <Importo valore={pag.importo} />
                  </Table.Td>
                  <Table.Td>
                    <Protocollo numero={pag.riferimento} data={pag.data} />
                  </Table.Td>
                  <Table.Td>
                    <Text fz="sm" c={pag.note ? undefined : 'dimmed'}>
                      {pag.note ?? '—'}
                    </Text>
                  </Table.Td>
                  {puoPagamenti && !p.saldato && (
                    <Table.Td>
                      <Group gap={2} justify="flex-end" wrap="nowrap">
                        <ActionIcon variant="subtle" color="gray" onClick={() => setModale(pag)} aria-label="Modifica pagamento">
                          <IconPencil size={16} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" color="red" onClick={() => elimina(pag)} aria-label="Elimina pagamento">
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td>
                  <Text fw={600} fz="sm">
                    Totale pagato
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Importo valore={vista.totalePagato} forte />
                </Table.Td>
                <Table.Td colSpan={puoPagamenti && !p.saldato ? 3 : 2} />
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Table.ScrollContainer>
      )}

      {!p.saldato && vista.quotaPagata != null && (
        <Stack gap={4} mt="md" maw={520}>
          <Group justify="space-between">
            <Text fz="xs" c="dimmed">
              Pagato sul valore stipulato
            </Text>
            <Text fz="xs" className="num">
              {formattaPercentuale(vista.quotaPagata)}
              {residuo != null && residuo > 0 ? ` · residuo ${formattaEuro(residuo)}` : ''}
            </Text>
          </Group>
          <Meter rapporto={vista.quotaPagata} etichetta="Pagato sul valore stipulato" />
        </Stack>
      )}

      {modale && <ModalePagamento vista={vista} pagamento={modale} onClose={() => setModale(null)} />}
      {saldoAperto && <ModaleSaldo vista={vista} onClose={() => setSaldoAperto(false)} />}
    </Card>
  );
}
