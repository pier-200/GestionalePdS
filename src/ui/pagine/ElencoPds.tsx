import { Anchor, Badge, Button, Card, CloseButton, Group, MultiSelect, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconFilterOff, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useMemo } from 'react';
import type { PdsVista } from '../../domain/calcoli';
import { elencoIdv, etichettaCapitolo } from '../../domain/calcoli';
import { formattaPercentuale, sommaCentesimi } from '../../domain/importi';
import { isAdmin, puo } from '../../domain/permessi';
import { ELENCO_STATI, STATI, stipulaAvvenuta, type StatoPds } from '../../domain/stato';
import { rapportoElencoPds } from '../../esportazione/rapporti';
import { useDerivati } from '../../stato/derivati';
import { useApp } from '../../stato/store';
import { MenuEsporta } from '../componenti/MenuEsporta';
import { BadgeStato, DataConScadenza, Importo, IntestazionePagina, StatoVuoto } from '../componenti/base';
import { useValoriDec } from '../componenti/CampiPds';
import { ModaleNuovoPds } from '../componenti/ModaleNuovoPds';
import { SelettoreEsercizio, useEsercizioSelezionato } from '../componenti/SelettoreEsercizio';
import { Tabella, type Colonna } from '../componenti/Tabella';
import { aggiornaQuery, href, naviga, usePosizione } from '../router';

export function normalizzaRicerca(testo: string): string {
  return testo.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('it').trim();
}

function classeAvviso(v: PdsVista): string | undefined {
  return v.avviso === 'scaduto' ? 'riga-scaduto' : v.avviso === 'in_scadenza' ? 'riga-in-scadenza' : undefined;
}

/** IDV mostrati come elenco di etichette: un PdS può essere collegato a più IDV. */
export function ElencoIdv({ v }: { v: PdsVista }) {
  const idv = elencoIdv(v.pds);
  if (idv.length === 0) return <Text fz="sm" c="dimmed">—</Text>;
  return (
    <Group gap={4} wrap="wrap">
      {idv.map((x) => (
        <Badge key={x} size="sm" variant="default" className="num" style={{ maxWidth: 'none' }} styles={{ label: { overflow: 'visible' } }}>
          {x}
        </Badge>
      ))}
    </Group>
  );
}

