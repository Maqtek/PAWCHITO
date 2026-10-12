/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'false' — моки MSW выключены, запросы уходят на бэкенд через прокси Vite. */
  readonly VITE_API_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
