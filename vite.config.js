import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard.html'),
        hub: resolve(import.meta.dirname, 'hub.html'),
        profile: resolve(import.meta.dirname, 'profile.html'),
        terminos: resolve(import.meta.dirname, 'Terminos_Politica.html'),
        login: resolve(import.meta.dirname, "login.html")
      },
    },
  },
})
