import { Card, Group, Pagination, Select, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type MouseEvent as EventoMouse, type ReactNode } from 'react';
import { confrontoNaturale } from '../../domain/calcoli';

export interface Colonna<T> {
  chiave: string;
  titolo: ReactNode;
  /** Valore usato per l'ordinamento (se assente la colonna non è ordinabile). */
  ordina?: (riga: T) => string | number | null | undefined;
  render: (riga: T) => ReactNode;
  allinea?: 'left' | 'right' | 'center';
  larghezza?: number | string;
  /** Titolo accessibile se `titolo` non è testuale. */
  descrizione?: string;
}

export interface Ordinamento {
  chiave: string;
  direzione: 'asc' | 'desc';
}

interface Props<T> {
  righe: T[];
  colonne: Colonna<T>[];
  chiaveRiga: (riga: T) => string;
  ordinamentoIniziale?: Ordinamento;
  onClickRiga?: (riga: T) => void;
  classeRiga?: (riga: T) => string | undefined;
  /** Rappresentazione a scheda per schermi stretti. */
  scheda?: (riga: T) => ReactNode;
  classeScheda?: (riga: T) => string | undefined;
  vuoto?: ReactNode;
  /** Piede della tabella (elemento Table.Tfoot) in modalità tabellare. */
  piede?: ReactNode;
  /** Riepilogo mostrato sotto le schede in modalità stretta. */
  piedeSchede?: ReactNode;
  paginazione?: boolean;
  larghezzaMinima?: number;
  etichetta: string;
}

const DIMENSIONI_PAGINA = ['25', '50', '100', 'Tutti'];

export function confrontaValori(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const vuotoA = a == null || a === '';
  const vuotoB = b == null || b === '';
  if (vuotoA && vuotoB) return 0;
  if (vuotoA) return 1;
  if (vuotoB) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return confrontoNaturale(String(a), String(b));
}

