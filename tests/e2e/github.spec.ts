import { expect, test } from '@playwright/test';
import { MockGitHub } from '../unit/mockGitHub';
import { accedi, configura, instrada, notifica, scegli, vaiA } from './aiuti';

const CONFIG = { nomeUfficio: 'Ufficio di prova', backend: { tipo: 'github', owner: 'ufficio', repoDati: 'pds-dati', repoAccessi: 'pds-accessi' } };
const TOKEN = 'github_pat_E2E_0123456789abcdef';

test.describe('backend GitHub (emulato)', () => {
  test('configurazione iniziale, salvataggi e accesso da un secondo dispositivo', async ({ browser }) => {
    const gh = new MockGitHub();
    gh.creaRepo('ufficio/pds-dati', true);
    gh.creaRepo('ufficio/pds-accessi', false);
    gh.tokenValidi.add(TOKEN);

    // Primo dispositivo: configurazione dell'amministratore
    const primo = await browser.newContext({ baseURL: 'http://localhost:4173/', locale: 'it-IT', timezoneId: 'Europe/Rome', viewport: { width: 1440, height: 900 } });
    await configura(primo, CONFIG);
    await instrada(primo, 'https://api.github.com/**', gh.fetch);
    await instrada(primo, 'https://raw.githubusercontent.com/**', gh.fetch);
    const page = await primo.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Configurazione iniziale' })).toBeVisible();
    await page.getByLabel('Token di accesso GitHub').fill(TOKEN);
    await page.getByLabel("Nome utente dell'amministratore").fill('anna.ferri');
    await page.getByLabel('Nome e cognome').fill('Anna Ferri');
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('password-anna-1');
    await page.getByRole('textbox', { name: 'Conferma password' }).fill('password-anna-1');
    await page.getByRole('button', { name: 'Configura e accedi' }).click();
    await expect(page.getByRole('heading', { name: 'Panoramica' })).toBeVisible({ timeout: 60_000 });
    expect(gh.leggiFile('ufficio/pds-accessi', 'keyring.json')).not.toContain(TOKEN);

    await vaiA(page, 'Capitoli di spesa');
    await page.getByRole('button', { name: 'Nuovo capitolo' }).click();
    let modale = page.getByRole('dialog');
    await modale.getByLabel('Codice capitolo').fill('4455');
    await modale.getByLabel('Totale finanziato').fill('25000,50');
    await modale.getByRole('button', { name: 'Salva' }).click();
    await notifica(page, 'Capitolo creato');

    await vaiA(page, 'Progetti di spesa');
    await page.getByRole('button', { name: 'Nuovo PdS' }).click();
    modale = page.getByRole('dialog');
    await modale.getByLabel('Numero del progetto di spesa').fill('7');
    await scegli(page, modale.getByRole('combobox', { name: 'Capitolo di spesa' }), /4455/);
    await modale.getByLabel('Importo del PdS inviato').fill('1500');
    await modale.getByRole('button', { name: 'Crea PdS' }).click();
    await expect(page.getByRole('heading', { name: /PdS 7\/2026/ })).toBeVisible();

    // i dati sono nel repository privato, con importi in centesimi
    expect(gh.leggiFile('ufficio/pds-dati', 'db/pds.json')).toContain('"importo_inviato": 150000');
    expect(gh.leggiFile('ufficio/pds-dati', 'db/capitoli.json')).toContain('"finanziato": 2500050');

    // Crea un secondo utente
    await vaiA(page, 'Utenti e permessi');
    await page.getByRole('button', { name: 'Nuovo utente' }).click();
    modale = page.getByRole('dialog');
    await modale.getByLabel('Nome e cognome').fill('Marco Bianchi');
    await modale.getByRole('textbox', { name: 'Nome utente' }).fill('m.bianchi');
    await modale.getByLabel('Password iniziale').fill('password-marco-1');
    await modale.getByRole('button', { name: 'Crea utente' }).click();
    await notifica(page, 'Utente m.bianchi creato');

    // Secondo dispositivo (smartphone): nessuna sessione condivisa, stesso archivio su GitHub
    const secondo = await browser.newContext({ baseURL: 'http://localhost:4173/', locale: 'it-IT', timezoneId: 'Europe/Rome', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await configura(secondo, CONFIG);
    await instrada(secondo, 'https://api.github.com/**', gh.fetch);
    await instrada(secondo, 'https://raw.githubusercontent.com/**', gh.fetch);
    const telefono = await secondo.newPage();
    await telefono.goto('/');
    await accedi(telefono, 'm.bianchi', 'password-marco-1');
    await vaiA(telefono, 'Progetti di spesa');
    await expect(telefono.getByRole('link', { name: 'PdS 7/2026' })).toBeVisible();
    await expect(telefono.getByRole('button', { name: 'Nuovo PdS' })).toHaveCount(0);

    // Il primo dispositivo resta connesso dopo il ricaricamento della pagina
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Utenti e permessi' })).toBeVisible({ timeout: 30_000 });
    await primo.close();
    await secondo.close();
  });
});
