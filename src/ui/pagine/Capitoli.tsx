import { ActionIcon, Alert, Anchor, Badge, Button, Card, Checkbox, FileButton, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCopy, IconInfoCircle, IconPencil, IconPlus, IconRefresh, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { annoDi } from '../../domain/date';
import { confrontoNaturale, eserciziDisponibili, etichettaCapitolo } from '../../domain/calcoli';
import { formattaEuro, sommaCentesimi } from '../../domain/importi';
import { isAdmin, puo } from '../../domain/permessi';
import { calcolaSintesi, inSforamento, sforamentoDaSegnalare, type RigaSintesi } from '../../domain/sintesi';
import { leggiExportSiefin } from '../../domain/siefin';
import type { Capitolo, Centesimi, RigaSiefin } from '../../domain/tipi';
import { chiaveCapitolo } from '../../domain/validazione';
import { useDerivati } from '../../stato/derivati';
import { useApp } from '../../stato/store';
import { chiediConferma, notificaErrore, notificaSuccesso, useAzione } from '../componenti/azioni';
import { Importo, IntestazionePagina, NomeCapitolo, StatoVuoto } from '../componenti/base';
import { CampoImporto } from '../componenti/campi';
import { SelettoreEsercizio, useEsercizioSelezionato } from '../componenti/SelettoreEsercizio';
import { MenuEsporta } from '../componenti/MenuEsporta';
import { rapportoCapitoli } from '../../esportazione/rapporti';
import { Tabella, type Colonna } from '../componenti/Tabella';
import { aggiornaQuery, href } from '../router';

function totaleIdv(c: Pick<Capitolo, 'idv'>): Centesimi {
  return sommaCentesimi((c.idv ?? []).map((f) => f.assegnato));
}

function ModaleCapitolo({ capitolo, esercizioPredefinito, onClose }: { capitolo: Capitolo | null; esercizioPredefinito: number; onClose: () => void }) {
  const [esercizio, setEsercizio] = useState<number | ''>(capitolo?.esercizio ?? esercizioPredefinito);
  const [codice, setCodice] = useState(capitolo?.codice ?? '');
  const [decreto, setDecreto] = useState(capitolo?.decreto ?? '');
  const [finanziato, setFinanziato] = useState<Centesimi | null>(capitolo?.finanziato ?? null);
  const { inCorso, esegui } = useAzione();

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    if (esercizio === '') return;
    const dati = { esercizio, codice, decreto, finanziato: finanziato ?? 0 };
    const ok = await esegui(async () => {
      if (capitolo) {
        const modifiche: Record<string, unknown> = {};
        const originale: Record<string, unknown> = {};
        for (const k of ['esercizio', 'codice', 'decreto', 'finanziato'] as const) {
          const nuovo = typeof dati[k] === 'string' ? (dati[k] as string).trim() : dati[k];
          // il decreto manca nei capitoli creati prima della sua introduzione
          if (nuovo !== (capitolo[k] ?? '')) {
            modifiche[k] = nuovo;
            originale[k] = capitolo[k];
          }
        }
        if (Object.keys(modifiche).length) await useApp.getState().esegui({ tipo: 'capitolo.modifica', id: capitolo.id, modifiche, originale });
      } else {
        await useApp.getState().esegui({ tipo: 'capitolo.crea', dati: { ...dati, descrizione: '', sforamento_ignorato: false, sforamento_note: '' } });
      }
      return true;
    }, capitolo ? 'Capitolo aggiornato.' : 'Capitolo creato.');
    if (ok) onClose();
  };

  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>{capitolo ? 'Modifica capitolo di spesa' : 'Nuovo capitolo di spesa'}</Text>}>
      <form onSubmit={invia}>
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <NumberInput
              label="Esercizio finanziario"
              value={esercizio}
              onChange={(v) => setEsercizio(typeof v === 'number' ? v : '')}
              min={2000}
              max={2100}
              allowDecimal={false}
              allowNegative={false}
              thousandSeparator=""
              required
            />
            <TextInput label="Codice capitolo" description="Es. 1189/7/61 (CPT/ART/PTF)" value={codice} onChange={(e) => setCodice(e.currentTarget.value)} required maxLength={50} data-autofocus />
          </SimpleGrid>
          <TextInput
            label="Decreto"
            description="Distingue i capitoli con lo stesso codice (es. Fuori Area 2026 - Anticipazione)"
            value={decreto}
            onChange={(e) => setDecreto(e.currentTarget.value)}
            maxLength={100}
          />
          <CampoImporto
            label="Fondi aggiunti manualmente"
            description={capitolo?.idv?.length ? `Si sommano ai ${formattaEuro(totaleIdv(capitolo))} degli IDV allineati dal SIEFIN` : 'Si sommano ai fondi degli IDV allineati dal SIEFIN'}
            value={finanziato}
            onChange={setFinanziato}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={inCorso} disabled={esercizio === '' || !codice.trim()}>
              Salva
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/** Autorizzazione del superamento del finanziato: riservata all'amministratore. */
function ModaleSforamento({ riga, onClose }: { riga: RigaSintesi; onClose: () => void }) {
  const c = riga.capitolo;
  const [ignorato, setIgnorato] = useState(c.sforamento_ignorato);
  const [note, setNote] = useState(c.sforamento_note);
  const { inCorso, esegui } = useAzione();

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await esegui(
      () =>
        useApp.getState().esegui({
          tipo: 'capitolo.modifica',
          id: c.id,
          modifiche: { sforamento_ignorato: ignorato, sforamento_note: ignorato ? note : '' },
          originale: { sforamento_ignorato: c.sforamento_ignorato, sforamento_note: c.sforamento_note },
        }),
      ignorato ? 'Superamento del finanziato autorizzato.' : 'Autorizzazione al superamento revocata.',
    );
    if (ok) onClose();
  };

  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>Superamento del finanziato – capitolo {c.codice}</Text>}>
      <form onSubmit={invia}>
        <Stack gap="sm">
          <Text fz="sm" c="dimmed">
            Finanziato {formattaEuro(riga.finanziato)} · impegnato (stipulato) {formattaEuro(riga.stipulato)} · impegnato (trasmesso){' '}
            {formattaEuro(riga.inviato)}.
          </Text>
          <Checkbox
            label="Ignora l’avviso di superamento su questo capitolo"
            description="L’avviso rosso non verrà più mostrato; la motivazione resta registrata nello storico."
            checked={ignorato}
            onChange={(e) => setIgnorato(e.currentTarget.checked)}
          />
          <Textarea
            label="Motivazione"
            description="Obbligatoria per ignorare l’avviso (es. variazione di bilancio richiesta)."
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            autosize
            minRows={3}
            maxRows={8}
            maxLength={5000}
            disabled={!ignorato}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={inCorso} disabled={ignorato && !note.trim()}>
              Salva
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/** Dettaglio degli IDV del capitolo: le voci di spesa che ne compongono i fondi SIEFIN. */
function ModaleIdv({ capitolo, onClose }: { capitolo: Capitolo; onClose: () => void }) {
  const idv = capitolo.idv ?? [];
  return (
    <Modal opened onClose={onClose} size="xl" title={<Text fw={600}>IDV del capitolo {etichettaCapitolo(capitolo, false)}</Text>}>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing={6} fz="sm" aria-label="IDV del capitolo">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>IDV</Table.Th>
              <Table.Th>Voce di spesa</Table.Th>
              <Table.Th>Attività</Table.Th>
              <Table.Th ta="right">Assegnato</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {idv.map((f) => (
              <Table.Tr key={f.idv}>
                <Table.Td className="num" fw={600}>
                  {f.idv}
                </Table.Td>
                <Table.Td>
                  {f.voce || '—'}
                  <Text fz="xs" c="dimmed">
                    {f.pc3}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Tooltip label={f.desc_attivita} disabled={!f.desc_attivita} multiline maw={420}>
                    <Text span fz="sm">
                      {f.cod_attivita || '—'}
                    </Text>
                  </Tooltip>
                </Table.Td>
                <Table.Td ta="right">
                  <Importo valore={f.assegnato} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Td colSpan={3} fw={600}>
                Totale SIEFIN ({idv.length} IDV){capitolo.finanziato > 0 ? ` · più ${formattaEuro(capitolo.finanziato)} aggiunti manualmente` : ''}
              </Table.Td>
              <Table.Td ta="right">
                <Importo valore={totaleIdv(capitolo)} forte />
              </Table.Td>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
    </Modal>
  );
}

/** Anteprima dell'export SIEFIN caricato: l'allineamento parte solo dopo la conferma. */
function ModaleSiefin({ righe, nomeFile, esercizioPredefinito, onClose }: { righe: RigaSiefin[]; nomeFile: string; esercizioPredefinito: number; onClose: () => void }) {
  const capitoli = useApp((s) => s.dati.capitoli);
  // l'export si riferisce a un solo esercizio: lo propone la data nel nome del file (Export_gg_mm_aaaa …)
  const [esercizio, setEsercizio] = useState<number | ''>(Number(/^Export_\d{2}_\d{2}_(\d{4})/i.exec(nomeFile)?.[1]) || esercizioPredefinito);
  const { inCorso, esegui } = useAzione();

  const gruppi = useMemo(() => {
    const esistenti = new Set(capitoli.map(chiaveCapitolo));
    const mappa = new Map<string, { nome: string; nIdv: number; totale: Centesimi; nuovo: boolean }>();
    for (const r of righe) {
      const nome = etichettaCapitolo({ ...r, esercizio: 0 }, false);
      const g = mappa.get(nome) ?? { nome, nIdv: 0, totale: 0, nuovo: esercizio === '' || !esistenti.has(chiaveCapitolo({ ...r, esercizio })) };
      g.nIdv++;
      g.totale += r.assegnato;
      mappa.set(nome, g);
    }
    return [...mappa.values()].sort((a, b) => confrontoNaturale(a.nome, b.nome));
  }, [righe, capitoli, esercizio]);
  const nuovi = gruppi.filter((g) => g.nuovo).length;

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    if (esercizio === '') return;
    const risultato = await esegui(() => useApp.getState().esegui({ tipo: 'capitoli.allinea', esercizio, righe }));
    if (risultato) {
      notificaSuccesso(risultato.conteggio ? `Allineamento SIEFIN completato: ${risultato.conteggio} capitoli aggiornati.` : 'Capitoli già allineati al SIEFIN: nessuna variazione.');
      aggiornaQuery({ esercizio: String(esercizio) });
      onClose();
    }
  };

  return (
    <Modal opened onClose={onClose} size="lg" title={<Text fw={600}>Allineamento SIEFIN</Text>}>
      <form onSubmit={invia}>
        <Stack gap="sm">
          <Text fz="sm" c="dimmed">
            {nomeFile}: {righe.length} IDV su {gruppi.length} capitoli, per {formattaEuro(sommaCentesimi(righe.map((r) => r.assegnato)))} assegnati. Gli IDV di questi capitoli vengono
            sostituiti da quelli del file (non sommati); i fondi aggiunti manualmente e i capitoli assenti dal file restano invariati.
          </Text>
          <NumberInput
            label="Esercizio finanziario dell'export"
            description="Tutti gli IDV del file vengono allineati su questo esercizio"
            value={esercizio}
            onChange={(v) => setEsercizio(typeof v === 'number' ? v : '')}
            min={2000}
            max={2100}
            allowDecimal={false}
            allowNegative={false}
            thousandSeparator=""
            required
            maw={320}
          />
          <Table.ScrollContainer minWidth={420} mah={320} style={{ overflowY: 'auto' }}>
            <Table verticalSpacing={4} fz="sm" aria-label="Capitoli presenti nell'export SIEFIN">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Capitolo</Table.Th>
                  <Table.Th ta="right">IDV</Table.Th>
                  <Table.Th ta="right">Assegnato</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {gruppi.map((g) => (
                  <Table.Tr key={g.nome}>
                    <Table.Td>
                      {g.nome}{' '}
                      {g.nuovo && (
                        <Badge size="xs" variant="light" style={{ maxWidth: 'none' }} styles={{ label: { overflow: 'visible' } }}>
                          Nuovo
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td ta="right" className="num">
                      {g.nIdv}
                    </Table.Td>
                    <Table.Td ta="right">
                      <Importo valore={g.totale} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group justify="space-between" mt="sm">
            <Text fz="sm" c="dimmed">
              {nuovi} capitoli nuovi · {gruppi.length - nuovi} già presenti
            </Text>
            <Group>
              <Button variant="default" onClick={onClose}>
                Annulla
              </Button>
              <Button type="submit" loading={inCorso} disabled={esercizio === ''}>
                Allinea{esercizio === '' ? '' : ` sull'esercizio ${esercizio}`}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function ModaleCopia({ anni, annoCorrente, onClose }: { anni: number[]; annoCorrente: number; onClose: () => void }) {
  const [origine, setOrigine] = useState<string | null>(anni.length ? String(anni[0]) : null);
  const [destinazione, setDestinazione] = useState<number | ''>(anni.length ? anni[0] + 1 : annoCorrente);
  const [copiaImporti, setCopiaImporti] = useState(false);
  const { inCorso, esegui } = useAzione();

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    if (!origine || destinazione === '') return;
    const risultato = await esegui(() =>
      useApp.getState().esegui({ tipo: 'capitoli.copia', esercizioOrigine: Number(origine), esercizioDestinazione: destinazione, copiaImporti }),
    );
    if (risultato) {
      notificaSuccesso(risultato.conteggio ? `${risultato.conteggio} capitoli copiati nell'esercizio ${destinazione}.` : `Nessun capitolo da copiare: sono già tutti presenti nell'esercizio ${destinazione}.`);
      aggiornaQuery({ esercizio: String(destinazione) });
      onClose();
    }
  };

  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>Copia capitoli da un altro esercizio</Text>}>
      <form onSubmit={invia}>
        <Stack gap="sm">
          <Text fz="sm" c="dimmed">
            Crea nel nuovo esercizio gli stessi capitoli dell'esercizio di origine. I capitoli già presenti non vengono duplicati; gli IDV non vengono copiati.
          </Text>
          <SimpleGrid cols={2} spacing="sm">
            <Select label="Esercizio di origine" data={anni.map(String)} value={origine} onChange={setOrigine} allowDeselect={false} />
            <NumberInput
              label="Esercizio di destinazione"
              value={destinazione}
              onChange={(v) => setDestinazione(typeof v === 'number' ? v : '')}
              min={2000}
              max={2100}
              allowDecimal={false}
              thousandSeparator=""
            />
          </SimpleGrid>
          <Checkbox label="Copia anche i fondi aggiunti manualmente" description="Altrimenti il finanziato sarà impostato a zero" checked={copiaImporti} onChange={(e) => setCopiaImporti(e.currentTarget.checked)} />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={inCorso} disabled={!origine || destinazione === '' || String(destinazione) === origine}>
              Copia capitoli
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function Capitoli() {
  const { viste, oggi } = useDerivati();
  const capitoli = useApp((s) => s.dati.capitoli);
  const utente = useApp((s) => s.sessione?.utente);
  const { valore, anno } = useEsercizioSelezionato();
  const [modale, setModale] = useState<Capitolo | 'nuovo' | null>(null);
  const [sforamento, setSforamento] = useState<RigaSintesi | null>(null);
  const [copiaAperta, setCopiaAperta] = useState(false);
  const [dettaglioIdv, setDettaglioIdv] = useState<Capitolo | null>(null);
  const [siefin, setSiefin] = useState<{ righe: RigaSiefin[]; nomeFile: string } | null>(null);
  const azzeraFile = useRef<() => void>(null);
  const { esegui } = useAzione();
  const puoGestire = puo(utente, 'capitoli');
  const admin = isAdmin(utente);
  const anni = useMemo(() => eserciziDisponibili({ capitoli }), [capitoli]);

  const filtrati = useMemo(() => capitoli.filter((c) => c.esercizio === anno), [capitoli, anno]);
  const sintesi = useMemo(() => calcolaSintesi(filtrati, viste), [filtrati, viste]);
  const autorizzati = useMemo(() => sintesi.righe.filter((r) => r.capitolo.sforamento_ignorato && inSforamento(r)), [sintesi.righe]);

  const caricaSiefin = async (file: File | null) => {
    if (!file) return;
    try {
      setSiefin({ righe: leggiExportSiefin(await file.text()), nomeFile: file.name });
    } catch (e) {
      notificaErrore(e, 'File SIEFIN non leggibile');
    }
    // consente di ricaricare lo stesso file
    azzeraFile.current?.();
  };

  const elimina = async (r: RigaSintesi) => {
    if (r.nPds > 0) {
      await chiediConferma({
        titolo: 'Capitolo non eliminabile',
        messaggio: `Al capitolo ${etichettaCapitolo(r.capitolo)} sono collegati ${r.nPds} PdS: eliminali o spostali su un altro capitolo prima di eliminarlo.`,
        conferma: 'Ho capito',
      });
      return;
    }
    const ok = await chiediConferma({
      titolo: 'Eliminare il capitolo?',
      messaggio: `Il capitolo ${etichettaCapitolo(r.capitolo, false)} dell'esercizio ${r.capitolo.esercizio} sarà eliminato${r.capitolo.idv?.length ? `, con i suoi ${r.capitolo.idv.length} IDV` : ''}.`,
      conferma: 'Elimina',
      pericolosa: true,
    });
    if (ok) await esegui(() => useApp.getState().esegui({ tipo: 'capitolo.elimina', id: r.capitolo.id }), 'Capitolo eliminato.');
  };

  const colonne: Colonna<RigaSintesi>[] = [
    {
      chiave: 'codice',
      titolo: 'Capitolo',
      ordina: (r) => etichettaCapitolo(r.capitolo, false),
      render: (r) => (
        <Group gap={6} wrap="nowrap">
          <NomeCapitolo capitolo={r.capitolo} forte />
          {sforamentoDaSegnalare(r) && (
            <Tooltip label="Impegnato superiore al finanziato">
              <IconAlertTriangle size={16} color="var(--pds-critico)" aria-label="Superamento del finanziato" />
            </Tooltip>
          )}
          {r.capitolo.sforamento_ignorato && inSforamento(r) && (
            <Tooltip label={`Superamento autorizzato: ${r.capitolo.sforamento_note}`}>
              <Badge size="sm" variant="light" color="gray" leftSection={<IconShieldCheck size={12} />} style={{ maxWidth: 'none' }} styles={{ label: { overflow: 'visible' } }}>
                Autorizzato
              </Badge>
            </Tooltip>
          )}
        </Group>
      ),
    },
    {
      chiave: 'idv',
      titolo: 'IDV',
      allinea: 'right',
      ordina: (r) => r.capitolo.idv?.length ?? 0,
      render: (r) =>
        r.capitolo.idv?.length ? (
          <Anchor component="button" type="button" fz="sm" className="num" onClick={() => setDettaglioIdv(r.capitolo)} aria-label={`Mostra gli IDV del capitolo ${etichettaCapitolo(r.capitolo, false)}`}>
            {r.capitolo.idv.length}
          </Anchor>
        ) : (
          <Text fz="sm" c="dimmed">
            0
          </Text>
        ),
      larghezza: 70,
    },
    {
      chiave: 'npds',
      titolo: 'PdS',
      allinea: 'right',
      ordina: (r) => r.nPds,
      render: (r) =>
        r.nPds > 0 ? (
          <Anchor href={href(`/pds?esercizio=${r.capitolo.esercizio}&capitolo=${r.capitolo.id}`)} fz="sm" className="num">
            {r.nPds}
          </Anchor>
        ) : (
          <Text fz="sm" c="dimmed">
            0
          </Text>
        ),
      larghezza: 90,
    },
    {
      chiave: 'finanziato',
      titolo: 'Finanziato',
      allinea: 'right',
      ordina: (r) => r.finanziato,
      render: (r) => (
        <div>
          <Importo valore={r.finanziato} forte />
          {r.capitolo.finanziato > 0 && (r.capitolo.idv?.length ?? 0) > 0 && (
            <Text fz="xs" c="dimmed" className="num">
              di cui {formattaEuro(r.capitolo.finanziato)} manuali
            </Text>
          )}
        </div>
      ),
    },
    { chiave: 'inviato', titolo: 'Impegnato (Trasmesso)', allinea: 'right', ordina: (r) => r.inviato, render: (r) => <Importo valore={r.inviato} /> },
    { chiave: 'stipulato', titolo: 'Impegnato (Stipulato)', allinea: 'right', ordina: (r) => r.stipulato, render: (r) => <Importo valore={r.stipulato} /> },
    { chiave: 'pagato', titolo: 'Pagato', allinea: 'right', ordina: (r) => r.pagato, render: (r) => <Importo valore={r.pagato} /> },
    {
      chiave: 'azioni',
      titolo: '',
      allinea: 'right',
      render: (r) => (
        <Group gap={2} justify="flex-end" wrap="nowrap">
          {admin && inSforamento(r) && (
            <Tooltip label={r.capitolo.sforamento_ignorato ? 'Modifica l’autorizzazione al superamento' : 'Autorizza il superamento del finanziato'}>
              <ActionIcon variant="subtle" color="gray" onClick={() => setSforamento(r)} aria-label={`Autorizza il superamento del capitolo ${r.capitolo.codice}`}>
                <IconShieldCheck size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {puoGestire && (
            <>
              <ActionIcon variant="subtle" color="gray" onClick={() => setModale(r.capitolo)} aria-label={`Modifica capitolo ${r.capitolo.codice}`}>
                <IconPencil size={16} />
              </ActionIcon>
              <ActionIcon variant="subtle" color="red" onClick={() => elimina(r)} aria-label={`Elimina capitolo ${r.capitolo.codice}`}>
                <IconTrash size={16} />
              </ActionIcon>
            </>
          )}
        </Group>
      ),
    },
  ];

  return (
    <>
      <IntestazionePagina
        titolo="Capitoli di spesa"
        sottotitolo="I capitoli sono definiti per esercizio finanziario; il capitolo scelto in un PdS ne determina l'esercizio."
        azioni={
          <>
            <SelettoreEsercizio />
            <MenuEsporta rapporto={() => rapportoCapitoli(sintesi, anno)} disabilitato={sintesi.righe.length === 0} />
            {puoGestire && (
              <>
                <FileButton onChange={caricaSiefin} accept=".xls,.htm,.html" resetRef={azzeraFile}>
                  {(props) => (
                    <Button {...props} variant="default" leftSection={<IconRefresh size={16} />}>
                      Allineamento SIEFIN
                    </Button>
                  )}
                </FileButton>
                <Button variant="default" leftSection={<IconCopy size={16} />} onClick={() => setCopiaAperta(true)} disabled={anni.length === 0}>
                  Copia da esercizio
                </Button>
                <Button leftSection={<IconPlus size={16} />} onClick={() => setModale('nuovo')}>
                  Nuovo capitolo
                </Button>
              </>
            )}
          </>
        }
      />

      {sintesi.capitoliInSforamento.length > 0 && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} mb="md" title="Superamento del finanziato">
          {sintesi.capitoliInSforamento.length === 1 ? 'Un capitolo ha' : `${sintesi.capitoliInSforamento.length} capitoli hanno`} un importo impegnato superiore al totale finanziato:{' '}
          {sintesi.capitoliInSforamento.map((r) => etichettaCapitolo(r.capitolo, false)).join(', ')}. L'inserimento non è bloccato; verificare nella{' '}
          <Anchor href={href(`/sintesi?esercizio=${valore}`)}>sintesi finanziaria</Anchor>
          {admin ? ' oppure autorizzare il superamento motivandolo.' : '.'}
        </Alert>
      )}

      {autorizzati.length > 0 && (
        <Alert color="gray" variant="light" icon={<IconShieldCheck size={18} />} mb="md" title="Superamenti autorizzati">
          <Stack gap={2}>
            {autorizzati.map((r) => (
              <Text key={r.capitolo.id} fz="sm">
                <b>{etichettaCapitolo(r.capitolo, false)}</b>: {r.capitolo.sforamento_note}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      {!puoGestire && (
        <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />} mb="md">
          Visualizzazione in sola lettura: la gestione dei capitoli richiede il relativo permesso.
        </Alert>
      )}

      <Card padding={0}>
        <Tabella
          etichetta="Capitoli di spesa"
          righe={sintesi.righe}
          colonne={colonne}
          chiaveRiga={(r) => r.capitolo.id}
          classeRiga={(r) => (sforamentoDaSegnalare(r) ? 'riga-scaduto' : undefined)}
          larghezzaMinima={980}
          paginazione={false}
          scheda={(r) => (
            <Stack gap={4}>
              <Group justify="space-between" wrap="nowrap">
                <NomeCapitolo capitolo={r.capitolo} forte />
                <Group gap={2}>
                  {admin && inSforamento(r) && (
                    <ActionIcon variant="subtle" color="gray" onClick={() => setSforamento(r)} aria-label={`Autorizza il superamento del capitolo ${r.capitolo.codice}`}>
                      <IconShieldCheck size={16} />
                    </ActionIcon>
                  )}
                  {puoGestire && (
                    <>
                      <ActionIcon variant="subtle" color="gray" onClick={() => setModale(r.capitolo)} aria-label={`Modifica capitolo ${r.capitolo.codice}`}>
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" onClick={() => elimina(r)} aria-label={`Elimina capitolo ${r.capitolo.codice}`}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </>
                  )}
                </Group>
              </Group>
              <Text fz="sm">
                Finanziato <b className="num">{formattaEuro(r.finanziato)}</b> · {r.nPds} PdS
                {r.capitolo.idv?.length ? (
                  <>
                    {' · '}
                    <Anchor component="button" type="button" fz="sm" onClick={() => setDettaglioIdv(r.capitolo)}>
                      {r.capitolo.idv.length} IDV
                    </Anchor>
                  </>
                ) : null}
              </Text>
              <Text fz="xs" c="dimmed">
                Impegnato (Trasmesso) {formattaEuro(r.inviato)} · Impegnato (Stipulato) {formattaEuro(r.stipulato)} · Pagato {formattaEuro(r.pagato)}
                {sforamentoDaSegnalare(r) ? ' · ⚠ superamento del finanziato' : ''}
              </Text>
            </Stack>
          )}
          classeScheda={(r) => (sforamentoDaSegnalare(r) ? 'card-scaduto' : undefined)}
          vuoto={
            <StatoVuoto
              titolo={`Nessun capitolo per l'esercizio ${anno}`}
              descrizione={puoGestire ? 'Carica l’export con «Allineamento SIEFIN», crea un nuovo capitolo oppure copia i capitoli da un esercizio precedente.' : 'I capitoli sono gestiti dagli utenti abilitati.'}
            />
          }
        />
      </Card>

      {modale && <ModaleCapitolo capitolo={modale === 'nuovo' ? null : modale} esercizioPredefinito={anno ?? annoDi(oggi)} onClose={() => setModale(null)} />}
      {dettaglioIdv && <ModaleIdv capitolo={dettaglioIdv} onClose={() => setDettaglioIdv(null)} />}
      {siefin && <ModaleSiefin {...siefin} esercizioPredefinito={anno ?? annoDi(oggi)} onClose={() => setSiefin(null)} />}
      {sforamento && <ModaleSforamento riga={sforamento} onClose={() => setSforamento(null)} />}
      {copiaAperta && <ModaleCopia anni={anni} annoCorrente={annoDi(oggi)} onClose={() => setCopiaAperta(false)} />}
    </>
  );
}
