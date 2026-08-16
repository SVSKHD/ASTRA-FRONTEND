/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_DATABASE_URL: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_FIREBASE_MEASUREMENT_ID: string
  readonly VITE_ALLOWED_UIDS: string
  readonly VITE_ALLOWED_EMAILS: string
  readonly VITE_AUTO_LOCK_MINUTES: string
  // URL of the deployed aiProxy Cloud Function (injects the Anthropic key and
  // streams replies). Empty/unset disables sending in the AI tab.
  readonly VITE_AI_PROXY_URL: string
  // URL of the deployed ghProxy Cloud Function. It holds the GitHub App
  // installation token (Secret Manager) and is the only thing that talks to
  // GitHub — no token ever reaches the browser. Empty/unset disables the
  // integration entirely.
  readonly VITE_GH_PROXY_URL: string
  // The GitHub App's slug, used to build the "install this App" URL.
  readonly VITE_GH_APP_SLUG: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
