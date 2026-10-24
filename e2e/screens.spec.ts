import { test } from '@playwright/test';

// Captures every view for visual review (not an assertion suite).
const VIEWS = ['overview', 'brief', 'budget', 'timeline', 'vendors', 'themes', 'guests', 'runofshow', 'team', 'exports'];

test('capture screens', async ({ page }, info) => {
  await page.goto('./');
  await page.waitForSelector('.hero');
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('sutra-studio:workspace')!).state.activeEventId);
  for (const v of VIEWS) {
    await page.goto(`./#/e/${id}/${v}`);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `e2e/screenshots/${info.project.name}-${v}.png`, fullPage: true });
  }
  await page.goto(`./#/e/${id}/report/brief`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}-report-brief.png`, fullPage: true });
  await page.goto('./#/new');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}-intake.png`, fullPage: true });
});

test('capture co-pilot proposal', async ({ page }, info) => {
  await page.goto('./#/e/evt_demo/overview');
  await page.waitForSelector('.hero');
  await page.getByRole('button', { name: 'Open the event co-pilot' }).click();
  await page.locator('#copilot-input').fill('Our decorator cancelled. What does this affect?');
  await page.locator('#copilot-input').press('Enter');
  await page.waitForSelector('.proposal');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}-copilot.png` });
  await page.locator('.copilot-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}-copilot-end.png` });
});
