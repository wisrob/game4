import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { compileMap } from '../shared/map.js';
export async function exportMap(source,out='public/world'){
  source??=JSON.parse(await readFile('world/map.json','utf8'));
  const {map,chunks,props}=compileMap(source);await mkdir(`${out}/chunks`,{recursive:true});
  for(const [key,chunk] of chunks)await writeFile(`${out}/chunks/${key}.json`,JSON.stringify(chunk));
  await writeFile(`${out}/manifest.json`,JSON.stringify({version:1,map,chunks:[...chunks.keys()],propCount:props.length},null,2)+'\n');
  console.log(`Exported ${chunks.size} chunks, ${props.length} props to ${out}`);
}
if(process.argv.includes('--generate')){
  const map={version:1,name:'The Far Marches',size:768,chunkSize:64,base:'grass',regions:[],paths:[],scatter:[],props:[]};
  function region(id,material,points,density=0,models){map.regions.push({id,material,points});if(density)map.scatter.push({id:`scatter-${id}`,region:id,seed:map.regions.length*913,density,spacing:7,models:models??({grass:['pine','pine','fern','boulder'],snow:['snow-pine','snow-pine','boulder'],sand:['dead-tree','cactus','boulder']}[material])});}
  region('western-forest','grass',[[-384,-384],[75,-384],[55,-115],[85,-55],[45,75],[80,170],[-40,384],[-384,384]],150);
  region('frostlands','snow',[[75,-384],[384,-384],[384,-75],[235,-60],[140,-85],[55,-115]],130);
  region('sunlands','sand',[[85,-55],[140,-85],[235,-60],[384,-75],[384,384],[130,384],[80,170],[45,75]],65);
  region('rocky-pass','rock',[[30,-165],[65,-220],[105,-175],[125,-95],[100,-70],[65,-95]],65,['boulder']);
  region('palm-coast','sand',[[-384,140],[-230,155],[-210,225],[-120,270],[-100,384],[-384,384]],100,['palm','palm','boulder']);
  region('western-sea','water',[[-384,175],[-320,165],[-280,185],[-255,225],[-235,235],[-220,270],[-165,300],[-155,345],[-135,384],[-384,384]]);
  region('oasis','water',[[197,133],[207,123],[227,124],[241,137],[237,157],[222,165],[202,154]]);
  region('oasis-grove','sand',[[180,110],[252,110],[262,175],[183,181]],140,['palm']);
  // Restore the water above the grove's material layer.
  const oasis=map.regions.splice(map.regions.findIndex(r=>r.id==='oasis'),1)[0];map.regions.push(oasis);
  const path=(id,points,width=5)=>map.paths.push({id,material:'path',width,points});
  path('north-road',[[0,-40],[0,-70],[20,-100],[55,-130],[90,-160],[150,-190],[200,-210]]);
  path('east-road',[[40,-2],[80,-2],[105,30],[130,70],[165,70],[180,105],[180,138]],6);
  path('coast-road',[[-40,-2],[-95,0],[-130,0],[-155,40],[-170,100],[-210,150],[-240,190]]);
  path('south-road',[[0,40],[0,90],[-20,145],[-55,180],[-80,210]]);
  let n=0;const prop=(model,x,z,rotation=0,scale=1)=>map.props.push({id:`landmark-${++n}`,model,x,z,rotation,scale});
  // Towns face a wide road; buildings have collision footprints and walkable streets.
  for(const [cx,cz,model] of [[-100,0,'house'],[150,-190,'snow-house'],[130,70,'house']])for(let j=0;j<3;j++)for(const side of [-1,1])prop(model,cx+(j-1)*14,cz+side*13,side===1?Math.PI:0);
  for(const [x,z] of [[-65,155],[265,45],[210,-275],[-255,-150]]){prop('ruin',x,z,.3,1.5);prop('ruin',x+12,z+6,2,1);}
  await writeFile('world/map.json',JSON.stringify(map,null,2)+'\n');console.log('Authored forest, frostlands, desert, coast, oasis, three towns and four ruins.');
}
await exportMap();
