import { Button } from '@mantine/core';
import { IconMapPinOff } from '@tabler/icons-react';
import { StatoVuoto } from '../componenti/base';
import { href } from '../router';

export function NonTrovata() {
  return (
    <StatoVuoto
      icona={<IconMapPinOff size={26} />}
      titolo="Pagina non trovata"
      descrizione="Il collegamento potrebbe essere errato oppure non hai i permessi per visualizzare questa sezione."
      azione={
        <Button component="a" href={href('/')} variant="light" mt="sm">
          Torna alla panoramica
        </Button>
      }
    />
  );
}
