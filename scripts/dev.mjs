import { createServer } from 'vite';
import { startWatchedServer } from './server-watch.mjs';
const game=startWatchedServer();
const vite=await createServer();
await vite.listen();vite.printUrls();
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await game.close();await vite.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
