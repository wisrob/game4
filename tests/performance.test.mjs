import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { createServer } from 'vite';
import { performancePlugin } from '../scripts/performance-plugin.mjs';
import { summarizeFrames } from '../shared/performance.js';

test('performance stats preserve real stalls instead of clamping simulation time', () => {
  const stats = summarizeFrames([16,16,100,250].map(intervalMs=>({intervalMs,workMs:2,renderSubmitMs:1})));
  assert.equal(stats.frames,4);assert.equal(stats.durationMs,382);assert.equal(stats.maxMs,250);
  assert.equal(stats.p95Ms,250);assert.equal(stats.over50,2);assert.equal(stats.onePercentLowFps,4);
  assert.equal(stats.workMeanMs,2);assert.equal(stats.renderSubmitMeanMs,1);
  assert.equal(summarizeFrames([]),null);
});

test('local logger persists browser samples, deduplicates beacons and rejects unsafe requests', async () => {
  const directory = await mkdtemp(join(tmpdir(),'emberfall-perf-'));
  const vite = await createServer({configFile:false,plugins:[performancePlugin({logDirectory:directory})],server:{middlewareMode:true,hmr:false},logLevel:'silent'});
  const http = createHttpServer(vite.middlewares);http.listen(0,'127.0.0.1');await once(http,'listening');
  const url=`http://127.0.0.1:${http.address().port}`;
  const id='11111111-2222-4333-8444-555555555555';
  const batch={sessionId:id,metadata:{kind:'manual',gpu:'Test hardware GPU',browser:'Test browser',startedAt:new Date().toISOString(),hardwareConcurrency:8},samples:[{sequence:0,timestamp:new Date().toISOString(),reason:'interval',frame:summarizeFrames([16,17,80].map(intervalMs=>({intervalMs,workMs:3,renderSubmitMs:2}))),context:{width:1920,height:1080,devicePixelRatio:1,pixelRatio:1.5,drawCalls:54,triangles:19000,geometries:20,textures:0,players:1,mobs:8,grassDensity:7000,cameraDistance:23,cameraAngle:48,cameraZoom:1,exposure:1.1,shadows:true}}]};
  const post = (body,origin=url) => fetch(`${url}/__performance`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
  try {
    assert.equal((await post(batch)).status,200);
    assert.equal((await post(batch)).status,200);
    const lines=(await readFile(join(directory,`${id}.jsonl`),'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(lines.length,2);assert.equal(lines[0].kind,'manual');assert.equal(lines[1].frame.maxMs,80);
    assert.equal((await post(batch,'http://external.invalid')).status,403);
    assert.equal((await post({...batch,sessionId:'../../escape'})).status,400);
    const broken=structuredClone(batch);broken.samples[0].frame.fps=-1;assert.equal((await post(broken)).status,400);
  } finally { http.closeAllConnections();await new Promise(r=>http.close(r));await vite.close(); }
});
