/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copilotApiPlugin } from './server/copilotApi';

// Strict Content-Security-Policy for the production build (static hosts such
// as GitHub Pages cannot set headers, so it ships as a meta tag). Not applied
// in dev, where Vite's HMR client needs inline scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function securityHeadersPlugin(): Plugin {
  return {
    name: 'sutra-security-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
      );
    },
  };
}

// The co-pilot API runs inside the Vite dev/preview server so the Anthropic key
// stays server-side. Only variables WITHOUT the VITE_ prefix are read here, so
// the key is never inlined into the client bundle.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [react(), securityHeadersPlugin(), copilotApiPlugin({ apiKey: env.ANTHROPIC_API_KEY, model: env.SUTRA_MODEL })],
    server: { port: 5173 },
    preview: { port: 4173 },
    build: { chunkSizeWarningLimit: 600 },
    test: {
      include: ['tests/**/*.test.{ts,tsx}'],
      environment: 'node',
      coverage: {
        provider: 'v8',
        include: ['src/domain/**', 'src/copilot/**', 'server/**'],
        reporter: ['text-summary', 'text'],
        // Guard rails: CI fails if logic coverage regresses below these levels.
        thresholds: { statements: 85, branches: 65, functions: 85, lines: 90 },
      },
    },
  };
});
