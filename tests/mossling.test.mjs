import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeMossling } from '../src/mossling.js';

async function loadModel(){
  const bytes=await readFile(new URL('../public/models/mossling.glb',import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), '')).scene;
}

test('actual mossling renders in one mesh with the same triangles, normals and surface colors',async()=>{
  const model=await loadModel();model.updateMatrixWorld(true);
  const expected=[];model.traverse(part=>{
    if(!part.isMesh)return;
    const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();geometry.applyMatrix4(part.matrixWorld);
    for(let i=0;i<geometry.attributes.position.count;i++)expected.push({
      position:new T.Vector3().fromBufferAttribute(geometry.attributes.position,i),
      normal:new T.Vector3().fromBufferAttribute(geometry.attributes.normal,i),
      color:part.material.color.clone()
    });
    geometry.dispose();
  });
  const merged=mergeMossling(model);assert.notEqual(merged,model);
  assert.equal(merged.children.length,1);
  const {geometry,material}=merged.children[0];assert.equal(geometry.attributes.position.count,expected.length);
  for(let i=0;i<expected.length;i++){
    assert.ok(new T.Vector3().fromBufferAttribute(geometry.attributes.position,i).distanceTo(expected[i].position)<1e-6);
    assert.ok(new T.Vector3().fromBufferAttribute(geometry.attributes.normal,i).distanceTo(expected[i].normal)<1e-6);
    const color=new T.Color().fromBufferAttribute(geometry.attributes.color,i);
    assert.ok(Math.abs(color.r-expected[i].color.r)+Math.abs(color.g-expected[i].color.g)+Math.abs(color.b-expected[i].color.b)<1e-6);
  }
  assert.equal(material.roughness,.8500000238418579);assert.equal(material.metalness,0);
  const first=material.clone(),second=material.clone();
  first.userData.actorTint.hit.value=1;assert.equal(second.userData.actorTint.hit.value,0,'Victim flashes remain independent');
});

test('future mossling assets with different lighting properties keep their original materials',async()=>{
  for(const field of ['roughness','metalness','opacity','flatShading']){
    const model=await loadModel(),part=model.children.find(p=>p.isMesh);
    if(!part){let found;model.traverse(p=>{if(p.isMesh&&!found)found=p;});found.material[field]=field==='flatShading'?true:.33;}
    else part.material[field]=field==='flatShading'?true:.33;
    assert.equal(mergeMossling(model),model,field);
  }
});
