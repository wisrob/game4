import * as T from 'three';

// A readable, tapered stroke. Overlay rendering keeps foreground foliage from hiding attacks.
export function createSlash(event) {
  const skill=event.key==='nova',arc=event.arcDegrees*Math.PI/180;
  // One server-authoritative range drives both hit reach and visual radius.
  const center=event.angle-Math.PI/2,range=event.range;
  const material=new T.ShaderMaterial({
    transparent:true,side:T.DoubleSide,depthWrite:false,depthTest:false,
    blending:T.NormalBlending,
    uniforms:{color:{value:new T.Color(skill?'#ff790d':'#ffffff')},opacity:{value:skill?1:.78},brightness:{value:skill?1.35:1},sweep:{value:0},center:{value:center},halfArc:{value:arc/2},range:{value:range}},
    vertexShader:`varying vec2 point; void main(){point=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      varying vec2 point;
      uniform vec3 color;
      uniform float opacity, brightness, sweep, center, halfArc, range;
      void main(){
        float angle=atan(point.y,point.x)-center;
        float signedOffset=atan(sin(angle),cos(angle));
        float offset=abs(signedOffset);
        float front=mix(-halfArc,halfArc,sweep);
        float behind=(front-signedOffset)/halfArc;
        float movingStroke=smoothstep(-.04,.04,behind)*(1.0-smoothstep(.6,1.1,behind));
        float taper=1.0-smoothstep(halfArc*.72,halfArc,offset);
        float radial=(length(point)/range-.72)/.28;
        float width=mix(.02,.30,taper);
        float stroke=1.0-smoothstep(width*.55,width,abs(radial-.62));
        float glow=(1.0-smoothstep(width,width+.24,abs(radial-.62)))*.22;
        gl_FragColor=vec4(color*brightness,opacity*max(stroke,glow)*taper*movingStroke);
        #include <colorspace_fragment>
      }`
  });
  const mesh=new T.Mesh(new T.RingGeometry(range*.72,range,64,4,center-arc/2,arc),material);
  mesh.rotation.x=-Math.PI/2;mesh.position.set(event.x,1.05,event.z);mesh.renderOrder=20;
  const variant=event.slashVariant??0,tilt=[0,-Math.PI/9,Math.PI/9][variant%3];
  mesh.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(Math.sin(event.angle),0,Math.cos(event.angle)),tilt));
  return {mesh,age:0,duration:skill?.65:.5,opacity:skill?1:.78,key:event.key,sourceId:event.id,mob:event.type==='mob-attack',angle:event.angle,arcDegrees:event.arcDegrees,range,radius:range,variant,tilt};
}

export function followSlash(slash,position){slash.mesh.position.set(position.x,1.05,position.z);}
