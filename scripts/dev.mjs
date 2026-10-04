import { createServer } from 'vite';
import { startServer } from '../server/index.js';
const game=startServer();
const vite=await createServer();
await vite.listen();vite.printUrls();
async function stop(){game.close();await vite.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
