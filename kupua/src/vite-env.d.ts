/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Vite proxy path prefix for ES requests */
  readonly VITE_ES_BASE?: string;
  /** ES index or alias to query */
  readonly VITE_ES_INDEX?: string;
  /** Whether the ES target is local (enables/disables write protection) */
  readonly VITE_ES_IS_LOCAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

