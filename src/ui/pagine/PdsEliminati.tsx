import { ActionIcon, Alert, Anchor, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconArrowBackUp, IconInfoCircle, IconTrash } from '@tabler/icons-react';
import type { PdsVista } from '../../domain/calcoli';
import { etichettaCapitolo } from '../../domain/calcoli';
import { formattaIstante } from '../../domain/date';
import { useDerivati } from '../../stato/derivati';
import { useApp } from '../../stato/store';
import { chiediConferma, useAzione } from '../componenti/azioni';
import { BadgeStato, Importo, IntestazionePagina, StatoVuoto } from '../componenti/base';
import { Tabella, type Colonna } from '../componenti/Tabella';
import { href } from '../router';

/**
 * PdS eliminati dagli utenti: restano archiviati con pagamenti e allegati.
 * Solo l'amministratore li vede e può ripristinarli o eliminarli definitivamente.
 */
export function PdsEliminati() {
  const { visteEliminate } = useDerivati();
  const utenti = useApp((s) => s.dati.utenti);
  const { esegui } = useAzione();

  const nome = (id: string | null) => utenti.find((u) => u.id === id)?.nome ?? 'utente non disponibile';

  const ripristina = async (v: PdsVista) => {
    const ok = await chiediConferma({
      titolo: `Ripristinare il PdS ${v.numeroCompleto}?`,
      messaggio: 'Il progetto di spesa torna nell’elenco dei PdS e rientra nei conteggi della sintesi finanziaria.',
      conferma: 'Ripristina',
    });
    if (ok) await esegui(() => useApp.getState().esegui({ tipo: 'pds.ripristina', id: v.pds.id }), `PdS ${v.numeroCompleto} ripristinato.`);
  };

  const eliminaDefinitivamente = async (v: PdsVista) => {
    const ok = await chiediConferma({
      titolo: `Eliminare definitivamente il PdS ${v.numeroCompleto}?`,
      messaggio: `Saranno eliminati anche ${v.pagamenti.length} pagamenti e ${v.allegati.length} allegati collegati. L'operazione resta tracciata nel registro delle modifiche ma non può essere annullata.`,
      conferma: 'Elimina definitivamente',
      pericolosa: true,
    });
    if (ok) {
      await esegui(() => useApp.getState().esegui({ tipo: 'pds.elimina_definitivo', id: v.pds.id }), `PdS ${v.numeroCompleto} eliminato definitivamente.`);
    }
  };

  const colonne: Colonna<PdsVista>[] = [
    {
      chiave: 'numero',
      titolo: 'N. PdS',
      ordina: (v) => `${v.esercizio ?? 0}|${v.pds.numero.padStart(8, '0')}`,
      render: (v) => (
        <Anchor href={href(`/pds/${v.pds.id}`)} fw={600} fz="sm" style={{ whiteSpace: 'nowrap' }}>
          {v.numeroCompleto}
        </Anchor>
      ),
    },
    { chiave: 'stato', titolo: 'Stato', ordina: (v) => v.stato, render: (v) => <BadgeStato stato={v.stato} />, larghezza: 124 },
    {
      chiave: 'capitolo',
      titolo: 'Capitolo',
      ordina: (v) => v.capitolo?.codice ?? '',
      render: (v) => <Text fz="sm">{v.capitolo ? etichettaCapitolo(v.capitolo) : '—'}</Text>,
    },
    { chiave: 'ditta', titolo: 'Ditta', ordina: (v) => v.pds.ditta, render: (v) => <Text fz="sm">{v.pds.ditta ?? '—'}</Text> },
    { chiave: 'stipulato', titolo: 'Stipulato', allinea: 'right', ordina: (v) => v.pds.valore_stipula, render: (v) => <Importo valore={v.pds.valore_stipula} /> },
    { chiave: 'pagato', titolo: 'Pagato', allinea: 'right', ordina: (v) => v.totalePagato, render: (v) => <Importo valore={v.totalePagato} /> },
    {
      chiave: 'eliminato',
      titolo: 'Eliminato',
      ordina: (v) => v.pds.eliminato_at,
      render: (v) => (
        <div>
          <Text fz="sm" className="num">
            {formattaIstante(v.pds.eliminato_at)}
          </Text>
          <Text fz="xs" c="dimmed">
            da {nome(v.pds.eliminato_da)}
          </Text>
        </div>
      ),
    },
    {
      chiave: 'azioni',
      titolo: '',
      allinea: 'right',
      render: (v) => (
        <Group gap={2} justify="flex-end" wrap="nowrap">
          <Tooltip label="Ripristina">
            <ActionIcon variant="subtle" onClick={() => ripristina(v)} aria-label={`Ripristina il PdS ${v.numeroCompleto}`}>
              <IconArrowBackUp size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Elimina definitivamente">
            <ActionIcon variant="subtle" color="red" onClick={() => eliminaDefinitivamente(v)} aria-label={`Elimina definitivamente il PdS ${v.numeroCompleto}`}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ),
    },
  ];

  return (
    <>
      <IntestazionePagina
        sopra={
          <Anchor href={href('/pds')} fz="sm" className="no-stampa">
            ← Progetti di spesa
          </Anchor>
        }
        titolo="PdS eliminati"
        sottotitolo="Progetti di spesa eliminati dagli utenti: puoi ripristinarli oppure eliminarli definitivamente."
      />

      <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />} mb="md">
        I PdS eliminati non compaiono negli elenchi e non sono conteggiati nella sintesi finanziaria, ma conservano pagamenti e allegati fino
        all’eliminazione definitiva. Questa sezione è visibile solo all’amministratore.
      </Alert>

      <Card padding={0}>
        <Tabella
          etichetta="PdS eliminati"
          righe={visteEliminate}
          colonne={colonne}
          chiaveRiga={(v) => v.pds.id}
          ordinamentoIniziale={{ chiave: 'eliminato', direzione: 'desc' }}
          classeRiga={() => 'riga-eliminata'}
          larghezzaMinima={980}
          scheda={(v) => (
            <Stack gap={4}>
              <Group justify="space-between" wrap="nowrap">
                <Anchor href={href(`/pds/${v.pds.id}`)} fw={700}>
                  PdS {v.numeroCompleto}
                </Anchor>
                <Group gap={2}>
                  <ActionIcon variant="subtle" onClick={() => ripristina(v)} aria-label={`Ripristina il PdS ${v.numeroCompleto}`}>
                    <IconArrowBackUp size={16} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="red" onClick={() => eliminaDefinitivamente(v)} aria-label={`Elimina definitivamente il PdS ${v.numeroCompleto}`}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
              <Text fz="xs" c="dimmed">
                {[v.capitolo ? `Cap. ${etichettaCapitolo(v.capitolo)}` : null, v.pds.ditta].filter(Boolean).join(' · ')}
              </Text>
              <Text fz="xs" c="dimmed">
                Eliminato il {formattaIstante(v.pds.eliminato_at)} da {nome(v.pds.eliminato_da)}
              </Text>
            </Stack>
          )}
          vuoto={<StatoVuoto titolo="Nessun PdS eliminato" descrizione="Quando un utente elimina un PdS lo trovi qui, pronto da ripristinare." />}
        />
      </Card>
    </>
  );
}
