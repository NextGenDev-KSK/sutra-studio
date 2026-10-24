import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Functional acceptance tests A–J from the build brief, run against the real
// app in Microsoft Edge. Every test starts from a fresh browser profile, so the
// illustrative demo workspace is seeded relative to today's date.

const DEMO = 'evt_demo';

async function open(page: Page, view = 'overview') {
  await page.goto(`./#/e/${DEMO}/${view}`);
  await expect(page.locator('main h1, main h2').first()).toBeVisible();
}

async function plan(page: Page, id = DEMO) {
  return page.evaluate((eid) => JSON.parse(localStorage.getItem('sutra-studio:workspace')!).state.events[eid], id);
}

const stat = (page: Page, label: string) =>
  page
    .locator('.stat', { has: page.locator('.stat-label', { hasText: label }) })
    .locator('.stat-value')
    .first();

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

test('A — first impression: populated demo and actionable dashboard', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/#\/e\/evt_demo\/overview/);
  await expect(page.locator('.hero h1')).toHaveText('Aanya & Kabir · Jaipur Wedding');
  await expect(page.locator('.hero-figure')).toHaveText('120');
  await expect(page.getByText('Illustrative demo workspace')).toBeVisible();
  await expect(stat(page, 'Forecast vs budget')).toHaveText('₹77.74 L');
  await expect(stat(page, 'Remaining')).toHaveText('₹2.26 L');
  await expect(page.locator('.action-item')).toHaveCount(3);
  await expect(page.locator('.action-item').first()).toContainText('Sign venue contract');
  await expect(page.locator('.risk-item').first()).toBeVisible();
  // Every navigation destination is a working view.
  const links = page.locator('nav.nav a');
  await expect(links).toHaveCount(10);
  for (const name of [
    'Event Brief',
    'Budget Lab',
    'Timeline',
    'Vendor Hub',
    'Theme Studio',
    'Guest Operations',
    'Run of Show',
    'Team & Tasks',
    'Exports & Reports',
  ]) {
    await page.locator('nav.nav a', { hasText: name }).click();
    await expect(page.locator('.topbar h1')).toHaveText(name);
    await expect(page.locator('main .page-head, main .stack-lg').first()).toBeVisible();
  }
});

test('B — event creation reflects type, date, city, budget and guests', async ({ page }) => {
  await page.goto('./#/new');
  const date = addDays(new Date().toISOString().slice(0, 10), 75);
  await page.locator('#i-name').fill('Riverside Harvest Gathering');
  await page.getByRole('button', { name: 'Community gathering' }).click();
  await page.locator('#i-city').fill('Pune');
  await page.locator('#i-date').fill(date);
  await page.locator('#i-sess').fill('2');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#i-guests').fill('320');
  await page.locator('#i-budget').fill('900000');
  await page.getByRole('button', { name: 'Skip to review' }).click();
  await expect(page.getByText('Riverside Harvest Gathering').first()).toBeVisible();
  await page.getByRole('button', { name: 'Generate plan' }).click();

  await expect(page).toHaveURL(/\/brief$/);
  await expect(page.locator('main h2').first()).toHaveText('Riverside Harvest Gathering');
  await expect(page.locator('.fact', { hasText: 'Guests' })).toContainText('320 expected');
  await expect(page.locator('.fact', { hasText: 'City' })).toContainText('Pune');
  await expect(page.locator('.fact', { hasText: 'Budget ceiling' })).toContainText('₹9 L');
  await expect(page.locator('.brief-vision').first()).toContainText('Pune');
  await expect(page.getByText('No ceremonial or cultural requirements were provided')).toBeVisible();
  await expect(page.locator('main .page-head .eyebrow')).toContainText('Community gathering');
  // The budget, timeline and run of show were generated from the brief.
  await page.locator('nav.nav a', { hasText: 'Budget Lab' }).click();
  await expect(stat(page, 'Budget ceiling')).toHaveText('₹9 L');
  await expect(page.locator('.stat-sub', { hasText: '320 guests' })).toBeVisible();
  await page.locator('nav.nav a', { hasText: 'Timeline' }).click();
  await expect(page.locator('.task-row').first()).toBeVisible();
  await page.locator('nav.nav a', { hasText: 'Vendor Hub' }).click();
  await expect(page.getByText('No vendors match.')).toBeVisible();
});

