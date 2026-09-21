import { Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useCallback, useState, type ReactNode } from 'react';
import { messaggioErrore } from '../../domain/errori';

export function notificaSuccesso(messaggio: string) {
  notifications.show({ color: 'green', message: messaggio, icon: <IconCheck size={18} />, autoClose: 3500 });
}

export function notificaErrore(errore: unknown, titolo = 'Operazione non riuscita') {
  notifications.show({ color: 'red', title: titolo, message: messaggioErrore(errore), icon: <IconX size={18} />, autoClose: 9000 });
}

/** Esegue un'operazione asincrona gestendo stato di attesa e notifiche. */
export function useAzione() {
  const [inCorso, setInCorso] = useState(false);
  const esegui = useCallback(async <T,>(fn: () => Promise<T>, messaggioSuccesso?: string): Promise<T | undefined> => {
    setInCorso(true);
    try {
      const risultato = await fn();
      if (messaggioSuccesso) notificaSuccesso(messaggioSuccesso);
      return risultato;
    } catch (e) {
      notificaErrore(e);
      return undefined;
    } finally {
      setInCorso(false);
    }
  }, []);
  return { inCorso, esegui };
}

export function chiediConferma(opzioni: { titolo: string; messaggio: ReactNode; conferma?: string; pericolosa?: boolean }): Promise<boolean> {
  return new Promise((risolvi) => {
    modals.openConfirmModal({
      title: <Text fw={600}>{opzioni.titolo}</Text>,
      children: typeof opzioni.messaggio === 'string' ? <Text fz="sm">{opzioni.messaggio}</Text> : opzioni.messaggio,
      labels: { confirm: opzioni.conferma ?? 'Conferma', cancel: 'Annulla' },
      confirmProps: { color: opzioni.pericolosa ? 'red' : undefined },
      onConfirm: () => risolvi(true),
      onCancel: () => risolvi(false),
      onClose: () => risolvi(false),
    });
  });
}
