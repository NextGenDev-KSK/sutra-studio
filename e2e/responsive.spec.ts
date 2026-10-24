import { expect, test } from '@playwright/test';

// Test K — responsive usability at common widths: no unintended horizontal
// page overflow, readable base text, and navigation reachable on phones.

const VIEWS = ['overview', 'brief', 'budget', 'timeline', 'vendors', 'themes', 'guests', 'runofshow', 'team', 'exports'];
const SIZES = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

for (const size of SIZES) {
  test(`K — ${size.width}px: every view fits without horizontal page scroll`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('./');
    await expect(page.locator('.hero h1')).toBeVisible();
    for (const v of [...VIEWS, 'report/brief']) {
      await page.goto(`./#/e/evt_demo/${v}`);
      await page.waitForTimeout(150);
      const { scroll, client, fontSize, offenders } = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const clipped = (el: Element) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if (o === 'auto' || o === 'hidden' || o === 'scroll' || o === 'clip') return true;
          }
          return false;
        };
        const offenders = [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > vw + 1 && !clipped(el))
          .slice(0, 5)
          .map(
            (el) =>
              `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 30)} "${(el.textContent ?? '').slice(0, 30)}"`,
          );
        return {
          scroll: document.documentElement.scrollWidth,
          client: vw,
          fontSize: parseFloat(getComputedStyle(document.body).fontSize),
          offenders,
        };
      });
      expect(scroll, `${v} at ${size.width}px overflows: ${offenders.join(' | ')}`).toBeLessThanOrEqual(client + 1);
      expect(fontSize).toBeGreaterThanOrEqual(14);
    }
    await page.goto('./#/new');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
}

test('K — phone navigation and co-pilot are usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('.hero h1')).toBeVisible();
  await expect(page.locator('.sidebar')).not.toBeInViewport();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.locator('nav.nav a', { hasText: 'Budget Lab' }).click();
  await expect(page.locator('.topbar h1')).toHaveText('Budget Lab');
  await page.getByRole('button', { name: 'Open the event co-pilot' }).click();
  const box = await page.locator('.copilot').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Decisions this week' }).click();
  await expect(page.locator('.msg-bot').first()).toContainText('need attention this week');
});
