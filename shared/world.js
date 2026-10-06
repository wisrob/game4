// Deterministic world data: rendering and server collisions share one source.
import placementFile from '../placements.json' with { type: 'json' };
import { validatePlacements } from './placements.js';
import mapFile from '../world/map.json' with { type: 'json' };
import { compileMap, validateMap, mapWalkable, starter } from './map.js';
// Server owns the complete collision index; browser prediction receives chunk
// colliders with the scenery payload instead of generating every world prop.
export let MAP = typeof window==='undefined'?compileMap(mapFile):{map:validateMap(mapFile),chunks:new Map()};
export function applyMapChunk(key,chunk){if(chunk)MAP.chunks.set(key,chunk);else MAP.chunks.delete(key);}
export let WORLD_SIZE = MAP.map.size;
export function applyMap(document){const next=compileMap(document);MAP=next;WORLD_SIZE=next.map.size;}
export const LAKE = { x: 14, z: -7, radius: 7.5 };
export const SPAWN = { x: 0, z: 4 };
export const MOB_SPAWNS = [[-8,-8],[-12,-4],[-4,-14],[8,12],[13,17],[-14,12],[20,8],[-21,-14]];
export function random(seed = 42) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
export function onPath(x,z) { return Math.abs(x - Math.sin(z * .12) * 2) < 2.2 || Math.abs(z + 2 - Math.sin(x * .15) * 2) < 1.7; }
export const PROPS = validatePlacements(placementFile).props;
export const TREES = PROPS.filter(p=>p.model==='pine');
export function applyPlacements(document) {
  const {props}=validatePlacements(document);
  PROPS.splice(0,PROPS.length,...props);
  TREES.splice(0,TREES.length,...props.filter(p=>p.model==='pine'));
}
export function walkable(x,z) { return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x)<WORLD_SIZE/2-1 && Math.abs(z)<WORLD_SIZE/2-1 && Math.hypot(x-LAKE.x,z-LAKE.z)>LAKE.radius+.3 && !TREES.some(t=>Math.hypot(x-t.x,z-t.z)<.7*t.scale+.35) && (starter(x,z)||mapWalkable(MAP,x,z)); }
export function move(entity, dx, dz) { if(walkable(entity.x+dx,entity.z)) entity.x+=dx; if(walkable(entity.x,entity.z+dz)) entity.z+=dz; }
