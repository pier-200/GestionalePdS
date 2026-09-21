import { Center, Loader, MantineProvider, Stack, Text } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { useEffect } from 'react';
import { useApp } from '../stato/store';
import { Guscio } from './layout/Guscio';
import { PaginaPubblica } from './layout/PaginaPubblica';
import { Accesso } from './pagine/Accesso';
import { Diagnostica } from './pagine/Diagnostica';
import { ErroreAvvio } from './pagine/ErroreAvvio';
import { PrimoAvvio } from './pagine/PrimoAvvio';
import { usePosizione } from './router';
import { tema } from './tema';

let avviata = false;

function Radice() {
  const fase = useApp((s) => s.fase);
  const { percorso } = usePosizione();

  useEffect(() => {
    if (avviata) return;
    avviata = true;
    void useApp.getState().avvia();
  }, []);

  if (fase !== 'pronto' && percorso === '/diagnostica') {
    return (
      <PaginaPubblica larga>
        <Diagnostica />
      </PaginaPubblica>
    );
  }

  switch (fase) {
    case 'avvio':
      return (
        <Center h="100vh">
          <Stack align="center" gap="sm">
            <Loader />
            <Text c="dimmed" fz="sm">
              Caricamento del Gestionale PdS…
            </Text>
          </Stack>
        </Center>
      );
    case 'errore':
      return <ErroreAvvio />;
    case 'primo_avvio':
      return <PrimoAvvio />;
    case 'accesso':
      return <Accesso />;
    case 'pronto':
      return <Guscio />;
  }
}

export function App() {
  return (
    <MantineProvider theme={tema} defaultColorScheme="light">
      <DatesProvider settings={{ locale: 'it', firstDayOfWeek: 1, weekendDays: [0, 6] }}>
        <ModalsProvider labels={{ confirm: 'Conferma', cancel: 'Annulla' }}>
          <Notifications position="top-right" zIndex={1000} />
          <Radice />
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