test('C — budget integrity: guest count and vendor quote changes recalculate', async ({ page }) => {
  await open(page);
  await page.locator('#wi-guests').fill('200');
  await page.locator('#wi-guests').press('Enter');
  await expect(stat(page, 'Forecast vs budget')).toHaveText('₹80.25 L');
  await expect(stat(page, 'Remaining')).toHaveText('−₹25,260');
  await expect(stat(page, 'Cost per guest')).toHaveText('₹40,126');
  await page.locator('nav.nav a', { hasText: 'Budget Lab' }).click();
  await expect(page.getByText(/Forecast exceeds the ₹80 L budget by ₹25,260/)).toBeVisible();
  await expect(page.locator('tr', { hasText: 'Catering' }).first()).toContainText('₹19.6 L');

  await page.locator('nav.nav a', { hasText: 'Vendor Hub' }).click();
  await page.getByRole('button', { name: 'Kesar Décor Studio (demo)' }).click();
  await page.locator('#qa').fill('1080000');
  await page.getByRole('button', { name: 'Save vendor' }).click();
  await page.locator('nav.nav a', { hasText: 'Budget Lab' }).click();
  await expect(page.locator('tbody tr', { hasText: 'Décor & florals' })).toContainText('₹10.8 L');
  await expect(stat(page, 'Remaining')).toHaveText('₹80,740');
  await expect(page.getByText('Categories + contingency reconcile to the total')).toBeVisible();
});

test('D — scenario comparison: lean, balanced and premium allocations and trade-offs', async ({ page }) => {
  await open(page, 'budget');
  await page.getByRole('tab', { name: 'Scenarios' }).click();
  const total = async (i: number) => Number((await page.locator('.scenario-card .total').nth(i).innerText()).replace(/[^\d.]/g, ''));
  const [lean, balanced, premium] = [await total(0), await total(1), await total(2)];
  expect(lean).toBeLessThan(balanced);
  expect(premium).toBeLessThanOrEqual(80);
  await page.locator('.scenario-card', { hasText: 'Lean' }).click();
  await expect(page.getByRole('heading', { name: 'Lean scenario' })).toBeVisible();
  await expect(page.locator('tbody tr', { hasText: 'Entertainment' }).locator('.badge').first()).toHaveText('Lean');
  await expect(page.locator('tbody tr', { hasText: 'Photo & film' }).locator('.badge', { hasText: 'Balanced' })).toBeVisible();
  await expect(page.getByText('Photo & film is protected and kept at a balanced level.')).toBeVisible();
  // Edit a scenario line — totals still reconcile.
  const venue = page.getByLabel('Venue amount in Lean scenario');
  await venue.fill('1000000');
  await venue.press('Enter');
  await expect(page.locator('tbody tr', { hasText: 'Venue' }).locator('.badge', { hasText: 'Edited' })).toBeVisible();
  await expect(page.locator('tfoot', { hasText: 'reconciles' })).toBeVisible();

  await page.locator('.scenario-card', { hasText: 'Premium' }).click();
  await expect(page.getByRole('heading', { name: 'Premium scenario' })).toBeVisible();
  await expect(page.locator('.card', { hasText: 'Major trade-offs' }).locator('li').first()).toBeVisible();
  await page.locator('.scenario-card', { hasText: 'Balanced' }).click();
  await page.getByRole('button', { name: 'Adopt as working plan' }).click();
  await expect(page.getByRole('dialog')).toContainText('Adopt the Balanced scenario?');
  await page.getByRole('button', { name: 'Adopt scenario' }).click();
  await expect(page.getByText('Balanced scenario adopted as the working plan.')).toBeVisible();
  const p = await plan(page);
  expect(p.budget.categories.find((c: { key: string }) => c.key === 'entertainment').planned).not.toBe(320000);
});

test('E — schedule integrity: date change moves deadlines and preserves completed work', async ({ page }) => {
  await open(page, 'timeline');
  const before = await plan(page);
  await page.getByRole('button', { name: 'Change event date' }).click();
  await page.locator('#new-date').fill('2020-01-01');
  await expect(page.getByText('The event date must be after today.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply new date' })).toBeDisabled();
  const newDate = addDays(before.brief.eventDate, 14);
  await page.locator('#new-date').fill(newDate);
  await expect(page.getByRole('dialog')).toContainText('move with the event');
  await expect(page.getByRole('dialog')).toContainText('completed task');
  await page.getByRole('button', { name: 'Apply new date' }).click();
  await expect(page.getByText(/What changed: event moved/)).toBeVisible();
  const after = await plan(page);
  expect(after.brief.eventDate).toBe(newDate);
  for (const t of before.tasks.filter((x: { status: string }) => x.status === 'done')) {
    const now = after.tasks.find((x: { id: string }) => x.id === t.id);
    expect(now.status).toBe('done');
    expect(now.dueDate).toBe(t.dueDate);
  }
  const rsvp = before.tasks.find((x: { id: string }) => x.id === 't29');
  expect(after.tasks.find((x: { id: string }) => x.id === 't29').dueDate).toBe(addDays(rsvp.dueDate, 14));
  await expect(page.locator('.hero-figure')).toHaveCount(0);
  await page.locator('nav.nav a', { hasText: 'Overview' }).click();
  await expect(page.locator('.hero-figure')).toHaveText('134');
});

