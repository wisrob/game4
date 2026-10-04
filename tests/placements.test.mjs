import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlacements } from '../shared/placements.js';
import { applyPlacements, PROPS, TREES, walkable } from '../shared/world.js';
import { World } from '../server/simulation.js';
const original=JSON.parse(readFileSync('placements.json','utf8'));

test('placement file round-trips all supported scenery with stable IDs',()=>{
  assert.deepEqual(validatePlacements(original),original);
  assert.equal(new Set(PROPS.map(p=>p.id)).size,PROPS.length);
  for(const model of ['pine','fern','boulder','log','lantern','dock','wardstone','campfire'])assert.ok(PROPS.some(p=>p.model===model));
});
test('placement validation rejects corrupt editor transforms and ambiguous IDs',()=>{
  const prop=original.props[0];
  for(const change of [{x:NaN},{z:45},{scale:0},{model:'missing'},{rotation:Infinity},{tint:'#bad'},{id:'../outside'}])assert.throws(()=>validatePlacements({version:1,props:[{...prop,...change}]}));
  assert.throws(()=>validatePlacements({version:1,props:[prop,prop]}));
  assert.throws(()=>validatePlacements({version:2,props:[]}));
});
test('moving a tree updates shared collisions and rejects invalid replacement atomically',()=>{
  const moved=structuredClone(original);const tree=moved.props.find(p=>p.model==='pine');tree.x=0;tree.z=4;
  assert.equal(walkable(0,4),true);
  try{
    applyPlacements(moved);assert.equal(walkable(0,4),false);assert.ok(TREES.some(p=>p.id===tree.id&&p.z===4));
    const bad=structuredClone(moved);bad.props[0].scale=-1;
    assert.throws(()=>applyPlacements(bad));assert.deepEqual(PROPS,moved.props);
  }finally{applyPlacements(original);}
  assert.equal(walkable(0,4),true);
});
test('camp healing follows the placement on the authoritative server',()=>{
  const moved=structuredClone(original),camp=moved.props.find(p=>p.model==='campfire');camp.x=20;camp.z=20;
  try{
    applyPlacements(moved);const world=new World();world.mobs=[];const player=world.join();player.hp=50;
    world.tick(.05);assert.equal(player.hp,50);
    player.x=20;player.z=20;world.tick(.05);assert.equal(player.hp,50.25);
  }finally{applyPlacements(original);}
});
