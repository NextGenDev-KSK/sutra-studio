/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "off" for static hosting with no co-pilot API (public, not a secret). */
  readonly VITE_COPILOT_API?: string;
}
