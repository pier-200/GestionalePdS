import { Alert, Button, Divider, Group, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { numeroPds } from '../../domain/calcoli';
import { puo } from '../../domain/permessi';
import type { Centesimi, DataISO, ID } from '../../domain/tipi';
import { useApp } from '../../stato/store';
import { naviga } from '../router';
import { notificaSuccesso, useAzione } from './azioni';
import { CampiIdentificativiPds, type ValoriIdentificativi } from './CampiPds';
import { CampoData, CampoImporto, CampoProtocollo } from './campi';

const VUOTI: ValoriIdentificativi = {
  numero: '',
  capitolo_id: null,
  accordo_id: null,
  atto_adesione_id: null,
  ditta: null,
  ordinativo: null,
  idv: null,
  dec: null,
};

export function ModaleNuovoPds({ aperto, onClose }: { aperto: boolean; onClose: () => void }) {
  const capitoli = useApp((s) => s.dati.capitoli);
  const utente = useApp((s) => s.sessione?.utente);
  const { inCorso, esegui } = useAzione();
  const [valori, setValori] = useState<ValoriIdentificativi>(VUOTI);
  const [importo, setImporto] = useState<Centesimi | null>(null);
  const [protocollo, setProtocollo] = useState<string | null>(null);
  const [dataInvio, setDataInvio] = useState<DataISO | null>(null);

  const imposta = <C extends keyof ValoriIdentificativi>(campo: C, valore: ValoriIdentificativi[C]) =>
    setValori((v) => ({ ...v, [campo]: valore }));

  const reset = () => {
    setValori(VUOTI);
    setImporto(null);
    setProtocollo(null);
    setDataInvio(null);
  };

  const capitolo = capitoli.find((c) => c.id === valori.capitolo_id);
  const nessunCapitolo = capitoli.every((c) => !puo(utente, 'pds_crea', c));

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    if (!valori.capitolo_id || !valori.numero.trim()) return;
    const risultato = await esegui(() =>
      useApp.getState().esegui({
        tipo: 'pds.crea',
        dati: {
          ...valori,
          capitolo_id: valori.capitolo_id as ID,
          importo_inviato: importo,
          protocollo_invio: protocollo,
          data_invio: dataInvio,
        },
      }),
    );
    if (risultato?.id) {
      notificaSuccesso(`PdS ${numeroPds(valori, capitolo?.esercizio ?? null)} creato.`);
      reset();
      onClose();
      naviga(`/pds/${risultato.id}`);
    }
  };

  return (
    <Modal opened={aperto} onClose={onClose} title={<Text fw={600}>Nuovo progetto di spesa</Text>} size="lg">
      <form onSubmit={invia}>
        <Stack gap="sm">
          {nessunCapitolo && (
            <Alert color="yellow" icon={<IconInfoCircle size={18} />}>
              Non ci sono capitoli di spesa su cui puoi creare PdS. Creare prima il capitolo nella sezione «Capitoli di spesa».
            </Alert>
          )}
          <CampiIdentificativiPds valori={valori} imposta={imposta} area="pds_crea" autofocus />
          <Divider label="Invio del progetto (facoltativo, completabile in seguito)" labelPosition="left" mt="xs" />
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <CampoImporto label="Importo del PdS inviato" value={importo} onChange={setImporto} />
            <CampoProtocollo label="Numero di protocollo" value={protocollo} onChange={setProtocollo} />
            <CampoData label="Data di invio" value={dataInvio} onChange={setDataInvio} />
          </SimpleGrid>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={inCorso} disabled={!valori.numero.trim() || !valori.capitolo_id}>
              Crea PdS
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
