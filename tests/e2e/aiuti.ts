import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

export const PASSWORD_DEMO = 'demo-pds-2026';

/** Instrada le richieste del browser verso un emulatore in-process (fetch compatibile). */
export async function instrada(context: BrowserContext | Page, schema: string, fetchFn: (url: string, init: RequestInit) => Promise<Response>) {
  await context.route(schema, async (route) => {
    const req = route.request();
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
      'access-control-expose-headers': '*',
    };
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const headers = await req.allHeaders();
    delete headers['content-length'];
    const corpo = req.postDataBuffer();
    try {
      const res = await fetchFn(req.url(), { method: req.method(), headers, body: corpo && req.method() !== 'GET' && req.method() !== 'HEAD' ? new Uint8Array(corpo) : undefined });
      const intestazioni: Record<string, string> = { ...cors };
      res.headers.forEach((v, k) => (intestazioni[k] = v));
      await route.fulfill({ status: res.status, headers: intestazioni, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) {
      await route.abort('failed');
      throw e;
    }
  });
}

export async function configura(context: BrowserContext | Page, config: unknown) {
  await context.route('**/config.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) }));
}

export async function accedi(page: Page, username: string, password: string) {
  await page.getByLabel('Nome utente').fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page.getByRole('heading', { name: 'Panoramica' })).toBeVisible({ timeout: 30_000 });
}

/** Seleziona un'opzione in una Select di Mantine. */
export async function scegli(page: Page, campo: Locator, opzione: string | RegExp) {
  await campo.click();
  await page.getByRole('option', { name: opzione }).first().click();
}

export async function vaiA(page: Page, voce: string) {
  const burger = page.getByRole('button', { name: 'Apri il menu di navigazione' });
  if (await burger.isVisible()) await burger.click();
  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: voce }).click();
}

export async function notifica(page: Page, testo: string | RegExp) {
  await expect(page.locator('.mantine-Notification-root').filter({ hasText: testo }).first()).toBeVisible();
}
