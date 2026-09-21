import { Select } from '@mantine/core';
import { useMemo } from 'react';
import { annoDi } from '../../domain/date';
import { eserciziDisponibili } from '../../domain/calcoli';
import { useOggi } from '../../stato/derivati';
import { useApp } from '../../stato/store';
import { aggiornaQuery, usePosizione } from '../router';

/**
 * Esercizio selezionato (dalla query dell'indirizzo): si lavora sempre su un
 * singolo esercizio finanziario, con predefinito l'anno corrente o il più recente.
 */
export function useEsercizioSelezionato(): { valore: string; anno: number; opzioni: { value: string; label: string }[] } {
  const capitoli = useApp((s) => s.dati.capitoli);
  const oggi = useOggi();
  const { query } = usePosizione();
  const anni = useMemo(() => eserciziDisponibili({ capitoli }), [capitoli]);
  const annoCorrente = annoDi(oggi);
  const disponibili = anni.length ? anni : [annoCorrente];
  const opzioni = disponibili.map((a) => ({ value: String(a), label: `Esercizio ${a}` }));
  const richiesto = query.get('esercizio');
  const predefinito = String(disponibili.includes(annoCorrente) ? annoCorrente : disponibili[0]);
  const valore = richiesto && opzioni.some((o) => o.value === richiesto) ? richiesto : predefinito;
  return { valore, anno: Number(valore), opzioni };
}

export function SelettoreEsercizio({ w = 180 }: { w?: number }) {
  const { valore, opzioni } = useEsercizioSelezionato();
  return (
    <Select
      aria-label="Esercizio finanziario"
      data={opzioni}
      value={valore}
      onChange={(v) => aggiornaQuery({ esercizio: v })}
      allowDeselect={false}
      w={w}
      comboboxProps={{ withinPortal: true }}
    />
  );
}
