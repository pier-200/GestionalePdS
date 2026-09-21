import { Button, Card, Group, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { IconLock, IconPencil } from '@tabler/icons-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { DatiPds } from '../../../domain/comandi';
import { ErroreApp } from '../../../domain/errori';
import type { CampoDatiPds } from '../../../domain/permessi';
import { valoriUguali } from '../../../domain/registro';
import type { Pds } from '../../../domain/tipi';
import { useApp } from '../../../stato/store';
import { notificaErrore, notificaSuccesso } from '../../componenti/azioni';

export type Valori<K extends CampoDatiPds> = Pick<DatiPds, K>;

function normalizza(valore: unknown): unknown {
  if (typeof valore === 'string') {
    const t = valore.trim();
    return t === '' ? null : t;
  }
  return valore ?? null;
}

interface Props<K extends CampoDatiPds> {
  titolo: string;
  icona: ReactNode;
  pds: Pds;
  campi: readonly K[];
  puoModificare: boolean;
  motivoBlocco?: string;
  lettura: ReactNode;
  modifica: (valori: Valori<K>, imposta: <C extends K>(campo: C, valore: DatiPds[C]) => void) => ReactNode;
  /** Controllo prima del salvataggio: restituisce un messaggio di errore o null. */
  verifica?: (valori: Valori<K>) => string | null;
  largo?: boolean;
}

/** Scheda di una sezione del PdS, modificabile in modo indipendente dalle altre. */
export function SezioneModificabile<K extends CampoDatiPds>({ titolo, icona, pds, campi, puoModificare, motivoBlocco, lettura, modifica, verifica, largo }: Props<K>) {
  const [originale, setOriginale] = useState<Valori<K> | null>(null);
  const [valori, setValori] = useState<Valori<K> | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const inizia = () => {
    const istantanea = Object.fromEntries(campi.map((c) => [c, pds[c]])) as unknown as Valori<K>;
    setOriginale(istantanea);
    setValori(istantanea);
    setErrore(null);
  };

  const annulla = () => {
    setOriginale(null);
    setValori(null);
    setErrore(null);
  };

  const imposta = <C extends K>(campo: C, valore: DatiPds[C]) => setValori((v) => (v ? { ...v, [campo]: valore } : v));

  const salva = async (e: FormEvent) => {
    e.preventDefault();
    if (!valori || !originale) return;
    const problema = verifica?.(valori);
    if (problema) {
      setErrore(problema);
      return;
    }
    const modifiche: Partial<DatiPds> = {};
    const visti: Partial<DatiPds> = {};
    for (const c of campi) {
      const nuovo = normalizza(valori[c]);
      if (!valoriUguali(nuovo, normalizza(originale[c]))) {
        (modifiche as Record<string, unknown>)[c] = nuovo;
        (visti as Record<string, unknown>)[c] = originale[c];
      }
    }
    if (Object.keys(modifiche).length === 0) {
      annulla();
      return;
    }
    setInCorso(true);
    try {
      await useApp.getState().esegui({ tipo: 'pds.modifica', id: pds.id, modifiche, originale: visti });
      notificaSuccesso(`${titolo}: modifiche salvate.`);
      annulla();
    } catch (err) {
      notificaErrore(err);
      if (err instanceof ErroreApp && (err.codice === 'CONFLITTO' || err.codice === 'NON_TROVATO')) annulla();
      else if (err instanceof ErroreApp) setErrore(err.message);
    } finally {
      setInCorso(false);
    }
  };

  const inModifica = valori != null;

  return (
    <Card style={largo ? { gridColumn: '1 / -1' } : undefined}>
      <form onSubmit={salva} noValidate>
        <Group justify="space-between" mb="md" wrap="nowrap" gap="xs">
          <Group gap="xs" wrap="nowrap">
            <ThemeIcon variant="light" size={30} radius="md">
              {icona}
            </ThemeIcon>
            <Text fw={600} component="h3" m={0} fz="md">
              {titolo}
            </Text>
          </Group>
          {!inModifica &&
            (puoModificare ? (
              <Button variant="subtle" size="compact-sm" leftSection={<IconPencil size={14} />} onClick={inizia} className="no-stampa">
                Modifica
              </Button>
            ) : (
              <Tooltip label={motivoBlocco ?? 'Non hai i permessi per modificare questa sezione'}>
                <ThemeIcon variant="subtle" color="gray" size={26} aria-label="Sezione in sola lettura" className="no-stampa">
                  <IconLock size={15} />
                </ThemeIcon>
              </Tooltip>
            ))}
        </Group>
        {inModifica ? (
          <Stack gap="sm">
            {modifica(valori, imposta)}
            {errore && (
              <Text c="red" fz="sm" role="alert">
                {errore}
              </Text>
            )}
            <Group justify="flex-end" gap="xs">
              <Button variant="default" onClick={annulla} disabled={inCorso}>
                Annulla
              </Button>
              <Button type="submit" loading={inCorso}>
                Salva
              </Button>
            </Group>
          </Stack>
        ) : (
          lettura
        )}
      </form>
    </Card>
  );
}

/** Griglia di campi in sola lettura. */
export function GrigliaCampi({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px 20px' }}>{children}</div>
  );
}
