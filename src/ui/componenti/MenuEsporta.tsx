import { Button, Menu } from '@mantine/core';
import { IconDownload, IconFileSpreadsheet, IconFileTypeCsv } from '@tabler/icons-react';
import { esportaFogli } from '../../esportazione/esportazione';
import type { Rapporto } from '../../esportazione/rapporti';
import { notificaErrore } from './azioni';

/**
 * Esportazione della sezione corrente: in Excel i fogli sono accompagnati dai
 * grafici dell'andamento finanziario, nel CSV ci sono i soli dati.
 */
export function MenuEsporta({ rapporto, disabilitato = false, etichetta }: { rapporto: () => Rapporto; disabilitato?: boolean; etichetta?: string }) {
  const esporta = async (formato: 'xlsx' | 'csv') => {
    try {
      const r = rapporto();
      await esportaFogli(r.base, r.fogli, formato, r.grafici);
    } catch (e) {
      notificaErrore(e, 'Esportazione non riuscita');
    }
  };

  return (
    <Menu position="bottom-end" shadow="md">
      <Menu.Target>
        <Button variant="default" leftSection={<IconDownload size={16} />} disabled={disabilitato}>
          Esporta
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {etichetta && <Menu.Label>{etichetta}</Menu.Label>}
        <Menu.Item leftSection={<IconFileSpreadsheet size={16} />} onClick={() => void esporta('xlsx')}>
          Excel (.xlsx) con grafici
        </Menu.Item>
        <Menu.Item leftSection={<IconFileTypeCsv size={16} />} onClick={() => void esporta('csv')}>
          CSV (separatore ;)
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