test('F — vendor reliability: add, quote, compare; demo records stay illustrative', async ({ page }) => {
  await open(page, 'vendors');
  await page.getByRole('button', { name: 'Add vendor' }).click();
  await page.locator('#vn').fill('Petal & Pillar Decor');
  await page.locator('#vc').selectOption('decor');
  await page.getByLabel('Quotation received').check();
  await page.locator('#qa').fill('950000');
  await page.locator('#vvl').selectOption('verified');
  await page.getByRole('button', { name: 'Save vendor' }).click();
  await expect(page.getByText('Verified vendors need a source URL')).toBeVisible();
  await page.locator('#vvl').selectOption('unverified');
  await page.getByRole('button', { name: 'Save vendor' }).click();
  const card = page.locator('.vendor-card', { hasText: 'Petal & Pillar Decor' });
  await expect(card).toContainText('Not verified');
  await expect(card).toContainText('₹9.5 L');
  // Edit the quotation.
  await page.getByRole('button', { name: 'Petal & Pillar Decor' }).click();
  await page.locator('#qa').fill('990000');
  await page.getByRole('button', { name: 'Save vendor' }).click();
  await expect(card).toContainText('₹9.9 L');
  // Compare three décor vendors.
  for (const n of ['Kesar Décor Studio (demo)', 'Jaal & Bloom Florals (demo)', 'Petal & Pillar Decor'])
    await page.getByLabel(`Select ${n} to compare`).check();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Compare vendors');
  await expect(dialog.locator('.badge', { hasText: 'Lowest' })).toHaveCount(1);
  await expect(dialog).toContainText('Illustrative demo vendor — not verified');
  await expect(dialog).toContainText('Planner-entered — not verified');
  await dialog.getByRole('button', { name: 'Close' }).last().click();
  // Demo records never expose fabricated contact details.
  const p = await plan(page);
  for (const v of p.vendors.filter((x: { verification: { level: string } }) => x.verification.level === 'illustrative')) {
    expect([v.phone, v.email, v.website, v.contactName].join('')).toBe('');
  }
});

test('G — co-pilot: rejected proposal changes nothing; applied proposal updates the plan', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Open the event co-pilot' }).click();
  await expect(page.getByText('Built-in planning assistant · rule-based')).toBeVisible();
  const before = await plan(page);
  await page.locator('#copilot-input').fill('Move the event two weeks earlier and update the timeline.');
  await page.locator('#copilot-input').press('Enter');
  const first = page.locator('.proposal').first();
  await expect(first).toContainText('Move the event to');
  await expect(first).toContainText('Current → proposed');
  await first.getByRole('button', { name: 'Reject' }).click();
  await expect(first).toContainText('Rejected — no changes made');
  const unchanged = await plan(page);
  expect(unchanged.brief.eventDate).toBe(before.brief.eventDate);
  expect(JSON.stringify(unchanged.tasks)).toBe(JSON.stringify(before.tasks));

  await page.locator('#copilot-input').fill('Our decorator cancelled. What does this affect?');
  await page.locator('#copilot-input').press('Enter');
  const second = page.locator('.proposal').nth(1);
  await expect(second).toContainText('Recover from Kesar Décor Studio (demo) cancelling');
  await expect(second).toContainText('Budget impact by category');
  await second.getByRole('button', { name: /^Apply/ }).click();
  await expect(second).toContainText('Applied to the plan');
  const after = await plan(page);
  expect(after.vendors.find((v: { id: string }) => v.id === 'v_dec1').status).toBe('cancelled');
  expect(after.tasks.find((t: { id: string }) => t.id === 't16').status).toBe('blocked');
  expect(after.activity[0].actor).toBe('copilot');
  await page.getByRole('button', { name: 'Close co-pilot' }).click();
  await page.locator('nav.nav a', { hasText: 'Vendor Hub' }).click();
  await expect(page.locator('.vendor-card', { hasText: 'Kesar Décor Studio' })).toContainText('Cancelled');
  await page.locator('nav.nav a', { hasText: 'Budget Lab' }).click();
  await expect(page.getByText(/already paid to a cancelled décor & florals vendor/)).toBeVisible();
});

