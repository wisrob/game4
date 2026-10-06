import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import { World } from '../server/simulation.js';
import { startServer } from '../server/index.js';
import { LAKE, walkable, WORLD_SIZE } from '../shared/world.js';
import { validateConfig } from '../shared/config.js';
import { createSlash, followSlash } from '../src/slash.js';
test('server normalizes movement and rejects nonfinite inputs',()=>{const w=new World(),p=w.join();w.input(p.id,{x:100,z:0});w.tick(.05);assert.ok(Math.abs(p.x-.3)<.001);w.input(p.id,{x:Infinity,z:NaN});assert.ok(Number.isFinite(p.input.x));const before=p.x;w.tick(1);assert.equal(p.x,before);});
test('mobs face their target, including a zero heading',()=>{const w=new World(),p=w.join(),m=w.mobs[0];p.x=m.x+2;p.z=m.z;w.tick(.05);assert.equal(m.angle,Math.PI/2);p.x=m.x;p.z=m.z+2;w.tick(.05);assert.equal(m.angle,0);assert.equal(w.snapshot().mobs[0].angle,0);});
test('mobs stop exactly at melee range without overshooting and can attack there',()=>{
  for(const range of [.5,1.15,3])for(const speed of [2.1,5])for(const dt of [.05,2]){
    const w=new World(),p=w.join(),m=w.mobs[0];w.mobs=[m];
    w.config.mobAttackRange=range;w.config.enemySpeed=speed;
    p.x=0;p.z=-2;m.x=range+.03;m.z=-2;
    assert.ok(walkable(m.x,m.z));w.tick(dt);
    assert.ok(Math.abs(Math.hypot(m.x-p.x,m.z-p.z)-range)<1e-8);
    assert.ok(w.snapshot().events.some(e=>e.type==='mob-attack'));
    const stopped={x:m.x,z:m.z};w.tick(.05);assert.equal(m.x,stopped.x);assert.equal(m.z,stopped.z);
    // If the player steps closer, the mob backs away using normal movement.
    p.x=m.x-.1;w.tick(2);
    assert.ok(Math.abs(Math.hypot(m.x-p.x,m.z-p.z)-range)<1e-8);
  }
});
test('overlapping actors separate without nonfinite movement or headings',()=>{
  const w=new World(),p=w.join(),m=w.mobs[0];w.mobs=[m];p.x=m.x=0;p.z=m.z=-2;
  for(let i=0;i<20;i++)w.tick(.05);
  assert.ok(Number.isFinite(m.x)&&Number.isFinite(m.z)&&Number.isFinite(m.angle));
  assert.ok(Math.abs(Math.hypot(m.x-p.x,m.z-p.z)-w.config.mobAttackRange)<1e-8);
});
test('lake, open world boundary and collision prevent invalid movement',()=>{assert.equal(walkable(LAKE.x,LAKE.z),false);assert.equal(walkable(WORLD_SIZE/2,0),false);assert.equal(walkable(44,0),true);const w=new World(),p=w.join();p.x=LAKE.x-LAKE.radius-.31;p.z=LAKE.z;w.input(p.id,{x:1,z:0});w.tick(.05);assert.ok(p.x<LAKE.x-LAKE.radius);});
test('combat is authoritative, cooldown protected and quest rewards once',()=>{const w=new World(),p=w.join();p.x=-8;p.z=-8;const m=w.mobs[0];assert.equal(w.ability(p.id,'nova'),true);assert.equal(m.hp,22);assert.equal(w.ability(p.id,'nova'),false);assert.equal(w.ability(p.id,'attack'),true);assert.equal(m.hp,0);assert.equal(p.kills,1);for(let i=0;i<5;i++){w.time+=1;m.hp=1;p.x=m.x;p.z=m.z;w.ability(p.id,'attack');}assert.equal(p.kills,6);assert.equal(p.xp,270);assert.equal(p.gold,98);});
test('settings validation rejects broken JSON domains and bad ranges',()=>{const config=JSON.parse(readFileSync('settings.json','utf8'));assert.deepEqual(validateConfig(config),config);config.water.speed=-1;assert.throws(()=>validateConfig(config),/water.speed/);});
test('water opacity accepts transparent and opaque endpoints and rejects invalid values',()=>{
  const config=JSON.parse(readFileSync('settings.json','utf8'));
  for(const opacity of [0,.68,1]){config.water.opacity=opacity;assert.equal(validateConfig(config).water.opacity,opacity);}
  for(const opacity of [-.01,1.01,NaN,Infinity,'0.5',null]){config.water.opacity=opacity;assert.throws(()=>validateConfig(config),/water.opacity/);}
});
test('water optics reject invalid coefficients and indices and preserve tunable endpoints',()=>{
  for(const [key,min,max] of [['transmission',0,1],['ior',1,2],['refraction',0,2],['absorption',0,5],['scattering',0,2],['roughness',.05,1],['reflection',0,3],['shimmer',0,2],['foamStrength',0,1],['foamDistance',.05,2]]){
    const config=JSON.parse(readFileSync('settings.json','utf8'));
    for(const value of [min,max]){config.water[key]=value;assert.equal(validateConfig(config).water[key],value);}
    for(const value of [min-.001,max+.001,NaN,Infinity,'1']){config.water[key]=value;assert.throws(()=>validateConfig(config),new RegExp(`water.${key}`));}
  }
});
test('damage identifies the victim and mob slashes accompany actual cooldown-protected attacks',()=>{
  const w=new World(),p=w.join(),m=w.mobs[0];p.x=m.x;p.z=m.z+1;p.angle=Math.PI;
  w.ability(p.id,'attack');assert.equal(w.snapshot().events.find(e=>e.type==='damage').id,m.id);
  w.tick(.05);const events=w.snapshot().events,slash=events.find(e=>e.type==='mob-attack');
  assert.equal(slash.id,m.id);assert.equal(slash.angle,0);assert.equal(slash.range,w.config.mobAttackRange);assert.equal(slash.radius,slash.range);assert.equal(slash.arcDegrees,w.config.attackArcDegrees);
  assert.equal(events.find(e=>e.type==='hurt').id,p.id);
  w.tick(.05);assert.equal(w.snapshot().events.some(e=>e.type==='mob-attack'),false);
  w.config.enemyDamage=0;w.tick(1.2);assert.ok(w.snapshot().events.some(e=>e.type==='mob-attack'));assert.equal(p.hp,92);
});
test('slashes hit only within the configured forward arc and range',()=>{
  for(const key of ['attack','nova'])for(const facing of [0,Math.PI/2,Math.PI-.1,-Math.PI+.1]){
    const w=new World(),p=w.join();w.config.attackArcDegrees=90;w.config.skillArcDegrees=90;p.angle=facing;
    const offsets=[0,Math.PI/4,Math.PI/4+.01,Math.PI,-Math.PI/4,-Math.PI/4-.01,0];
    w.mobs=w.mobs.slice(0,offsets.length);
    w.mobs.forEach((m,i)=>{const distance=i===6?6:1;m.x=p.x+Math.sin(facing+offsets[i])*distance;m.z=p.z+Math.cos(facing+offsets[i])*distance;});
    assert.equal(w.ability(p.id,key),true);
    assert.deepEqual(w.mobs.map(m=>m.hp<60),[true,true,false,false,true,false,false]);
    const event=w.snapshot().events.find(e=>e.type==='ability');assert.equal(event.angle,facing);assert.equal(event.arcDegrees,90);
  }
});
test('arc changes apply on the next attack, including full circles',()=>{
  const w=new World(),p=w.join(),m=w.mobs[0];m.x=p.x+1;m.z=p.z;
  w.config.attackArcDegrees=10;w.ability(p.id,'attack');assert.equal(m.hp,60);
  w.time+=1;w.config.attackArcDegrees=200;w.ability(p.id,'attack');assert.equal(m.hp,36);
  w.time+=1;m.x=p.x;m.z=p.z-1;w.config.attackArcDegrees=360;w.ability(p.id,'attack');assert.equal(m.hp,12);
  p.hp=40;w.ability(p.id,'heal');assert.equal(p.hp,80);
});
test('slash arc settings reject invalid angles',()=>{
  for(const key of ['attackArcDegrees','skillArcDegrees'])for(const value of [0,361,NaN,Infinity,'120']){
    const config=JSON.parse(readFileSync('settings.json','utf8'));config.gameplay[key]=value;assert.throws(()=>validateConfig(config),new RegExp(key));
  }
});
test('one configured range drives both damage reach and slash radius',()=>{
  for(const [key,field] of [['attack','attackRange'],['nova','skillRange']]){
    const w=new World(),p=w.join(),m=w.mobs[0];w.config[field]=.75;
    m.x=p.x;m.z=p.z+1.5;w.ability(p.id,key);assert.equal(m.hp,60);
    let event=w.snapshot().events.find(e=>e.type==='ability');assert.equal(event.radius,.75);assert.equal(event.range,.75);
    w.time+=10;w.config[field]=2;w.ability(p.id,key);assert.ok(m.hp<60);event=w.snapshot().events.find(e=>e.type==='ability');assert.equal(event.radius,2);
    const slash=createSlash(event),positions=slash.mesh.geometry.attributes.position;
    let maxRadius=0;for(let i=0;i<positions.count;i++)maxRadius=Math.max(maxRadius,Math.hypot(positions.getX(i),positions.getY(i)));
    assert.ok(Math.abs(maxRadius-2)<1e-6);assert.equal(slash.radius,2);assert.equal(slash.range,2);assert.equal(slash.mesh.scale.x,1);
    followSlash(slash,{x:3,z:4});assert.equal(slash.mesh.position.x,3);assert.equal(slash.mesh.position.z,4);
    slash.mesh.geometry.dispose();slash.mesh.material.dispose();
  }
  for(const field of ['attackRange','skillRange','mobAttackRange'])for(const value of [0,-1,6.1,NaN,Infinity,'1.5']){
    const config=JSON.parse(readFileSync('settings.json','utf8'));config.gameplay[field]=value;assert.throws(()=>validateConfig(config),new RegExp(field));
  }
});
test('accepted attacks cycle swing planes per actor, not on rejected casts or potions',()=>{
  const w=new World(),p=w.join();const variants=[],rotations=[];
  for(let i=0;i<4;i++){
    assert.ok(w.ability(p.id,'attack'));assert.equal(w.ability(p.id,'attack'),false);
    const event=w.snapshot().events.find(e=>e.key==='attack');variants.push(event.slashVariant);
    const slash=createSlash(event);rotations.push(slash.mesh.quaternion.toArray().join(','));slash.mesh.geometry.dispose();slash.mesh.material.dispose();
    w.ability(p.id,'heal');w.snapshot();w.time+=10;
  }
  assert.deepEqual(variants,[0,1,2,0]);assert.equal(new Set(rotations).size,3);
});
test('camera zoom bounds reject reversed and nonfinite limits and allow a locked zoom',()=>{const config=JSON.parse(readFileSync('settings.json','utf8'));config.camera.minZoom=2;config.camera.maxZoom=1;assert.throws(()=>validateConfig(config),/Camera max zoom/);config.camera.maxZoom=2;assert.equal(validateConfig(config).camera.minZoom,2);config.camera.minZoom=NaN;assert.throws(()=>validateConfig(config),/camera.minZoom/);config.camera.minZoom=.6;config.camera.maxZoom=Infinity;assert.throws(()=>validateConfig(config),/camera.maxZoom/);});
test('two websocket clients share movement, chat and disconnect cleanup',async()=>{const game=startServer(0);await once(game.http,'listening');const url=`ws://127.0.0.1:${game.http.address().port}/ws`;const sockets=[];try{const a=new WebSocket(url),b=new WebSocket(url);sockets.push(a,b);const messagesA=[],messagesB=[];a.on('message',s=>messagesA.push(JSON.parse(s)));b.on('message',s=>messagesB.push(JSON.parse(s)));await Promise.all([once(a,'open'),once(b,'open')]);await new Promise(r=>setTimeout(r,150));assert.equal(game.world.players.size,2);a.send(JSON.stringify({type:'input',x:1,z:0}));a.send(JSON.stringify({type:'chat',text:'Hello vale'}));await new Promise(r=>setTimeout(r,150));assert.ok(messagesB.some(m=>m.type==='chat'&&m.text==='Hello vale'));assert.ok(messagesB.some(m=>m.type==='state'&&m.players.some(p=>p.x>0)));a.close();await once(a,'close');await new Promise(r=>setTimeout(r,20));assert.equal(game.world.players.size,1);}finally{for(const s of sockets)s.terminate();game.close();}});
