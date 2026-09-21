import { Alert, Anchor, Badge, Button, Group, List, SimpleGrid, Text } from '@mantine/core';
import { IconAlertCircle, IconArrowBackUp, IconArrowLeft, IconEye, IconTrash, IconTrashX } from '@tabler/icons-react';
import { useMemo } from 'react';
import { etichettaCapitolo } from '../../domain/calcoli';
import { descriviGiorni, formattaData, formattaIstante } from '../../domain/date';
import { formattaEuro, formattaPercentuale } from '../../domain/importi';
import { isAdmin, puo } from '../../domain/permessi';
import { stipulaAvvenuta } from '../../domain/stato';
import { avvisiCoerenzaPds } from '../../domain/validazione';
import { useDerivati } from '../../stato/derivati';
import { useApp } from '../../stato/store';
import { chiediConferma, useAzione } from '../componenti/azioni';
import { BadgeStato, IndicatoreScadenza, IntestazionePagina, Meter, StatoVuoto } from '../componenti/base';
import { RiquadroValore } from '../componenti/RiquadroValore';
import { StoricoModifiche } from '../componenti/StoricoModifiche';
import { href, naviga } from '../router';
import { SezioneAllegati } from './pds/SezioneAllegati';
import { SezionePagamenti } from './pds/SezionePagamenti';
import { SezioneIdentificativi, SezioneInvio, SezioneNote, SezioneStipula, SezioneTempi } from './pds/SezioniDati';

