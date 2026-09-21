import { ActionIcon, Alert, Anchor, Badge, Button, Card, Group, Modal, NumberInput, SimpleGrid, Stack, Table, Text, Textarea, TextInput, Title, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconArrowLeft, IconFileText, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { importoImpegnato, type VistaAccordo, type VistaAtto } from '../../domain/accordi';
import type { PdsVista } from '../../domain/calcoli';
import { formattaData } from '../../domain/date';
import { formattaEuro, formattaPercentuale } from '../../domain/importi';
import { puo } from '../../domain/permessi';
import { DURATA_ATTO_PREDEFINITA, type AttoAdesione, type Centesimi, type DataISO } from '../../domain/tipi';
import { useDerivati } from '../../stato/derivati';
import { useApp } from '../../stato/store';
import { chiediConferma, useAzione } from '../componenti/azioni';
import { BadgeStato, Importo, IntestazionePagina, Meter, Protocollo, StatoVuoto } from '../componenti/base';
import { CampoData, CampoImporto, CampoProtocollo } from '../componenti/campi';
import { RiquadroValore } from '../componenti/RiquadroValore';
import { href } from '../router';
import { ModaleAccordo } from './AccordiQuadro';

/** Creazione e modifica di un atto di adesione a quantità indeterminata. */
function ModaleAtto({ accordoId, atto, onClose }: { accordoId: string; atto: AttoAdesione | null; onClose: () => void }) {
  const [numero, setNumero] = useState(atto?.numero ?? '');
  const [oggetto, setOggetto] = useState(atto?.oggetto ?? '');
  const [protocollo, setProtocollo] = useState<string | null>(atto?.protocollo_stipula ?? null);
  const [dataStipula, setDataStipula] = useState<DataISO | null>(atto?.data_stipula ?? null);
  const [durata, setDurata] = useState<number | ''>(atto?.durata_giorni ?? DURATA_ATTO_PREDEFINITA);
  const [valore, setValore] = useState<Centesimi | null>(atto?.valore ?? null);
  const [note, setNote] = useState(atto?.note ?? '');
  const { inCorso, esegui } = useAzione();

  const dati = {
    numero: numero.trim(),
    oggetto: oggetto.trim() || null,
    protocollo_stipula: protocollo,
    data_stipula: dataStipula,
    durata_giorni: durata === '' ? DURATA_ATTO_PREDEFINITA : durata,
    valore: valore ?? 0,
    note: note.trim() || null,
  };

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await esegui(async () => {
      if (atto) {
        const modifiche: Record<string, unknown> = {};
        const originale: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(dati)) {
          if (v !== (atto as unknown as Record<string, unknown>)[k]) {
            modifiche[k] = v;
            originale[k] = (atto as unknown as Record<string, unknown>)[k];
          }
        }
        if (Object.keys(modifiche).length) await useApp.getState().esegui({ tipo: 'atto.modifica', id: atto.id, modifiche, originale });
      } else {
        await useApp.getState().esegui({ tipo: 'atto.crea', accordo_id: accordoId, dati });
      }
      return true;
    }, atto ? 'Atto di adesione aggiornato.' : 'Atto di adesione creato.');
    if (ok) onClose();
  };

  return (
    <Modal opened onClose={onClose} size="lg" title={<Text fw={600}>{atto ? 'Modifica atto di adesione' : 'Nuovo atto di adesione a quantità indeterminata'}</Text>}>
      <form onSubmit={invia}>
        <Stack gap="sm">
          <Text fz="sm" c="dimmed">
            L’atto impegna la capienza contrattuale dell’accordo quadro ma non i fondi dei capitoli di spesa: sono i PdS collegati all’atto a impegnarli.
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput label="Numero" description="Es. AdA 1" value={numero} onChange={(e) => setNumero(e.currentTarget.value)} required maxLength={50} data-autofocus />
            <CampoImporto label="Valore stipulato" value={valore} onChange={setValore} />
          </SimpleGrid>
          <TextInput label="Oggetto" value={oggetto} onChange={(e) => setOggetto(e.currentTarget.value)} maxLength={300} />
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <CampoProtocollo label="Protocollo di stipula" value={protocollo} onChange={setProtocollo} />
            <CampoData label="Data di stipula" value={dataStipula} onChange={setDataStipula} />
            <NumberInput
              label="Durata (giorni)"
              description={`Predefinita: ${DURATA_ATTO_PREDEFINITA}`}
              value={durata}
              onChange={(v) => setDurata(typeof v === 'number' ? v : '')}
              min={1}
              max={36500}
              allowDecimal={false}
              allowNegative={false}
            />
          </SimpleGrid>
          <Textarea label="Note" value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={2} maxRows={8} maxLength={5000} />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={inCorso} disabled={!numero.trim() || !valore}>
              Salva
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/** Ordinativi (PdS) collegati: la riga mostra l'impegno sul capitolo e il pagato. */
function TabellaOrdinativi({ pds, vuoto }: { pds: PdsVista[]; vuoto: string }) {
  if (pds.length === 0) {
    return (
      <Text fz="sm" c="dimmed" p="sm">
        {vuoto}
      </Text>
    );
  }
  return (
    <Table.ScrollContainer minWidth={860}>
      <Table verticalSpacing={6} fz="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>N. PdS</Table.Th>
            <Table.Th>Stato</Table.Th>
            <Table.Th>Ordinativo</Table.Th>
            <Table.Th>Capitolo</Table.Th>
            <Table.Th ta="right">Impegnato</Table.Th>
            <Table.Th ta="right">Pagato</Table.Th>
            <Table.Th>Scadenza</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {[...pds]
            .sort((a, b) => a.numeroCompleto.localeCompare(b.numeroCompleto, 'it', { numeric: true }))
            .map((v) => (
              <Table.Tr key={v.pds.id}>
                <Table.Td>
                  <Anchor href={href(`/pds/${v.pds.id}`)} fz="sm" fw={600}>
                    {v.numeroCompleto}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <BadgeStato stato={v.stato} size="sm" />
                </Table.Td>
                <Table.Td>{v.pds.ordinativo ?? '—'}</Table.Td>
                <Table.Td className="num">{v.capitolo?.codice ?? '—'}</Table.Td>
                <Table.Td ta="right">
                  <Importo valore={importoImpegnato(v)} />
                </Table.Td>
                <Table.Td ta="right">
                  <Importo valore={v.totalePagato} />
                </Table.Td>
                <Table.Td className="num">{formattaData(v.scadenza)}</Table.Td>
              </Table.Tr>
            ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function SchedaAtto({ v, puoGestire, onModifica, onElimina }: { v: VistaAtto; puoGestire: boolean; onModifica: () => void; onElimina: () => void }) {
  return (
    <Card>
      <Group justify="space-between" wrap="nowrap" align="flex-start" mb="xs">
        <div style={{ minWidth: 0 }}>
          <Group gap={8} wrap="nowrap">
            <Text fw={700}>{v.atto.numero}</Text>
            <Badge size="sm" variant="light" color="gray" style={{ maxWidth: 'none' }} styles={{ label: { overflow: 'visible' } }}>
              Quantità indeterminata
            </Badge>
            {v.residuo < 0 && (
              <Tooltip label={`Ordinativi oltre il valore dell'atto di ${formattaEuro(-v.residuo)}`}>
                <IconAlertTriangle size={16} color="var(--pds-critico)" aria-label="Valore dell'atto superato" />
              </Tooltip>
            )}
          </Group>
          {v.atto.oggetto && (
            <Text fz="sm" c="dimmed">
              {v.atto.oggetto}
            </Text>
          )}
          <Text fz="xs" c="dimmed" mt={4}>
            Stipula: <Protocollo numero={v.atto.protocollo_stipula} data={v.atto.data_stipula} /> · durata {v.atto.durata_giorni} giorni
            {v.scadenza ? ` · scadenza ${formattaData(v.scadenza)}` : ''}
          </Text>
        </div>
        {puoGestire && (
          <Group gap={2} wrap="nowrap">
            <ActionIcon variant="subtle" color="gray" onClick={onModifica} aria-label={`Modifica l'atto di adesione ${v.atto.numero}`}>
              <IconPencil size={16} />
            </ActionIcon>
            <ActionIcon variant="subtle" color="red" onClick={onElimina} aria-label={`Elimina l'atto di adesione ${v.atto.numero}`}>
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        )}
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="sm">
        {[
          ['Valore stipulato', formattaEuro(v.atto.valore)],
          ['Ordinato', formattaEuro(v.impegnato)],
          ['Residuo ordinabile', formattaEuro(v.residuo)],
          ['Pagato', formattaEuro(v.pagato)],
        ].map(([e, t]) => (
          <div key={e}>
            <Text fz={11} c="dimmed">
              {e}
            </Text>
            <Text fz="sm" fw={600} className="num">
              {t}
            </Text>
          </div>
        ))}
      </SimpleGrid>
      <Meter rapporto={v.quotaImpegnata} etichetta={`Quota ordinata dell'atto ${v.atto.numero}`} />
      <Text fz="xs" c="dimmed" mt={4} mb="sm">
        {formattaPercentuale(v.quotaImpegnata)} del valore stipulato · {v.pds.length} ordinativi
      </Text>
      <TabellaOrdinativi pds={v.pds} vuoto="Nessun PdS collegato a questo atto di adesione." />
    </Card>
  );
}

export function DettaglioAccordo({ parametri }: { parametri: Record<string, string> }) {
  const { accordiPerId } = useDerivati();
  const utente = useApp((s) => s.sessione?.utente);
  const puoGestire = puo(utente, 'accordi');
  const [modaleAtto, setModaleAtto] = useState<AttoAdesione | 'nuovo' | null>(null);
  const [modaleAccordo, setModaleAccordo] = useState(false);
  const { esegui } = useAzione();
  const v: VistaAccordo | undefined = accordiPerId.get(parametri.id);

  const indietro = (
    <Anchor href={href('/accordi')} fz="sm" className="no-stampa">
      <Group gap={4} component="span">
        <IconArrowLeft size={14} /> Accordi quadro
      </Group>
    </Anchor>
  );

  if (!v) {
    return (
      <>
        {indietro}
        <StatoVuoto icona={<IconFileText size={26} />} titolo="Accordo quadro non trovato" descrizione="Potrebbe essere stato eliminato da un altro utente." />
      </>
    );
  }

  const eliminaAtto = async (atto: AttoAdesione, collegati: number) => {
    const ok = await chiediConferma({
      titolo: 'Eliminare l’atto di adesione?',
      messaggio:
        collegati > 0
          ? `All'atto ${atto.numero} sono collegati ${collegati} PdS: vanno scollegati prima di eliminarlo.`
          : `L'atto di adesione ${atto.numero} sarà eliminato.`,
      conferma: 'Elimina',
      pericolosa: true,
    });
    if (ok) await esegui(() => useApp.getState().esegui({ tipo: 'atto.elimina', id: atto.id }), 'Atto di adesione eliminato.');
  };

  return (
    <>
      <IntestazionePagina
        sopra={indietro}
        titolo={
          <Group gap="sm" component="span" wrap="wrap">
            <span>{v.accordo.numero}</span>
            {v.superamento > 0 && (
              <Badge color="red" variant="light" leftSection={<IconAlertTriangle size={12} />}>
                Capienza superata
              </Badge>
            )}
          </Group>
        }
        sottotitolo={
          <>
            <Text fz="sm" component="span">
              {v.accordo.oggetto} · {v.accordo.ditta}
              {v.accordo.dec ? ` · ${v.accordo.dec}` : ''}
            </Text>
            <Text fz="xs" c="dimmed" mt={2} component="div">
              Stipula: <Protocollo numero={v.accordo.protocollo_stipula} data={v.accordo.data_stipula} />
              {v.accordo.durata_giorni ? ` · durata ${v.accordo.durata_giorni} giorni` : ''}
              {v.scadenza ? ` · scadenza ${formattaData(v.scadenza)}` : ''}
            </Text>
          </>
        }
        azioni={
          puoGestire ? (
            <>
              <Button variant="default" leftSection={<IconPencil size={16} />} onClick={() => setModaleAccordo(true)}>
                Modifica accordo
              </Button>
              <Button leftSection={<IconPlus size={16} />} onClick={() => setModaleAtto('nuovo')}>
                Nuovo atto di adesione
              </Button>
            </>
          ) : undefined
        }
      />

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md" mb="md">
        <RiquadroValore etichetta="Capienza contrattuale" valore={formattaEuro(v.accordo.importo)} dettaglio={`${v.atti.length} atti di adesione · ${v.nPds} PdS`} />
        <RiquadroValore
          etichetta="Capienza impegnata"
          valore={formattaPercentuale(v.quotaImpegnata)}
          sotto={<Meter rapporto={v.quotaImpegnata} etichetta="Capienza impegnata" />}
          dettaglio={
            <>
              Atti di adesione {formattaEuro(v.impegnatoAtti)}
              <br />
              Ordinativi diretti {formattaEuro(v.impegnatoDiretto)}
            </>
          }
        />
        <RiquadroValore
          etichetta="Residuo ordinabile"
          valore={formattaEuro(v.residuo)}
          dettaglio={v.superamento > 0 ? `Capienza superata di ${formattaEuro(v.superamento)}` : 'Capienza contrattuale ancora impegnabile'}
        />
        <RiquadroValore etichetta="Pagato sugli ordinativi" valore={formattaEuro(v.pagato)} dettaglio={`Ordinato ${formattaEuro(v.ordinato)}`} />
      </SimpleGrid>

      {v.superamento > 0 && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="Capienza contrattuale superata" mb="md">
          Atti di adesione e ordinativi diretti impegnano {formattaEuro(v.impegnato)} a fronte di una capienza di {formattaEuro(v.accordo.importo)}.
        </Alert>
      )}

      {v.accordo.note && (
        <Card mb="md">
          <Text fz="sm" className="testo-pre">
            {v.accordo.note}
          </Text>
        </Card>
      )}

      <Stack gap="md">
        <div>
          <Title order={3} fz="md" mb="xs">
            Atti di adesione a quantità indeterminata
          </Title>
          {v.atti.length === 0 ? (
            <Card>
              <StatoVuoto
                titolo="Nessun atto di adesione a quantità indeterminata"
                descrizione="Gli atti a quantità indeterminata impegnano la capienza dell’accordo quadro; i PdS collegati ne consumano la quota parte."
              />
            </Card>
          ) : (
            <Stack gap="md">
              {v.atti.map((a) => (
                <SchedaAtto
                  key={a.atto.id}
                  v={a}
                  puoGestire={puoGestire}
                  onModifica={() => setModaleAtto(a.atto)}
                  onElimina={() => eliminaAtto(a.atto, a.pds.length)}
                />
              ))}
            </Stack>
          )}
        </div>

        <Card>
          <Title order={3} fz="md" mb={4}>
            Atti di adesione a quantità determinata
          </Title>
          <Text fz="sm" c="dimmed" mb="sm">
            PdS collegati direttamente all’accordo quadro: impegnano insieme {formattaEuro(v.impegnatoDiretto)} di capienza.
          </Text>
          <TabellaOrdinativi pds={v.pdsDiretti} vuoto="Nessun PdS collegato direttamente a questo accordo quadro." />
        </Card>

        <Card>
          <Title order={3} fz="md" mb="sm">
            Tutti gli ordinativi dell’accordo quadro
          </Title>
          <TabellaOrdinativi pds={v.pds} vuoto="Nessun ordinativo emesso su questo accordo quadro." />
        </Card>
      </Stack>

      {modaleAtto && <ModaleAtto accordoId={v.accordo.id} atto={modaleAtto === 'nuovo' ? null : modaleAtto} onClose={() => setModaleAtto(null)} />}
      {modaleAccordo && <ModaleAccordo accordo={v.accordo} onClose={() => setModaleAccordo(false)} />}
    </>
  );
}
