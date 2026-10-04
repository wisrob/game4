import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const directory = resolve('artifacts/performance');
const args = process.argv.slice(2), all = args.includes('--all'), session = args.find(a => /^[0-9a-f-]{36}$/i.test(a));
const names = await readdir(directory).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
const logs = [];
for (const name of names.filter(n => /^[0-9a-f-]{36}\.jsonl$/i.test(n))) {
  if (session && name !== `${session}.jsonl`) continue;
  const path = join(directory, name), text = await readFile(path, 'utf8');
  const lines = text.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const metadata = lines.find(l => l.type === 'session');
  if (!metadata || (!all && !session && metadata.kind !== 'manual')) continue;
  logs.push({ path, metadata, samples: lines.filter(l => l.type === 'sample'), modified: (await stat(path)).mtimeMs });
}
logs.sort((a, b) => b.modified - a.modified);
if (!logs.length) console.log('No local browser performance logs yet. Play at http://127.0.0.1:5173 with mise run dev running. Samples save every 5 seconds. Use --all to include automated sessions.');
for (const log of all ? logs : logs.slice(0, 1)) {
  const { metadata: m, samples: raw } = log;
  // Repeated delivery / dev server restart should not double-count a window.
  const samples = [...new Map(raw.map(s => [s.sequence, s])).values()];
  console.log(`\n${m.kind.toUpperCase()} session ${m.sessionId}\nStarted: ${m.startedAt}\nGPU: ${m.gpu}\nBrowser: ${m.browser}\nLog: ${log.path}`);
  if (!samples.length) { console.log('Waiting for first 5-second sample.'); continue; }
  const frames = samples.reduce((n, s) => n + s.frame.frames, 0), duration = samples.reduce((n, s) => n + s.frame.durationMs, 0);
  const latest = samples.at(-1), fps = samples.map(s => s.frame.fps);
  console.log(`Visible play: ${(duration / 1000).toFixed(1)}s · ${samples.length} windows · ${frames} frames\nFPS: ${(1000 * frames / duration).toFixed(1)} overall · ${Math.min(...fps).toFixed(1)}–${Math.max(...fps).toFixed(1)} by window\nWorst window p95 / p99: ${Math.max(...samples.map(s => s.frame.p95Ms)).toFixed(2)} / ${Math.max(...samples.map(s => s.frame.p99Ms)).toFixed(2)} ms\nLongest frame: ${Math.max(...samples.map(s => s.frame.maxMs)).toFixed(2)} ms · frames >50ms: ${samples.reduce((n, s) => n + s.frame.over50, 0)}\nLatest: ${latest.frame.fps} FPS · 1% low ${latest.frame.onePercentLowFps} FPS · CPU work ${latest.frame.workMeanMs} ms · render submission ${latest.frame.renderSubmitMeanMs} ms\nViewport: ${latest.context.width}×${latest.context.height} · pixel ratio ${latest.context.pixelRatio}\nScene: ${latest.context.drawCalls} calls · ${latest.context.triangles} triangles · grass ${latest.context.grassDensity} · shadows ${latest.context.shadows}\nLast sample: ${latest.timestamp}`);
  if (/swiftshader|llvmpipe|software/i.test(m.gpu)) console.log('Software renderer detected: these measurements do not represent hardware-accelerated gameplay.');
}
