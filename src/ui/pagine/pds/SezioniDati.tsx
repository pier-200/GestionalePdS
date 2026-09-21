import { Anchor, Group, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea } from '@mantine/core';
import { IconCalendarTime, IconId, IconNote, IconSend, IconSignature } from '@tabler/icons-react';
import { etichettaAtto } from '../../../domain/accordi';
import type { PdsVista } from '../../../domain/calcoli';
import { etichettaCapitolo } from '../../../domain/calcoli';
import { descriviGiorni, formattaData } from '../../../domain/date';
import { formattaEuro, formattaPercentuale, rapporto } from '../../../domain/importi';
import { puo } from '../../../domain/permessi';
import { dataScadenza } from '../../../domain/stato';
import type { ModalitaTermine, UnitaDurata } from '../../../domain/tipi';
import { useApp } from '../../../stato/store';
import { Campo, IndicatoreScadenza, Importo, Protocollo, Testo } from '../../componenti/base';
import { CampiIdentificativiPds } from '../../componenti/CampiPds';
import { CampoData, CampoImporto, CampoProtocollo } from '../../componenti/campi';
import { href } from '../../router';
import { ElencoIdv } from '../ElencoPds';
import { GrigliaCampi, SezioneModificabile } from './SezioneModificabile';

interface PropsSezione {
  vista: PdsVista;
}

function usePuoDati(vista: PdsVista) {
  const utente = useApp((s) => s.sessione?.utente);
  return puo(utente, 'pds_dati', vista.capitolo);
}

const CAMPI_IDENTIFICATIVI = ['numero', 'capitolo_id', 'accordo_id', 'atto_adesione_id', 'ditta', 'ordinativo', 'idv', 'dec'] as const;

export function SezioneIdentificativi({ vista }: PropsSezione) {
  const puoModificare = usePuoDati(vista);
  const p = vista.pds;
  return (
    <SezioneModificabile
      titolo="Dati identificativi"
      icona={<IconId size={18} />}
      pds={p}
      campi={CAMPI_IDENTIFICATIVI}
      puoModificare={puoModificare}
      verifica={(v) =>
        !v.numero?.trim()
          ? 'Il numero del PdS è obbligatorio.'
          : !/^\d{1,20}$/.test(v.numero.trim())
            ? 'Il numero del PdS deve contenere solo cifre: l’anno arriva dall’esercizio finanziario.'
            : !v.capitolo_id
              ? 'Selezionare il capitolo di spesa.'
              : null
      }
      lettura={
        <GrigliaCampi>
          <Campo etichetta="Numero del progetto di spesa">
            <Text fz="sm" fw={600} className="num">
              {vista.numeroCompleto}
            </Text>
          </Campo>
          <Campo etichetta="Esercizio finanziario">
            <Testo valore={vista.esercizio != null ? String(vista.esercizio) : null} />
          </Campo>
          <Campo etichetta="Capitolo di spesa">
            <Testo valore={vista.capitolo ? etichettaCapitolo(vista.capitolo, false) : 'Capitolo non trovato'} />
          </Campo>
          <Campo etichetta="Ditta">
            <Testo valore={p.ditta} />
          </Campo>
          <Campo etichetta="Accordo quadro">
            {vista.accordo ? (
              <Anchor href={href(`/accordi/${vista.accordo.id}`)} fz="sm">
                {vista.accordo.numero} – {vista.accordo.oggetto}
              </Anchor>
            ) : (
              <Testo valore={null} />
            )}
          </Campo>
          <Campo etichetta="Atto di adesione">
            <Testo valore={vista.atto ? etichettaAtto(vista.atto) : null} />
          </Campo>
          <Campo etichetta="Ordinativo">
            <Testo valore={p.ordinativo} />
          </Campo>
          <Campo etichetta="IDV">
            <ElencoIdv v={vista} />
          </Campo>
          <Campo etichetta="Collaboratore o DEC">
            <Testo valore={p.dec} />
          </Campo>
        </GrigliaCampi>
      }
      modifica={(v, imposta) => (
        <CampiIdentificativiPds
          valori={{ ...v, numero: v.numero ?? '', capitolo_id: v.capitolo_id ?? null }}
          // il capitolo resta obbligatorio: un azzeramento dalla tendina non viene propagato
          imposta={(campo, valore) => {
            if (campo === 'capitolo_id' && valore == null) return;
            imposta(campo as (typeof CAMPI_IDENTIFICATIVI)[number], valore as never);
          }}
          area="pds_dati"
        />
      )}
    />
  );
}

