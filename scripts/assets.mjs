import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const candidates=[process.env.BLENDER_PATH,'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe','C:/Program Files/Blender Foundation/Blender 4.5/blender.exe','/Applications/Blender.app/Contents/MacOS/Blender','blender'].filter(Boolean);
const executable=candidates.find(p=>p==='blender'||existsSync(p));
const detailsOnly=process.argv.includes('--details-only');
const pineOnly=process.argv.includes('--pine-only');
const worldOnly=process.argv.includes('--world-only');
const result=spawnSync(executable,['--background','--python','scripts/models.py',...(detailsOnly||pineOnly||worldOnly?['--',...(detailsOnly?['--details-only']:[]),...(pineOnly?['--pine-only']:[]),...(worldOnly?['--world-only']:[])]:[])],{stdio:'inherit'});
if(result.error){console.error('Install Blender or set BLENDER_PATH to its executable.',result.error.message);process.exit(1);}
if(result.status!==0)process.exit(result.status??1);
// Blender 5 exports its dithered node materials as BLEND. These assets are
// binary alpha cutouts; record MASK in the GLB for other viewers as well.
for(const name of detailsOnly||worldOnly?[]:pineOnly?['pine']:['pine','fern']){
  const path=`public/models/${name}.glb`,original=readFileSync(path),jsonLength=original.readUInt32LE(12);
  const document=JSON.parse(original.subarray(20,20+jsonLength).toString());
  for(const material of document.materials)if(material.pbrMetallicRoughness?.baseColorTexture){material.alphaMode='MASK';material.alphaCutoff=.4;}
  const json=Buffer.from(JSON.stringify(document)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
  const binary=original.subarray(20+jsonLength),header=Buffer.from(original.subarray(0,20));
  header.writeUInt32LE(20+padded.length+binary.length,8);header.writeUInt32LE(padded.length,12);
  writeFileSync(path,Buffer.concat([header,padded,binary]));
}
