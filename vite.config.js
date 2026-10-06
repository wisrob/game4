import { defineConfig } from 'vite';
import { configPlugin } from './scripts/config-plugin.mjs';
import { performancePlugin } from './scripts/performance-plugin.mjs';
import { placementsPlugin } from './scripts/placements-plugin.mjs';
import { mapPlugin } from './scripts/map-plugin.mjs';
export default defineConfig({ plugins:[configPlugin(),placementsPlugin(),performancePlugin(),mapPlugin()], server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/ws': { target: 'ws://127.0.0.1:3001', ws: true } } }, build: { target: 'es2022',rollupOptions:{input:{game:'index.html',map:'map-editor.html'}} } });
