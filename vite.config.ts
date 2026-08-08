import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * BASE sätts av deploy-arbetsflödet till "/<reponamn>/", eftersom ett
 * GitHub Pages-projektsite ligger under en underkatalog. Lokalt är den "/".
 * Appen hämtar produktdatan via import.meta.env.BASE_URL och följer därför med.
 */
export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [react()],
})
