/// <reference types="vite/client" />

/**
 * Defines the structure of the environment variables exposed via import.meta.env.
 * This resolves the TypeScript error: "Property 'env' does not exist on type 'ImportMeta'."
 */
interface ImportMetaEnv {
  readonly VITE_SERVER_URL: string;
  // Add other environment variables here if needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
