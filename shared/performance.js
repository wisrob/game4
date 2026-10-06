const rounded = value => Math.round(value * 100) / 100;
const percentile = (sorted, p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;

// Raw requestAnimationFrame intervals, never the simulation's clamped dt.
export function summarizeFrames(frames) {
  if (!frames.length) return null;
  const intervals = frames.map(f => f.intervalMs).sort((a, b) => a - b);
  const work = frames.map(f => f.workMs).sort((a, b) => a - b);
  const render = frames.map(f => f.renderSubmitMs).sort((a, b) => a - b);
  const durationMs = intervals.reduce((a, b) => a + b, 0);
  const tail = intervals.slice(-Math.max(1, Math.ceil(intervals.length * .01)));
  return {
    frames: frames.length, durationMs: rounded(durationMs), fps: rounded(1000 * frames.length / durationMs),
    meanMs: rounded(durationMs / frames.length), medianMs: rounded(percentile(intervals, .5)),
    p95Ms: rounded(percentile(intervals, .95)), p99Ms: rounded(percentile(intervals, .99)), maxMs: rounded(intervals.at(-1)),
    onePercentLowFps: rounded(1000 / (tail.reduce((a, b) => a + b, 0) / tail.length)),
    over16_7: intervals.filter(v => v > 16.7).length,
    over33_3: intervals.filter(v => v > 33.3).length,
    over50: intervals.filter(v => v > 50).length,
    workMeanMs: rounded(work.reduce((a, b) => a + b, 0) / work.length), workP95Ms: rounded(percentile(work, .95)),
    renderSubmitMeanMs: rounded(render.reduce((a, b) => a + b, 0) / render.length), renderSubmitP95Ms: rounded(percentile(render, .95))
  };
}

export function validatePerformanceBatch(body) {
  if (!body || !/^[0-9a-f-]{36}$/i.test(body.sessionId) || !Array.isArray(body.samples) || body.samples.length > 12) throw new Error('Invalid performance batch');
  const m = body.metadata;
  if (!m || !['manual', 'automated'].includes(m.kind) || typeof m.gpu !== 'string' || typeof m.browser !== 'string' || !Number.isFinite(Date.parse(m.startedAt))) throw new Error('Invalid session metadata');
  const number = (v, key, max = 1e12) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) throw new Error(`Invalid performance ${key}`); return v; };
  const metadata = { kind: m.kind, gpu: m.gpu.slice(0, 500), browser: m.browser.slice(0, 300), startedAt: new Date(m.startedAt).toISOString(), hardwareConcurrency: number(m.hardwareConcurrency, 'hardwareConcurrency', 1024) };
  const samples = body.samples.map(s => {
    if (!s || !Number.isSafeInteger(s.sequence) || s.sequence < 0 || !Number.isFinite(Date.parse(s.timestamp))) throw new Error('Invalid sample');
    const frame = {}; // Only known metrics reach disk; no arbitrary browser data.
    for (const key of ['frames','durationMs','fps','meanMs','medianMs','p95Ms','p99Ms','maxMs','onePercentLowFps','over16_7','over33_3','over50','workMeanMs','workP95Ms','renderSubmitMeanMs','renderSubmitP95Ms']) frame[key] = number(s.frame?.[key], key);
    if (!frame.frames || !frame.durationMs) throw new Error('Empty sample');
    const context = {};
    for (const key of ['width','height','devicePixelRatio','pixelRatio','drawCalls','triangles','geometries','textures','players','mobs','grassDensity','cameraAngle','cameraZoom','exposure']) context[key] = number(s.context?.[key], key);
    for (const key of ['cameraDistance','cameraMinZoom','cameraMaxZoom']) if(s.context?.[key]!=null) context[key] = number(s.context[key], key);
    for (const key of ['totalDrawCalls','totalTriangles','shadowDrawCalls','shadowTriangles']) if(s.context?.[key]!=null) context[key] = number(s.context[key], key);
    for (const key of ['streamingRadius','grassPerChunk','loadedChunks']) if(s.context?.[key]!=null) context[key] = number(s.context[key], key);
    if (typeof s.context?.shadows !== 'boolean') throw new Error('Invalid shadows');
    context.shadows = s.context.shadows;
    if (s.context.heapUsedBytes != null) context.heapUsedBytes = number(s.context.heapUsedBytes, 'heapUsedBytes');
    return { sequence: s.sequence, timestamp: new Date(s.timestamp).toISOString(), reason: ['interval','hidden','pagehide'].includes(s.reason) ? s.reason : 'interval', frame, context };
  });
  return { sessionId: body.sessionId, metadata, samples };
}
