import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MAP_MODELS,MATERIALS,surfaceSampler,starter,rng } from '../shared/map.js';
import { applyMapChunk } from '../shared/world.js';

// Only nine nearby chunks are retained by default. GPU prop geometry is shared;
// per-chunk textures, instance buffers and grass are disposed on eviction.
export async function createWorldStream(scene,models,grassMaterial,blade){
  const response=await fetch('/world/manifest.json');if(!response.ok)throw new Error('World manifest missing');
  const manifest=await response.json(),map=manifest.map,available=new Set(manifest.chunks),loaded=new Map(),pending=new Map(),failures=new Map(),baked=new Map(),dummy=new T.Object3D();
  const loader=new GLTFLoader();let config,centerKey='',desired=new Set(),generation=0,totalLoaded=0,totalUnloaded=0,error=null;
  const time={value:0},sample=surfaceSampler(map),colors=Object.fromEntries(Object.entries(MATERIALS).map(([k,v])=>{const c=new T.Color(v).convertLinearToSRGB();return [k,[Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255)]];}));
  async function modelParts(name){if(baked.has(name))return baked.get(name);const promise=(async()=>{const model=models[name]??(await loader.loadAsync(`/models/${name}.glb`)).scene;model.updateMatrixWorld(true);const parts=[];model.traverse(p=>{if(p.isMesh){p.material.side=T.DoubleSide;parts.push({geometry:p.geometry.clone().applyMatrix4(p.matrixWorld),material:p.material});}});return parts;})();baked.set(name,promise);return promise;}
  function dispose(record){scene.remove(record.group);for(const mesh of record.owned){mesh.geometry?.dispose();mesh.material?.dispose();}for(const mesh of record.instances)mesh.dispose();record.texture.dispose();}
  async function build(chunk){
    const group=new T.Group(),owned=[],instances=[],resolution=256,data=new Uint8Array(resolution*resolution*4);let wet=false;
    for(let j=0;j<resolution;j++)for(let i=0;i<resolution;i++){const x=chunk.x+(i+.5)*chunk.size/resolution,z=chunk.z+(j+.5)*chunk.size/resolution,key=sample(x,z),offset=(j*resolution+i)*4,c=colors[key];
      // Texture uses sRGB bytes; standard terrain material decodes them.
      data[offset]=c[0];data[offset+1]=c[1];data[offset+2]=c[2];data[offset+3]=starter(x,z)?127:key==='water'?0:255;if(key==='water'&&!starter(x,z))wet=true;
    }
    const texture=new T.DataTexture(data,resolution,resolution);texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.NearestFilter;texture.minFilter=T.NearestFilter;texture.needsUpdate=true;
    const geometry=new T.PlaneGeometry(chunk.size,chunk.size);geometry.rotateX(-Math.PI/2);geometry.translate(chunk.x+chunk.size/2,-.012,chunk.z+chunk.size/2);for(let i=0;i<geometry.attributes.uv.count;i++)geometry.attributes.uv.setY(i,1-geometry.attributes.uv.getY(i));
    const material=new T.MeshStandardMaterial({map:texture,alphaTest:.75,roughness:1});
    material.onBeforeCompile=shader=>{shader.vertexShader='varying vec2 groundPoint;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngroundPoint=position.xz;');shader.fragmentShader='varying vec2 groundPoint;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float grain=fract(sin(dot(floor(groundPoint*45.),vec2(127.1,311.7)))*43758.5453);
      float broad=sin(groundPoint.x*.7+sin(groundPoint.y*.4))*cos(groundPoint.y*.5);
      diffuseColor.rgb*=.94+grain*.09+broad*.035;
    `);};material.customProgramCacheKey=()=> 'stream-ground-v1';
    const ground=new T.Mesh(geometry,material);ground.receiveShadow=true;group.add(ground);owned.push(ground);
    if(wet){const waterMat=new T.ShaderMaterial({uniforms:{mask:{value:texture},time,flow:{value:config.water.speed},foamStrength:{value:config.water.foamStrength},color:{value:new T.Color(config.water.color)},foam:{value:new T.Color(config.water.foamColor)},opacity:{value:config.water.opacity}},vertexShader:'varying vec2 waterUV,waterPoint;void main(){waterUV=uv;waterPoint=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform sampler2D mask;uniform float time,opacity,flow,foamStrength;uniform vec3 color,foam;varying vec2 waterUV,waterPoint;
      void main(){if(texture2D(mask,waterUV).a>.25)discard;
        float shore=0.;vec2 stepUV=vec2(1./256.);shore=max(shore,texture2D(mask,waterUV+vec2(stepUV.x,0)).a);shore=max(shore,texture2D(mask,waterUV-vec2(stepUV.x,0)).a);shore=max(shore,texture2D(mask,waterUV+vec2(0,stepUV.y)).a);shore=max(shore,texture2D(mask,waterUV-vec2(0,stepUV.y)).a);
        float waves=sin(waterPoint.x*1.7+time*flow*.7+sin(waterPoint.y*.6))*sin(waterPoint.y*2.-time*flow*.4);
        gl_FragColor=vec4(mix(color*(1.+waves*.12),foam,shore*foamStrength),opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,transparent:true,depthWrite:false});const water=new T.Mesh(geometry.clone().translate(0,.025,0),waterMat);group.add(water);owned.push(water);}
    const grouped=new Map();for(const p of chunk.props){if(!MAP_MODELS.includes(p.model))continue;const key=`${p.model}:${Math.floor(p.x/32)},${Math.floor(p.z/32)}`;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(p);}
    for(const props of grouped.values()){for(const part of await modelParts(props[0].model)){const mesh=new T.InstancedMesh(part.geometry,part.material,props.length);props.forEach((p,i)=>{dummy.position.set(p.x,0,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();mesh.receiveShadow=true;group.add(mesh);instances.push(mesh);}}
    const random=rng((chunk.x*139+chunk.z*913)>>>0),grass=new T.InstancedMesh(blade,grassMaterial,config.streaming.grassPerChunk);let count=0;
    for(let attempt=0;attempt<config.streaming.grassPerChunk*5&&count<config.streaming.grassPerChunk;attempt++){const x=chunk.x+random()*chunk.size,z=chunk.z+random()*chunk.size;if(starter(x,z)||sample(x,z)!=='grass')continue;dummy.position.set(x,0,z);dummy.rotation.set(0,random()*6.28,0);dummy.scale.setScalar(.6+random()*.6);dummy.updateMatrix();grass.setMatrixAt(count++,dummy.matrix);}grass.count=count;grass.receiveShadow=true;grass.computeBoundingSphere();group.add(grass);instances.push(grass);
    return {group,owned,instances,texture};
  }
  function update(now,center){time.value=now;if(!config)return;const cx=Math.floor(center.x/map.chunkSize),cz=Math.floor(center.z/map.chunkSize),r=config.streaming.radius,key=`${cx},${cz},${r}`;
    if(key!==centerKey){centerKey=key;desired=new Set();for(let z=-r;z<=r;z++)for(let x=-r;x<=r;x++){const k=`${cx+x},${cz+z}`;if(available.has(k))desired.add(k);}for(const [k,record] of loaded)if(!desired.has(k)){dispose(record);loaded.delete(k);applyMapChunk(k,null);totalUnloaded++;}for(const [k,request] of pending)if(!desired.has(k))request.controller.abort();}
    // Limit simultaneous rasterization/fetch work and retry transient failures.
    const sorted=[...desired].sort((a,b)=>{const distance=k=>{const [x,z]=k.split(',').map(Number);return (cx-x)**2+(cz-z)**2;};return distance(a)-distance(b);});
    for(const k of sorted){if(pending.size>=2)break;if(loaded.has(k)||pending.has(k)||(failures.get(k)??0)>performance.now())continue;const controller=new AbortController(),stamp=generation;pending.set(k,{controller});
      void(async()=>{try{const response=await fetch(`/world/chunks/${k}.json`,{signal:controller.signal});if(!response.ok)throw new Error(`Chunk ${k}: ${response.status}`);const chunk=await response.json(),record=await build(chunk);if(controller.signal.aborted||stamp!==generation||!desired.has(k))dispose(record);else{loaded.set(k,record);applyMapChunk(k,chunk);scene.add(record.group);totalLoaded++;error=null;}}catch(e){if(e.name!=='AbortError'){error=e.message;failures.set(k,performance.now()+3000);}}finally{pending.delete(k);}})();
    }
  }
  function apply(next){const changed=config&&next.streaming.grassPerChunk!==config.streaming.grassPerChunk;config=next;if(changed){generation++;for(const request of pending.values())request.controller.abort();for(const [key,record] of loaded){dispose(record);applyMapChunk(key,null);}loaded.clear();centerKey='';}for(const record of loaded.values())for(const mesh of record.owned)if(mesh.material.uniforms?.color){mesh.material.uniforms.color.value.set(next.water.color);mesh.material.uniforms.foam.value.set(next.water.foamColor);mesh.material.uniforms.opacity.value=next.water.opacity;mesh.material.uniforms.flow.value=next.water.speed;mesh.material.uniforms.foamStrength.value=next.water.foamStrength;}}
  return {update,apply,get metrics(){return {loaded:[...loaded.keys()],desired:[...desired],pending:[...pending.keys()],totalLoaded,totalUnloaded,error,mapSize:map.size,propCount:manifest.propCount};}};
}