test('G2 — co-pilot edit mode: adjust a proposed value before applying', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Open the event co-pilot' }).click();
  await page.locator('#copilot-input').fill('Plan for 200 guests');
  await page.locator('#copilot-input').press('Enter');
  const card = page.locator('.proposal').first();
  await card.getByRole('button', { name: 'Edit' }).click();
  await card.getByLabel('Guest count').fill('190');
  await card.getByLabel('Guest count').blur();
  await expect(card).toContainText('Guest count: 180 → 190');
  await card.getByRole('button', { name: /^Apply/ }).click();
  expect((await plan(page)).brief.guestCount).toBe(190);
});

test('H — persistence: edits and new events survive a reload', async ({ page }) => {
  await open(page);
  await page.locator('#wi-guests').fill('190');
  await page.locator('#wi-guests').press('Enter');
  await expect(stat(page, 'Cost per guest')).not.toHaveText('₹43,191');
  await page.goto('./#/new');
  await page.getByRole('button', { name: 'Fill a sample brief' }).click();
  await page.getByRole('button', { name: 'Skip to review' }).click();
  await page.getByRole('button', { name: 'Generate plan' }).click();
  await expect(page).toHaveURL(/\/brief$/);
  await page.reload();
  await expect(page.locator('main h2').first()).toHaveText('Ira turns 40 — Garden Soirée');
  await page.locator('.event-switch-btn').click();
  await expect(page.getByRole('menuitem', { name: /Aanya & Kabir/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /Aanya & Kabir/ }).click();
  await expect(page.locator('#wi-guests')).toHaveValue('190');
  await expect(page.getByText('Local workspace — saved in this browser only. No cloud sync.')).toBeVisible();
});

test('I — exports contain the current, modified values', async ({ page }) => {
  await open(page, 'budget');
  const venue = page.getByLabel('Venue planned amount');
  await venue.fill('1234000');
  await venue.press('Enter');
  await expect(page.locator('tbody tr', { hasText: 'Venue' })).toContainText('₹12.34 L');
  await page.locator('nav.nav a', { hasText: 'Exports & Reports' }).click();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Budget CSV' }).click()]);
  const csvText = fs.readFileSync(await csv.path(), 'utf8');
  expect(csvText).toMatch(/Venue,Fixed,,1234000,/);
  expect(csvText).toContain('Estimates are illustrative planning benchmarks');
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
  const backup = JSON.parse(fs.readFileSync(await json.path(), 'utf8'));
  expect(backup.app).toBe('sutra-studio');
  expect(backup.plan.budget.categories.find((c: { key: string }) => c.key === 'venue').planned).toBe(1234000);
  const [ics] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Calendar (.ics)' }).click()]);
  const icsText = fs.readFileSync(await ics.path(), 'utf8');
  expect(icsText).toContain('BEGIN:VCALENDAR');
  expect(icsText).toContain('Sign venue contract');
  const [ros] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.export-card', { hasText: 'Event-day production schedule' }).getByRole('button', { name: 'CSV' }).click(),
  ]);
  expect(fs.readFileSync(await ros.path(), 'utf8')).toContain('Reception dinner');
  // Print view renders current data.
  await page.goto(`./#/e/${DEMO}/report/budget`);
  await expect(page.getByRole('article')).toContainText('Budget report');
  await expect(page.getByRole('article')).toContainText('₹12,34,000');
  await page.goto(`./#/e/${DEMO}/report/brief`);
  await expect(page.getByRole('article')).not.toContainText('Arjun');
});

