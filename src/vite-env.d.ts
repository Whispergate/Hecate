/// <reference types="vite/client" />

// CSS Modules
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

// Vite env
interface ImportMetaEnv {
  readonly VITE_MYTHIC_HOST: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
