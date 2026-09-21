import { ActionIcon, Anchor, Button, Card, Group, Modal, NumberInput, SimpleGrid, Stack, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconFileText, IconInfoCircle, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import type { VistaAccordo } from '../../domain/accordi';
import { DURATA_ATTO_PREDEFINITA } from '../../domain/tipi';
import { formattaData } from '../../domain/date';
import { formattaEuro, formattaPercentuale } from '../../domain/importi';
import { puo } from '../../domain/permessi';
import type { AccordoQuadro, Centesimi, DataISO } from '../../domain/tipi';
import { useDerivati } from '../../stato/derivati';
import { useApp } from '../../stato/store';
import { chiediConferma, useAzione } from '../componenti/azioni';
import { Importo, IntestazionePagina, Meter, Protocollo, StatoVuoto } from '../componenti/base';
import { useValoriDitta } from '../componenti/CampiPds';
import { CampoData, CampoImporto, CampoProtocollo } from '../componenti/campi';
import { MenuEsporta } from '../componenti/MenuEsporta';
import { rapportoAccordi } from '../../esportazione/rapporti';
import { Tabella, type Colonna } from '../componenti/Tabella';
import { href, naviga } from '../router';

/** Creazione e modifica di un accordo quadro. */
export function ModaleAccordo({ accordo, onClose }: { accordo: AccordoQuadro | null; onClose: () => void }) {
  const ditte = useValoriDitta();
  const [numero, setNumero] = useState(accordo?.numero ?? '');
  const [oggetto, setOggetto] = useState(accordo?.oggetto ?? '');
  const [ditta, setDitta] = useState(accordo?.ditta ?? '');
  const [dec, setDec] = useState(accordo?.dec ?? '');
  const [protocollo, setProtocollo] = useState<string | null>(accordo?.protocollo_stipula ?? null);
  const [dataStipula, setDataStipula] = useState<DataISO | null>(accordo?.data_stipula ?? null);
  const [durata, setDurata] = useState<number | ''>(accordo?.durata_giorni ?? 1095);
  const [importo, setImporto] = useState<Centesimi | null>(accordo?.importo ?? null);
  const [note, setNote] = useState(accordo?.note ?? '');
  const { inCorso, esegui } = useAzione();

  const dati = {
    numero: numero.trim(),
    oggetto: oggetto.trim(),
    ditta: ditta.trim(),
    dec: dec.trim() || null,
    protocollo_stipula: protocollo,
    data_stipula: dataStipula,
    durata_giorni: durata === '' ? null : durata,
    importo: importo ?? 0,
    note: note.trim() || null,
  };

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await esegui(async () => {
      if (accordo) {
        const modifiche: Record<string, unknown> = {};
        const originale: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(dati)) {
          if (v !== (accordo as unknown as Record<string, unknown>)[k]) {
            modifiche[k] = v;
            originale[k] = (accordo as unknown as Record<string, unknown>)[k];
          }
        }
        if (Object.keys(modifiche).length) await useApp.getState().esegui({ tipo: 'accordo.modifica', id: accordo.id, modifiche, originale });
      } else {
        await useApp.getState().esegui({ tipo: 'accordo.crea', dati });
      }
      return true;
    }, accordo ? 'Accordo quadro aggiornato.' : 'Accordo quadro creato.');
    if (ok) onClose();
  };

  return (
    <Modal opened onClose={onClose} size="lg" title={<Text fw={600}>{accordo ? 'Modifica accordo quadro' : 'Nuovo accordo quadro'}</Text>}>
      <form onSubmit={invia}>
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput label="Numero" description="Es. AQ 4/2026" value={numero} onChange={(e) => setNumero(e.currentTarget.value)} required maxLength={50} data-autofocus />
            <TextInput label="Ditta" value={ditta} onChange={(e) => setDitta(e.currentTarget.value)} required maxLength={300} list="ditte-accordo" />
            <datalist id="ditte-accordo">
              {ditte.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </SimpleGrid>
          <TextInput label="Oggetto" value={oggetto} onChange={(e) => setOggetto(e.currentTarget.value)} required maxLength={300} />
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <CampoProtocollo label="Protocollo di stipula" value={protocollo} onChange={setProtocollo} />
            <CampoData label="Data di stipula" value={dataStipula} onChange={setDataStipula} />
            <NumberInput
              label="Durata (giorni)"
              value={durata}
              onChange={(v) => setDurata(typeof v === 'number' ? v : '')}
              min={1}
              max={36500}
              allowDecimal={false}
              allowNegative={false}
            />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <CampoImporto label="Importo contrattuale" description="Capienza complessiva dell'accordo quadro" value={importo} onChange={setImporto} />
            <TextInput label="Collaboratore o DEC" value={dec} onChange={(e) => setDec(e.currentTarget.value)} maxLength={100} />
          </SimpleGrid>
          <Textarea label="Note" value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={2} maxRows={8} maxLength={5000} />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={inCorso} disabled={!numero.trim() || !oggetto.trim() || !ditta.trim()}>
              Salva
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function AccordiQuadro() {
  const { accordi } = useDerivati();
  const utente = useApp((s) => s.sessione?.utente);
  const puoGestire = puo(utente, 'accordi');
  const [modale, setModale] = useState<AccordoQuadro | 'nuovo' | null>(null);
  const { esegui } = useAzione();

  const elimina = async (v: VistaAccordo) => {
    const ok = await chiediConferma({
      titolo: 'Eliminare l’accordo quadro?',
      messaggio:
        v.atti.length > 0 || v.nPds > 0
          ? `All'accordo quadro ${v.accordo.numero} sono collegati ${v.atti.length} atti di adesione e ${v.nPds} PdS: vanno scollegati prima di eliminarlo.`
          : `L'accordo quadro ${v.accordo.numero} sarà eliminato.`,
      conferma: 'Elimina',
      pericolosa: true,
    });
    if (ok) await esegui(() => useApp.getState().esegui({ tipo: 'accordo.elimina', id: v.accordo.id }), 'Accordo quadro eliminato.');
  };

  const colonne: Colonna<VistaAccordo>[] = [
    {
      chiave: 'numero',
      titolo: 'Accordo quadro',
      ordina: (v) => v.accordo.numero,
      render: (v) => (
        <div style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Anchor href={href(`/accordi/${v.accordo.id}`)} fw={600} fz="sm" style={{ whiteSpace: 'nowrap' }}>
              {v.accordo.numero}
            </Anchor>
            {v.superamento > 0 && (
              <Tooltip label={`Capienza superata di ${formattaEuro(v.superamento)}`}>
                <IconAlertTriangle size={16} color="var(--pds-critico)" aria-label="Capienza contrattuale superata" />
              </Tooltip>
            )}
          </Group>
          <Text fz="xs" c="dimmed" lineClamp={1}>
            {v.accordo.oggetto}
          </Text>
        </div>
      ),
    },
    { chiave: 'ditta', titolo: 'Ditta', ordina: (v) => v.accordo.ditta, render: (v) => <Text fz="sm">{v.accordo.ditta}</Text> },
    { chiave: 'dec', titolo: 'Collaboratore/DEC', ordina: (v) => v.accordo.dec, render: (v) => <Text fz="sm">{v.accordo.dec ?? '—'}</Text> },
    {
      chiave: 'stipula',
      titolo: 'Stipula',
      ordina: (v) => v.accordo.data_stipula,
      render: (v) => <Protocollo numero={v.accordo.protocollo_stipula} data={v.accordo.data_stipula} />,
    },
    {
      chiave: 'scadenza',
      titolo: 'Scadenza',
      ordina: (v) => v.scadenza,
      render: (v) => (
        <div>
          <Text fz="sm" className="num">
            {formattaData(v.scadenza)}
          </Text>
          {v.accordo.durata_giorni != null && (
            <Text fz="xs" c="dimmed">
              {v.accordo.durata_giorni} giorni
            </Text>
          )}
        </div>
      ),
    },
    { chiave: 'importo', titolo: 'Capienza', allinea: 'right', ordina: (v) => v.accordo.importo, render: (v) => <Importo valore={v.accordo.importo} forte /> },
    {
      chiave: 'impegnato',
      titolo: 'Impegnato',
      allinea: 'right',
      ordina: (v) => v.impegnato,
      render: (v) => (
        <Stack gap={3} align="flex-end">
          <Importo valore={v.impegnato} />
          <div style={{ width: 110 }}>
            <Meter rapporto={v.quotaImpegnata} etichetta={`Capienza impegnata dell'accordo quadro ${v.accordo.numero}`} />
          </div>
          <Text fz="xs" c="dimmed" className="num">
            {formattaPercentuale(v.quotaImpegnata)}
          </Text>
        </Stack>
      ),
    },
    {
      chiave: 'residuo',
      titolo: 'Residuo ordinabile',
      allinea: 'right',
      ordina: (v) => v.residuo,
      render: (v) => <Importo valore={v.residuo} c={v.residuo < 0 ? 'red.7' : undefined} forte />,
    },
    { chiave: 'pagato', titolo: 'Pagato', allinea: 'right', ordina: (v) => v.pagato, render: (v) => <Importo valore={v.pagato} /> },
    {
      chiave: 'azioni',
      titolo: '',
      allinea: 'right',
      render: (v) =>
        puoGestire ? (
          <Group gap={2} justify="flex-end" wrap="nowrap">
            <ActionIcon variant="subtle" color="gray" onClick={() => setModale(v.accordo)} aria-label={`Modifica l'accordo quadro ${v.accordo.numero}`}>
              <IconPencil size={16} />
            </ActionIcon>
            <ActionIcon variant="subtle" color="red" onClick={() => elimina(v)} aria-label={`Elimina l'accordo quadro ${v.accordo.numero}`}>
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ) : null,
    },
  ];

  return (
    <>
      <IntestazionePagina
        titolo="Accordi quadro"
        sottotitolo="Capienza contrattuale di ogni accordo quadro, impegnata dagli atti di adesione e dagli ordinativi."
        azioni={
          <>
            <MenuEsporta rapporto={() => rapportoAccordi(accordi)} disabilitato={accordi.length === 0} />
            {puoGestire && (
              <Button leftSection={<IconPlus size={16} />} onClick={() => setModale('nuovo')}>
                Nuovo accordo quadro
              </Button>
            )}
          </>
        }
      />

      <Card padding={0}>
        <Tabella
          etichetta="Accordi quadro"
          righe={accordi}
          colonne={colonne}
          chiaveRiga={(v) => v.accordo.id}
          ordinamentoIniziale={{ chiave: 'numero', direzione: 'asc' }}
          onClickRiga={(v) => naviga(`/accordi/${v.accordo.id}`)}
          classeRiga={(v) => (v.superamento > 0 ? 'riga-scaduto' : undefined)}
          larghezzaMinima={1180}
          paginazione={false}
          scheda={(v) => (
            <Stack gap={4}>
              <Group justify="space-between" wrap="nowrap">
                <Anchor href={href(`/accordi/${v.accordo.id}`)} fw={700}>
                  {v.accordo.numero}
                </Anchor>
                {puoGestire && (
                  <Group gap={2}>
                    <ActionIcon variant="subtle" color="gray" onClick={() => setModale(v.accordo)} aria-label={`Modifica l'accordo quadro ${v.accordo.numero}`}>
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => elimina(v)} aria-label={`Elimina l'accordo quadro ${v.accordo.numero}`}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                )}
              </Group>
              <Text fz="xs" c="dimmed">
                {v.accordo.oggetto} · {v.accordo.ditta}
              </Text>
              <Meter rapporto={v.quotaImpegnata} etichetta="Capienza impegnata" />
              <Text fz="xs" c="dimmed">
                Impegnato {formattaEuro(v.impegnato)} su {formattaEuro(v.accordo.importo)} · residuo {formattaEuro(v.residuo)}
              </Text>
            </Stack>
          )}
          vuoto={
            <StatoVuoto
              icona={<IconFileText size={26} />}
              titolo="Nessun accordo quadro"
              descrizione={
                puoGestire
                  ? 'Inserisci il primo accordo quadro: potrai poi collegarvi gli atti di adesione e i PdS.'
                  : 'Gli accordi quadro sono gestiti dagli utenti abilitati.'
              }
            />
          }
        />
      </Card>

      {!puoGestire && (
        <Group gap="xs" mt="md">
          <IconInfoCircle size={16} />
          <Text fz="sm" c="dimmed">
            Visualizzazione in sola lettura: la gestione degli accordi quadro richiede il relativo permesso.
          </Text>
        </Group>
      )}

      {modale && <ModaleAccordo accordo={modale === 'nuovo' ? null : modale} onClose={() => setModale(null)} />}
    </>
  );
}

export { DURATA_ATTO_PREDEFINITA };
