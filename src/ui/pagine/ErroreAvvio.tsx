import { Alert, Anchor, Button, Card, Code, Group, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useApp } from '../../stato/store';
import { PaginaPubblica } from '../layout/PaginaPubblica';
import { href } from '../router';

export function ErroreAvvio() {
  const errore = useApp((s) => s.erroreAvvio);
  return (
    <PaginaPubblica larga>
      <Card padding="xl" radius="lg">
        <Stack>
          <Title order={1} fz={22}>
            Impossibile avviare l'applicazione
          </Title>
          <Alert color="red" icon={<IconAlertTriangle size={18} />}>
            {errore}
          </Alert>
          <Text fz="sm">
            Verificare il file <Code>config.json</Code> pubblicato insieme all'applicazione e la raggiungibilità dell'archivio dati dalla rete in uso.
          </Text>
          <Group>
            <Button onClick={() => window.location.reload()}>Riprova</Button>
            <Anchor href={href('/diagnostica')} fz="sm">
              Apri la diagnostica della connessione
            </Anchor>
          </Group>
        </Stack>
      </Card>
    </PaginaPubblica>
  );
}
