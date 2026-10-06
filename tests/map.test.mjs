import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileMap,validateMap,surface,mapWalkable,chunkKey,inside,segmentDistance,starter } from '../shared/map.js';
import { validateConfig } from '../shared/config.js';
// Independent fixture: authoring a different real map must not break tests
// that exercise specific shore coordinates, biome palettes or landmarks.
const source=()=>({version:1,name:'Test marches',size:768,chunkSize:64,base:'grass',regions:[
  {id:'western-forest',material:'grass',points:[[-384,-384],[0,-384],[0,384],[-384,384]]},
  {id:'frostlands',material:'snow',points:[[0,-384],[384,-384],[384,0],[0,0]]},
  {id:'desert',material:'sand',points:[[0,0],[384,0],[384,384],[0,384]]},
  {id:'oasis',material:'water',points:[[197,133],[207,123],[227,124],[241,137],[237,157],[222,165],[202,154]]}
],paths:[{id:'road',material:'path',width:6,points:[[-100,-2],[150,-2]]}],scatter:[
  {id:'forest-scatter',region:'western-forest',seed:913,density:150,spacing:7,models:['pine','boulder']},
  {id:'snow-scatter',region:'frostlands',seed:1826,density:130,spacing:7,models:['snow-pine','boulder']},
  {id:'sand-scatter',region:'desert',seed:2739,density:100,spacing:7,models:['palm','dead-tree','cactus']}
],props:Array.from({length:18},(_,i)=>({id:`house-${i}`,model:'house',x:-180+(i%6)*14,z:80+Math.floor(i/6)*16,scale:1,rotation:0}))});
test('repository map remains valid independently of authoring choices',()=>{assert.ok(compileMap(JSON.parse(readFileSync('world/map.json','utf8'))).chunks.size>0);});
test('authored map exports deterministic biome placements with stable chunk ownership',()=>{const a=compileMap(source()),b=compileMap(source());assert.deepEqual(a.props,b.props);assert.equal(a.chunks.size,144);assert.ok(a.props.length>1000);assert.equal([...a.chunks.values()].reduce((n,c)=>n+c.props.length,0),a.props.length);for(const p of a.props){assert.equal(starter(p.x,p.z),false);assert.notEqual(surface(a.map,p.x,p.z),'water');assert.ok(a.chunks.get(chunkKey(p.x,p.z)).props.includes(p));}assert.ok(a.props.some(p=>p.model==='palm'));assert.ok(a.props.some(p=>p.model==='snow-pine'));assert.equal(a.props.filter(p=>p.model.includes('house')).length,18);});
test('fine shoreline and path widths share exact collision sampling',()=>{const map=source();assert.equal(surface(map,220,145),'water');assert.equal(surface(map,220,170),'sand');assert.equal(surface(map,80,-2),'path');assert.equal(inside(1,1,[[0,0],[2,0],[2,2],[0,2]]),true);assert.equal(segmentDistance(1,1,[0,0],[2,0]),1);const compiled=compileMap(map);assert.equal(mapWalkable(compiled,220,145),false);assert.equal(mapWalkable(compiled,384,0),false);assert.equal(mapWalkable(compiled,80,-2),true);const house=map.props.find(p=>p.model==='house');assert.equal(mapWalkable(compiled,house.x,house.z),false);assert.equal(mapWalkable(compiled,NaN,0),false);});
test('chunk indexing handles negative coordinates and neighbors at seams',()=>{assert.equal(chunkKey(-.1,-64.1),'-1,-2');assert.equal(chunkKey(64,0),'1,0');const map=source();map.props.push({id:'seam-house',model:'house',x:63,z:90,scale:1,rotation:0});const compiled=compileMap(map);assert.equal(mapWalkable(compiled,65,90),false);});
test('map validation rejects malformed authoring and unsafe placement',()=>{for(const mutate of [m=>m.size=777,m=>m.base='toString',m=>m.regions[0].material='constructor',m=>m.regions[0].points[0][0]=Infinity,m=>m.scatter[0].density=999,m=>m.scatter[0].models=['alien'],m=>m.paths[0].width=0,m=>m.regions[1].id=m.regions[0].id]){const m=source();mutate(m);assert.throws(()=>validateMap(m));}const map=source();map.props.push({id:'water-house',model:'house',x:220,z:145,scale:1,rotation:0});assert.throws(()=>compileMap(map),/overlaps/);});
test('water painting disables an existing region scatter request',()=>{const map=source();map.regions.find(r=>r.id==='western-forest').material='water';map.props=[];const compiled=compileMap(map);for(const p of compiled.props)assert.notEqual(surface(map,p.x,p.z),'water');});
test('fractional streaming radius and instance counts are rejected',()=>{for(const key of ['radius','grassPerChunk']){const config=JSON.parse(readFileSync('settings.json','utf8'));config.streaming[key]=1.5;assert.throws(()=>validateConfig(config),/integers/);}});
