import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5182/';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const storageKey = 'marble-run-studio.design.v1';

async function saved(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
}

async function clickCell(page, col, row) {
  const bounds = await page.locator('canvas').boundingBox();
  await page.locator('canvas').click({
    position: { x: (col + 0.5) * bounds.width / 14, y: (row + 0.5) * bounds.height / 10 },
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.goto(baseURL);
  await expect(page.getByRole('heading', { name: 'Small pieces. Big possibilities.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Release marble' })).toBeVisible();
  await expect.poll(async () => (await saved(page))?.pieces.length).toBe(7);
  await page.screenshot({ path: 'artifacts/desktop-ready.png', fullPage: true });

  await page.getByRole('button', { name: 'Release marble' }).click();
  await expect(page.getByRole('button', { name: 'Pause marble' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Pause marble' }).click();
  const pausedTime = await page.locator('.stats strong').first().textContent();
  await page.waitForTimeout(400);
  expect(await page.locator('.stats strong').first().textContent()).toBe(pausedTime);
  await page.getByRole('button', { name: 'Keep rolling' }).click();
  await expect(page.locator('.status-label')).toHaveText('Beautiful landing!', { timeout: 15_000 });
  await page.screenshot({ path: 'artifacts/desktop-landed.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset marble', exact: true }).click();
  await expect(page.locator('.stats strong').first()).toHaveText('0.0s');
  await expect(page.locator('.status-label')).toHaveText('Ready to roll');

  await page.getByRole('button', { name: 'Choose Straight rail' }).click();
  await clickCell(page, 11, 3);
  await expect.poll(async () => (await saved(page)).pieces.length).toBe(8);
  await page.getByRole('button', { name: /^Rotate/ }).click();
  await expect.poll(async () => (await saved(page)).pieces.find(p => p.col === 11 && p.row === 3)?.rotation).toBe(1);
  await page.reload();
  await expect.poll(async () => (await saved(page)).pieces.length).toBe(8);
  await clickCell(page, 11, 3);
  await page.getByRole('button', { name: 'Remove selected piece' }).click();
  await expect.poll(async () => (await saved(page)).pieces.length).toBe(7);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await saved(page)).pieces.length).toBe(8);

  await page.getByRole('button', { name: 'Clear board' }).click();
  await expect(page.locator('.board-feedback')).toContainText('No pieces yet');
  await page.getByRole('button', { name: 'Release marble' }).click();
  await expect(page.locator('.status-label')).toHaveText('Try a little tweak', { timeout: 12_000 });
  await page.getByRole('button', { name: 'Reset marble', exact: true }).click();
  await page.getByRole('button', { name: 'Choose Quarter curve' }).click();
  await page.locator('canvas').focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.keyboard.press('r');
  await expect.poll(async () => (await saved(page)).pieces[0]?.rotation).toBe(1);
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await saved(page)).pieces.length).toBe(0);

  for (const id of ['mirror', 'leap']) {
    await page.getByLabel('Try a track').selectOption(id);
    await page.getByRole('button', { name: 'Release marble' }).click();
    await expect(page.locator('.status-label')).toHaveText('Beautiful landing!', { timeout: 15_000 });
  }
  await page.getByLabel('Try a track').selectOption('cascade');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.evaluate(key => localStorage.setItem(key, '{invalid'), storageKey);
  await page.reload();
  await expect.poll(async () => (await saved(page)).pieces.length).toBe(7);
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(baseURL);
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mobile.getByRole('button', { name: 'Release marble' }).tap();
  await expect(mobile.locator('.status-label')).toHaveText('Beautiful landing!', { timeout: 15_000 });
  await mobile.getByRole('button', { name: 'Reset marble', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Choose Spring bumper' }).tap();
  await clickCell(mobile, 11, 2);
  await expect.poll(async () => (await saved(mobile)).pieces.length).toBe(8);
  await mobile.getByRole('button', { name: /^Rotate/ }).tap();
  await mobile.screenshot({ path: 'artifacts/mobile-editor.png', fullPage: true });
  await mobile.getByRole('button', { name: 'Remove selected piece' }).tap();
  await expect.poll(async () => (await saved(mobile)).pieces.length).toBe(7);
  await expect(mobile.locator('.status-label')).toHaveText('Ready to roll');
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
  console.log(`PASS ${baseURL}: desktop/mobile launch, pause, resume, landing, reset, edit, rotate, remove, undo, persistence, invalid-save recovery, keyboard, 3 examples and responsive widths; zero browser errors.`);
} finally {
  await browser.close();
}
