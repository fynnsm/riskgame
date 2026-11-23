/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

interface ImportMetaEnv {
  /** Set to "1" to show draft situations in a production build (F-906). */
  readonly VITE_SHOW_DRAFTS?: string;
}