export function DettaglioPds({ parametri }: { parametri: Record<string, string> }) {
  const { vistePerId, indici } = useDerivati();
  const dati = useApp((s) => s.dati);
  const utente = useApp((s) => s.sessione?.utente);
  const { inCorso, esegui } = useAzione();
  const vista = vistePerId.get(parametri.id);

  const avvisi = useMemo(
    () => (vista ? avvisiCoerenzaPds(vista.pds, { pagamenti: vista.pagamenti, altriPds: dati.pds, capitoli: indici.capitoliPerId }) : []),
    [vista, dati.pds, indici],
  );

  const indietro = (
    <Anchor href={href('/pds')} fz="sm" className="no-stampa">
      <Group gap={4} component="span">
        <IconArrowLeft size={14} /> Progetti di spesa
      </Group>
    </Anchor>
  );

  if (!vista) {
    return (
      <>
        {indietro}
        <StatoVuoto titolo="PdS non trovato" descrizione="Il progetto di spesa potrebbe essere stato eliminato definitivamente da un altro utente." />
      </>
    );
  }

  const p = vista.pds;
  const numero = vista.numeroCompleto;
  const eliminato = p.eliminato_at != null;
  const admin = isAdmin(utente);
  const nome = (id: string | null) => dati.utenti.find((u) => u.id === id)?.nome ?? 'utente non disponibile';
  const soloLettura = eliminato || !['pds_dati', 'pds_pagamenti', 'pds_allegati', 'pds_crea'].some((a) => puo(utente, a as 'pds_dati', vista.capitolo));

  const elimina = async () => {
    const ok = await chiediConferma({
      titolo: `Eliminare il PdS ${numero}?`,
      messaggio:
        "Il progetto di spesa viene spostato tra i «PdS eliminati», con i suoi pagamenti e allegati: non compare più negli elenchi né nella sintesi finanziaria. Solo l’amministratore può ripristinarlo o eliminarlo definitivamente.",
      conferma: 'Elimina',
      pericolosa: true,
    });
    if (!ok) return;
    const risultato = await esegui(() => useApp.getState().esegui({ tipo: 'pds.elimina', id: p.id }), `PdS ${numero} spostato tra i PdS eliminati.`);
    if (risultato) naviga('/pds');
  };

  const ripristina = async () => {
    await esegui(() => useApp.getState().esegui({ tipo: 'pds.ripristina', id: p.id }), `PdS ${numero} ripristinato.`);
  };

  const eliminaDefinitivamente = async () => {
    const ok = await chiediConferma({
      titolo: `Eliminare definitivamente il PdS ${numero}?`,
      messaggio: `Saranno eliminati anche ${vista.pagamenti.length} pagamenti e ${vista.allegati.length} allegati collegati. L'operazione resta tracciata nel registro delle modifiche ma non può essere annullata.`,
      conferma: 'Elimina definitivamente',
      pericolosa: true,
    });
    if (!ok) return;
    const risultato = await esegui(() => useApp.getState().esegui({ tipo: 'pds.elimina_definitivo', id: p.id }), `PdS ${numero} eliminato definitivamente.`);
    if (risultato) naviga('/pds');
  };

  return (
    <>
      <IntestazionePagina
        sopra={indietro}
        titolo={
          <Group gap="sm" component="span" wrap="wrap">
            <span>PdS {numero}</span>
            <BadgeStato stato={vista.stato} size="lg" />
            <IndicatoreScadenza livello={vista.avviso} giorni={vista.giorniAllaScadenza} />
            {eliminato && (
              <Badge color="red" variant="light" leftSection={<IconTrash size={12} />}>
                Eliminato
              </Badge>
            )}
            {soloLettura && !eliminato && (
              <Badge variant="default" leftSection={<IconEye size={12} />}>
                Sola lettura
              </Badge>
            )}
          </Group>
        }
        sottotitolo={
          <>
            <Text fz="sm" component="span">
              {vista.capitolo
                ? `Capitolo ${etichettaCapitolo(vista.capitolo, false)} · Esercizio finanziario ${vista.capitolo.esercizio}${p.ditta ? ` · ${p.ditta}` : ''}`
                : 'Capitolo non trovato'}
            </Text>
            <Text fz="xs" c="dimmed" mt={2}>
              Inserito il {formattaIstante(p.created_at)} da {nome(p.created_by)} · ultima modifica il {formattaIstante(p.updated_at)} da {nome(p.updated_by)}
            </Text>
          </>
        }
        azioni={
          eliminato ? (
            admin ? (
              <>
                <Button variant="default" leftSection={<IconArrowBackUp size={16} />} onClick={ripristina} loading={inCorso}>
                  Ripristina
                </Button>
                <Button variant="subtle" color="red" leftSection={<IconTrashX size={16} />} onClick={eliminaDefinitivamente} loading={inCorso}>
                  Elimina definitivamente
                </Button>
              </>
            ) : undefined
          ) : puo(utente, 'pds_crea', vista.capitolo) ? (
            <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={elimina} loading={inCorso}>
              Elimina PdS
            </Button>
          ) : undefined
        }
      />

      {eliminato && (
        <Alert color="red" variant="light" icon={<IconTrash size={18} />} title="PdS eliminato" mb="md">
          Spostato tra i PdS eliminati il {formattaIstante(p.eliminato_at)} da {nome(p.eliminato_da)}. Non è conteggiato nella sintesi finanziaria e non è
          modificabile finché non viene ripristinato{admin ? '.' : " dall'amministratore."}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md" mb="md">
        <RiquadroValore etichetta="Importo inviato" valore={formattaEuro(p.importo_inviato)} dettaglio={p.data_invio ? `Inviato il ${formattaData(p.data_invio)}` : 'Non ancora inviato'} />
        <RiquadroValore
          etichetta="Valore della stipula"
          valore={stipulaAvvenuta(p) ? formattaEuro(p.valore_stipula) : p.valore_stipula != null ? `(${formattaEuro(p.valore_stipula)})` : '—'}
          dettaglio={stipulaAvvenuta(p) ? `Stipulato il ${formattaData(p.data_stipula)}` : 'Stipula non ancora registrata'}
        />
        <RiquadroValore
          etichetta="Totale pagato"
          valore={formattaEuro(vista.totalePagato)}
          sotto={vista.quotaPagata != null ? <Meter rapporto={vista.quotaPagata} etichetta="Pagato sul valore stipulato" /> : undefined}
          dettaglio={
            p.saldato
              ? `Saldato il ${formattaData(p.data_saldo)} · economia ${formattaEuro(vista.economia)}`
              : vista.quotaPagata != null
                ? `${formattaPercentuale(vista.quotaPagata)} del valore stipulato · ${vista.pagamenti.length} pagamenti`
                : `${vista.pagamenti.length} pagamenti`
          }
        />
        <RiquadroValore
          etichetta="Scadenza per l'esecuzione"
          valore={formattaData(vista.scadenza)}
          dettaglio={
            vista.scadenza
              ? p.saldato
                ? 'PdS saldato'
                : descriviGiorni(vista.giorniAllaScadenza ?? 0)
              : p.modalita_termine === 'durata' && !p.data_stipula
                ? 'Calcolata dalla data di stipula'
                : 'Termine non definito'
          }
        />
      </SimpleGrid>

      {avvisi.length > 0 && (
        <Alert color="yellow" variant="light" icon={<IconAlertCircle size={18} />} title="Verifiche sui dati" mb="md">
          <List fz="sm" spacing={2}>
            {avvisi.map((a) => (
              <List.Item key={a}>{a}</List.Item>
            ))}
          </List>
        </Alert>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 'var(--mantine-spacing-md)' }}>
        <SezioneIdentificativi vista={vista} />
        <SezioneInvio vista={vista} />
        <SezioneStipula vista={vista} />
        <SezioneTempi vista={vista} />
        <SezionePagamenti vista={vista} />
        <SezioneNote vista={vista} />
        <SezioneAllegati vista={vista} />
        {admin && <StoricoModifiche pdsId={p.id} />}
      </div>
    </>
  );
}
