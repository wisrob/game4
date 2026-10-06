import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROPS, LAKE, random, onPath } from '../shared/world.js';
import { configureCutoutTexture } from './foliage.js';
import { createWater } from './water.js';
import { mergeMossling } from './mossling.js';
import { createWorldStream } from './world-stream.js';
export async function createEnvironment(scene, renderer) {
  const loader=new GLTFLoader();
  const names=['pine','fern','wanderer','mossling','wardstone','boulder','log','lantern','dock','wildflowers','lilypad'];
  const models=Object.fromEntries(await Promise.all(names.map(async name=>[name,(await loader.loadAsync(`/models/${name}.glb`)).scene])));
  models.mossling=mergeMossling(models.mossling);
  for(const name of ['pine','fern'])models[name].traverse(part=>{if(part.isMesh){part.material.side=T.DoubleSide;part.material.shadowSide=T.FrontSide;}});
  // Surface detail stays in the existing material passes; no texture fetches or postprocessing.
  for(const name of ['boulder','wardstone','log','dock','lantern'])models[name].traverse(part=>{
    if(!part.isMesh)return;const mat=part.material;
    const stone=['Slate','Wardstone'].includes(mat.name),wood=['Old timber','Cut wood'].includes(mat.name);
    if(!stone&&!wood)return;
    mat.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 weatherPoint;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nweatherPoint=position;');
      shader.fragmentShader=`varying vec3 weatherPoint;
        float surfaceHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float surfaceNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(surfaceHash(i),surfaceHash(i+vec2(1,0)),f.x),mix(surfaceHash(i+vec2(0,1)),surfaceHash(i+vec2(1,1)),f.x),f.y);}
        `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        vec3 wp=weatherPoint;
        ${stone?`float grain=surfaceNoise(wp.xz*65.+wp.y*31.);
          float mineral=surfaceNoise(wp.xz*4.+wp.y*2.);
          diffuseColor.rgb*=.82+mineral*.30+(grain-.5)*.12;
          float seam=smoothstep(.965,.998,abs(sin(wp.x*7.+wp.y*5.+surfaceNoise(wp.xz*2.)*5.)));
          diffuseColor.rgb*=1.-seam*.15;
          float moss=(1.-smoothstep(.12,.65,wp.y))*smoothstep(.35,.7,surfaceNoise(wp.xz*7.));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.075,.095,.032),moss*.6);`
        :`float fibre=surfaceNoise(vec2(wp.x*5.+wp.z*2.,wp.y*80.));
          diffuseColor.rgb*=.8+fibre*.35;
          diffuseColor.rgb*=1.-smoothstep(.96,.995,abs(sin(wp.y*63.+surfaceNoise(wp.xz*3.)*3.)))*.14;`}
      `);
    };
    mat.customProgramCacheKey=()=>stone?'weathered-stone-v1':'timber-grain-v1';
  });
  for(const name of ['pine','fern'])models[name].traverse(part=>{if(!part.isMesh||!part.material.map)return;const m=part.material;m.transparent=false;m.depthWrite=true;m.opacity=1;m.alphaTest=.4;m.alphaToCoverage=true;m.side=T.DoubleSide;m.shadowSide=T.FrontSide;configureCutoutTexture(m.map,renderer,m.alphaTest);m.needsUpdate=true;});
  // Painted canopy bounce keeps shaded boughs readable without flattening sunlit planes.
  models.pine.traverse(part=>{if(part.isMesh&&part.material.map){part.material.roughness=1;part.material.color.setRGB(.75,.85,.95);part.material.emissiveMap=part.material.map;part.material.emissive.setRGB(.25,.33,.40);}});
  const sunOffset=new T.Vector3();
  const sun=new T.DirectionalLight('#ffe0ad',2.6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-27;sun.shadow.camera.right=27;sun.shadow.camera.top=27;sun.shadow.camera.bottom=-27;sun.shadow.normalBias=.035;scene.add(sun,sun.target);
  const ambient=new T.HemisphereLight('#c3cfda','#69715c',2.6);scene.add(ambient);
  const terrain=new T.MeshStandardMaterial({roughness:1});
  terrain.uniforms={ground:{value:new T.Color()},path:{value:new T.Color()}};
  terrain.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,terrain.uniforms);
    shader.vertexShader='varying vec2 terrainPoint;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nterrainPoint=position.xz;');
    shader.fragmentShader=`uniform vec3 ground,path;varying vec2 terrainPoint;
      float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 p=terrainPoint;float a=abs(p.x-sin(p.y*.12)*2.);float b=abs(p.y+2.-sin(p.x*.15)*2.);
      if(distance(p,vec2(${LAKE.x.toFixed(1)},${LAKE.z.toFixed(1)}))<${(LAKE.radius-.04).toFixed(2)})discard;
      float edge=(noise(p*1.3)-.5)*.9+(noise(p*6.)-.5)*.22;
      float road=1.-smoothstep(1.1,2.1,min(a,b)+edge);
      float variation=(noise(p*.65)-.5)*.035;
      vec2 cell=floor(p*5.),local=fract(p*5.);float seed=hash(cell);
      vec2 center=vec2(.25+hash(cell+19.)*.5,.25+hash(cell+41.)*.5);
      vec2 delta=(local-center)*vec2(1.,1.3);float radius=.11+hash(cell+7.)*.10;
      float pebble=(1.-smoothstep(radius-.035,radius+.025,length(delta)))*step(.95,seed)*road;
      float rim=(1.-smoothstep(radius,radius+.055,length(delta)))*step(.95,seed)*road;
      float worn=1.-smoothstep(.25,.9,min(a,b));
      diffuseColor.rgb=mix(ground,path,road)+variation;
      diffuseColor.rgb*=.90+noise(p*.8)*.12-worn*.025;
      diffuseColor.rgb+=(noise(p*42.)-.5)*.025;
      float moss=smoothstep(.48,.7,noise(p*3.5))* (1.-road);
      diffuseColor.rgb=mix(diffuseColor.rgb,ground*1.12,moss*.20);
      diffuseColor.rgb-=rim*.024;
      diffuseColor.rgb=mix(diffuseColor.rgb,path*(.75+seed*.5)+vec3(.025),pebble);
      diffuseColor.rgb+=pebble*clamp(-delta.x-delta.y,-.15,.15)*.28;
    `);
  };
  const groundGeometry=new T.PlaneGeometry(88,88);groundGeometry.rotateX(-Math.PI/2);const ground=new T.Mesh(groundGeometry,terrain);ground.receiveShadow=true;scene.add(ground);
  // An annulus leaves room below the waves; a solid bank disc clips wave troughs.
  const bankGeometry=new T.RingGeometry(LAKE.radius-.1,LAKE.radius+.9,80);bankGeometry.rotateX(-Math.PI/2);
  const bank=new T.Mesh(bankGeometry,new T.MeshStandardMaterial({color:'#625849',roughness:1}));bank.position.set(LAKE.x,.025,LAKE.z);scene.add(bank);
  // A real recessed bed lets alpha blending reveal stones below the surface.
  const bedGeo=new T.RingGeometry(0,LAKE.radius,80,12);bedGeo.rotateX(-Math.PI/2);
  const bedPositions=bedGeo.attributes.position;
  // Meet the bank at its height: separated horizontal rims leave an exposed
  // sliver at oblique camera angles, visible as a dark line through the foam.
  for(let i=0;i<bedPositions.count;i++){const r=Math.hypot(bedPositions.getX(i),bedPositions.getZ(i));bedPositions.setY(i,.025-1.795*(1-Math.pow(r/LAKE.radius,2)));}bedGeo.computeVertexNormals();
  const bedMaterial=new T.MeshStandardMaterial({color:'#83967a',roughness:1});
  const bedTime={value:0};
  bedMaterial.onBeforeCompile=shader=>{
    shader.uniforms.bedTime=bedTime;shader.vertexShader='varying vec2 bedPoint;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nbedPoint=position.xz;');
    shader.fragmentShader='uniform float bedTime;varying vec2 bedPoint;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float depth=1.-pow(clamp(length(bedPoint)/${LAKE.radius.toFixed(1)},0.,1.),2.);
      vec2 bp=bedPoint;float grain=fract(sin(dot(floor(bp*32.),vec2(127.1,311.7)))*43758.5453);
      diffuseColor.rgb=mix(vec3(.34,.32,.19),vec3(.055,.16,.14),depth*.85)*( .84+grain*.27);
      float ripple=sin(bp.x*4.+sin(bp.y*3.+bedTime*.45))+sin(bp.y*5.-bedTime*.38+sin(bp.x*2.));
      float caustic=pow(1.-abs(ripple)*.5,10.);
      diffuseColor.rgb+=vec3(.08,.12,.06)*caustic*(1.-depth*.7);
    `);
  };
  const bed=new T.Mesh(bedGeo,bedMaterial);bed.position.set(LAKE.x,0,LAKE.z);bed.receiveShadow=true;scene.add(bed);
  const underwaterScene=new T.Scene();underwaterScene.add(bed.clone(),bank.clone());
  const water=createWater(scene,renderer,underwaterScene),waterUniforms=water.uniforms;
  models.lilypad.traverse(part=>{
    if(!part.isMesh)return;
    part.material.onBeforeCompile=shader=>{
      for(const key of ['time','speed','waveHeight','scale','radius'])shader.uniforms[key]=waterUniforms[key];
      shader.vertexShader='uniform float time,speed,waveHeight,scale,radius;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec3 padWorld=(instanceMatrix*vec4(transformed,1.)).xyz;
        vec2 wp=padWorld.xz-vec2(${LAKE.x.toFixed(1)},${LAKE.z.toFixed(1)});float t=time*speed;
        float wave=(sin(dot(wp,vec2(.65,.38))*scale+t*.55)+sin(dot(wp,vec2(-.32,.80))*scale-t*.38)*.55+sin(dot(wp,vec2(1.2,-.55))*scale+t*.72)*.20)*waveHeight*(1.-smoothstep(radius-.7,radius,length(wp)));
        transformed.y+=(.175+max(wave,-.11)-padWorld.y)/length(instanceMatrix[1].xyz);
      `);
    };
  });
  const grassUniforms={time:{value:0},color:{value:new T.Color()},tipColor:{value:new T.Color()},environmentFill:{value:new T.Color()},sunFill:{value:new T.Color()},height:{value:.65},wind:{value:.35},speed:{value:1.2}};
  const grassMaterial=new T.ShaderMaterial({side:T.DoubleSide,lights:true,uniforms:Object.assign(T.UniformsUtils.merge([T.UniformsLib.lights]),grassUniforms),vertexShader:`
    uniform float time,height,wind,speed;varying float bladeTip,bladeShade;
    #include <common>
    #include <shadowmap_pars_vertex>
    void main(){bladeTip=uv.y;vec3 v=position;v.y*=height;
      vec4 world=instanceMatrix*vec4(v,1.);
      world.x+=sin(time*speed+world.x*.8+world.z*.6)*wind*bladeTip*bladeTip;
      bladeShade=.85+.15*sin(world.x*3.+world.z);
      vec4 worldPosition=modelMatrix*world;
      vec3 transformedNormal=normalMatrix*vec3(0.,1.,0.);
      #include <shadowmap_vertex>
      gl_Position=projectionMatrix*modelViewMatrix*world;
    }`,fragmentShader:`
    uniform vec3 color,tipColor,environmentFill,sunFill;varying float bladeTip,bladeShade;
    #include <common>
    #include <packing>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
    void main(){vec3 c=mix(color,tipColor,bladeTip*.75)*bladeShade;
      c*=environmentFill+sunFill*getShadowMask();gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const blade=new T.BufferGeometry();blade.setAttribute('position',new T.Float32BufferAttribute([-.06,0,0,.06,0,0,.08,1,0,0,0,-.05,0,0,.05,-.12,.8,0,-.14,0,.04,-.04,0,.04,-.18,.65,.04],3));blade.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,.5,1,0,0,1,0,.5,1,0,0,1,0,.5,1],2));blade.computeVertexNormals();
  const grassCells=new Map(),grassGroups=[];const rng=random(914);const dummy=new T.Object3D();let n=0;
  const reeds=new T.InstancedMesh(blade,grassMaterial,140);for(let i=0;i<140;i++){const a=Math.floor(rng()*5)*Math.PI*2/5+rng()*.35,r=LAKE.radius+.2+rng()*.6;dummy.position.set(LAKE.x+Math.cos(a)*r,.1,LAKE.z+Math.sin(a)*r);dummy.rotation.set(0,rng()*6,0);dummy.scale.set(.9,1.8+rng()*1.8,.9);dummy.updateMatrix();reeds.setMatrixAt(i,dummy.matrix);}scene.add(reeds);
  while(n<18000){const x=(rng()-.5)*56,z=(rng()-.5)*56;if(onPath(x,z)||Math.hypot(x,z-4)<1.3||Math.hypot(x-LAKE.x,z-LAKE.z)<LAKE.radius+.7)continue;const patch=.5+.5*Math.sin(x*.9+Math.sin(z))*Math.cos(z*.8);if(rng()> .25+patch*.7)continue;dummy.position.set(x,.01,z);dummy.rotation.set(0,rng()*Math.PI*2,0);const s=.5+rng()*.9;dummy.scale.set(s,s*(.55+patch*.6),s);dummy.updateMatrix();const key=`${Math.floor(x/10)},${Math.floor(z/10)}`;if(!grassCells.has(key))grassCells.set(key,[]);grassCells.get(key).push({index:n++,matrix:dummy.matrix.clone()});}
  for(const records of grassCells.values()){const mesh=new T.InstancedMesh(blade,grassMaterial,records.length);records.forEach((r,i)=>mesh.setMatrixAt(i,r.matrix));mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);grassGroups.push({mesh,indices:records.map(r=>r.index)});}grassCells.clear();
  // Flatten Blender transforms into geometry once, then batch every pine part.
  const propBindings=new Map(),propMeshes=[];
  let displayedProps=structuredClone(PROPS);
  function bind(id,record){if(!propBindings.has(id))propBindings.set(id,[]);propBindings.get(id).push(record);}
  for(const name of ['pine','boulder','log','lantern','dock','fern','wardstone'])batch(name,PROPS.filter(p=>p.model===name));
  function batch(name,placements){
    const cells=new Map();
    const cellSize=name==='pine'?8:16;
    for(const p of placements){const key=['pine','boulder','fern'].includes(name)?`${Math.floor(p.x/cellSize)},${Math.floor(p.z/cellSize)}`:'all';if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);}
    models[name].updateMatrixWorld(true);
    models[name].traverse(part=>{
      if(!part.isMesh)return;
      const geo=part.geometry.clone().applyMatrix4(part.matrixWorld);
      for(const group of cells.values()){
        const mesh=new T.InstancedMesh(geo,part.material,group.length);
        group.forEach((p,i)=>{dummy.position.set(p.x,p.y??0,p.z);dummy.rotation.set(0,p.rotation??0,0);dummy.scale.setScalar(p.scale??1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(p.tint)mesh.setColorAt(i,new T.Color(p.tint));});
        mesh.computeBoundingSphere();mesh.castShadow=name!=='fern';
        // Painted broad canopy planes avoid thin, high-contrast card intersection shadows.
        mesh.receiveShadow=!(name==='pine'&&part.material.map);
        if(part.material.alphaTest>0)mesh.customDepthMaterial=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,map:part.material.map,alphaTest:part.material.alphaTest,side:T.FrontSide});
        group.forEach((p,index)=>bind(p.id,{mesh,index}));mesh.userData.propIds=group.map(p=>p.id);propMeshes.push(mesh);scene.add(mesh);
        if(['boulder','dock'].includes(name)){
          const contactMesh=mesh.clone();contactMesh.castShadow=false;
          // Share transforms/bounds so depth contacts follow normal prop edits.
          contactMesh.instanceMatrix=mesh.instanceMatrix;contactMesh.instanceColor=mesh.instanceColor;
          contactMesh.boundingSphere=mesh.boundingSphere;underwaterScene.add(contactMesh);
        }
      }
    });
  }
  // Broad leaf clusters keep the understory legible at gameplay distance.
  const fernPlacements=PROPS.filter(p=>p.model==='fern');
  const gravel=new T.InstancedMesh(new T.TetrahedronGeometry(1),new T.MeshStandardMaterial({color:'#806e5e',roughness:1}),350);
  let gravelCount=0;
  for(let i=0;i<15000&&gravelCount<350;i++){const x=(rng()-.5)*56,z=(rng()-.5)*56;if(!onPath(x,z)||Math.hypot(x-LAKE.x,z-LAKE.z)<LAKE.radius+.4)continue;dummy.position.set(x,.025,z);dummy.rotation.set(rng()*.3,rng()*6,rng()*.3);dummy.scale.set(.035+rng()*.07,.018+rng()*.035,.04+rng()*.08);dummy.updateMatrix();gravel.setMatrixAt(gravelCount++,dummy.matrix);}gravel.count=gravelCount;gravel.receiveShadow=true;scene.add(gravel);
  function decorate(name,placements){
    models[name].updateMatrixWorld(true);models[name].traverse(part=>{
      if(!part.isMesh)return;part.material.side=T.DoubleSide;
      const mesh=new T.InstancedMesh(part.geometry.clone().applyMatrix4(part.matrixWorld),part.material,placements.length);
      placements.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.set(p.scale,p.height??p.scale,p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
      mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);
      if(name==='boulder')underwaterScene.add(mesh.clone());
    });
  }
  const flowerPatches=[];
  for(const fern of fernPlacements){
    if(flowerPatches.length>=340||rng()>.42)continue;
    for(let j=0;j<3;j++){const x=fern.x+(rng()-.5)*1.8,z=fern.z+(rng()-.5)*1.8;
      if(onPath(x,z)||Math.hypot(x-LAKE.x,z-LAKE.z)<LAKE.radius+.6)continue;
      flowerPatches.push({x,y:.015,z,rotation:rng()*6.28,scale:.65+rng()*.55});}
  }
  decorate('wildflowers',flowerPatches);
  const pads=[],underwater=[];
  for(let i=0;i<32;i++){
    const a=.25+rng()*2.4,r=LAKE.radius*(.55+rng()*.30);
    pads.push({x:LAKE.x+Math.cos(a)*r,y:.26,z:LAKE.z+Math.sin(a)*r,rotation:rng()*6.28,scale:.6+rng()*.65});
  }
  for(let i=0;i<65;i++){
    const a=rng()*6.28,r=LAKE.radius*(.45+rng()*.51),depth=.12+1.65*(1-Math.pow(r/LAKE.radius,2));
    underwater.push({x:LAKE.x+Math.cos(a)*r,y:-depth+.02,z:LAKE.z+Math.sin(a)*r,rotation:rng()*6.28,scale:.18+rng()*.38,height:.14+rng()*.18});
  }
  decorate('lilypad',pads);decorate('boulder',underwater);
  const streaming=await createWorldStream(scene,models,grassMaterial,blade);
  // Camp: a warm, animated beacon next to the spawn.
  const campfires=PROPS.filter(p=>p.model==='campfire').map(p=>{
    const group=new T.Group();group.position.set(p.x,p.y,p.z);group.rotation.y=p.rotation;group.scale.setScalar(p.scale);scene.add(group);bind(p.id,{group});
    const flame=new T.Mesh(new T.IcosahedronGeometry(.28,0),new T.MeshBasicMaterial({color:'#ffd083'}));flame.position.y=.7;
    const fire=new T.PointLight('#ffa54e',5,8*p.scale);fire.position.copy(flame.position);
    const ring=new T.Mesh(new T.TorusGeometry(.55,.10,4,10),new T.MeshStandardMaterial({color:'#a09a83'}));ring.rotation.x=Math.PI/2;ring.position.y=.15;group.add(flame,fire,ring);for(const mesh of [flame,ring]){mesh.userData.propId=p.id;propMeshes.push(mesh);}return {flame,fire};
  });
  const selection=new T.Box3Helper(new T.Box3(),'#ffe29a');selection.visible=false;scene.add(selection);
  let selectedId=null;
  function selectProp(id){selectedId=id;const p=displayedProps.find(p=>p.id===id);selection.visible=Boolean(p);if(p){const size=p.model==='pine'?new T.Vector3(2,6,2):new T.Vector3(1.5,1.5,1.5);size.multiplyScalar(p.scale);selection.box.set(new T.Vector3(p.x-size.x/2,p.y,p.z-size.z/2),new T.Vector3(p.x+size.x/2,p.y+size.y,p.z+size.z/2));}}
  function updateProps(props){
    const changed=new Set(),previous=new Map(displayedProps.map(p=>[p.id,p]));displayedProps=structuredClone(props);
    for(const p of props){const old=previous.get(p.id);if(old&&['x','y','z','rotation','scale','tint'].every(key=>p[key]===old[key]))continue;for(const binding of propBindings.get(p.id)??[]){
      if(binding.group){binding.group.position.set(p.x,p.y,p.z);binding.group.rotation.y=p.rotation;binding.group.scale.setScalar(p.scale);continue;}
      const {mesh,index}=binding;dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);if(p.tint)mesh.setColorAt(index,new T.Color(p.tint));changed.add(mesh);
    }}
    for(const mesh of changed){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();mesh.computeBoundingBox();}selectProp(selectedId);
  }
  function pickProp(raycaster){const hit=raycaster.intersectObjects(propMeshes,false)[0];return hit?(hit.object.userData.propId??hit.object.userData.propIds[hit.instanceId]):null;}
  function apply(config){
    streaming.apply(config);
    const {lighting:l}=config;
    scene.background=new T.Color(l.fogColor);scene.fog=new T.Fog(l.fogColor,l.fogNear,l.fogFar);
    sun.color.set(l.sunColor);sun.intensity=l.sunIntensity;
    sunOffset.set(l.sunX,l.sunHeight,l.sunZ);sun.position.copy(sun.target.position).add(sunOffset);
    ambient.color.set(l.ambientColor);ambient.groundColor.set(l.ambientGroundColor);ambient.intensity=l.ambientIntensity;
    // Thin procedural blades use the same sun/environment balance as the scenery.
    grassUniforms.environmentFill.value.copy(ambient.color).lerp(new T.Color('white'),.6).multiplyScalar(l.ambientIntensity*.35);
    grassUniforms.sunFill.value.copy(sun.color).lerp(new T.Color('white'),.7).multiplyScalar(l.sunIntensity*.19);
    renderer.toneMappingExposure=l.exposure;renderer.setPixelRatio(Math.min(devicePixelRatio,config.performance.pixelRatio));
    renderer.shadowMap.enabled=config.performance.shadows;sun.castShadow=config.performance.shadows;
    terrain.uniforms.ground.value.set(config.terrain.color);terrain.uniforms.path.value.set(config.terrain.pathColor);
    water.apply(config,sun,ambient);
    for(const [key,v] of Object.entries(config.grass)){if(grassUniforms[key]?.value?.isColor)grassUniforms[key].value.set(v);else if(grassUniforms[key])grassUniforms[key].value=v;}
    for(const {mesh,indices} of grassGroups){const end=indices.findIndex(i=>i>=Math.round(config.grass.density));mesh.count=end<0?indices.length:end;}
  }
  function update(time,center,waterTime=time){streaming.update(time,center);for(const {mesh} of grassGroups)mesh.visible=Math.abs(center.x)<85&&Math.abs(center.z)<85;bedTime.value=waterTime;waterUniforms.time.value=waterTime;grassUniforms.time.value=time;for(const {flame,fire} of campfires){flame.scale.setScalar(1+Math.sin(time*9)*.12);fire.intensity=4+Math.sin(time*9);}sun.target.position.set(center.x,0,center.z);sun.position.copy(sun.target.position).add(sunOffset);}
  return {models,apply,update,captureWater:water.capture,updateProps,pickProp,selectProp,get streaming(){return streaming.metrics;},get placements(){return structuredClone(displayedProps);},get lighting(){return {sunPosition:sun.position.toArray(),sunTarget:sun.target.position.toArray()};}};
}
