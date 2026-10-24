import type { IncomingMessage, ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Plugin } from 'vite';
import { ModelResponseSchema, OP_NAMES } from '../src/copilot/modelSchema';

// Server-side co-pilot endpoint, mounted on the Vite dev and preview servers.
// The API key never leaves this process; the browser only sees the
// structured, validated response.

const DEFAULT_MODEL = 'claude-opus-5';
const MAX_BODY = 400_000;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

const SYSTEM_PROMPT = `You are the planning co-pilot inside Sutrā Studio, an operations workspace for professional event planners in India and elsewhere.
You receive the live event plan as JSON in <plan_context> and a planner's request. Respond in the required JSON structure.

How to respond:
- "reply": 1–3 short sentences for the planner. Plain, specific, professional.
- "insights": short factual bullet points computed from the plan context (numbers in the plan's currency). Empty array if not needed.
- "proposal": only when the request implies changing the plan. Otherwise null. A proposal is a preview the planner will review, edit, apply or reject — never claim a change has been applied.

Proposal rules:
- Use only these operations: ${OP_NAMES.join(', ')}. Every field of each op must be present; set unused fields to null.
- Reference only ids that exist in the plan context (vendorId, taskId, sessionId, itemId, categoryKey).
- setCategoryPlanned.planned is a fixed total for basis "fixed", or a per-guest rate per unit for basis "perGuest" — match the category's basis.
- Money values are plain numbers in the plan currency. Dates are YYYY-MM-DD and must be after today. addTask.offsetDays is days relative to the event date (negative = before).
- Booked vendors are contracts: do not pretend their cost changes by editing allocations; suggest renegotiation as a trade-off or a task instead.
- Include honest trade-offs and the assumptions you made.

Integrity rules (always):
- Never invent vendors, businesses, phone numbers, addresses, ratings, availability or prices as facts. Estimates must be described as illustrative.
- Never assume a religion, ceremony, cultural practice or diet from names or locations; use only preferences stated in the plan.
- Never claim to have contacted anyone, sent messages, booked anything or checked live data.
- Guest personal data is not provided; work only with aggregate guest figures.`;

interface Options {
  apiKey?: string;
  model?: string;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createCopilotHandler(opts: Options) {
  const apiKey = opts.apiKey?.trim();
  const model = opts.model?.trim() || DEFAULT_MODEL;
  const client = apiKey ? new Anthropic({ apiKey, maxRetries: 1 }) : null;
  const hits: number[] = [];

  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? '').split('?')[0];
    if (!url.endsWith('/api/copilot') && !url.endsWith('/api/copilot/status')) return next();

    if (url.endsWith('/status')) {
      return send(res, 200, { available: !!client, model: client ? model : undefined });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
    if (!client) return send(res, 503, { error: 'No ANTHROPIC_API_KEY is configured on the server.' });

    const now = Date.now();
    while (hits.length && now - hits[0] > WINDOW_MS) hits.shift();
    if (hits.length >= MAX_PER_WINDOW) return send(res, 429, { error: 'Too many co-pilot requests — wait a minute.' });
    hits.push(now);

    let payload: { request?: unknown; context?: unknown; history?: unknown };
    try {
      payload = JSON.parse(await readBody(req));
    } catch (e) {
      return send(res, 400, { error: (e as Error).message === 'Request body too large' ? 'Request too large.' : 'Invalid JSON body.' });
    }
    const request = typeof payload.request === 'string' ? payload.request.trim().slice(0, 2000) : '';
    if (!request || !payload.context || typeof payload.context !== 'object')
      return send(res, 400, { error: 'Missing request or plan context.' });
    const history = Array.isArray(payload.history)
      ? payload.history
          .filter(
            (h): h is { role: string; text: string } => !!h && typeof h === 'object' && typeof (h as { text?: unknown }).text === 'string',
          )
          .slice(-6)
          .map((h) => `${h.role === 'user' ? 'Planner' : 'Co-pilot'}: ${h.text.slice(0, 1500)}`)
          .join('\n')
      : '';

    try {
      const response = await client.beta.messages.parse(
        {
          model,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium', format: betaZodOutputFormat(ModelResponseSchema) },
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `<plan_context>\n${JSON.stringify(payload.context)}\n</plan_context>\n${history ? `\n<recent_conversation>\n${history}\n</recent_conversation>\n` : ''}\nPlanner request: ${request}`,
            },
          ],
        },
        { timeout: 75_000 },
      );
      if (response.stop_reason === 'refusal') return send(res, 422, { error: 'The model declined this request.' });
      if (response.stop_reason === 'max_tokens') return send(res, 502, { error: 'The model response was cut off.' });
      if (!response.parsed_output) return send(res, 502, { error: 'The model returned an unreadable response.' });
      return send(res, 200, { ...response.parsed_output, model: response.model });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return send(res, 401, { error: 'The configured API key was rejected.' });
      if (e instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'The model provider is rate-limiting requests.' });
      if (e instanceof Anthropic.BadRequestError) return send(res, 400, { error: 'The model provider rejected the request.' });
      if (e instanceof Anthropic.APIConnectionError) return send(res, 502, { error: 'Could not connect to the model provider.' });
      if (e instanceof Anthropic.APIError) return send(res, 502, { error: `Model provider error (${e.status ?? 'unknown'}).` });
      return send(res, 500, { error: 'Unexpected server error.' });
    }
  };
}

export function copilotApiPlugin(opts: Options): Plugin {
  const handler = createCopilotHandler(opts);
  return {
    name: 'sutra-copilot-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
  };
}
