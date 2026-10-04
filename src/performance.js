import { summarizeFrames } from '../shared/performance.js';

export function createPerformanceRecorder(renderer, gpu, getContext) {
  if (!import.meta.env.DEV) return { frame() {}, get status() { return 'Local logging disabled in production'; }, sessionId: null };
  const sessionId = crypto.randomUUID();
  const metadata = { kind: navigator.webdriver ? 'automated' : 'manual', gpu, browser: navigator.userAgent, startedAt: new Date().toISOString(), hardwareConcurrency: navigator.hardwareConcurrency || 0 };
  let frames = [], pending = [], sequence = 0, previous = null, flushing = false, lastSentAt = 0, lastSample = null, status = 'Connecting local logger';
  const endpoint = '/__performance';
  function payload(samples = pending) { return { sessionId, metadata, samples }; }
  function collect(reason) {
    if (!frames.length) return;
    const config = getContext();
    const sample = { sequence: sequence++, timestamp: new Date().toISOString(), reason, frame: summarizeFrames(frames), context: {
      width: innerWidth, height: innerHeight, devicePixelRatio, pixelRatio: renderer.getPixelRatio(),
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      ...config, ...(performance.memory ? { heapUsedBytes: performance.memory.usedJSHeapSize } : {})
    } };
    lastSample = sample; frames = []; pending.push(sample);
    if (pending.length > 12) { pending.shift(); status = 'Logger offline · oldest window dropped'; }
  }
  async function flush() {
    if (flushing) return;
    flushing = true; const batch = pending.slice();
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(batch)) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const delivered = new Set(batch.map(s => s.sequence)); pending = pending.filter(s => !delivered.has(s.sequence));
      status = `Logging ${metadata.kind} · ${sessionId.slice(0, 8)}${batch.length ? ' · saved' : ''}`;
    } catch (e) { status = `Logger unavailable (${e.message}) · retrying`; }
    finally { flushing = false; lastSentAt = performance.now(); }
  }
  function beacon(reason) {
    collect(reason); previous = null;
    if (pending.length) navigator.sendBeacon(endpoint, new Blob([JSON.stringify(payload())], { type: 'application/json' }));
    // Keep pending until acknowledged by fetch. Server deduplicates sequence IDs.
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) beacon('hidden'); else { previous = null; if (pending.length) void flush(); } });
  addEventListener('pagehide', () => beacon('pagehide'));
  const timer = setInterval(() => { if (frames.length) collect('interval'); if (pending.length || !lastSentAt) void flush(); }, 5000);
  void flush();
  if (import.meta.hot) import.meta.hot.dispose(() => { clearInterval(timer); beacon('pagehide'); });
  return {
    sessionId,
    get status() { return status; },
    get lastSample() { return lastSample ? structuredClone(lastSample) : null; },
    frame(now, workMs, renderSubmitMs) {
      if (document.hidden) { previous = null; return; }
      if (previous !== null) frames.push({ intervalMs: Math.max(.001, now - previous), workMs, renderSubmitMs });
      previous = now;
    }
  };
}
