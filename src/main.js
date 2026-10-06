import './style.css';
import * as T from 'three';
import { createEnvironment } from './environment.js';
import { createEditor } from './editor.js';
import { createPropEditor } from './prop-editor.js';
import { createPerformanceRecorder } from './performance.js';
import { createSlash, followSlash } from './slash.js';
import { LAKE, PROPS, move, SPAWN, onPath } from '../shared/world.js';
import { MAP } from '../shared/world.js';
import { MATERIALS,surface,starter } from '../shared/map.js';

const $=s=>document.querySelector(s);
let toastTimer;function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
if(import.meta.hot)import.meta.hot.on('world-placements-error',data=>toast(`Invalid placements · keeping current scene: ${data.message}`));
if(import.meta.hot)import.meta.hot.on('large-world-map',()=>location.reload());
const scene=new T.Scene();const camera=new T.OrthographicCamera(-16,16,10,-10,.1,150);
camera.zoom=23/25;
const renderer=new T.WebGLRenderer({canvas:$('#game'),antialias:true,powerPreference:'high-performance'});renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.type=T.PCFSoftShadowMap;
// Count the submerged capture and the main view together in all metrics/logs.
renderer.info.autoReset=false;
let shadowCalls=0,shadowTriangles=0;
const renderShadowMap=renderer.shadowMap.render.bind(renderer.shadowMap);
renderer.shadowMap.render=(...args)=>{const before={...renderer.info.render};renderShadowMap(...args);shadowCalls+=renderer.info.render.calls-before.calls;shadowTriangles+=renderer.info.render.triangles-before.triangles;};
let renderMetrics={drawCalls:0,triangles:0,totalDrawCalls:0,totalTriangles:0,shadowDrawCalls:0,shadowTriangles:0};
const gl=renderer.getContext(),gpuInfo=gl.getExtension('WEBGL_debug_renderer_info');const gpu=gpuInfo?gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
const target=new T.Vector3(SPAWN.x,0,SPAWN.z),raycaster=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),0);
let editor,propEditor,environment,settings,recorder,localId=null,state={time:0,players:[],mobs:[]},connected=false,ws,reconnectTimer;
const keys=new Set(),entities=new Map(),effects=[],floaters=[],frameObservers=new Set();let clickTarget=null,lastInput=0,clock=0,frames=0,fps=60,lastFps=0;
const cursor=new T.Mesh(new T.RingGeometry(.33,.39,32),new T.MeshBasicMaterial({color:'#ecd494',side:T.DoubleSide,transparent:true,opacity:.8}));cursor.rotation.x=-Math.PI/2;cursor.visible=false;scene.add(cursor);
const selfRing=new T.Mesh(new T.RingGeometry(.53,.60,32),new T.MeshBasicMaterial({color:'#d5d89e',side:T.DoubleSide,transparent:true,opacity:.65}));selfRing.rotation.x=-Math.PI/2;scene.add(selfRing);
function resize(){const aspect=innerWidth/innerHeight;camera.left=-11*aspect;camera.right=11*aspect;camera.top=11;camera.bottom=-11;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
addEventListener('resize',resize);
function send(data){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
function logChat(name,text){const p=document.createElement('p');const b=document.createElement('span');b.style.color='#d1c38d';b.textContent=name+': ';p.append(b,document.createTextNode(text));$('#messages').append(p);while($('#messages').children.length>40)$('#messages').firstChild.remove();$('#messages').scrollTop=$('#messages').scrollHeight;}
function connect(){ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);ws.addEventListener('open',()=>{connected=true;$('#network').textContent='World connected';$('#network').classList.add('connected');});ws.addEventListener('close',()=>{connected=false;localId=null;keys.clear();clickTarget=null;$('#network').textContent='Reconnecting…';$('#network').classList.remove('connected');clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,1500);});ws.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='welcome'){localId=data.id;target.set(SPAWN.x,0,SPAWN.z);}if(data.type==='chat')logChat(data.name,data.text);if(data.type==='state'){state=data;syncEntities();for(const e of data.events)handleEvent(e);}});}
function makeEntity(data,mob){
  const group=new T.Group(),model=environment.models[mob?'mossling':'wanderer'].clone();
  model.scale.setScalar(mob?1:settings.characters.playerScale);
  const tintMaterials=new Map();
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const clone=material=>{if(!tintMaterials.has(material)){const copy=material.clone();copy.onBeforeCompile=material.onBeforeCompile;copy.customProgramCacheKey=material.customProgramCacheKey;tintMaterials.set(material,{material:copy,color:copy.color?.clone(),emissive:copy.emissive?.clone()});}return tintMaterials.get(material).material;};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);}});
  group.add(model);group.position.set(data.x,0,data.z);scene.add(group);
  let health=null;
  if(mob){health=new T.Mesh(new T.PlaneGeometry(.9,.085),new T.MeshBasicMaterial({color:'#c5452b',depthTest:false}));health.position.y=2.28;group.add(health);}
  const record={group,model,health,data,mob,tintMaterials:[...tintMaterials.values()],potionAge:Infinity,hitAge:Infinity};entities.set(data.id,record);return record;
}
function applySettings(config){
  settings=config;environment.apply(config);
  // Browser compositor grades only the world canvas, leaving the HUD crisp.
  // No extra Three.js scene render or render target; compositor cost is separate.
  const grade=config.postProcessing;
  renderer.domElement.style.filter=grade.enabled?`brightness(${grade.brightness}) contrast(${grade.contrast}) saturate(${grade.saturation})`:'none';
  camera.zoom=T.MathUtils.clamp(camera.zoom,config.camera.minZoom,config.camera.maxZoom);
  for(const e of entities.values())if(!e.mob)e.model.scale.setScalar(config.characters.playerScale);
  resize();
}
function syncEntities(){const ids=new Set();for(const [list,mob] of [[state.players,false],[state.mobs,true]])for(const data of list){ids.add(data.id);let e=entities.get(data.id);if(!e)e=makeEntity(data,mob);e.data=data;e.group.visible=data.hp>0;if(data.id===localId&&Math.hypot(e.group.position.x-data.x,e.group.position.z-data.z)>3)e.group.position.set(data.x,0,data.z);}for(const [id,e] of entities)if(!ids.has(id)){scene.remove(e.group);for(const tint of e.tintMaterials)tint.material.dispose();if(e.health){e.health.geometry.dispose();e.health.material.dispose();}entities.delete(id);}$('#online').textContent=`${state.players.length} adventurer${state.players.length===1?'':'s'}`;}
function effect(event){const slash=createSlash(event);scene.add(slash.mesh);effects.push(slash);}
const hitRed=new T.Color('#ff2424'),potionWhite=new T.Color('#ffffff');
function updateTint(e,dt){
  if(e.potionAge>=1.2&&e.hitAge>=.4)return;
  e.potionAge=Math.min(1.2,e.potionAge+dt);e.hitAge=Math.min(.4,e.hitAge+dt);
  const hit=1-e.hitAge/.4,heal=(1-e.potionAge/1.2)*(1-hit);
  for(const tint of e.tintMaterials){
    if(tint.material.userData.actorTint){tint.material.userData.actorTint.hit.value=hit;tint.material.userData.actorTint.heal.value=heal;}
    else if(tint.color)tint.material.color.copy(tint.color).lerp(potionWhite,heal*.85).lerp(hitRed,hit*.9);
    if(tint.emissive)tint.material.emissive.copy(tint.emissive).lerp(potionWhite,heal*.35).lerp(hitRed,hit*.45);
  }
}
function flash(id,key){const entity=entities.get(id);if(entity){entity[key]=0;updateTint(entity,0);}}
function floating(x,z,amount,hurt=false){const el=document.createElement('div');el.className=`damage${hurt?' hurt':''}`;el.textContent=String(amount);document.body.append(el);floaters.push({el,pos:new T.Vector3(x,1.6,z),age:0});}
function handleEvent(e){if(e.type==='ability'){if(e.key==='heal')flash(e.id,'potionAge');else effect(e);}if(e.type==='mob-attack')effect(e);if(e.type==='damage'){flash(e.id,'hitAge');floating(e.x,e.z,e.amount);}if(e.type==='hurt'){flash(e.id,'hitAge');if(e.id===localId)floating(e.x,e.z,e.amount,true);}if(e.type==='quest'&&e.id===localId)toast('Quest complete · +150 experience · +50 gold');if(e.type==='respawn'&&e.id===localId)toast('The wardstone returned you to camp');}
function ability(key){if(!connected)return;send({type:'ability',key});}
addEventListener('keydown',e=>{const typing=['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName);if(e.code==='F3'){e.preventDefault();$('#debug').hidden=!$('#debug').hidden;return;}if(typing){if(e.code==='Escape')document.activeElement.blur();return;}if(e.code==='Enter'){e.preventDefault();$('#chat-input').focus();return;}if(e.code==='Escape'){keys.clear();clickTarget=null;return;}if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','KeyQ','KeyE'].includes(e.code))e.preventDefault();keys.add(e.code);if(!e.repeat){if(e.code==='Space')ability('attack');if(e.code==='KeyQ')ability('nova');if(e.code==='KeyE')ability('heal');}});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();clickTarget=null;send({type:'input',x:0,z:0});});
$('#chat-input').addEventListener('focus',()=>{keys.clear();clickTarget=null;send({type:'input',x:0,z:0});});
$('#chat-form').addEventListener('submit',e=>{e.preventDefault();const input=$('#chat-input');if(input.value.trim()){send({type:'chat',text:input.value});input.value='';}input.blur();});
document.querySelectorAll('[data-ability]').forEach(button=>button.addEventListener('click',()=>ability(button.dataset.ability)));
$('#quality').addEventListener('change',e=>{renderer.setPixelRatio(Math.min(devicePixelRatio,Number(e.target.value)));resize();});
let propDrag=null;
$('#game').addEventListener('wheel',e=>{if(!settings||e.ctrlKey)return;e.preventDefault();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);camera.zoom=T.MathUtils.clamp(camera.zoom*Math.exp(T.MathUtils.clamp(-pixels*.0015,-20,20)),settings.camera.minZoom,settings.camera.maxZoom);camera.updateProjectionMatrix();},{passive:false});
function groundPoint(e){raycaster.setFromCamera(new T.Vector2(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1),camera);return raycaster.ray.intersectPlane(plane,new T.Vector3());}
$('#game').addEventListener('pointerdown',e=>{if(e.button!==0)return;document.activeElement?.blur();const point=groundPoint(e);if(propEditor?.active){keys.clear();clickTarget=null;cursor.visible=false;propEditor.select(environment.pickProp(raycaster));const p=propEditor.selected;if(p&&point){propDrag={pointerId:e.pointerId,x:p.x-point.x,z:p.z-point.z};$('#game').setPointerCapture(e.pointerId);}return;}if(point){clickTarget={x:point.x,z:point.z};cursor.position.set(point.x,.04,point.z);cursor.visible=true;}});
$('#game').addEventListener('pointermove',e=>{if(!propDrag||e.pointerId!==propDrag.pointerId)return;if(!propEditor.active){propDrag=null;return;}const point=groundPoint(e);if(point)propEditor.move(point.x+propDrag.x,point.z+propDrag.z);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('#game').addEventListener(event,()=>{propDrag=null;});
function inputDirection(){if(propEditor?.active){keys.clear();clickTarget=null;cursor.visible=false;return {x:0,z:0};}let right=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),forward=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);let x=(right+forward)*Math.SQRT1_2,z=(forward-right)*Math.SQRT1_2,speed=1;const self=entities.get(localId);if(x||z){clickTarget=null;cursor.visible=false;}else if(clickTarget&&self){x=clickTarget.x-self.data.x;z=clickTarget.z-self.data.z;const remaining=Math.hypot(x,z);speed=Math.min(1,remaining/2);if(remaining<.3){clickTarget=null;cursor.visible=false;x=z=0;}}const len=Math.hypot(x,z);if(len>0){x=x/len*speed;z=z/len*speed;}return {x,z};}
const map=$('#minimap'),ctx=map.getContext('2d');
let mapAt=0;
function minimap(){if(performance.now()-mapAt<350)return;mapAt=performance.now();const self=state.players.find(p=>p.id===localId)??SPAWN,range=70,scale=map.width/(range*2),left=self.x-range,top=self.z-range;
  for(let y=0;y<map.height;y+=3)for(let x=0;x<map.width;x+=3){const wx=left+x/scale,wz=top+y/scale;ctx.fillStyle=starter(wx,wz)?Math.hypot(wx-LAKE.x,wz-LAKE.z)<LAKE.radius?MATERIALS.water:onPath(wx,wz)?MATERIALS.path:MATERIALS.grass:MATERIALS[surface(MAP.map,wx,wz)];ctx.fillRect(x,y,3,3);}
  for(const m of state.mobs)if(m.hp>0){ctx.fillStyle='#d16b4d';ctx.beginPath();ctx.arc((m.x-left)*scale,(m.z-top)*scale,2,0,Math.PI*2);ctx.fill();}for(const p of state.players){ctx.save();ctx.translate((p.x-left)*scale,(p.z-top)*scale);ctx.rotate(-p.angle);ctx.fillStyle=p.id===localId?'#eee4ca':'#99dad2';ctx.strokeStyle='#17201d';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,5);ctx.lineTo(-4,-4);ctx.lineTo(0,-2);ctx.lineTo(4,-4);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
  $('.map-footer span:last-child').textContent=starter(self.x,self.z)?'WHISPERING VALE':surface(MAP.map,self.x,self.z).toUpperCase()+' · FAR MARCHES';
}
function updateUI(){const p=state.players.find(p=>p.id===localId);if(!p)return;$('#hp-bar').style.width=p.hp+'%';$('#hp-label').textContent=`${Math.round(p.hp)} / 100`;$('#level').textContent=String(p.level);$('#xp-bar').style.width=p.xp%100+'%';$('#gold').textContent=p.gold;$('#quest-progress').textContent=p.quest?'Completed':`${Math.min(p.kills,5)} / 5 creatures`;$('#coordinates').textContent=`${p.x.toFixed(0)}, ${p.z.toFixed(0)}`;for(const [key,seconds] of [['attack',.55],['nova',5],['heal',9]]){const remaining=Math.max(0,p.cooldowns[key]-state.time);const button=$(`[data-ability="${key}"]`);button.querySelector('i').style.height=`${remaining/seconds*100}%`;button.setAttribute('aria-label',`${key}${remaining?` cooldown ${remaining.toFixed(1)} seconds`:''}`);}}
let last=performance.now();function frame(now){const frameStarted=performance.now();requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;clock+=dt;frames++;if(now-lastFps>1000){fps=Math.round(frames*1000/(now-lastFps));frames=0;lastFps=now;}
  const direction=inputDirection(),self=entities.get(localId);if(connected&&now-lastInput>50){send({type:'input',...direction});lastInput=now;}
  // Blender -Y exports as +Z, matching the server's atan2(x, z) heading.
  for(const [id,e] of entities){const p=e.group.position,d=e.data;if(id===localId){const predicted={x:p.x,z:p.z};move(predicted,direction.x*settings.gameplay.moveSpeed*dt,direction.z*settings.gameplay.moveSpeed*dt);p.x=predicted.x;p.z=predicted.z;if(!direction.x&&!direction.z){p.x=T.MathUtils.lerp(p.x,d.x,Math.min(1,dt*10));p.z=T.MathUtils.lerp(p.z,d.z,Math.min(1,dt*10));}e.group.rotation.y=direction.x||direction.z?Math.atan2(direction.x,direction.z):d.angle;}else{p.x=T.MathUtils.lerp(p.x,d.x,Math.min(1,dt*12));p.z=T.MathUtils.lerp(p.z,d.z,Math.min(1,dt*12));e.group.rotation.y=d.angle??0;}e.model.position.y=e.mob?Math.sin(clock*3+d.x)*.035:(id===localId&&(direction.x||direction.z)?Math.abs(Math.sin(clock*12))*.065:0);if(e.health){e.health.scale.x=d.hp/60;e.health.quaternion.copy(camera.quaternion).premultiply(e.group.quaternion.clone().invert());}}
  if(self){target.lerp(new T.Vector3(self.group.position.x,0,self.group.position.z),1-Math.exp(-dt*9));selfRing.position.set(self.group.position.x,.035,self.group.position.z);}
  const elevation=settings.camera.angle*Math.PI/180,distance=25;camera.position.set(target.x+distance*Math.cos(elevation)*Math.SQRT1_2,distance*Math.sin(elevation),target.z+distance*Math.cos(elevation)*Math.SQRT1_2);camera.lookAt(target);environment.update(clock,target,now*.001);
  for(const e of entities.values())updateTint(e,dt);
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];const actor=entities.get(e.sourceId);if(actor)followSlash(e,actor.group.position);e.age+=dt;const progress=e.age/e.duration;e.mesh.material.uniforms.sweep.value=T.MathUtils.smoothstep(progress,0,.7);e.mesh.material.uniforms.opacity.value=e.opacity*(1-T.MathUtils.smoothstep(progress,.5,1));if(e.age>e.duration){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();effects.splice(i,1);}}
  for(let i=floaters.length-1;i>=0;i--){const f=floaters[i];f.age+=dt;const p=f.pos.clone();p.y+=f.age*1.8;p.project(camera);f.el.style.left=`${(p.x*.5+.5)*innerWidth}px`;f.el.style.top=`${(-p.y*.5+.5)*innerHeight}px`;f.el.style.opacity=1-f.age;if(f.age>1){f.el.remove();floaters.splice(i,1);}}
  const renderStarted=performance.now();renderer.info.reset();shadowCalls=0;shadowTriangles=0;environment.captureWater(camera);renderer.render(scene,camera);const renderSubmitMs=performance.now()-renderStarted;
  renderMetrics={drawCalls:renderer.info.render.calls-shadowCalls,triangles:renderer.info.render.triangles-shadowTriangles,totalDrawCalls:renderer.info.render.calls,totalTriangles:renderer.info.render.triangles,shadowDrawCalls:shadowCalls,shadowTriangles};
  for(const observe of frameObservers)observe();
  if(frames%8===0){updateUI();minimap();$('#metrics').textContent=`${fps} FPS\n${renderMetrics.drawCalls} scene + water draw calls\n${renderMetrics.triangles.toLocaleString()} triangles\n${renderMetrics.shadowDrawCalls} shadow calls\n${state.players.length} players · ${state.mobs.length} mobs\nGrass: ${settings.grass.density}\nServer: 20 Hz · network: 10 Hz\n${recorder?.status??''}`;}
  recorder?.frame(now,performance.now()-frameStarted,renderSubmitMs,renderMetrics);
}
// Read-only, stable observability hook for AI playtests. Actions use actual UI.
Object.defineProperty(window,'__game',{value:{get ready(){return Boolean(environment&&settings&&localId);},get state(){return structuredClone(state);},get playerId(){return localId;},get config(){return structuredClone(settings);},get placements(){return environment?.placements??structuredClone(PROPS);},get performanceLog(){return {sessionId:recorder?.sessionId,status:recorder?.status,lastSample:recorder?.lastSample};},get metrics(){return {fps,...renderMetrics,gpu};},project(x,z,y=0){const p=new T.Vector3(x,y,z).project(camera);return {x:(p.x*.5+.5)*innerWidth,y:(-p.y*.5+.5)*innerHeight};}},writable:false});
Object.defineProperty(window.__game,'entities',{get(){return [...entities].map(([id,e])=>({id,mob:e.mob,x:e.group.position.x,z:e.group.position.z,angle:e.group.rotation.y,scale:e.model.scale.x,potionTint:Math.max(0,1-e.potionAge/1.2),hitTint:Math.max(0,1-e.hitAge/.4),materialColors:e.tintMaterials.map(t=>t.material.color?.getHexString())}));}});
Object.defineProperty(window.__game,'effects',{get(){return effects.map(e=>({key:e.key,sourceId:e.sourceId,mob:e.mob,age:e.age,duration:e.duration,sweep:e.mesh.material.uniforms.sweep.value,angle:e.angle,arcDegrees:e.arcDegrees,range:e.range,radius:e.radius,variant:e.variant,tilt:e.tilt,x:e.mesh.position.x,z:e.mesh.position.z,color:e.mesh.material.uniforms.color.value.getHexString(),opacity:e.mesh.material.uniforms.opacity.value}));}});
Object.defineProperty(window.__game,'lighting',{get(){return environment?.lighting;}});
Object.defineProperty(window.__game,'streaming',{get(){return environment?.streaming;}});
Object.defineProperty(window.__game,'camera',{get(){return {zoom:camera.zoom,angle:settings?.camera.angle,position:camera.position.toArray(),target:target.toArray()};}});
Object.defineProperty(window.__game,'observeFrames',{value(callback){frameObservers.add(callback);return()=>frameObservers.delete(callback);}});
try{environment=await createEnvironment(scene,renderer);editor=await createEditor(applySettings,toast);propEditor=await createPropEditor(environment,toast);recorder=createPerformanceRecorder(renderer,gpu,()=>({players:state.players.length,mobs:state.mobs.filter(m=>m.hp>0).length,grassDensity:settings.grass.density,streamingRadius:settings.streaming.radius,grassPerChunk:settings.streaming.grassPerChunk,loadedChunks:environment.streaming.loaded.length,shadows:settings.performance.shadows,cameraAngle:settings.camera.angle,cameraZoom:camera.zoom,cameraMinZoom:settings.camera.minZoom,cameraMaxZoom:settings.camera.maxZoom,exposure:settings.lighting.exposure}));resize();connect();$('#loading').remove();requestAnimationFrame(frame);}catch(error){console.error(error);$('#loading').textContent=`Unable to enter the vale: ${error.message}. Run mise run assets and mise run dev.`;}
