import { ActionIcon, Anchor, Button, Card, FileInput, Group, Modal, SegmentedControl, Select, Stack, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core';
import { IconDownload, IconExternalLink, IconFileInvoice, IconFileText, IconLink, IconPaperclip, IconPlus, IconSend, IconSignature, IconTrash } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import type { PdsVista } from '../../../domain/calcoli';
import { formattaIstante } from '../../../domain/date';
import { puo } from '../../../domain/permessi';
import type { Allegato, TipoAllegato } from '../../../domain/tipi';
import { TIPI_ALLEGATO, isUrlValido } from '../../../domain/validazione';
import { scaricaBlob } from '../../../esportazione/esportazione';
import { useApp } from '../../../stato/store';
import { chiediConferma, notificaErrore, useAzione } from '../../componenti/azioni';

const ICONE_TIPO: Record<TipoAllegato, typeof IconFileText> = {
  protocollo_invio: IconSend,
  protocollo_stipula: IconSignature,
  fattura: IconFileInvoice,
  altro: IconFileText,
};

function dimensioneLeggibile(byte: number | null): string {
  if (byte == null) return '';
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(0)} kB`;
  return `${(byte / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function ModaleAllegato({ vista, onClose }: { vista: PdsVista; onClose: () => void }) {
  const backend = useApp((s) => s.backend);
  const consentiFile = Boolean(backend?.capacita.caricamentoFile);
  const limite = backend?.capacita.dimensioneMassimaFile ?? 0;
  const [modo, setModo] = useState<'link' | 'file'>('link');
  const [tipo, setTipo] = useState<TipoAllegato>('altro');
  const [titolo, setTitolo] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { inCorso, esegui } = useAzione();

  const erroreUrl = modo === 'link' && url && !isUrlValido(url.trim()) ? 'Indirizzo non valido: deve iniziare con https:// o http://' : null;
  const erroreFile = modo === 'file' && file && file.size > limite ? `Il file supera la dimensione massima di ${dimensioneLeggibile(limite)}` : null;
  const valido = titolo.trim() && (modo === 'link' ? url.trim() && !erroreUrl : file && !erroreFile);

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    const ok = await esegui(
      () =>
        useApp.getState().esegui({
          tipo: 'allegato.crea',
          pds_id: vista.pds.id,
          dati: { tipo, titolo, url: modo === 'link' ? url.trim() : null },
          file: modo === 'file' && file ? { nome: file.name, tipo: file.type, dimensione: file.size, contenuto: file } : null,
        }),
      'Allegato aggiunto.',
    );
    if (ok) onClose();
  };

  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>Aggiungi allegato</Text>}>
      <form onSubmit={invia}>
        <Stack gap="sm">
          {consentiFile && (
            <SegmentedControl
              value={modo}
              onChange={(v) => setModo(v as 'link' | 'file')}
              data={[
                { value: 'link', label: 'Collegamento a documento' },
                { value: 'file', label: 'Carica file' },
              ]}
              fullWidth
            />
          )}
          <Select label="Tipo di documento" data={TIPI_ALLEGATO.map((t) => ({ value: t.valore, label: t.etichetta }))} value={tipo} onChange={(v) => v && setTipo(v as TipoAllegato)} allowDeselect={false} />
          <TextInput label="Titolo" value={titolo} onChange={(e) => setTitolo(e.currentTarget.value)} required maxLength={300} data-autofocus />
          {modo === 'link' ? (
            <TextInput
              label="Collegamento"
              description="Indirizzo del documento, ad esempio nel sistema di protocollo o in un'area condivisa"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.currentTarget.value)}
              error={erroreUrl}
              required
              type="url"
            />
          ) : (
            <FileInput
              label="File"
              description={`Dimensione massima ${dimensioneLeggibile(limite)}`}
              placeholder="Seleziona un file"
              value={file}
              onChange={(f) => {
                setFile(f);
                if (f && !titolo) setTitolo(f.name.replace(/\.[^.]+$/, ''));
              }}
              error={erroreFile}
              leftSection={<IconPaperclip size={16} />}
              clearable
              required
            />
          )}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={inCorso} disabled={!valido}>
              Aggiungi
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function SezioneAllegati({ vista }: { vista: PdsVista }) {
  const utente = useApp((s) => s.sessione?.utente);
  const utenti = useApp((s) => s.dati.utenti);
  const backend = useApp((s) => s.backend);
  const puoAllegati = puo(utente, 'pds_allegati', vista.capitolo);
  const [aperto, setAperto] = useState(false);
  const [scaricando, setScaricando] = useState<string | null>(null);
  const { esegui } = useAzione();

  const scarica = async (a: Allegato) => {
    if (!backend) return;
    setScaricando(a.id);
    try {
      const blob = await backend.scaricaFile(a);
      scaricaBlob(blob, a.file_nome ?? 'allegato');
    } catch (e) {
      notificaErrore(e, 'Download non riuscito');
    } finally {
      setScaricando(null);
    }
  };

  const elimina = async (a: Allegato) => {
    const ok = await chiediConferma({ titolo: "Eliminare l'allegato?", messaggio: `«${a.titolo}» sarà rimosso dal PdS.`, conferma: 'Elimina', pericolosa: true });
    if (ok) await esegui(() => useApp.getState().esegui({ tipo: 'allegato.elimina', id: a.id }), 'Allegato eliminato.');
  };

  const nomeUtente = (id: string | null) => utenti.find((u) => u.id === id)?.nome ?? null;

  return (
    <Card>
      <Group justify="space-between" mb="md" gap="xs" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <ThemeIcon variant="light" size={30} radius="md">
            <IconPaperclip size={18} />
          </ThemeIcon>
          <Text fw={600} component="h3" m={0} fz="md">
            Allegati e documenti
          </Text>
        </Group>
        {puoAllegati && (
          <Button variant="subtle" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={() => setAperto(true)} className="no-stampa">
            Aggiungi
          </Button>
        )}
      </Group>
      {vista.allegati.length === 0 ? (
        <Text fz="sm" c="dimmed">
          Nessun allegato o collegamento.
        </Text>
      ) : (
        <Stack gap={0}>
          {vista.allegati.map((a) => {
            const Icona = ICONE_TIPO[a.tipo] ?? IconFileText;
            const etichettaTipo = TIPI_ALLEGATO.find((t) => t.valore === a.tipo)?.etichetta;
            const autore = nomeUtente(a.created_by);
            // difesa in profondità: solo collegamenti http/https, anche se i dati fossero stati alterati
            const url = a.url && isUrlValido(a.url) ? a.url : null;
            return (
              <Group key={a.id} justify="space-between" wrap="nowrap" py={8} gap="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <ThemeIcon variant="default" size={32} radius="md" style={{ flexShrink: 0 }}>
                    <Icona size={17} />
                  </ThemeIcon>
                  <div style={{ minWidth: 0 }}>
                    {url ? (
                      <Anchor href={url} target="_blank" rel="noopener noreferrer" fz="sm" fw={500}>
                        <Group gap={4} wrap="nowrap" component="span">
                          <span style={{ overflowWrap: 'anywhere' }}>{a.titolo}</span>
                          <IconExternalLink size={13} style={{ flexShrink: 0 }} />
                        </Group>
                      </Anchor>
                    ) : (
                      <Text fz="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>
                        {a.titolo}
                      </Text>
                    )}
                    <Text fz="xs" c="dimmed">
                      {etichettaTipo}
                      {a.file_nome ? ` · ${a.file_nome} (${dimensioneLeggibile(a.file_dimensione)})` : ''}
                      {` · ${formattaIstante(a.created_at)}`}
                      {autore ? ` · ${autore}` : ''}
                    </Text>
                  </div>
                </Group>
                <Group gap={2} wrap="nowrap">
                  {a.file_path && (
                    <Tooltip label="Scarica il file">
                      <ActionIcon variant="subtle" onClick={() => scarica(a)} loading={scaricando === a.id} aria-label={`Scarica ${a.titolo}`}>
                        <IconDownload size={17} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {url && (
                    <Tooltip label="Apri il collegamento">
                      <ActionIcon variant="subtle" component="a" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Apri ${a.titolo}`}>
                        <IconLink size={17} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {puoAllegati && (
                    <ActionIcon variant="subtle" color="red" onClick={() => elimina(a)} aria-label={`Elimina ${a.titolo}`} className="no-stampa">
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Group>
            );
          })}
        </Stack>
      )}
      {aperto && <ModaleAllegato vista={vista} onClose={() => setAperto(false)} />}
    </Card>
  );
}