export function SezioneInvio({ vista }: PropsSezione) {
  const puoModificare = usePuoDati(vista);
  const p = vista.pds;
  return (
    <SezioneModificabile
      titolo="Invio del progetto"
      icona={<IconSend size={18} />}
      pds={p}
      campi={['importo_inviato', 'protocollo_invio', 'data_invio'] as const}
      puoModificare={puoModificare}
      lettura={
        <GrigliaCampi>
          <Campo etichetta="Importo del PdS inviato">
            <Importo valore={p.importo_inviato} forte />
          </Campo>
          <Campo etichetta="Protocollo di invio">
            <Protocollo numero={p.protocollo_invio} data={p.data_invio} />
          </Campo>
        </GrigliaCampi>
      }
      modifica={(v, imposta) => (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <CampoImporto label="Importo del PdS inviato" value={v.importo_inviato} onChange={(x) => imposta('importo_inviato', x)} />
          <CampoProtocollo label="Numero di protocollo" value={v.protocollo_invio} onChange={(x) => imposta('protocollo_invio', x)} />
          <CampoData label="Data del protocollo (data di invio)" value={v.data_invio} onChange={(x) => imposta('data_invio', x)} />
        </SimpleGrid>
      )}
    />
  );
}

export function SezioneStipula({ vista }: PropsSezione) {
  const puoModificare = usePuoDati(vista);
  const p = vista.pds;
  const differenza = p.valore_stipula != null && p.importo_inviato != null ? p.valore_stipula - p.importo_inviato : null;
  return (
    <SezioneModificabile
      titolo="Stipula"
      icona={<IconSignature size={18} />}
      pds={p}
      campi={['protocollo_stipula', 'data_stipula', 'valore_stipula'] as const}
      puoModificare={puoModificare}
      lettura={
        <GrigliaCampi>
          <Campo etichetta="Valore della stipula">
            <Importo valore={p.valore_stipula} forte />
            {differenza != null && differenza !== 0 && (
              <Text fz="xs" c="dimmed" className="num">
                {differenza < 0 ? '' : '+'}
                {formattaEuro(differenza)} rispetto all'inviato ({formattaPercentuale(rapporto(differenza, p.importo_inviato ?? 0))})
              </Text>
            )}
          </Campo>
          <Campo etichetta="Protocollo di stipula">
            <Protocollo numero={p.protocollo_stipula} data={p.data_stipula} />
          </Campo>
        </GrigliaCampi>
      }
      modifica={(v, imposta) => (
        <Stack gap="xs">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <CampoImporto label="Valore della stipula" value={v.valore_stipula} onChange={(x) => imposta('valore_stipula', x)} />
            <CampoProtocollo label="Numero di protocollo" value={v.protocollo_stipula} onChange={(x) => imposta('protocollo_stipula', x)} />
            <CampoData label="Data del protocollo (data di stipula)" value={v.data_stipula} onChange={(x) => imposta('data_stipula', x)} />
          </SimpleGrid>
          <Text fz="xs" c="dimmed">
            La stipula è considerata avvenuta quando è indicata la data di stipula: da quel momento il PdS risulta stipulato (in esecuzione).
          </Text>
        </Stack>
      )}
    />
  );
}