export function colonneElencoPds(): Colonna<PdsVista>[] {
  return [
    { chiave: 'stato', titolo: 'Stato', ordina: (v) => STATI[v.stato].ordine, render: (v) => <BadgeStato stato={v.stato} />, larghezza: 124 },
    {
      chiave: 'numero',
      titolo: 'N. PdS',
      // ordinamento numerico all'interno dell'esercizio
      ordina: (v) => `${v.esercizio ?? 0}|${v.pds.numero.padStart(8, '0')}`,
      render: (v) => (
        <Anchor href={href(`/pds/${v.pds.id}`)} fw={600} fz="sm" style={{ whiteSpace: 'nowrap' }}>
          {v.numeroCompleto}
        </Anchor>
      ),
    },
    {
      chiave: 'capitolo',
      titolo: 'Capitolo',
      ordina: (v) => v.capitolo?.codice ?? '',
      render: (v) => (
        <Text fz="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>
          {v.capitolo ? etichettaCapitolo(v.capitolo, false) : '—'}
        </Text>
      ),
      larghezza: 110,
    },
    { chiave: 'ditta', titolo: 'Ditta', ordina: (v) => v.pds.ditta, render: (v) => <Text fz="sm">{v.pds.ditta ?? '—'}</Text> },
    { chiave: 'dec', titolo: 'Collaboratore/DEC', ordina: (v) => v.pds.dec, render: (v) => <Text fz="sm">{v.pds.dec ?? '—'}</Text> },
    { chiave: 'ordinativo', titolo: 'Ordinativo', ordina: (v) => v.pds.ordinativo, render: (v) => <Text fz="sm">{v.pds.ordinativo ?? '—'}</Text> },
    { chiave: 'idv', titolo: 'IDV', ordina: (v) => v.pds.idv, render: (v) => <ElencoIdv v={v} /> },
    { chiave: 'inviato', titolo: 'Inviato', allinea: 'right', ordina: (v) => v.pds.importo_inviato, render: (v) => <Importo valore={v.pds.importo_inviato} /> },
    {
      chiave: 'stipulato',
      titolo: 'Stipulato',
      allinea: 'right',
      ordina: (v) => (stipulaAvvenuta(v.pds) ? v.pds.valore_stipula : null),
      render: (v) =>
        stipulaAvvenuta(v.pds) ? (
          <Importo valore={v.pds.valore_stipula} />
        ) : v.pds.valore_stipula != null ? (
          <Text span fz="sm" c="dimmed" className="num" title="Stipula non ancora registrata (manca la data)">
            (<Importo valore={v.pds.valore_stipula} c="dimmed" />)
          </Text>
        ) : (
          <Text span fz="sm" c="dimmed">
            —
          </Text>
        ),
    },
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
              {formattaPercentuale(v.quotaPagata)} dello stipulato
            </Text>
          )}
        </div>
      ),
    },
    { chiave: 'scadenza', titolo: 'Scadenza', ordina: (v) => v.scadenza, render: (v) => <DataConScadenza data={v.scadenza} livello={v.avviso} giorni={v.giorniAllaScadenza} /> },
    { chiave: 'economia', titolo: 'Economia', allinea: 'right', ordina: (v) => v.economia, render: (v) => <Importo valore={v.economia} /> },
  ];
}

export function SchedaPds({ v }: { v: PdsVista }) {
  return (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Anchor href={href(`/pds/${v.pds.id}`)} fw={700}>
          PdS {v.numeroCompleto}
        </Anchor>
        <BadgeStato stato={v.stato} />
      </Group>
      <Text fz="xs" c="dimmed">
        {[v.capitolo ? `Cap. ${v.capitolo.codice}` : 'Capitolo non trovato', v.pds.ditta, v.pds.dec].filter(Boolean).join(' · ')}
      </Text>
      <Group gap="lg" mt={4} align="flex-start">
        <div>
          <Text fz={11} c="dimmed">
            Inviato
          </Text>
          <Importo valore={v.pds.importo_inviato} />
        </div>
        <div>
          <Text fz={11} c="dimmed">
            Stipulato
          </Text>
          <Importo valore={stipulaAvvenuta(v.pds) ? v.pds.valore_stipula : null} />
        </div>
        <div>
          <Text fz={11} c="dimmed">
            Pagato
          </Text>
          <Importo valore={v.totalePagato} />
        </div>
        <div>
          <Text fz={11} c="dimmed">
            Scadenza
          </Text>
          <DataConScadenza data={v.scadenza} livello={v.avviso} giorni={v.giorniAllaScadenza} />
        </div>
      </Group>
    </Stack>
  );
}

export function PiedeTotali({ righe, colonne }: { righe: PdsVista[]; colonne: number }) {
  const inviato = sommaCentesimi(righe.map((v) => v.pds.importo_inviato));
  const stipulato = sommaCentesimi(righe.filter((v) => stipulaAvvenuta(v.pds)).map((v) => v.pds.valore_stipula));
  const pagato = sommaCentesimi(righe.map((v) => v.totalePagato));
  const economie = sommaCentesimi(righe.map((v) => v.economia));
  return (
    <Table.Tfoot>
      <Table.Tr style={{ borderTop: '2px solid var(--mantine-color-default-border)' }}>
        <Table.Td colSpan={colonne - 5}>
          <Text fz="sm" fw={600}>
            Totale ({righe.length} PdS)
          </Text>
        </Table.Td>
        <Table.Td ta="right">
          <Importo valore={inviato} forte />
        </Table.Td>
        <Table.Td ta="right">
          <Importo valore={stipulato} forte />
        </Table.Td>
        <Table.Td ta="right">
          <Importo valore={pagato} forte />
        </Table.Td>
        <Table.Td />
        <Table.Td ta="right">
          <Importo valore={economie} forte />
        </Table.Td>
      </Table.Tr>
    </Table.Tfoot>
  );
}

