import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { PASSWORD_DEMO, accedi, notifica, scegli, vaiA } from './aiuti';

function scheda(page: Page, titolo: string) {
  return page.locator('.mantine-Card-root').filter({ has: page.getByRole('heading', { name: titolo, exact: true }) });
}

async function compilaData(campo: ReturnType<Page['getByLabel']>, valore: string) {
  await campo.fill(valore);
  await campo.press('Tab');
}

test.describe('modalità dimostrativa', () => {
  test('ciclo di vita completo di un PdS con sintesi ed esportazione', async ({ page }) => {
    await page.goto('/');
    await accedi(page, 'admin', PASSWORD_DEMO);

    // Capitolo di spesa
    await vaiA(page, 'Capitoli di spesa');
    await page.getByRole('button', { name: 'Nuovo capitolo' }).click();
    const modaleCapitolo = page.getByRole('dialog');
    await modaleCapitolo.getByLabel('Codice capitolo').fill('9001');
    await modaleCapitolo.getByLabel('Totale finanziato').fill('10000');
    await modaleCapitolo.getByRole('button', { name: 'Salva' }).click();
    await notifica(page, 'Capitolo creato');
    await expect(page.getByRole('cell', { name: '9001', exact: true })).toBeVisible();

    // Nuovo PdS
    await vaiA(page, 'Progetti di spesa');
    await page.getByRole('button', { name: 'Nuovo PdS' }).click();
    const modalePds = page.getByRole('dialog');
    await modalePds.getByLabel('Numero del progetto di spesa').fill('99');
    await scegli(page, modalePds.getByRole('combobox', { name: 'Capitolo di spesa' }), /9001/);
    await modalePds.getByLabel('Ditta').fill('Formazione Continua S.r.l.');
    await modalePds.getByLabel('Collaboratore o DEC').fill('Ing. Prova');
    await modalePds.getByLabel('Ordinativo').fill('ODA-TEST-1');
    await modalePds.getByLabel('Importo del PdS inviato').fill('8000');
    await modalePds.getByLabel('Numero di protocollo').fill('0000990');
    await compilaData(modalePds.getByLabel('Data di invio'), '10/01/2026');
    await modalePds.getByRole('button', { name: 'Crea PdS' }).click();
    await expect(page.getByRole('heading', { name: /PdS 99\/2026/ })).toBeVisible();
    await expect(page.getByText('Inviato', { exact: true }).first()).toBeVisible();

    // Stipula
    const stipula = scheda(page, 'Stipula');
    await stipula.getByRole('button', { name: 'Modifica' }).click();
    await stipula.getByLabel('Valore della stipula').fill('7500');
    await stipula.getByLabel('Numero di protocollo').fill('0000123');
    await compilaData(stipula.getByLabel('Data del protocollo (data di stipula)'), '01/02/2026');
    await stipula.getByRole('button', { name: 'Salva' }).click();
    await notifica(page, 'Stipula: modifiche salvate');
    await expect(stipula.getByText('-500,00 € rispetto all\'inviato')).toBeVisible();
    // il protocollo si legge per esteso
    await expect(stipula.getByText('Prot. n. 0000123 del 01/02/2026')).toBeVisible();

    // Tempi di esecuzione: 30 giorni dalla stipula del 01/02/2026 → 03/03/2026
    const tempi = scheda(page, 'Tempi di esecuzione');
    await tempi.getByRole('button', { name: 'Modifica' }).click();
    await tempi.getByText('Durata dalla stipula').click();
    await tempi.getByRole('textbox', { name: 'Durata', exact: true }).fill('30');
    await expect(tempi.getByText('Scadenza calcolata: 03/03/2026')).toBeVisible();
    await tempi.getByRole('button', { name: 'Salva' }).click();
    await notifica(page, 'Tempi di esecuzione: modifiche salvate');
    await expect(tempi.getByText('03/03/2026')).toBeVisible();

    // Pagamenti e saldo
    const pagamenti = scheda(page, 'Pagamenti e saldo');
    await pagamenti.getByRole('button', { name: 'Registra pagamento' }).click();
    const modalePagamento = page.getByRole('dialog');
    await modalePagamento.getByLabel('Importo').fill('3000');
    await modalePagamento.getByLabel('Numero di protocollo').fill('0001234');
    await modalePagamento.getByRole('button', { name: 'Salva' }).click();
    await notifica(page, 'Pagamento registrato');
    await pagamenti.getByRole('button', { name: 'Conferma saldo' }).click();
    const modaleSaldo = page.getByRole('dialog');
    await expect(modaleSaldo.getByLabel('Importo del pagamento a saldo')).toHaveValue('4.500,00 €');
    await modaleSaldo.getByLabel('Importo del pagamento a saldo').fill('4400');
    await expect(modaleSaldo.getByText('100,00 €')).toBeVisible();
    await modaleSaldo.getByRole('button', { name: 'Conferma saldo' }).click();
    await notifica(page, 'Saldo del PdS 99/2026 confermato');
    await expect(pagamenti.getByText(/Saldo confermato il/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /PdS 99\/2026/ }).getByText('Saldato')).toBeVisible();
    await expect(scheda(page, 'Storico modifiche').getByText('Saldo confermato – PdS 99/2026')).toBeVisible();

    // Sintesi finanziaria del capitolo
    await vaiA(page, 'Sintesi finanziaria');
    const riga = page.getByRole('row').filter({ hasText: '9001' });
    await expect(riga).toContainText('10.000,00 €');
    await expect(riga).toContainText('7.500,00 €');
    await expect(riga).toContainText('7.400,00 €');
    // disponibile da impegnare: 10.000 - 7.500 + 100 di economie
    await expect(riga).toContainText('2.600,00 €');

    // Esportazione dell'elenco PdS filtrato
    await vaiA(page, 'Progetti di spesa');
    await page.getByPlaceholder(/Cerca per numero PdS/).fill('ODA-TEST');
    await expect(page.getByText('1 PdS su')).toBeVisible();
    await page.getByRole('button', { name: 'Esporta' }).click();
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /CSV/ }).click()]);
    expect(csv.suggestedFilename()).toMatch(/^elenco_pds_2026_\d{4}-\d{2}-\d{2}\.csv$/);
    const testo = readFileSync(await csv.path(), 'utf8');
    expect(testo).toContain('99/2026');
    expect(testo).toContain('7500,00');
    // il CSV riporta anche i riepiloghi della sezione
    expect(testo).toContain('Impegnato (Trasmesso)');
    expect(testo).toContain('Stato;N. PdS');
    await page.getByRole('button', { name: 'Esporta' }).click();
    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Excel/ }).click()]);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
    const pacchetto = unzipSync(new Uint8Array(readFileSync(await xlsx.path())));
    // l'Excel contiene i grafici nativi dell'andamento finanziario
    expect(Object.keys(pacchetto)).toEqual(expect.arrayContaining(['xl/charts/chart1.xml', 'xl/charts/chart2.xml', 'xl/drawings/drawing2.xml']));
    expect(Buffer.from(pacchetto['xl/charts/chart1.xml']).toString()).toContain('Impegnato e pagato per capitolo');
  });

  test("un utente senza permessi vede i dati in sola lettura", async ({ page }) => {
    await page.goto('/');
    await accedi(page, 'admin', PASSWORD_DEMO);
    await vaiA(page, 'Utenti e permessi');
    await page.getByRole('button', { name: 'Nuovo utente' }).click();
    const modale = page.getByRole('dialog');
    await modale.getByLabel('Nome e cognome').fill('Utente Prova');
    await modale.getByRole('textbox', { name: 'Nome utente' }).fill('utente.prova');
    await modale.getByLabel('Password iniziale').fill('password-prova-1');
    await modale.getByRole('button', { name: 'Crea utente' }).click();
    await notifica(page, 'Utente utente.prova creato');
    await expect(page.getByRole('cell', { name: /Utente Prova/ })).toBeVisible();

    await page.getByRole('button', { name: 'Menu utente' }).click();
    await page.getByRole('menuitem', { name: 'Esci' }).click();
    await accedi(page, 'utente.prova', 'password-prova-1');
    await expect(page.getByRole('link', { name: 'Utenti e permessi' })).toHaveCount(0);
    await vaiA(page, 'Progetti di spesa');
    await expect(page.getByRole('button', { name: 'Nuovo PdS' })).toHaveCount(0);
    await page.getByRole('link', { name: '3/2026' }).first().click();
    await expect(page.getByText('Sola lettura')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Modifica' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Registra pagamento' })).toHaveCount(0);
    // registro e storico modifiche restano riservati all'amministratore
    await expect(page.getByRole('link', { name: 'Registro modifiche' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Storico modifiche' })).toHaveCount(0);
  });

  test('i PdS eliminati sono ripristinabili solo dall\u2019amministratore', async ({ page }) => {
    await page.goto('/');
    await accedi(page, 'admin', PASSWORD_DEMO);
    await vaiA(page, 'Progetti di spesa');
    await page.getByRole('link', { name: '9/2026', exact: true }).first().click();
    await page.getByRole('button', { name: 'Elimina PdS' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click();
    await notifica(page, 'spostato tra i PdS eliminati');
    await expect(page.getByRole('link', { name: '9/2026', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: /PdS eliminati/ }).click();
    await expect(page.getByRole('heading', { name: 'PdS eliminati' })).toBeVisible();
    await page.getByRole('button', { name: 'Ripristina il PdS 9/2026' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ripristina' }).click();
    await notifica(page, 'ripristinato');
    await vaiA(page, 'Progetti di spesa');
    await expect(page.getByRole('link', { name: '9/2026', exact: true }).first()).toBeVisible();
  });

  test('accordi quadro: atti di adesione, ordinativi e capienza residua', async ({ page }) => {
    await page.goto('/');
    await accedi(page, 'admin', PASSWORD_DEMO);

    // Nuovo accordo quadro
    await vaiA(page, 'Accordi quadro');
    await page.getByRole('button', { name: 'Nuovo accordo quadro' }).click();
    let modale = page.getByRole('dialog');
    await modale.getByLabel('Numero').fill('AQ 99/2026');
    await modale.getByLabel('Ditta').fill('Collaudo S.r.l.');
    await modale.getByLabel('Oggetto').fill('Servizi di collaudo');
    await modale.getByLabel('Protocollo di stipula').fill('0007777');
    await compilaData(modale.getByLabel('Data di stipula'), '02/01/2026');
    await modale.getByLabel('Importo contrattuale').fill('100000');
    await modale.getByRole('button', { name: 'Salva' }).click();
    await notifica(page, 'Accordo quadro creato');

    await page.getByRole('link', { name: 'AQ 99/2026' }).first().click();
    await expect(page.getByRole('heading', { name: 'AQ 99/2026' })).toBeVisible();
    await expect(page.getByText('Prot. n. 0007777 del 02/01/2026')).toBeVisible();

    // Atto di adesione a quantità indeterminata: impegna la capienza ma non i capitoli
    await page.getByRole('button', { name: 'Nuovo atto di adesione' }).click();
    modale = page.getByRole('dialog');
    await modale.getByLabel('Numero').fill('AdA 1');
    await modale.getByLabel('Valore stipulato').fill('40000');
    await modale.getByLabel('Oggetto').fill('Collaudi a chiamata');
    await modale.getByRole('button', { name: 'Salva' }).click();
    await notifica(page, 'Atto di adesione creato');
    await expect(page.getByText('60.000,00 €').first()).toBeVisible();

    // Ordinativo sull'atto di adesione: impegna il capitolo e consuma la quota dell'atto
    await vaiA(page, 'Progetti di spesa');
    await page.getByRole('button', { name: 'Nuovo PdS' }).click();
    modale = page.getByRole('dialog');
    await modale.getByLabel('Numero del progetto di spesa').fill('77');
    await scegli(page, modale.getByRole('combobox', { name: 'Capitolo di spesa' }), /1181/);
    await scegli(page, modale.getByRole('combobox', { name: 'Accordo quadro (eventuale)' }), /AQ 99\/2026/);
    await scegli(page, modale.getByRole('combobox', { name: 'Atto di adesione a quantità indeterminata' }), /AdA 1/);
    await modale.getByLabel('Importo del PdS inviato').fill('15000');
    await compilaData(modale.getByLabel('Data di invio'), '15/02/2026');
    await modale.getByRole('button', { name: 'Crea PdS' }).click();
    await expect(page.getByRole('heading', { name: /PdS 77\/2026/ })).toBeVisible();

    // L'accordo quadro registra l'ordinativo e aggiorna il residuo dell'atto
    await vaiA(page, 'Accordi quadro');
    await page.getByRole('link', { name: 'AQ 99/2026' }).first().click();
    const schedaAtto = page.locator('.mantine-Card-root').filter({ hasText: 'Collaudi a chiamata' }).first();
    await expect(schedaAtto).toContainText('15.000,00 €');
    await expect(schedaAtto).toContainText('25.000,00 €');
    await expect(schedaAtto.getByRole('link', { name: '77/2026' })).toBeVisible();

    // Modifica dell'accordo quadro
    await page.getByRole('button', { name: 'Modifica accordo' }).click();
    modale = page.getByRole('dialog');
    await modale.getByLabel('Importo contrattuale').fill('50000');
    await modale.getByRole('button', { name: 'Salva' }).click();
    await notifica(page, 'Accordo quadro aggiornato');
    await expect(page.getByText('10.000,00 €').first()).toBeVisible();
  });

  test('evidenzia scadenze e sforamenti @mobile', async ({ page }) => {
    await page.goto('/');
    await accedi(page, 'l.verdi', PASSWORD_DEMO);
    await vaiA(page, 'Scadenze e avvisi');
    await expect(page.getByRole('heading', { name: 'PdS scaduti non saldati' })).toBeVisible();
    await expect(page.getByText('11/2026').first()).toBeVisible();
    await vaiA(page, 'Sintesi finanziaria');
    await expect(page.getByText('Impegnato superiore al finanziato')).toBeVisible();
    await expect(page.getByText('Superamento').first()).toBeVisible();
    // il superamento autorizzato dall'amministratore non compare tra quelli da segnalare
    await expect(page.getByText('Autorizzato').first()).toBeVisible();
  });
});
