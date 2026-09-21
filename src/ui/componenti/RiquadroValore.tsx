import { Card, Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

/** Riquadro indicatore: etichetta, valore principale e dettagli. */
export function RiquadroValore({
  etichetta,
  valore,
  dettaglio,
  sotto,
  icona,
  href,
}: {
  etichetta: string;
  valore: ReactNode;
  dettaglio?: ReactNode;
  sotto?: ReactNode;
  icona?: ReactNode;
  href?: string;
}) {
  return (
    <Card padding="md" component={href ? 'a' : 'div'} href={href} style={href ? { textDecoration: 'none', color: 'inherit' } : undefined}>
      <Stack gap={6} h="100%">
        <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
          <Text fz="sm" c="dimmed" fw={500} lh={1.3}>
            {etichetta}
          </Text>
          {icona}
        </Group>
        <Text fz={{ base: 22, sm: 24 }} fw={600} lh={1.15} style={{ overflowWrap: 'anywhere' }}>
          {valore}
        </Text>
        {sotto}
        {dettaglio && (
          <Text fz="xs" c="dimmed" component="div" lh={1.4}>
            {dettaglio}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
