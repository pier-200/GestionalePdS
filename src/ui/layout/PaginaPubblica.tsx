import { Anchor, Container, Group, Text } from '@mantine/core';
import { IconReceipt2 } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useApp } from '../../stato/store';
import { href } from '../router';

/** Tessera con il logo: usata sia qui sia dentro la scheda di accesso. */
export function MarchioPds({ size = 30 }: { size?: number }) {
  return (
    <div className="marchio-tessera" aria-hidden>
      <IconReceipt2 size={size} />
    </div>
  );
}

interface Props {
  children: ReactNode;
  larga?: boolean;
  /** Marchio sopra il contenuto: la pagina di accesso lo mostra dentro la scheda. */
  marchio?: boolean;
  /** Riga in fondo alla pagina, sul fondo blu. */
  piede?: ReactNode;
}

/** Cornice delle pagine accessibili senza login (accesso, primo avvio, diagnostica). */
export function PaginaPubblica({ children, larga = false, marchio = true, piede }: Props) {
  const nomeUfficio = useApp((s) => s.config?.nomeUfficio);
  return (
    <div className="pagina-pubblica">
      <Container size={larga ? 'md' : 460} p={0} className="pagina-pubblica-corpo">
        {marchio && (
          <Group gap={14} mb="lg" justify="center" wrap="nowrap">
            <MarchioPds />
            <div>
              <Anchor href={href('/')} underline="never" c="white">
                <Text fw={700} fz={20} lh={1.2}>
                  Gestionale PdS
                </Text>
              </Anchor>
              <Text fz="xs" lh={1.25} c="rgba(255,255,255,0.8)">
                {nomeUfficio || 'Progetti di spesa, capitoli e sintesi finanziaria'}
              </Text>
            </div>
          </Group>
        )}
        {children}
      </Container>
      {piede && <div className="piede-pubblico">{piede}</div>}
    </div>
  );
}
