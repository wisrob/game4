import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The six mossling materials have identical lighting properties. Bake their
// colors into vertices so the unchanged model uses one color and shadow pass.
export function mergeMossling(model){
  model.updateMatrixWorld(true);
  const parts=[];model.traverse(part=>{if(part.isMesh)parts.push(part);});
  const first=parts[0]?.material;
  const signature=material=>{const {metadata,uuid,name,color,...surface}=material.toJSON();return JSON.stringify(surface);};
  // Keep future assets intact if they introduce different surface properties.
  if(!first||parts.some(p=>p.isSkinnedMesh||Array.isArray(p.material)||p.geometry.morphAttributes.position||
    !p.material.isMeshStandardMaterial||p.material.map||p.material.normalMap||p.material.vertexColors||
    p.material.transparent||p.material.alphaTest||signature(p.material)!==signature(first)))return model;
  const geometries=parts.map(part=>{
    const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();
    geometry.applyMatrix4(part.matrixWorld);
    const colors=new Float32Array(geometry.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3)part.material.color.toArray(colors,i);
    geometry.setAttribute('color',new T.BufferAttribute(colors,3));return geometry;
  });
  const geometry=mergeGeometries(geometries);
  for(const part of geometries)part.dispose();
  if(!geometry)return model;
  const material=first.clone();material.color.set('white');material.vertexColors=true;
  material.userData.actorTint={hit:{value:0},heal:{value:0}};
  material.onBeforeCompile=function(shader){
    shader.uniforms.actorHit=this.userData.actorTint.hit;shader.uniforms.actorHeal=this.userData.actorTint.heal;
    shader.fragmentShader='uniform float actorHit,actorHeal;\n'+shader.fragmentShader;
    const red=new T.Color('#ff2424');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.),actorHeal*.85);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(${red.r},${red.g},${red.b}),actorHit*.9);
    `);
  };
  material.customProgramCacheKey=()=> 'mossling-vertex-tint-v1';
  const result=new T.Group();result.add(new T.Mesh(geometry,material));return result;
}