export function ElencoPds() {
  const { viste, visteEliminate } = useDerivati();
  const capitoli = useApp((s) => s.dati.capitoli);
  const utente = useApp((s) => s.sessione?.utente);
  const valoriDec = useValoriDec();
  const { query } = usePosizione();
  const { anno } = useEsercizioSelezionato();
  const [nuovoAperto, { open: apriNuovo, close: chiudiNuovo }] = useDisclosure(false);

  const q = query.get('q') ?? '';
  const capitolo = query.get('capitolo');
  const statoQuery = query.get('stato') ?? '';
  const stati = useMemo(() => statoQuery.split(',').filter((s): s is StatoPds => s in STATI), [statoQuery]);
  const dec = query.get('dec');
  const avviso = query.get('avviso');

  const dellEsercizio = useMemo(() => viste.filter((v) => v.esercizio === anno), [viste, anno]);
  const codiciCapitolo = useMemo(
    () =>
      capitoli
        .filter((c) => c.esercizio === anno)
        .sort((a, b) => a.codice.localeCompare(b.codice, 'it', { numeric: true }))
        .map((c) => ({ value: c.codice, label: c.codice })),
    [capitoli, anno],
  );

  const filtrate = useMemo(() => {
    const testo = normalizzaRicerca(q);
    return dellEsercizio.filter((v) => {
      if (capitolo && v.capitolo?.codice !== capitolo) return false;
      if (stati.length && !stati.includes(v.stato)) return false;
      if (dec && (v.pds.dec ?? '').trim() !== dec) return false;
      if (avviso === 'scaduti' && v.avviso !== 'scaduto') return false;
      if (avviso === 'in_scadenza' && v.avviso !== 'in_scadenza') return false;
      if (avviso === 'tutti' && v.avviso == null) return false;
      if (testo) {
        const campi = [
          v.numeroCompleto,
          v.pds.ditta,
          v.pds.ordinativo,
          v.pds.idv,
          v.accordo?.numero,
          v.accordo?.oggetto,
          v.atto?.numero,
          v.pds.protocollo_invio,
          v.pds.protocollo_stipula,
          v.pds.dec,
          v.capitolo?.codice,
        ];
        if (!campi.some((c) => c && normalizzaRicerca(c).includes(testo))) return false;
      }
      return true;
    });
  }, [dellEsercizio, q, capitolo, stati, dec, avviso]);

  const filtriAttivi = Boolean(q || capitolo || stati.length || dec || avviso);
  const colonne = useMemo(colonneElencoPds, []);

  return (
    <>
      <IntestazionePagina
        titolo="Progetti di spesa"
        sottotitolo={
          filtriAttivi
            ? `${filtrate.length} PdS su ${dellEsercizio.length} dell'esercizio ${anno} corrispondono ai filtri`
            : `${dellEsercizio.length} PdS registrati nell'esercizio ${anno}`
        }
        azioni={
          <>
            <SelettoreEsercizio />
            {isAdmin(utente) && (
              <Button variant="default" leftSection={<IconTrash size={16} />} component="a" href={href('/pds-eliminati')}>
                PdS eliminati{visteEliminate.length > 0 ? ` (${visteEliminate.length})` : ''}
              </Button>
            )}
            <MenuEsporta
              rapporto={() => rapportoElencoPds(filtrate, anno)}
              disabilitato={filtrate.length === 0}
              etichetta={filtriAttivi ? 'Esporta i PdS filtrati' : 'Esporta i PdS dell’esercizio'}
            />
            {puo(utente, 'pds_crea') && (
              <Button leftSection={<IconPlus size={16} />} onClick={apriNuovo}>
                Nuovo PdS
              </Button>
            )}
          </>
        }
      />

      <Card padding="sm" mb="md" className="no-stampa">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <TextInput
            aria-label="Cerca"
            placeholder="Cerca per numero PdS, ditta, ordinativo, IDV, protocollo…"
            leftSection={<IconSearch size={16} />}
            value={q}
            onChange={(e) => aggiornaQuery({ q: e.currentTarget.value })}
            rightSection={q ? <CloseButton size="sm" aria-label="Cancella ricerca" onClick={() => aggiornaQuery({ q: null })} /> : null}
            style={{ flex: '1 1 260px' }}
          />
          <Select
            aria-label="Capitolo di spesa"
            placeholder="Tutti i capitoli"
            data={codiciCapitolo}
            value={capitolo}
            onChange={(v) => aggiornaQuery({ capitolo: v })}
            clearable
            searchable
            w={{ base: '100%', sm: 190 }}
            comboboxProps={{ width: 260, position: 'bottom-start' }}
          />
          <MultiSelect
            aria-label="Stato"
            placeholder={stati.length ? undefined : 'Tutti gli stati'}
            data={ELENCO_STATI.map((s) => ({ value: s, label: STATI[s].etichetta }))}
            value={stati}
            onChange={(v) => aggiornaQuery({ stato: v.join(',') })}
            clearable
            w={{ base: '100%', sm: 230 }}
          />
          <Select aria-label="Collaboratore o DEC" placeholder="Tutti i DEC" data={valoriDec} value={dec} onChange={(v) => aggiornaQuery({ dec: v })} clearable searchable w={{ base: '100%', sm: 200 }} />
          <Select
            aria-label="Avvisi di scadenza"
            placeholder="Qualsiasi scadenza"
            data={[
              { value: 'tutti', label: 'Con avviso di scadenza' },
              { value: 'scaduti', label: 'Scaduti non saldati' },
              { value: 'in_scadenza', label: 'In scadenza' },
            ]}
            value={avviso}
            onChange={(v) => aggiornaQuery({ avviso: v })}
            clearable
            w={{ base: '100%', sm: 210 }}
          />
          {filtriAttivi && (
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconFilterOff size={16} />}
              onClick={() => naviga(`/pds?esercizio=${anno}`, { sostituisci: true })}
            >
              Azzera filtri
            </Button>
          )}
        </Group>
      </Card>

      <Card padding={0}>
        <Tabella
          etichetta="Elenco dei progetti di spesa"
          righe={filtrate}
          colonne={colonne}
          chiaveRiga={(v) => v.pds.id}
          ordinamentoIniziale={{ chiave: 'numero', direzione: 'desc' }}
          onClickRiga={(v) => naviga(`/pds/${v.pds.id}`)}
          classeRiga={classeAvviso}
          classeScheda={(v) => (v.avviso === 'scaduto' ? 'card-scaduto' : v.avviso === 'in_scadenza' ? 'card-in-scadenza' : undefined)}
          scheda={(v) => <SchedaPds v={v} />}
          piede={<PiedeTotali righe={filtrate} colonne={colonne.length} />}
          larghezzaMinima={1320}
          vuoto={
            <StatoVuoto
              titolo={dellEsercizio.length === 0 ? `Nessun PdS nell'esercizio ${anno}` : 'Nessun PdS corrisponde ai filtri'}
              descrizione={
                dellEsercizio.length === 0
                  ? 'Inserisci il primo progetto di spesa con il pulsante «Nuovo PdS».'
                  : 'Modifica o azzera i filtri per vedere altri risultati.'
              }
            />
          }
        />
      </Card>

      <ModaleNuovoPds aperto={nuovoAperto} onClose={chiudiNuovo} />
    </>
  );
}
