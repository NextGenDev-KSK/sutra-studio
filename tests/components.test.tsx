// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoPlan } from '../src/domain/demo';
import { useWorkspace } from '../src/store/workspace';
import { BulletChart } from '../src/ui/charts';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { CommitNumber } from '../src/ui/kit';
import { useUI } from '../src/views/common';
import { CopilotPanel } from '../src/views/Copilot';
import { Overview } from '../src/views/Overview';
import { ProposalPreview } from '../src/views/ProposalPreview';
import { todayISO } from '../src/domain/util';

afterEach(cleanup);

describe('CommitNumber', () => {
  it('validates before committing and commits on Enter', async () => {
    const onCommit = vi.fn();
    render(<CommitNumber value={10} min={1} integer onCommit={onCommit} ariaLabel="Guests" />);
    const input = screen.getByLabelText('Guests');
    await userEvent.clear(input);
    await userEvent.type(input, 'abc{Enter}');
    expect(screen.getByText('Enter a number')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    await userEvent.clear(input);
    await userEvent.type(input, '2.5{Enter}');
    expect(screen.getByText('Whole numbers only')).toBeTruthy();
    await userEvent.clear(input);
    await userEvent.type(input, '25{Enter}');
    expect(onCommit).toHaveBeenCalledWith(25);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe('ProposalPreview', () => {
  const plan = createDemoPlan(todayISO());

  it('blocks invalid changes with a readable reason', () => {
    render(<ProposalPreview plan={plan} ops={[{ op: 'setVendorStatus', vendorId: 'ghost', status: 'booked' }]} />);
    expect(screen.getByRole('alert').textContent).toMatch(/vendor not found/);
  });

  it('shows current → proposed budget impact for a valid change', () => {
    render(<ProposalPreview plan={plan} ops={[{ op: 'setGuestCount', count: 200 }]} />);
    expect(screen.getByText('Guest count: 180 → 200')).toBeTruthy();
    expect(screen.getByText('Current → proposed')).toBeTruthy();
    expect(screen.getByText('₹80.25 L')).toBeTruthy();
    expect(screen.getByText(/Nothing changes until you apply/)).toBeTruthy();
  });
});

describe('BulletChart', () => {
  it('exposes an accessible name and visible values (tooltips never gate data)', () => {
    render(
      <BulletChart
        ariaLabel="Forecast by category"
        rows={[{ key: 'a', label: 'Catering', value: 100, marker: 90, display: '₹1 L', tooltip: [['Forecast', '₹1 L']] }]}
      />,
    );
    const chart = screen.getByRole('img', { name: 'Forecast by category' });
    expect(within(chart).getByText('Catering')).toBeTruthy();
    expect(within(chart).getByText('₹1 L')).toBeTruthy();
  });
});

describe('ErrorBoundary', () => {
  it('contains a crashing view and offers recovery', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = () => {
      throw new Error('kaboom');
    };
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/Something went wrong in this view/);
    expect(screen.getByRole('button', { name: 'Download workspace backup' })).toBeTruthy();
    spy.mockRestore();
  });
});

describe('workspace views', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspace.setState({ events: {}, order: [], activeEventId: null, undo: [], copilot: {} });
    useWorkspace.getState().seedDemo();
    useUI.setState({ copilotOpen: true, copilotDraft: '' });
  });

  it('Overview ranks three next actions from live data', () => {
    const plan = useWorkspace.getState().events.evt_demo;
    render(<Overview plan={plan} />);
    expect(screen.getAllByRole('listitem').some((li) => /Sign venue contract/.test(li.textContent ?? ''))).toBe(true);
    expect(screen.getByRole('heading', { name: 'Next three actions' })).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
  });

  it('Co-pilot: a rejected proposal leaves the plan untouched', async () => {
    const plan = useWorkspace.getState().events.evt_demo;
    render(<CopilotPanel plan={plan} />);
    expect(screen.getByText('Built-in planning assistant · rule-based')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Decorator cancelled' }));
    const proposal = await screen.findByLabelText(/Proposal: Recover from Kesar Décor Studio/);
    await userEvent.click(within(proposal).getByRole('button', { name: /Reject/ }));
    expect(within(proposal).getByText(/Rejected — no changes made/)).toBeTruthy();
    expect(useWorkspace.getState().events.evt_demo).toBe(plan);
  });

  it('Co-pilot: an applied proposal updates the plan and can be undone', async () => {
    const plan = useWorkspace.getState().events.evt_demo;
    render(<CopilotPanel plan={plan} />);
    await userEvent.type(screen.getByLabelText('Ask the co-pilot'), 'Increase contingency to 8%{Enter}');
    const proposal = await screen.findByLabelText(/Proposal: Set contingency to 8%/);
    await userEvent.click(within(proposal).getByRole('button', { name: /^Apply/ }));
    expect(useWorkspace.getState().events.evt_demo.budget.contingencyPct).toBe(8);
    expect(useWorkspace.getState().events.evt_demo.activity[0].actor).toBe('copilot');
    useWorkspace.getState().undoLast();
    expect(useWorkspace.getState().events.evt_demo.budget.contingencyPct).toBe(6);
  });
});
