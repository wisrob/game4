import { appendFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { validatePerformanceBatch } from '../shared/performance.js';

export function performancePlugin({ logDirectory = resolve('artifacts/performance') } = {}) {
  const sessions = new Map();
  return { name: 'local-performance-logs', configureServer(server) {
    server.middlewares.use('/__performance', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'POST') { res.statusCode = 405; res.end('{}'); return; }
      if (req.headers.origin !== `http://${req.headers.host}`) { res.statusCode = 403; res.end('{}'); return; }
      try {
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 64000) throw new Error('Performance batch too large'); }
        const batch = validatePerformanceBatch(JSON.parse(raw));
        let session = sessions.get(batch.sessionId);
        if (!session) { if (sessions.size >= 256) throw new Error('Too many log sessions; restart development server'); session = { chain: Promise.resolve(), seen: new Set(), initialized: false }; sessions.set(batch.sessionId, session); }
        // Serialize overlapping fetch/beacon writes for each session.
        const write = session.chain.then(async () => {
          await mkdir(logDirectory, { recursive: true });
          const path = join(logDirectory, `${batch.sessionId}.jsonl`);
          const size = await stat(path).then(s => s.size).catch(e => { if (e.code === 'ENOENT') return 0; throw e; });
          if (size > 8 * 1024 * 1024) throw new Error('Session log full; reload game to start another');
          const lines = [];
          if (!session.initialized) lines.push({ type: 'session', schemaVersion: 1, sessionId: batch.sessionId, ...batch.metadata });
          const unseen = batch.samples.filter(s => !session.seen.has(s.sequence));
          for (const sample of unseen) lines.push({ type: 'sample', sessionId: batch.sessionId, receivedAt: new Date().toISOString(), ...sample });
          if (lines.length) await appendFile(path, lines.map(line => JSON.stringify(line)).join('\n') + '\n');
          session.initialized = true;for (const sample of unseen) session.seen.add(sample.sequence);
        });
        session.chain = write.catch(() => {}); await write;
        res.end(JSON.stringify({ ok: true, sessionId: batch.sessionId }));
      } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })); }
    });
  } };
}
