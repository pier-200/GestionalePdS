import { Autocomplete, Select, SimpleGrid, TagsInput, TextInput } from '@mantine/core';
import { useMemo, useState } from 'react';
import { attiDiAccordo, etichettaAtto } from '../../domain/accordi';
import { elencoIdv, eserciziDisponibili, idvDaElenco } from '../../domain/calcoli';
import { annoDi } from '../../domain/date';
import { puo } from '../../domain/permessi';
import type { AreaPermesso, ID } from '../../domain/tipi';
import { useOggi } from '../../stato/derivati';
import { useApp } from '../../stato/store';

/** Valori dei dati identificativi del PdS, condivisi fra creazione e modifica. */
export interface ValoriIdentificativi {
  numero: string;
  capitolo_id: ID | null;
  accordo_id: ID | null;
  atto_adesione_id: ID | null;
  ditta: string | null;
  ordinativo: string | null;
  idv: string | null;
  dec: string | null;
}

export function useValoriDec(): string[] {
  const pds = useApp((s) => s.dati.pds);
  return useMemo(() => [...new Set(pds.map((p) => p.dec?.trim()).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, 'it')), [pds]);
}

/** Ditte già usate nei PdS e negli accordi quadro, per l'inserimento assistito. */
export function useValoriDitta(): string[] {
  const pds = useApp((s) => s.dati.pds);
  const accordi = useApp((s) => s.dati.accordi);
  return useMemo(() => {
    const tutte = [...pds.map((p) => p.ditta?.trim()), ...accordi.map((a) => a.ditta.trim())];
    return [...new Set(tutte.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, 'it'));
  }, [pds, accordi]);
}

/**
 * Dati identificativi del PdS: numero ed esercizio finanziario si inseriscono
 * separatamente e si leggono insieme ("25/2026"). L'esercizio determina i
 * capitoli selezionabili.
 */
export function CampiIdentificativiPds({
  valori,
  imposta,
  area,
  autofocus = false,
}: {
  valori: ValoriIdentificativi;
  imposta: <C extends keyof ValoriIdentificativi>(campo: C, valore: ValoriIdentificativi[C]) => void;
  /** Permesso richiesto sui capitoli selezionabili. */
  area: Extract<AreaPermesso, 'pds_crea' | 'pds_dati'>;
  autofocus?: boolean;
}) {
  const capitoli = useApp((s) => s.dati.capitoli);
  const accordi = useApp((s) => s.dati.accordi);
  const atti = useApp((s) => s.dati.atti);
  const utente = useApp((s) => s.sessione?.utente);
  const valoriDec = useValoriDec();
  const valoriDitta = useValoriDitta();
  const oggi = useOggi();

  const anni = useMemo(() => eserciziDisponibili({ capitoli }), [capitoli]);
  const annoCapitolo = capitoli.find((c) => c.id === valori.capitolo_id)?.esercizio ?? null;
  const annoPredefinito = annoCapitolo ?? (anni.includes(annoDi(oggi)) ? annoDi(oggi) : (anni[0] ?? annoDi(oggi)));
  const [esercizio, setEsercizio] = useState<number>(annoPredefinito);
  const annoAttivo = annoCapitolo ?? esercizio;

  const opzioniCapitoli = useMemo(
    () =>
      capitoli
        .filter((c) => c.esercizio === annoAttivo)
        .sort((a, b) => a.codice.localeCompare(b.codice, 'it', { numeric: true }))
        .map((c) => ({ value: c.id, label: c.codice, disabled: !puo(utente, area, c) })),
    [capitoli, annoAttivo, utente, area],
  );

  const opzioniAccordi = useMemo(
    () => [...accordi].sort((a, b) => a.numero.localeCompare(b.numero, 'it', { numeric: true })).map((a) => ({ value: a.id, label: `${a.numero} – ${a.oggetto}` })),
    [accordi],
  );
  const opzioniAtti = useMemo(
    () => attiDiAccordo(atti, valori.accordo_id).map((a) => ({ value: a.id, label: etichettaAtto(a) })),
    [atti, valori.accordo_id],
  );

  const cambiaEsercizio = (anno: number) => {
    setEsercizio(anno);
    if (valori.capitolo_id && capitoli.find((c) => c.id === valori.capitolo_id)?.esercizio !== anno) imposta('capitolo_id', null);
  };

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      <TextInput
        label="Numero del progetto di spesa"
        description={`Comparirà come ${valori.numero.trim() || '…'}/${annoAttivo}`}
        value={valori.numero}
        onChange={(e) => imposta('numero', e.currentTarget.value.replace(/\D/g, ''))}
        inputMode="numeric"
        required
        maxLength={20}
        data-autofocus={autofocus || undefined}
        classNames={{ input: 'num' }}
      />
      <Select
        label="Esercizio finanziario"
        description="Determina i capitoli selezionabili"
        data={[...new Set([...anni, annoAttivo])].sort((a, b) => b - a).map((a) => ({ value: String(a), label: String(a) }))}
        value={String(annoAttivo)}
        onChange={(x) => x && cambiaEsercizio(Number(x))}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
      <Select
        label="Capitolo di spesa"
        data={opzioniCapitoli}
        value={valori.capitolo_id}
        onChange={(x) => imposta('capitolo_id', x)}
        searchable
        required
        nothingFoundMessage={`Nessun capitolo per l'esercizio ${annoAttivo}`}
        comboboxProps={{ withinPortal: true }}
      />
      <Autocomplete label="Ditta" data={valoriDitta} value={valori.ditta ?? ''} onChange={(x) => imposta('ditta', x || null)} maxLength={300} comboboxProps={{ withinPortal: true }} />
      <Select
        label="Accordo quadro (eventuale)"
        data={opzioniAccordi}
        value={valori.accordo_id}
        onChange={(x) => {
          imposta('accordo_id', x);
          imposta('atto_adesione_id', null);
        }}
        searchable
        clearable
        nothingFoundMessage="Nessun accordo quadro"
        comboboxProps={{ withinPortal: true }}
      />
      <Select
        label="Atto di adesione a quantità indeterminata"
        description={valori.accordo_id ? 'Il PdS consuma la quota parte dell’atto' : 'Scegliere prima l’accordo quadro'}
        data={opzioniAtti}
        value={valori.atto_adesione_id}
        onChange={(x) => imposta('atto_adesione_id', x)}
        disabled={!valori.accordo_id || opzioniAtti.length === 0}
        clearable
        nothingFoundMessage="Nessun atto di adesione"
        comboboxProps={{ withinPortal: true }}
      />
      <TextInput label="Ordinativo" value={valori.ordinativo ?? ''} onChange={(e) => imposta('ordinativo', e.currentTarget.value || null)} maxLength={100} />
      <TagsInput
        label="IDV"
        description="Un PdS può essere collegato a più IDV: premere Invio dopo ogni codice"
        value={elencoIdv({ idv: valori.idv ?? null })}
        onChange={(x) => imposta('idv', idvDaElenco(x))}
        clearable
        comboboxProps={{ withinPortal: true }}
      />
      <Autocomplete label="Collaboratore o DEC" data={valoriDec} value={valori.dec ?? ''} onChange={(x) => imposta('dec', x || null)} maxLength={100} comboboxProps={{ withinPortal: true }} />
    </SimpleGrid>
  );
}
