// Engine-independent authoring, placement and collision tools. Coordinates are X/Z.
export const MATERIALS={grass:'#526b3c',snow:'#d9e5e4',sand:'#ccb47d',rock:'#777d7a',path:'#9c805c',water:'#357f8b'};
export const MAP_MODELS=['pine','boulder','fern','snow-pine','dead-tree','palm','cactus','ruin','house','snow-house'];
export const PALETTES={grass:['pine','pine','fern','boulder'],snow:['snow-pine','snow-pine','boulder'],sand:['dead-tree','palm','cactus','boulder'],rock:['boulder','ruin']};
export const COLLIDERS={pine:.9,'snow-pine':1,'dead-tree':.65,palm:.65,cactus:.5,boulder:.8,ruin:2.8,house:3.5,'snow-house':3.5};
export function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function inside(x,z,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [ax,az]=points[i],[bx,bz]=points[j];if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)yes=!yes;}return yes;}
export function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);}
export function starter(x,z){return Math.abs(x)<44&&Math.abs(z)<44;}
export function surface(map,x,z){let material=map.base;for(const r of map.regions)if(inside(x,z,r.points))material=r.material;for(const p of map.paths)for(let i=1;i<p.points.length;i++)if(segmentDistance(x,z,p.points[i-1],p.points[i])<=p.width/2){material=p.material;break;}return material;}
export function surfaceSampler(map){const bounds=(points,margin=0)=>{const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);return [Math.min(...xs)-margin,Math.min(...zs)-margin,Math.max(...xs)+margin,Math.max(...zs)+margin];};const regions=map.regions.map(r=>({...r,bounds:bounds(r.points)})),paths=map.paths.map(r=>({...r,bounds:bounds(r.points,r.width/2)}));const contains=(b,x,z)=>x>=b[0]&&z>=b[1]&&x<=b[2]&&z<=b[3];return(x,z)=>{let material=map.base;for(const r of regions)if(contains(r.bounds,x,z)&&inside(x,z,r.points))material=r.material;for(const p of paths)if(contains(p.bounds,x,z))for(let i=1;i<p.points.length;i++)if(segmentDistance(x,z,p.points[i-1],p.points[i])<=p.width/2){material=p.material;break;}return material;};}
export function validateMap(input){
  const m=structuredClone(input);const fail=message=>{throw new Error(message);};
  if(m?.version!==1||typeof m.name!=='string'||m.name.length>100||!Number.isInteger(m.size)||m.size<128||m.size>4096||m.chunkSize!==64||m.size%128||!Object.hasOwn(MATERIALS,m.base))fail('Invalid map header (size: multiples of 128, chunk size: 64)');
  const ids=new Set();const id=v=>{if(typeof v!=='string'||!/^[\w-]{1,80}$/.test(v)||ids.has(v))fail('Map IDs must be unique');ids.add(v);};
  const points=(v,n)=>{if(!Array.isArray(v)||v.length<n||v.length>512||v.some(p=>!Array.isArray(p)||p.length!==2||p.some(c=>!Number.isFinite(c)||Math.abs(c)>m.size/2)))fail('Invalid region/path vertices');};
  if(!Array.isArray(m.regions)||!Array.isArray(m.paths)||!Array.isArray(m.scatter)||!Array.isArray(m.props)||m.regions.length>128||m.paths.length>128||m.scatter.length>256||m.props.length>10000)fail('Invalid map collections');
  for(const r of m.regions){id(r.id);points(r.points,3);if(!Object.hasOwn(MATERIALS,r.material))fail('Unknown region material');}
  for(const p of m.paths){id(p.id);points(p.points,2);if(!Object.hasOwn(MATERIALS,p.material)||!Number.isFinite(p.width)||p.width<.25||p.width>40)fail('Invalid path');}
  for(const s of m.scatter){id(s.id);if(!m.regions.some(r=>r.id===s.region)||!Number.isInteger(s.seed)||!Number.isFinite(s.density)||s.density<0||s.density>600||!Number.isFinite(s.spacing)||s.spacing<2||s.spacing>30||!Array.isArray(s.models)||!s.models.length||s.models.some(n=>!MAP_MODELS.includes(n)))fail('Invalid placement request');}
  for(const p of m.props){id(p.id);if(!MAP_MODELS.includes(p.model)||['x','z','rotation','scale'].some(k=>!Number.isFinite(p[k]))||Math.abs(p.x)>m.size/2||Math.abs(p.z)>m.size/2||p.scale<.2||p.scale>3)fail('Invalid explicit prop');}
  return m;
}
export function chunkKey(x,z,size=64){return `${Math.floor(x/size)},${Math.floor(z/size)}`;}
export function compileMap(input){
  const map=validateMap(input),chunks=new Map(),all=[];const size=map.chunkSize;
  for(let z=-map.size/2;z<map.size/2;z+=size)for(let x=-map.size/2;x<map.size/2;x+=size)chunks.set(chunkKey(x,z,size),{x,z,size,props:[]});
  const occupied=new Map();
  function insert(p){all.push(p);chunks.get(chunkKey(p.x,p.z,size))?.props.push(p);const key=chunkKey(p.x,p.z,8);if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push(p);}
  function clear(x,z,d){const radius=Math.ceil((d+12)/8);for(let j=-radius;j<=radius;j++)for(let i=-radius;i<=radius;i++)for(const p of occupied.get(`${Math.floor(x/8)+i},${Math.floor(z/8)+j}`)??[])if(Math.hypot(x-p.x,z-p.z)<d+(COLLIDERS[p.model]??0)*p.scale)return false;return true;}
  for(const p of map.props){if(starter(p.x,p.z)||surface(map,p.x,p.z)==='water'||Math.abs(p.x)>=map.size/2||Math.abs(p.z)>=map.size/2)throw new Error(`Prop ${p.id} overlaps water, starter clearing or boundary`);insert(p);}
  for(const request of map.scatter){const region=map.regions.find(r=>r.id===request.region);if(!PALETTES[region.material])continue;const r=rng(request.seed),xs=region.points.map(p=>p[0]),zs=region.points.map(p=>p[1]);const minX=Math.min(...xs),minZ=Math.min(...zs),w=Math.max(...xs)-minX,h=Math.max(...zs)-minZ;
    // Fixed jittered grid bounds both runtime work and minimum spacing.
    for(let z=minZ;z<minZ+h;z+=request.spacing)for(let x=minX;x<minX+w;x+=request.spacing){const px=x+r()*request.spacing,pz=z+r()*request.spacing,choice=r(),model=request.models[Math.floor(r()*request.models.length)],scale=.7+r()*.6,rotation=r()*Math.PI*2;
      if(choice>request.density*request.spacing**2/10000||starter(px,pz)||!inside(px,pz,region.points)||surface(map,px,pz)!==region.material||Math.abs(px)>=map.size/2||Math.abs(pz)>=map.size/2||!clear(px,pz,request.spacing*.55))continue;
      // Reserve a margin along roads and shores, not just the center point.
      const d=(COLLIDERS[model]??0)*scale+.7;if([[d,0],[-d,0],[0,d],[0,-d]].some(([dx,dz])=>surface(map,px+dx,pz+dz)!==region.material))continue;
      insert({id:`${request.id}-${all.length}`,model,x:px,z:pz,scale,rotation});
    }
  }
  return {map,chunks,props:all};
}
export function mapWalkable(compiled,x,z){const {map,chunks}=compiled;if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>=map.size/2-1||Math.abs(z)>=map.size/2-1||surface(map,x,z)==='water')return false;
  const cx=Math.floor(x/map.chunkSize),cz=Math.floor(z/map.chunkSize);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const p of chunks.get(`${cx+dx},${cz+dz}`)?.props??[])if(Math.hypot(x-p.x,z-p.z)<(COLLIDERS[p.model]??0)*p.scale+.35)return false;return true;
}
