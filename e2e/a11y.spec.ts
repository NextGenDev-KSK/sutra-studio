import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Automated WCAG 2.1 A/AA scan of every workspace view, the intake and a report.
const VIEWS = ['overview', 'brief', 'budget', 'timeline', 'vendors', 'themes', 'guests', 'runofshow', 'team', 'exports'];

test('accessibility: no serious or critical axe violations', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.hero h1')).toBeVisible();
  const problems: string[] = [];
  for (const path of [...VIEWS.map((v) => `#/e/evt_demo/${v}`), '#/new', '#/e/evt_demo/report/budget']) {
    await page.goto(`./${path}`);
    await page.waitForTimeout(200);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const v of r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
      problems.push(
        `${path}: ${v.id} (${v.impact}) — ${v.nodes.length} node(s): ${v.nodes
          .slice(0, 2)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
      );
    }
  }
  expect(problems, problems.join('\n')).toEqual([]);
});

test('accessibility: co-pilot proposal and editor drawer', async ({ page }) => {
  const scan = async (label: string) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    return r.violations
      .filter((x) => x.impact === 'serious' || x.impact === 'critical')
      .map(
        (v) =>
          `${label}: ${v.id} — ${v.nodes
            .slice(0, 2)
            .map((n) => n.target.join(' '))
            .join(' | ')}`,
      );
  };
  await page.goto('./#/e/evt_demo/overview');
  await page.getByRole('button', { name: 'Open the event co-pilot' }).click();
  await page.locator('#copilot-input').fill('Reduce the total budget by 15% without cutting photography quality.');
  await page.locator('#copilot-input').press('Enter');
  await expect(page.locator('.proposal')).toBeVisible();
  const problems = await scan('co-pilot');
  await page.getByRole('button', { name: 'Close co-pilot' }).click();
  await page.goto('./#/e/evt_demo/vendors');
  await page.getByRole('button', { name: 'Kesar Décor Studio (demo)' }).click();
  problems.push(...(await scan('vendor drawer')));
  expect(problems, problems.join('\n')).toEqual([]);
});
