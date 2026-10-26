/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Older name for the same key (legacy anon key). */
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_POKEMONTCG_API_KEY?: string
}