export function SezioneTempi({ vista }: PropsSezione) {
  const puoModificare = usePuoDati(vista);
  const p = vista.pds;
  return (
    <SezioneModificabile
      titolo="Tempi di esecuzione"
      icona={<IconCalendarTime size={18} />}
      pds={p}
      campi={['modalita_termine', 'durata', 'durata_unita', 'data_termine'] as const}
      puoModificare={puoModificare}
      verifica={(v) =>
        v.modalita_termine === 'durata' && (v.durata == null || v.durata <= 0)
          ? 'Indicare la durata di esecuzione.'
          : v.modalita_termine === 'data' && !v.data_termine
            ? 'Indicare la data di scadenza.'
            : null
      }
      lettura={
        <GrigliaCampi>
          <Campo etichetta="Modalità">
            <Testo
              valore={p.modalita_termine === 'durata' ? 'Durata calcolata dalla stipula' : p.modalita_termine === 'data' ? 'Data di scadenza fissa' : 'Non definita'}
            />
          </Campo>
          {p.modalita_termine === 'durata' && (
            <Campo etichetta="Durata">
              <Testo valore={p.durata != null ? `${p.durata} ${p.durata_unita ?? 'giorni'}` : null} />
            </Campo>
          )}
          <Campo etichetta="Scadenza per l'esecuzione">
            {vista.scadenza ? (
              <Group gap="xs">
                <Text fz="sm" fw={600} className="num">
                  {formattaData(vista.scadenza)}
                </Text>
                {vista.avviso ? (
                  <IndicatoreScadenza livello={vista.avviso} giorni={vista.giorniAllaScadenza} />
                ) : (
                  !p.saldato &&
                  vista.giorniAllaScadenza != null && (
                    <Text fz="xs" c="dimmed">
                      {descriviGiorni(vista.giorniAllaScadenza)}
                    </Text>
                  )
                )}
              </Group>
            ) : (
              <Text fz="sm" c="dimmed">
                {p.modalita_termine === 'durata' && !p.data_stipula ? 'Sarà calcolata dalla data di stipula' : '—'}
              </Text>
            )}
          </Campo>
        </GrigliaCampi>
      }
      modifica={(v, imposta) => {
        const anteprima = dataScadenza({ ...v, durata_unita: v.durata_unita ?? 'giorni', data_stipula: p.data_stipula });
        return (
          <Stack gap="sm">
            <SegmentedControl
              value={v.modalita_termine ?? 'nessuna'}
              onChange={(x) => {
                imposta('modalita_termine', x === 'nessuna' ? null : (x as ModalitaTermine));
                if (x === 'durata' && !v.durata_unita) imposta('durata_unita', 'giorni');
              }}
              data={[
                { value: 'durata', label: 'Durata dalla stipula' },
                { value: 'data', label: 'Data fissa' },
                { value: 'nessuna', label: 'Non definita' },
              ]}
              fullWidth
            />
            {v.modalita_termine === 'durata' && (
              <SimpleGrid cols={{ base: 2 }} spacing="sm">
                <NumberInput
                  label="Durata"
                  value={v.durata ?? ''}
                  onChange={(x) => imposta('durata', typeof x === 'number' ? Math.trunc(x) : null)}
                  min={1}
                  allowDecimal={false}
                  allowNegative={false}
                />
                <Select
                  label="Unità"
                  data={[
                    { value: 'giorni', label: 'giorni' },
                    { value: 'mesi', label: 'mesi' },
                  ]}
                  value={v.durata_unita ?? 'giorni'}
                  onChange={(x) => imposta('durata_unita', (x as UnitaDurata) ?? 'giorni')}
                  allowDeselect={false}
                />
              </SimpleGrid>
            )}
            {v.modalita_termine === 'data' && <CampoData label="Data di scadenza per l'esecuzione" value={v.data_termine} onChange={(x) => imposta('data_termine', x)} maw={260} />}
            {v.modalita_termine === 'durata' && (
              <Text fz="sm" c={anteprima ? undefined : 'dimmed'}>
                {anteprima
                  ? `Scadenza calcolata: ${formattaData(anteprima)} (dalla stipula del ${formattaData(p.data_stipula)})`
                  : 'La scadenza sarà calcolata quando saranno presenti la data di stipula e la durata.'}
              </Text>
            )}
          </Stack>
        );
      }}
    />
  );
}

export function SezioneNote({ vista }: PropsSezione) {
  const puoModificare = usePuoDati(vista);
  const p = vista.pds;
  return (
    <SezioneModificabile
      titolo="Note"
      icona={<IconNote size={18} />}
      pds={p}
      campi={['note'] as const}
      puoModificare={puoModificare}
      lettura={p.note ? <Testo valore={p.note} /> : <Text fz="sm" c="dimmed">Nessuna nota.</Text>}
      modifica={(v, imposta) => (
        <Textarea aria-label="Note" value={v.note ?? ''} onChange={(e) => imposta('note', e.currentTarget.value)} autosize minRows={4} maxRows={14} maxLength={5000} />
      )}
    />
  );
}
