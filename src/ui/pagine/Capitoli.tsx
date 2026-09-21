import { ActionIcon, Alert, Anchor, Badge, Button, Card, Checkbox, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCopy, IconInfoCircle, IconPencil, IconPlus, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import { useMemo, useState, type FormEvent } from 'react';
import { annoDi } from '../../domain/date';
import { eserciziDisponibili } from '../../domain/calcoli';
import { formattaEuro } from '../../domain/importi';
import { isAdmin, puo } from '../../domain/permessi';
import { calcolaSintesi, inSforamento, sforamentoDaSegnalare, type RigaSintesi } from '../../domain/sintesi';
import type { Capitolo, Centesimi } from '../../domain/tipi';
import { useDerivati } from '../../stato/derivati';
import { useApp } from '../../stato/store';
import { chiediConferma, notificaSuccesso, useAzione } from '../componenti/azioni';
import { Importo, IntestazionePagina, StatoVuoto } from '../componenti/base';
import { CampoImporto } from '../componenti/campi';
import { SelettoreEsercizio, useEsercizioSelezionato } from '../componenti/SelettoreEsercizio';
import { MenuEsporta } from '../componenti/MenuEsporta';
import { rapportoCapitoli } from '../../esportazione/rapporti';
import { Tabella, type Colonna } from '../componenti/Tabella';
import { aggiornaQuery, href } from '../router';

function ModaleCapitolo({ capitolo, esercizioPredefinito, onClose }: { capitolo: Capitolo | null; esercizioPredefinito: number; onClose: () => void }) {
  const [esercizio, setEsercizio] = useState<number | ''>(capitolo?.esercizio ?? esercizioPredefinito);
  const [codice, setCodice] = useState(capitolo?.codice ?? '');
  const [finanziato, setFinanziato] = useState<Centesimi | null>(capitolo?.finanziato ?? null);
  const { inCorso, esegui } = useAzione();

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    if (esercizio === '') return;
    const dati = { esercizio, codice, finanziato: finanziato ?? 0 };
    const ok = await esegui(async () => {
      if (capitolo) {
        const modifiche: Record<string, unknown> = {};
        const originale: Record<string, unknown> = {};
        for (const k of ['esercizio', 'codice', 'finanziato'] as const) {
          const nuovo = typeof dati[k] === 'string' ? (dati[k] as string).trim() : dati[k];
          if (nuovo !== capitolo[k]) {
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
            <TextInput label="Codice capitolo" description="Es. 1181 o 1181/05" value={codice} onChange={(e) => setCodice(e.currentTarget.value)} required maxLength={50} data-autofocus />
          </SimpleGrid>
          <CampoImporto label="Totale finanziato" value={finanziato} onChange={setFinanziato} />
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
            Crea nel nuovo esercizio gli stessi capitoli dell'esercizio di origine. I capitoli già presenti non vengono duplicati.
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
          <Checkbox label="Copia anche i totali finanziati" description="Altrimenti il finanziato sarà impostato a zero" checked={copiaImporti} onChange={(e) => setCopiaImporti(e.currentTarget.checked)} />
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
  const { esegui } = useAzione();
  const puoGestire = puo(utente, 'capitoli');
  const admin = isAdmin(utente);
  const anni = useMemo(() => eserciziDisponibili({ capitoli }), [capitoli]);

  const filtrati = useMemo(() => capitoli.filter((c) => c.esercizio === anno), [capitoli, anno]);
  const sintesi = useMemo(() => calcolaSintesi(filtrati, viste), [filtrati, viste]);
  const autorizzati = useMemo(() => sintesi.righe.filter((r) => r.capitolo.sforamento_ignorato && inSforamento(r)), [sintesi.righe]);

  const elimina = async (r: RigaSintesi) => {
    if (r.nPds > 0) {
      await chiediConferma({
        titolo: 'Capitolo non eliminabile',
        messaggio: `Al capitolo ${r.capitolo.codice} (${r.capitolo.esercizio}) sono collegati ${r.nPds} PdS: eliminali o spostali su un altro capitolo prima di eliminarlo.`,
        conferma: 'Ho capito',
      });
      return;
    }
    const ok = await chiediConferma({
      titolo: 'Eliminare il capitolo?',
      messaggio: `Il capitolo ${r.capitolo.codice} dell'esercizio ${r.capitolo.esercizio} sarà eliminato.`,
      conferma: 'Elimina',
      pericolosa: true,
    });
    if (ok) await esegui(() => useApp.getState().esegui({ tipo: 'capitolo.elimina', id: r.capitolo.id }), 'Capitolo eliminato.');
  };

  const colonne: Colonna<RigaSintesi>[] = [
    {
      chiave: 'codice',
      titolo: 'Capitolo',
      ordina: (r) => r.capitolo.codice,
      render: (r) => (
        <Group gap={6} wrap="nowrap">
          <Text fz="sm" fw={600}>
            {r.capitolo.codice}
          </Text>
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
      chiave: 'npds',
      titolo: 'PdS',
      allinea: 'right',
      ordina: (r) => r.nPds,
      render: (r) =>
        r.nPds > 0 ? (
          <Anchor href={href(`/pds?esercizio=${r.capitolo.esercizio}&capitolo=${encodeURIComponent(r.capitolo.codice)}`)} fz="sm" className="num">
            {r.nPds}
          </Anchor>
        ) : (
          <Text fz="sm" c="dimmed">
            0
          </Text>
        ),
      larghezza: 90,
    },
    { chiave: 'finanziato', titolo: 'Finanziato', allinea: 'right', ordina: (r) => r.finanziato, render: (r) => <Importo valore={r.finanziato} forte /> },
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
          {sintesi.capitoliInSforamento.map((r) => r.capitolo.codice).join(', ')}. L'inserimento non è bloccato; verificare nella{' '}
          <Anchor href={href(`/sintesi?esercizio=${valore}`)}>sintesi finanziaria</Anchor>
          {admin ? ' oppure autorizzare il superamento motivandolo.' : '.'}
        </Alert>
      )}

      {autorizzati.length > 0 && (
        <Alert color="gray" variant="light" icon={<IconShieldCheck size={18} />} mb="md" title="Superamenti autorizzati">
          <Stack gap={2}>
            {autorizzati.map((r) => (
              <Text key={r.capitolo.id} fz="sm">
                <b>{r.capitolo.codice}</b>: {r.capitolo.sforamento_note}
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
          larghezzaMinima={900}
          paginazione={false}
          scheda={(r) => (
            <Stack gap={4}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={700}>{r.capitolo.codice}</Text>
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
              descrizione={puoGestire ? 'Crea un nuovo capitolo oppure copia i capitoli da un esercizio precedente.' : 'I capitoli sono gestiti dagli utenti abilitati.'}
            />
          }
        />
      </Card>

      {modale && <ModaleCapitolo capitolo={modale === 'nuovo' ? null : modale} esercizioPredefinito={anno ?? annoDi(oggi)} onClose={() => setModale(null)} />}
      {sforamento && <ModaleSforamento riga={sforamento} onClose={() => setSforamento(null)} />}
      {copiaAperta && <ModaleCopia anni={anni} annoCorrente={annoDi(oggi)} onClose={() => setCopiaAperta(false)} />}
    </>
  );
}
