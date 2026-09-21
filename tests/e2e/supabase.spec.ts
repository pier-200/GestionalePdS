import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MockSupabase } from '../unit/mockSupabase';
import { accedi, configura, instrada, notifica, scegli, vaiA } from './aiuti';

/** Carica la vera Edge Function (codice Deno) nel processo di test, con un ambiente Deno simulato. */
async function caricaFunzioneUtenti(sb: MockSupabase) {
  const richiedi = createRequire(import.meta.url);
  const sorgente = readFileSync(fileURLToPath(new URL('../../supabase/functions/gestione-utenti/index.ts', import.meta.url)), 'utf8');
  const js = stripTypeScriptTypes(sorgente).replace("'npm:@supabase/supabase-js@2'", `'${pathToFileURL(richiedi.resolve('@supabase/supabase-js')).href}'`);
  const cartella = fileURLToPath(new URL('../../test-results', import.meta.url));
  mkdirSync(cartella, { recursive: true });
  const file = join(cartella, `gestione-utenti-${Date.now()}.mjs`);
  writeFileSync(file, js);
  const env: Record<string, string> = { SUPABASE_URL: sb.url, SUPABASE_SECRET_KEYS: JSON.stringify({ default: sb.chiaveServizio }) };
  let gestore: ((req: Request) => Promise<Response>) | undefined;
  (globalThis as unknown as { Deno: unknown }).Deno = { serve: (h: typeof gestore) => (gestore = h), env: { get: (k: string) => env[k] } };
  globalThis.fetch = sb.fetch as typeof fetch;
  await import(pathToFileURL(file).href);
  sb.funzioni.set('gestione-utenti', gestore!);
}

test.describe('backend Supabase (emulato)', () => {
  test('primo amministratore, utenti con permessi limitati e accesso da un altro dispositivo', async ({ browser }) => {
    const sb = await MockSupabase.crea();
    await caricaFunzioneUtenti(sb);
    await sb.creaUtenteAuth('responsabile@pds.local', 'password-resp-1');
    const CONFIG = { nomeUfficio: 'Ufficio di prova', backend: { tipo: 'supabase', url: sb.url, chiavePubblica: sb.chiavePubblica } };
    const opzioni = { baseURL: 'http://localhost:4173/', locale: 'it-IT', timezoneId: 'Europe/Rome' };

    const primo = await browser.newContext({ ...opzioni, viewport: { width: 1440, height: 900 } });
    await configura(primo, CONFIG);
    await instrada(primo, `${sb.url}/**`, sb.fetch);
    const page = await primo.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Configurazione iniziale' })).toBeVisible();
    await page.getByLabel("Nome utente dell'amministratore").fill('responsabile');
    await page.getByLabel('Nome e cognome').fill('Rita Responsabile');
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('password-resp-1');
    await page.getByRole('button', { name: 'Diventa amministratore' }).click();
    await expect(page.getByRole('heading', { name: 'Panoramica' })).toBeVisible({ timeout: 30_000 });

    await vaiA(page, 'Capitoli di spesa');
    await page.getByRole('button', { name: 'Nuovo capitolo' }).click();
    let modale = page.getByRole('dialog');
    await modale.getByLabel('Codice capitolo').fill('1181');
    await modale.getByLabel('Totale finanziato').fill('50000');
    await modale.getByRole('button', { name: 'Salva' }).click();
    await notifica(page, 'Capitolo creato');

    await vaiA(page, 'Progetti di spesa');
    await page.getByRole('button', { name: 'Nuovo PdS' }).click();
    modale = page.getByRole('dialog');
    await modale.getByLabel('Numero del progetto di spesa').fill('1');
    await scegli(page, modale.getByRole('combobox', { name: 'Capitolo di spesa' }), /1181/);
    await modale.getByLabel('Importo del PdS inviato').fill('60000');
    await modale.getByLabel('Data di invio').fill('15/01/2026');
    await modale.getByLabel('Data di invio').press('Tab');
    await modale.getByRole('button', { name: 'Crea PdS' }).click();
    await expect(page.getByRole('heading', { name: /PdS 1\/2026/ })).toBeVisible();

    // Sforamento visibile nella sintesi (60.000 inviati su 50.000 finanziati)
    await vaiA(page, 'Sintesi finanziaria');
    await expect(page.getByText('Impegnato superiore al finanziato')).toBeVisible();

    // Utente con permessi sui soli pagamenti
    await vaiA(page, 'Utenti e permessi');
    await page.getByRole('button', { name: 'Nuovo utente' }).click();
    modale = page.getByRole('dialog');
    await modale.getByLabel('Nome e cognome').fill('Carlo Cassa');
    await modale.getByRole('textbox', { name: 'Nome utente' }).fill('c.cassa');
    await modale.getByLabel('Password iniziale').fill('password-carlo-1');
    await modale.getByRole('switch', { name: 'Pagamenti e saldo' }).check({ force: true });
    await modale.getByRole('button', { name: 'Crea utente' }).click();
    await notifica(page, 'Utente c.cassa creato');
    await expect(page.getByRole('cell', { name: /Carlo Cassa/ })).toBeVisible();

    // Altro dispositivo
    const secondo = await browser.newContext({ ...opzioni, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await configura(secondo, CONFIG);
    await instrada(secondo, `${sb.url}/**`, sb.fetch);
    const telefono = await secondo.newPage();
    await telefono.goto('/');
    await accedi(telefono, 'c.cassa', 'password-carlo-1');
    await vaiA(telefono, 'Progetti di spesa');
    await telefono.getByRole('link', { name: 'PdS 1/2026' }).click();
    await expect(telefono.getByRole('button', { name: 'Registra pagamento' })).toBeVisible();
    await expect(telefono.getByRole('button', { name: 'Modifica' })).toHaveCount(0);
    await telefono.getByRole('button', { name: 'Registra pagamento' }).click();
    const modalePagamento = telefono.getByRole('dialog');
    await modalePagamento.getByLabel('Importo').fill('1000');
    await modalePagamento.getByRole('button', { name: 'Salva' }).click();
    await notifica(telefono, 'Pagamento registrato');

    // Il pagamento registrato dal telefono è visibile al primo dispositivo
    const { rows } = await sb.db.query<{ importo: string }>('select importo::text from public.pagamenti');
    expect(rows).toEqual([{ importo: '1000.00' }]);
    await vaiA(page, 'Progetti di spesa');
    await page.getByRole('button', { name: 'Aggiorna i dati' }).click();
    await expect(page.getByRole('row').filter({ hasText: '1/2026' })).toContainText('1.000,00 €');
    await primo.close();
    await secondo.close();
  });
});