export function Tabella<T>({
  righe,
  colonne,
  chiaveRiga,
  ordinamentoIniziale,
  onClickRiga,
  classeRiga,
  scheda,
  classeScheda,
  vuoto,
  piede,
  piedeSchede,
  paginazione = true,
  larghezzaMinima = 900,
  etichetta,
}: Props<T>) {
  const stretto = useMediaQuery('(max-width: 62em)');
  const [ordinamento, setOrdinamento] = useState<Ordinamento | undefined>(ordinamentoIniziale);
  const [pagina, setPagina] = useState(1);
  const [dimensione, setDimensione] = useState('50');

  const ordinate = useMemo(() => {
    if (!ordinamento) return righe;
    const col = colonne.find((c) => c.chiave === ordinamento.chiave);
    if (!col?.ordina) return righe;
    const segno = ordinamento.direzione === 'asc' ? 1 : -1;
    return [...righe].sort((a, b) => {
      const va = col.ordina!(a);
      const vb = col.ordina!(b);
      const vuotoA = va == null || va === '';
      const vuotoB = vb == null || vb === '';
      if (vuotoA !== vuotoB) return vuotoA ? 1 : -1; // i vuoti restano in fondo in entrambe le direzioni
      return segno * confrontaValori(va, vb);
    });
  }, [righe, colonne, ordinamento]);

  const perPagina = dimensione === 'Tutti' ? Number.POSITIVE_INFINITY : Number(dimensione);
  const pagine = Math.max(1, Math.ceil(ordinate.length / perPagina));
  useEffect(() => {
    if (pagina > pagine) setPagina(1);
  }, [pagina, pagine]);
  const visibili = paginazione && Number.isFinite(perPagina) ? ordinate.slice((pagina - 1) * perPagina, pagina * perPagina) : ordinate;

  const cambiaOrdinamento = (chiave: string) => {
    setOrdinamento((o) => {
      if (!o || o.chiave !== chiave) return { chiave, direzione: 'asc' };
      if (o.direzione === 'asc') return { chiave, direzione: 'desc' };
      return undefined;
    });
  };

  if (righe.length === 0) return <>{vuoto}</>;

  const controlliPaginazione = paginazione && ordinate.length > 25 && (
    <Group justify="space-between" mt="sm" gap="xs" className="no-stampa">
      <Group gap={6}>
        <Text fz="xs" c="dimmed">
          Righe per pagina
        </Text>
        <Select
          size="xs"
          w={84}
          data={DIMENSIONI_PAGINA}
          value={dimensione}
          onChange={(v) => {
            setDimensione(v ?? '50');
            setPagina(1);
          }}
          allowDeselect={false}
          aria-label="Righe per pagina"
        />
        <Text fz="xs" c="dimmed">
          {ordinate.length} risultati
        </Text>
      </Group>
      {pagine > 1 && <Pagination size="sm" total={pagine} value={pagina} onChange={setPagina} siblings={1} />}
    </Group>
  );

  if (stretto && scheda) {
    return (
      <Stack gap="xs">
        {visibili.map((riga) => (
          <Card
            key={chiaveRiga(riga)}
            padding="sm"
            className={`${onClickRiga ? 'riga-cliccabile ' : ''}${classeScheda?.(riga) ?? ''}`}
            // l'intera scheda è cliccabile per comodità; da tastiera si usa il collegamento interno
            onClick={
              onClickRiga
                ? (e: EventoMouse) => {
                    if ((e.target as HTMLElement).closest('a,button,input,[role="button"]')) return;
                    onClickRiga(riga);
                  }
                : undefined
            }
          >
            {scheda(riga)}
          </Card>
        ))}
        {piedeSchede}
        {controlliPaginazione}
      </Stack>
    );
  }

  return (
    <div>
      <Table.ScrollContainer minWidth={larghezzaMinima} type="native">
        <Table highlightOnHover={Boolean(onClickRiga)} verticalSpacing={8} horizontalSpacing="sm" aria-label={etichetta} stickyHeader stickyHeaderOffset={0}>
          <Table.Thead>
            <Table.Tr>
              {colonne.map((c) => {
                const attivo = ordinamento?.chiave === c.chiave;
                const icona = !attivo ? <IconArrowsSort size={13} opacity={0.45} /> : ordinamento!.direzione === 'asc' ? <IconArrowUp size={13} /> : <IconArrowDown size={13} />;
                return (
                  <Table.Th
                    key={c.chiave}
                    style={{ textAlign: c.allinea ?? 'left', width: c.larghezza, minWidth: c.larghezza }}
                    aria-sort={attivo ? (ordinamento!.direzione === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {c.ordina ? (
                      <UnstyledButton className="th-ordinabile" onClick={() => cambiaOrdinamento(c.chiave)} fz="xs" fw={600} aria-label={c.descrizione}>
                        <Group gap={4} wrap="nowrap" justify={c.allinea === 'right' ? 'flex-end' : c.allinea === 'center' ? 'center' : 'flex-start'}>
                          <span>{c.titolo}</span>
                          {icona}
                        </Group>
                      </UnstyledButton>
                    ) : (
                      <Text fz="xs" fw={600} component="span">
                        {c.titolo}
                      </Text>
                    )}
                  </Table.Th>
                );
              })}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibili.map((riga) => (
              <Table.Tr
                key={chiaveRiga(riga)}
                className={`${onClickRiga ? 'riga-cliccabile ' : ''}${classeRiga?.(riga) ?? ''}`}
                onClick={
                  onClickRiga
                    ? (e) => {
                        if ((e.target as HTMLElement).closest('a,button,input,[role="button"]')) return;
                        onClickRiga(riga);
                      }
                    : undefined
                }
              >
                {colonne.map((c) => (
                  <Table.Td key={c.chiave} style={{ textAlign: c.allinea ?? 'left', verticalAlign: 'top' }}>
                    {c.render(riga)}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
          {piede}
        </Table>
      </Table.ScrollContainer>
      {controlliPaginazione}
    </div>
  );
}
