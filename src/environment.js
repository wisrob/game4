import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROPS, LAKE, random, onPath } from '../shared/world.js';
import { configureCutoutTexture } from './foliage.js';
export async function createEnvironment(scene, renderer) {
  const loader=new GLTFLoader();
  const names=['pine','fern','wanderer','mossling','wardstone','boulder','log','lantern','dock'];
  const models=Object.fromEntries(await Promise.all(names.map(async name=>[name,(await loader.loadAsync(`/models/${name}.glb`)).scene])));
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
  const sun=new T.DirectionalLight('#ffe0ad',2.6);sun.position.set(-12,24,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-27;sun.shadow.camera.right=27;sun.shadow.camera.top=27;sun.shadow.camera.bottom=-27;sun.shadow.normalBias=.035;scene.add(sun,sun.target);
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
      float edge=(noise(p*1.3)-.5)*.9+(noise(p*6.)-.5)*.22;
      float road=1.-smoothstep(1.1,2.1,min(a,b)+edge);
      float variation=(noise(p*.65)-.5)*.06+(noise(p*18.)-.5)*.018;
      vec2 cell=floor(p*5.),local=fract(p*5.);float seed=hash(cell);
      vec2 center=vec2(.25+hash(cell+19.)*.5,.25+hash(cell+41.)*.5);
      vec2 delta=(local-center)*vec2(1.,1.3);float radius=.11+hash(cell+7.)*.10;
      float pebble=(1.-smoothstep(radius-.035,radius+.025,length(delta)))*step(.95,seed)*road;
      float rim=(1.-smoothstep(radius,radius+.055,length(delta)))*step(.95,seed)*road;
      float worn=1.-smoothstep(.25,.9,min(a,b));
      diffuseColor.rgb=mix(ground,path,road)+variation;
      diffuseColor.rgb*=.82+noise(p*3.)*.24-worn*.025;
      float moss=smoothstep(.48,.7,noise(p*3.5))* (1.-road);
      diffuseColor.rgb=mix(diffuseColor.rgb,ground*1.18,moss*.35);
      diffuseColor.rgb-=rim*.024;
      diffuseColor.rgb=mix(diffuseColor.rgb,path*(.75+seed*.5)+vec3(.025),pebble);
      diffuseColor.rgb+=pebble*clamp(-delta.x-delta.y,-.15,.15)*.28;
    `);
  };
  const groundGeometry=new T.PlaneGeometry(88,88);groundGeometry.rotateX(-Math.PI/2);const ground=new T.Mesh(groundGeometry,terrain);ground.receiveShadow=true;scene.add(ground);
  const bank=new T.Mesh(new T.CylinderGeometry(LAKE.radius+.5,LAKE.radius+.9,.22,64),new T.MeshStandardMaterial({color:'#655e43',roughness:1}));bank.position.set(LAKE.x,-.01,LAKE.z);scene.add(bank);
  const waterUniforms={time:{value:0},color:{value:new T.Color()},highlight:{value:new T.Color()},speed:{value:.7},waveHeight:{value:.09},scale:{value:2.4}};
  const waterMaterial=new T.ShaderMaterial({uniforms:waterUniforms,vertexShader:`uniform float time,speed,waveHeight;varying vec2 p;void main(){p=position.xz;vec3 v=position;v.y+=sin(p.x*1.4+time*speed)*cos(p.y*1.8+time*speed*.8)*waveHeight;gl_Position=projectionMatrix*modelViewMatrix*vec4(v,1.);}`,fragmentShader:`
    uniform float time,speed,scale;uniform vec3 color,highlight;varying vec2 p;
    float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    void main(){float t=time*speed;vec2 q=p*scale;
      float swell=sin(p.x*1.1+p.y*.8+t*.6)*.5+sin(p.y*1.5-p.x*.7-t*.4)*.3;
      vec2 warp=vec2(noise(q*.7+vec2(t*.1,0.)),noise(q*.65-vec2(0.,t*.13)));
      float ripple=abs(sin(q.x*1.2+q.y*1.7+warp.x*5.+t));
      float glint=smoothstep(.965,.995,ripple)*smoothstep(.38,.75,noise(q*.7+t*.06));
      float r=length(p);float shore=smoothstep(6.7,7.5,r);
      float foam=shore*smoothstep(.58,.82,noise(p*9.+warp+t*.15))*.65;
      foam+=smoothstep(7.25,7.48,r)*(.35+.35*sin(atan(p.y,p.x)*17.+t));
      vec3 c=mix(color,highlight,.08+swell*.035+glint*.23+foam*.6);
      c=mix(c,vec3(.24,.32,.28),shore*.24);gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const waterGeo=new T.CircleGeometry(LAKE.radius,80);waterGeo.rotateX(-Math.PI/2);const water=new T.Mesh(waterGeo,waterMaterial);water.position.set(LAKE.x,.15,LAKE.z);scene.add(water);
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
  const grass=new T.InstancedMesh(blade,grassMaterial,18000);grass.receiveShadow=true;const rng=random(914);const dummy=new T.Object3D();let n=0;
  const reeds=new T.InstancedMesh(blade,grassMaterial,450);for(let i=0;i<450;i++){const a=rng()*Math.PI*2,r=LAKE.radius+.2+rng()*.8;dummy.position.set(LAKE.x+Math.cos(a)*r,.1,LAKE.z+Math.sin(a)*r);dummy.rotation.set(0,rng()*6,0);dummy.scale.set(.7,2+rng()*2,.7);dummy.updateMatrix();reeds.setMatrixAt(i,dummy.matrix);}scene.add(reeds);
  while(n<18000){const x=(rng()-.5)*56,z=(rng()-.5)*56;if(onPath(x,z)||Math.hypot(x,z-4)<1.3||Math.hypot(x-LAKE.x,z-LAKE.z)<LAKE.radius+.7)continue;const patch=.5+.5*Math.sin(x*.9+Math.sin(z))*Math.cos(z*.8);if(rng()> .25+patch*.7)continue;dummy.position.set(x,.01,z);dummy.rotation.set(0,rng()*Math.PI*2,0);const s=.5+rng()*.9;dummy.scale.set(s,s*(.55+patch*.6),s);dummy.updateMatrix();grass.setMatrixAt(n++,dummy.matrix);}grass.instanceMatrix.needsUpdate=true;grass.frustumCulled=false;scene.add(grass);
  // Flatten Blender transforms into geometry once, then batch every pine part.
  for(const name of ['pine','boulder','log','lantern','dock','fern','wardstone'])batch(name,PROPS.filter(p=>p.model===name));
  function batch(name,placements){
    const cells=new Map();
    for(const p of placements){const key=['pine','boulder','fern'].includes(name)?`${Math.floor(p.x/16)},${Math.floor(p.z/16)}`:'all';if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);}
    models[name].updateMatrixWorld(true);
    models[name].traverse(part=>{
      if(!part.isMesh)return;
      const geo=part.geometry.clone().applyMatrix4(part.matrixWorld);
      for(const group of cells.values()){
        const mesh=new T.InstancedMesh(geo,part.material,group.length);
        group.forEach((p,i)=>{dummy.position.set(p.x,p.y??0,p.z);dummy.rotation.set(0,p.rotation??0,0);dummy.scale.setScalar(p.scale??1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(p.tint)mesh.setColorAt(i,new T.Color(p.tint));});
        mesh.computeBoundingSphere();mesh.castShadow=name!=='fern';
        // Painted foliage facets supply canopy shading without noisy overlapping card shadows.
        mesh.receiveShadow=!(name==='pine'&&part.material.map);
        if(part.material.alphaTest>0)mesh.customDepthMaterial=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,map:part.material.map,alphaTest:part.material.alphaTest,side:T.FrontSide});
        scene.add(mesh);
      }
    });
  }
  // Broad leaf clusters keep the understory legible at gameplay distance.
  const fernPlacements=PROPS.filter(p=>p.model==='fern');
  const flowers=new T.InstancedMesh(new T.OctahedronGeometry(1,0),new T.MeshStandardMaterial({color:'#e0daba',emissive:'#787249',emissiveIntensity:.12,roughness:1}),700);
  const gravel=new T.InstancedMesh(new T.TetrahedronGeometry(1),new T.MeshStandardMaterial({color:'#9b896a',roughness:1}),1400);
  let flowerCount=0,gravelCount=0;
  for(const fern of fernPlacements){if(Math.hypot(fern.x,fern.z-4)>17||rng()<.45)continue;for(let j=0;j<9&&flowerCount<700;j++){dummy.position.set(fern.x+(rng()-.5)*.8,.22+rng()*.28,fern.z+(rng()-.5)*.8);const size=.035+rng()*.025;dummy.scale.set(size,size*.6,size);dummy.updateMatrix();flowers.setMatrixAt(flowerCount++,dummy.matrix);}}
  for(let i=0;i<15000&&gravelCount<1400;i++){const x=(rng()-.5)*56,z=(rng()-.5)*56;if(!onPath(x,z)||Math.hypot(x-LAKE.x,z-LAKE.z)<LAKE.radius+.4)continue;dummy.position.set(x,.025,z);dummy.rotation.set(rng()*.3,rng()*6,rng()*.3);dummy.scale.set(.035+rng()*.07,.018+rng()*.035,.04+rng()*.08);dummy.updateMatrix();gravel.setMatrixAt(gravelCount++,dummy.matrix);}flowers.count=flowerCount;gravel.count=gravelCount;gravel.receiveShadow=true;scene.add(flowers,gravel);
  // Camp: a warm, animated beacon next to the spawn.
  const campfires=PROPS.filter(p=>p.model==='campfire').map(p=>{
    const group=new T.Group();group.position.set(p.x,p.y,p.z);group.rotation.y=p.rotation;group.scale.setScalar(p.scale);scene.add(group);
    const flame=new T.Mesh(new T.IcosahedronGeometry(.28,0),new T.MeshBasicMaterial({color:'#ffd083'}));flame.position.y=.7;
    const fire=new T.PointLight('#ffa54e',5,8*p.scale);fire.position.copy(flame.position);
    const ring=new T.Mesh(new T.TorusGeometry(.55,.10,4,10),new T.MeshStandardMaterial({color:'#a09a83'}));ring.rotation.x=Math.PI/2;ring.position.y=.15;group.add(flame,fire,ring);return {flame,fire};
  });
  function apply(config){
    const {lighting:l}=config;
    scene.background=new T.Color(l.fogColor);scene.fog=new T.Fog(l.fogColor,l.fogNear,l.fogFar);
    sun.color.set(l.sunColor);sun.intensity=l.sunIntensity;
    ambient.color.set(l.ambientColor);ambient.groundColor.set(l.ambientGroundColor);ambient.intensity=l.ambientIntensity;
    // Thin procedural blades use the same sun/environment balance as the scenery.
    grassUniforms.environmentFill.value.copy(ambient.color).lerp(new T.Color('white'),.6).multiplyScalar(l.ambientIntensity*.35);
    grassUniforms.sunFill.value.copy(sun.color).lerp(new T.Color('white'),.7).multiplyScalar(l.sunIntensity*.19);
    renderer.toneMappingExposure=l.exposure;renderer.setPixelRatio(Math.min(devicePixelRatio,config.performance.pixelRatio));
    renderer.shadowMap.enabled=config.performance.shadows;sun.castShadow=config.performance.shadows;
    terrain.uniforms.ground.value.set(config.terrain.color);terrain.uniforms.path.value.set(config.terrain.pathColor);
    for(const [key,v] of Object.entries(config.water)){if(waterUniforms[key]?.value?.isColor)waterUniforms[key].value.set(v);else if(waterUniforms[key])waterUniforms[key].value=v;}
    for(const [key,v] of Object.entries(config.grass)){if(grassUniforms[key]?.value?.isColor)grassUniforms[key].value.set(v);else if(grassUniforms[key])grassUniforms[key].value=v;}
    grass.count=Math.round(config.grass.density);
  }
  function update(time,center){waterUniforms.time.value=time;grassUniforms.time.value=time;for(const {flame,fire} of campfires){flame.scale.setScalar(1+Math.sin(time*9)*.12);fire.intensity=4+Math.sin(time*9);}sun.position.set(center.x-12,24,center.z+8);sun.target.position.set(center.x,0,center.z);}
  return {models,apply,update};
}
