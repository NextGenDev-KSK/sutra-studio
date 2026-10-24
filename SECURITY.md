# Security

## Reporting a vulnerability

Please open a private security advisory on this repository (**Security → Report a vulnerability**) rather than a public issue. Include steps to reproduce and the affected version or commit.

## Security model

Sutrā Studio is a local-first single-page app. Event data stays in the browser's local storage; an optional server endpoint forwards co-pilot requests to Anthropic's API.

| Area | Control | Where |
|---|---|---|
| **Secrets** | `ANTHROPIC_API_KEY` is read only by the Node server middleware (no `VITE_` prefix), so it is never inlined into the client bundle. `.env*` files are git-ignored; `.env.example` holds no values. | `vite.config.ts`, `server/copilotApi.ts`, `.gitignore` |
| **Content Security Policy** | The production build ships a strict CSP (`default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`) plus a `strict-origin-when-cross-origin` referrer policy. The whole browser suite runs against this build in CI. | `vite.config.ts` (`securityHeadersPlugin`) |
| **No HTML injection** | React escapes all rendered text; the codebase uses no `dangerouslySetInnerHTML`, `innerHTML` or `eval`. Fonts and icons are bundled locally, so no third-party scripts load at runtime. | `src/` |
| **Untrusted imports** | JSON backups are validated with zod schemas (types, enums, ISO dates, capped string lengths, array limits, 15 MB file limit), dangling references are repaired with warnings, and imports are always added as new events — never overwriting. Guest CSV import validates every row and reports problems instead of importing them. | `src/domain/io.ts`, `src/domain/guests.ts` |
| **CSV formula injection** | Exported cells beginning with `= + - @` (or tab/CR) are prefixed with an apostrophe so spreadsheet apps don't execute them. | `src/domain/csv.ts` |
| **AI output is untrusted** | Model responses must match a structured-output schema, then every proposed operation is re-validated (schema + references against the live plan) before a planner can apply it. Nothing changes without an explicit preview and Apply; Reject changes nothing. | `src/copilot/modelSchema.ts`, `src/domain/ops.ts` |
| **Co-pilot endpoint hardening** | POST only, 400 kB body limit, JSON parsing guarded, request length capped, simple rate limit (20/minute), 75 s upstream timeout, typed SDK errors mapped to generic messages (no stack traces or secrets in responses), `cache-control: no-store`. | `server/copilotApi.ts` |
| **Privacy** | The model context contains aggregate guest counts only — never guest names or contact details (asserted by a test). Client reports exclude guest names. Guest-list export asks for confirmation because it contains personal data. | `src/copilot/provider.ts`, `tests/integration.test.ts` |
| **Resilient storage** | Unreadable saved data is backed up and quarantined; each stored event is schema-validated on load; storage write failures are surfaced to the user. | `src/store/workspace.ts` |
| **Dependencies** | `npm audit` runs in CI (`--audit-level=high`, production deps); Dependabot opens weekly update PRs for npm and GitHub Actions. | `.github/workflows/ci.yml`, `.github/dependabot.yml` |

## Known limitations

- Data in local storage is not encrypted at rest; anyone with access to the browser profile can read it. Use a trusted device and export backups deliberately.
- The rate limiter is in-memory and per process; a multi-instance deployment should add a shared limiter and authentication in front of `/api/copilot`.
- GitHub Pages cannot set HTTP headers, so the CSP is delivered as a meta tag (which cannot express `frame-ancestors`).
