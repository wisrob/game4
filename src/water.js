import * as T from 'three';
import { LAKE } from '../shared/world.js';

// Capture lake/contact scenery without redrawing the forest. Refraction and
// contact foam share this pass; opaque objects retain their normal depth test.
export function createWater(scene, renderer, underwaterScene) {
  const uniforms={time:{value:0},color:{value:new T.Color()},highlight:{value:new T.Color()},
    opacity:{value:.92},transmission:{value:.92},ior:{value:1.333},refraction:{value:1},
    absorption:{value:1.2},absorptionColor:{value:new T.Color()},scattering:{value:.18},
    roughness:{value:.2},reflection:{value:1},shimmer:{value:.65},
    foamColor:{value:new T.Color()},foamStrength:{value:.75},foamDistance:{value:.5},
    speed:{value:.7},waveHeight:{value:.08},scale:{value:1.15},radius:{value:LAKE.radius},
    sunDirection:{value:new T.Vector3()},sunColor:{value:new T.Color()},sunIntensity:{value:1},
    viewport:{value:new T.Vector2()},captureSize:{value:new T.Vector2(1,1)},bedTexture:{value:null},bedDepth:{value:null},cameraNear:{value:.1},cameraFar:{value:150}};
  const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:true});
  target.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  uniforms.bedTexture.value=target.texture;
  uniforms.bedDepth.value=target.depthTexture;
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms,vertexShader:`
    uniform float time,speed,waveHeight,scale,radius;
    varying vec2 p;varying vec3 surfaceWorld;
    void main(){p=position.xz;vec3 v=position;float t=time*speed;
      float a=dot(p,vec2(.65,.38))*scale+t*.55;
      float b=dot(p,vec2(-.32,.80))*scale-t*.38;
      float c=dot(p,vec2(1.2,-.55))*scale+t*.72;
      v.y+=max((sin(a)+sin(b)*.55+sin(c)*.20)*waveHeight*(1.-smoothstep(radius-.7,radius,length(p))),-.11);
      surfaceWorld=(modelMatrix*vec4(v,1.)).xyz;
      gl_Position=projectionMatrix*viewMatrix*vec4(surfaceWorld,1.);
    }`,fragmentShader:`
    uniform float time,speed,scale,waveHeight,radius,opacity,transmission,ior,refraction;
    uniform float absorption,scattering,roughness,reflection,shimmer,sunIntensity;
    uniform float foamStrength,foamDistance,cameraNear,cameraFar;uniform vec3 foamColor;
    uniform vec3 color,highlight,absorptionColor,sunDirection,sunColor;
    uniform vec2 viewport,captureSize;uniform sampler2D bedTexture,bedDepth;
    uniform mat4 projectionMatrix;
    varying vec2 p;varying vec3 surfaceWorld;
    float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    vec2 noiseGradient(vec2 p){
      vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f),du=6.*f*(1.-f);
      float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
      return du*vec2(mix(b-a,d-c,u.y),mix(c-a,d-b,u.x));
    }
    float contactAt(vec2 sampleUV,float surfaceDepth,vec2 depthGradient,vec2 uv,float vertical){
      float sceneDepth=mix(cameraNear,cameraFar,texture2D(bedDepth,sampleUV).r);
      float surfaceAtSample=surfaceDepth+dot(sampleUV-uv,depthGradient);
      float gap=(sceneDepth-surfaceAtSample)*vertical;
      return (1.-smoothstep(0.,foamDistance,max(gap,0.)))*smoothstep(-.045,-.005,gap);
    }
    void main(){float t=time*speed,r=length(p);
      float a=dot(p,vec2(.65,.38))*scale+t*.55;
      float b=dot(p,vec2(-.32,.80))*scale-t*.38;
      float c=dot(p,vec2(1.2,-.55))*scale+t*.72;
      float edge=1.-smoothstep(radius-.7,radius,r);
      vec2 slope=(cos(a)*vec2(.65,.38)+cos(b)*vec2(-.32,.80)*.55+cos(c)*vec2(1.2,-.55)*.20)*scale*waveHeight*edge;
      // Small capillary waves break the broad reflection into moving glints.
      vec2 flow=vec2(t*.37,-t*.26);
      vec2 micro=noiseGradient(p*3.6+flow)*.08+noiseGradient(p*7.1-flow*1.3)*.035;
      slope+=micro*shimmer*edge;
      vec3 n=normalize(vec3(-slope.x*2.,1.,-slope.y*2.));
      vec3 view=normalize(vec3(viewMatrix[0][2],viewMatrix[1][2],viewMatrix[2][2]));
      float nv=max(dot(n,view),.001),nl=max(dot(n,sunDirection),.001);
      float f0=pow((ior-1.)/(ior+1.),2.);
      float interfaceStrength=step(1.0001,ior);
      float fresnel=interfaceStrength*(f0+(1.-f0)*pow(1.-nv,5.));
      float reflectance=clamp(fresnel*reflection,0.,1.);
      float depth=.125+1.795*(1.-pow(clamp(r/radius,0.,1.),2.));
      vec3 refracted=refract(-view,n,1./ior);
      float thickness=depth/max(-refracted.y,.15);
      vec3 hit=surfaceWorld+refracted*thickness;
      vec4 projected=projectionMatrix*viewMatrix*vec4(hit,1.);
      vec2 uv=gl_FragCoord.xy/viewport;
      vec2 bent=mix(uv,projected.xy/projected.w*.5+.5,refraction);
      vec4 bed=texture2D(bedTexture,clamp(bent,vec2(.001),vec2(.999)));
      vec4 straight=texture2D(bedTexture,uv);
      // Keep bank-edge samples inside the captured submerged geometry.
      vec3 bedLight=mix(straight.rgb,bed.rgb,smoothstep(.5,.99,bed.a));
      vec3 extinction=max(absorptionColor*absorption+vec3(scattering),vec3(0.));
      vec3 attenuation=exp(-extinction*thickness);
      vec3 scattered=color*(1.-exp(-scattering*thickness))*(.7+nl*sunIntensity*.25);
      vec3 transmitted=bedLight*attenuation+scattered;
      vec3 body=mix(color,transmitted,transmission);
      vec3 reflected=reflect(-view,n);
      vec3 sky=mix(highlight*.32,highlight,smoothstep(-.1,.9,reflected.y));
      // GGX sun lobe: roughness controls spread; IOR controls Fresnel strength.
      vec3 halfVector=normalize(view+sunDirection);float nh=max(dot(n,halfVector),0.);
      float alpha=max(.0025,roughness*roughness),a2=alpha*alpha;
      float denom=nh*nh*(a2-1.)+1.;float distribution=a2/(3.14159265*denom*denom);
      float k=pow(roughness+1.,2.)/8.;
      float geometry=nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k);
      float sunF=interfaceStrength*(f0+(1.-f0)*pow(1.-max(dot(view,halfVector),0.),5.));
      float specular=distribution*geometry*sunF/max(4.*nv*nl,.001);
      // Derivative-aware cap limits subpixel fireflies at overview zoom.
      specular=min(specular,2./(1.+fwidth(nh)*180.));
      vec3 light=mix(body,sky,reflectance)+sunColor*sunIntensity*specular*nl*reflection;
      // Orthographic depth is linear. Compare unrefracted scene and surface
      // depths, then convert the ray gap to a vertical gap in world units.
      float surfaceDepth=-(viewMatrix*vec4(surfaceWorld,1.)).z;
      // Filter contact coverage, not raw depth: blending foreground rock depth
      // with distant bed depth would invent a false shallow band. Compensate
      // each tap for the surface slope so flat banks do not show texel seams.
      vec2 texel=uv*captureSize-.5,weight=fract(texel);
      vec2 base=(floor(texel)+.5)/captureSize,stepUV=1./captureSize;
      vec2 depthGradient=vec2(dFdx(surfaceDepth),dFdy(surfaceDepth))*viewport;
      float vertical=max(view.y,.01);
      float contact=mix(
        mix(contactAt(base,surfaceDepth,depthGradient,uv,vertical),contactAt(base+vec2(stepUV.x,0.),surfaceDepth,depthGradient,uv,vertical),weight.x),
        mix(contactAt(base+vec2(0.,stepUV.y),surfaceDepth,depthGradient,uv,vertical),contactAt(base+stepUV,surfaceDepth,depthGradient,uv,vertical),weight.x),weight.y);
      float breakup=noise(p*6.+vec2(t*.13,-t*.1));
      float bubbles=smoothstep(.38,.72,breakup);
      float foam=contact*foamStrength*(.35+.65*bubbles);
      light=mix(light,foamColor,foam);
      gl_FragColor=vec4(max(light,vec3(0.)),opacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const geometry=new T.RingGeometry(0,LAKE.radius,80,12);geometry.rotateX(-Math.PI/2);
  const mesh=new T.Mesh(geometry,material);mesh.position.set(LAKE.x,.15,LAKE.z);scene.add(mesh);
  const captureSun=new T.DirectionalLight(),captureAmbient=new T.HemisphereLight();
  underwaterScene.add(captureSun,captureSun.target,captureAmbient);
  const frustum=new T.Frustum(),matrix=new T.Matrix4(),bounds=new T.Sphere(new T.Vector3(LAKE.x,0,LAKE.z),LAKE.radius+2);
  function capture(camera){
    renderer.getDrawingBufferSize(uniforms.viewport.value);camera.updateMatrixWorld();
    uniforms.cameraNear.value=camera.near;uniforms.cameraFar.value=camera.far;
    frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    if(!frustum.intersectsSphere(bounds)||uniforms.opacity.value===0||(uniforms.transmission.value===0&&uniforms.foamStrength.value===0))return;
    const size=uniforms.viewport.value,width=Math.min(2048,size.x),height=Math.max(1,Math.round(width*size.y/size.x));
    if(target.width!==width||target.height!==height)target.setSize(width,height);
    uniforms.captureSize.value.set(width,height);
    const previous=renderer.getRenderTarget(),toneMapping=renderer.toneMapping,clearColor=renderer.getClearColor(new T.Color()),clearAlpha=renderer.getClearAlpha();
    renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.toneMapping=T.NoToneMapping;
    renderer.render(underwaterScene,camera);
    renderer.setRenderTarget(previous);renderer.setClearColor(clearColor,clearAlpha);renderer.toneMapping=toneMapping;
  }
  function apply(config,sun,ambient){
    for(const [key,value] of Object.entries(config.water))if(uniforms[key]){
      if(uniforms[key].value?.isColor)uniforms[key].value.set(value);else uniforms[key].value=value;
    }
    uniforms.sunDirection.value.copy(sun.position).sub(sun.target.position).normalize();
    uniforms.sunColor.value.copy(sun.color);uniforms.sunIntensity.value=sun.intensity;
    captureSun.color.copy(sun.color);captureSun.intensity=sun.intensity;
    captureSun.position.copy(uniforms.sunDirection.value);captureSun.target.position.set(0,0,0);
    captureAmbient.color.copy(ambient.color);captureAmbient.groundColor.copy(ambient.groundColor);captureAmbient.intensity=ambient.intensity;
  }
  return {uniforms,capture,apply};
}
