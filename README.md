# MiSueldoCPE (PWA)

Aplicacion web progresiva para gestion de jornales de estiba en Valencia.

## Desarrollo local

1. Instala dependencias:
   `npm install`
2. Ejecuta en local:
   `npm run dev`
3. Build de produccion:
   `npm run build`

## PWA

- Manifest: `public/manifest.webmanifest`
- Service Worker: `public/sw.js`
- Iconos moviles: `public/icons/*`

## Deploy en Vercel

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`

## Deploy en GitHub Pages

1. Genera build con `npm run build`.
2. Publica el contenido de `dist/` en GitHub Pages.

La configuracion de Vite usa `base: './'` para que el build funcione en rutas de subdirectorio.