test('J — resilience: invalid input, malformed imports, failed model calls, conflicts', async ({ page }) => {
  // Missing inputs and impossible dates in intake.
  await page.goto('./#/new');
  await page.locator('#i-date').fill('2020-05-05');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Give the event a name')).toBeVisible();
  await expect(page.getByText('The event date must be in the future.')).toBeVisible();

  // Malformed backup import.
  await open(page, 'exports');
  await page.locator('#import-json').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(page.getByText('This file is not valid JSON')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#import-json').setInputFiles({
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"app":"sutra-studio","kind":"event-plan","plan":{"brief":{"name":"x"}}}'),
  });
  await expect(page.getByText('This file can’t be imported.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Malformed guest CSV.
  await page.locator('nav.nav a', { hasText: 'Guest Operations' }).click();
  await page
    .locator('#guest-csv')
    .setInputFiles({ name: 'g.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Party size\nAsha,2\n,1\nRavi,lots\n') });
  await expect(page.getByRole('dialog')).toContainText('1 households (2 people) ready to import; 2 rows skipped');
  await expect(page.getByRole('dialog')).toContainText('party size “lots”');
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Conflicting run-of-show change is detected.
  await page.locator('nav.nav a', { hasText: 'Run of Show' }).click();
  await page.getByRole('tab', { name: /Day 2/ }).click();
  await page.getByRole('button', { name: 'Edit Wedding ceremony' }).click();
  await page.locator('#r-s').fill('09:00');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.locator('.card', { hasText: 'scheduling issue' })).toContainText('overlaps');

  // Circular dependencies cannot be created.
  await page.locator('nav.nav a', { hasText: 'Timeline' }).click();
  await page.locator('#f-status').selectOption('all');
  await page.getByRole('button', { name: 'Venue site visits with both families' }).click();
  await expect(page.locator('label', { hasText: 'Venue floor plan & capacity sign-off' }).locator('input')).toBeDisabled();
});

test('J2 — resilience: model outage and invalid model output fall back safely', async ({ page }) => {
  await page.route('**/api/copilot/status', (r) => r.fulfill({ json: { available: true, model: 'claude-opus-5' } }));
  let call = 0;
  await page.route('**/api/copilot', (r) => {
    call++;
    if (call === 1) return r.fulfill({ status: 500, json: { error: 'Simulated outage' } });
    const nulls = {
      categoryKey: null,
      planned: null,
      pct: null,
      count: null,
      amount: null,
      date: null,
      title: null,
      workstream: null,
      offsetDays: null,
      durationDays: null,
      priority: null,
      notes: null,
      taskId: null,
      status: null,
      vendorId: null,
      sessionId: null,
      setting: null,
      itemId: null,
      field: null,
      value: null,
      text: null,
    };
    if (call === 2)
      return r.fulfill({
        json: {
          reply: 'Booking it.',
          insights: [],
          proposal: {
            title: 'Book ghost',
            summary: '',
            reason: '',
            tradeoffs: [],
            assumptions: [],
            ops: [{ ...nulls, op: 'setVendorStatus', vendorId: 'ghost', status: 'booked' }],
          },
        },
      });
    return r.fulfill({
      json: {
        reply: 'Here is a headcount change.',
        insights: ['Each guest adds about ₹12,540.'],
        proposal: {
          title: 'Plan for 185 guests',
          summary: '',
          reason: 'RSVPs trending up.',
          tradeoffs: [],
          assumptions: [],
          ops: [{ ...nulls, op: 'setGuestCount', count: 185 }],
        },
      },
    });
  });
  await open(page);
  await page.getByRole('button', { name: 'Open the event co-pilot' }).click();
  await expect(page.locator('.copilot')).toContainText('Claude · claude-opus-5');
  await page.locator('#copilot-input').fill('Which decisions must I make this week?');
  await page.locator('#copilot-input').press('Enter');
  await expect(page.locator('.copilot')).toContainText("Couldn't reach Claude (Simulated outage)");
  await expect(page.locator('.msg-bot').first()).toContainText('Built-in planning assistant');
  await page.locator('#copilot-input').fill('Book the ghost vendor');
  await page.locator('#copilot-input').press('Enter');
  await expect(page.locator('.copilot')).toContainText('failed validation');
  expect((await plan(page)).vendors.some((v: { id: string }) => v.id === 'ghost')).toBe(false);
  await page.locator('#copilot-input').fill('Plan for more guests');
  await page.locator('#copilot-input').press('Enter');
  const card = page.locator('.proposal').last();
  await expect(card).toContainText('Plan for 185 guests');
  await card.getByRole('button', { name: /^Apply/ }).click();
  expect((await plan(page)).brief.guestCount).toBe(185);
});

test('J3 — resilience: corrupt saved data does not break the app', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('corrupted')) {
      localStorage.setItem('sutra-studio:workspace', '{not valid json');
      sessionStorage.setItem('corrupted', '1');
    }
  });
  await page.goto('./');
  await expect(page.locator('.hero h1')).toBeVisible();
  await expect(page.getByText('Saved data could not be read')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sutra-studio:unreadable-backup'))).toBe('{not valid json');
});
