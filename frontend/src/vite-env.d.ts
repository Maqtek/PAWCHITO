
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** true — включить моки MSW при разработке. */
  readonly VITE_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
