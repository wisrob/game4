import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { startServer } from '../server/index.js';
import assert from 'node:assert/strict';
import { TREES } from '../shared/world.js';
import { captureSlashSequence, captureCombatFrame, captureMovingSlash } from './ability-capture.mjs';
import { captureWaterReview, captureWaterClose } from './water-capture.mjs';
import { testOpenWorld } from './map-playtest.mjs';
// Own servers and restore config in finally: does not disturb a running dev session.
const original=await readFile('settings.json','utf8');let browser,vite,game;
const originalPlacements=await readFile('placements.json','utf8');let placementsEdited=false;
const errors=[],checks=[];let metrics,expectedConflict=false;
const smoke=process.argv.includes('--smoke');
try{
  game=startServer(0);await new Promise(r=>game.http.once('listening',r));
  const serverPort=game.http.address().port;
  vite=await createServer({server:{port:5174,strictPort:true,proxy:{'/ws':{target:`ws://127.0.0.1:${serverPort}`,ws:true}}}});await vite.listen();
  browser=await chromium.launch({headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  const context=await browser.newContext({viewport:process.argv.includes('--pine-review')?{width:1669,height:942}:smoke?{width:960,height:640}:{width:1440,height:960},deviceScaleFactor:1});
  context.setDefaultTimeout(60000); // Software WebGL can take several frames to establish stable UI geometry.
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!(expectedConflict&&m.text().includes('409 (Conflict)')))errors.push(m.text());});
  await page.goto('http://127.0.0.1:5174');await page.waitForFunction(()=>window.__game?.ready,{},{timeout:30000}).catch(async error=>{console.error({errors,loading:await page.locator('#loading').textContent().catch(()=>null)});throw error;});
  if(smoke){
    await mkdir('artifacts',{recursive:true});
    await page.waitForFunction(()=>{const s=window.__game.streaming;return s.desired.length>0&&s.loaded.length===s.desired.length&&!s.pending.length;});
    await page.screenshot({path:'artifacts/smoke-world.png'});
    const wideMetrics=await page.evaluate(()=>window.__game.metrics);assert.ok(wideMetrics.drawCalls<200,`Wide draw calls ${wideMetrics.drawCalls}`);assert.ok(wideMetrics.triangles<150000,`Wide triangles ${wideMetrics.triangles}`);
    if(process.argv.includes('--pine-review')){
      const reference=await readFile('artifacts/target.png');
      const current=await readFile('artifacts/smoke-world.png');
      const comparison=await context.newPage();
      await comparison.setViewportSize({width:2000,height:600});
      await comparison.setContent(`<style>body{margin:0;background:#151b18;color:#eee;font:18px sans-serif}main{display:flex}section{width:1000px}h2{font:18px sans-serif;margin:10px 16px}img{display:block;width:1000px;height:auto}</style><main><section><h2>Target reference</h2><img src="data:image/png;base64,${reference.toString('base64')}"></section><section><h2>Current game · same viewport size</h2><img src="data:image/png;base64,${current.toString('base64')}"></section></main>`);
      await comparison.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
      await comparison.screenshot({path:'artifacts/pine-comparison.png'});
      await comparison.setViewportSize({width:600,height:420});
      await comparison.setContent(`<style>body{margin:0;background:#151b18;color:#eee;font:16px sans-serif}main{display:flex}section{width:300px}h2{font:16px sans-serif;margin:10px}div{position:relative;overflow:hidden;width:300px;height:380px}img{position:absolute;max-width:none}</style><main><section><h2>Target pine</h2><div><img style="width:1669px;left:-285px;top:-125px" src="data:image/png;base64,${reference.toString('base64')}"></div></section><section><h2>Current pine · normalized size</h2><div><img style="width:2169.7px;left:-596.7px;top:-520px" src="data:image/png;base64,${current.toString('base64')}"></div></section></main>`);
      await comparison.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
      await comparison.screenshot({path:'artifacts/pine-detail-comparison.png'});
      await comparison.close();
    }
    const initial=await page.evaluate(()=>{const g=window.__game;return g.state.players.find(p=>p.id===g.playerId);});
    await page.keyboard.down('d');
    try{
      await page.waitForFunction(initial=>{const g=window.__game,p=g.state.players.find(p=>p.id===g.playerId);return Math.hypot(p.x-initial.x,p.z-initial.z)>.2;},initial,{timeout:15000});
    }finally{await page.keyboard.up('d');}
    await page.mouse.move(480,320);await page.mouse.wheel(0,-10000);
    await page.waitForFunction(()=>window.__game.camera.zoom===window.__game.config.camera.maxZoom);
    await page.screenshot({path:'artifacts/smoke-close.png'});
    if(process.argv.includes('--grading')){
      await page.locator('#settings').click();
      await page.locator('#editor summary').filter({hasText:'post-processing'}).click();
      await page.locator('#setting-postProcessing-saturation').fill('0');
      await page.locator('#setting-postProcessing-saturation').dispatchEvent('input');
      await page.waitForFunction(()=>window.__game.config.postProcessing.saturation===0&&document.querySelector('#game').style.filter.includes('saturate(0)'));
      await page.locator('#close-editor').click();
      await page.screenshot({path:'artifacts/grading-desaturated.png'});
      await page.locator('#settings').click();
      await page.locator('#setting-postProcessing-enabled').setChecked(false);
      await page.waitForFunction(()=>document.querySelector('#game').style.filter==='none');
      await page.locator('#close-editor').click();
      await page.screenshot({path:'artifacts/grading-disabled.png'});
      checks.push('Post-processing editor previews saturation and bypass without changing settings.json');
    }
    metrics=await page.evaluate(()=>window.__game.metrics);
    assert.ok(metrics.drawCalls<200,`Draw calls ${metrics.drawCalls} exceed budget`);
    assert.ok(metrics.triangles<150000,`Triangles ${metrics.triangles} exceed budget`);
    checks.push('World and models load without browser errors','Keyboard movement reaches the server','Mouse wheel reaches close zoom','Scene remains within render budgets');
  }else if(process.argv.includes('--moving-only')){
    await mkdir('artifacts',{recursive:true});await captureMovingSlash(page);metrics=await page.evaluate(()=>window.__game.metrics);checks.push('Moving attack follows the actor on collision-checked clear ground');
  }else if(process.argv.includes('--map-only')){
    await mkdir('artifacts',{recursive:true});metrics=await testOpenWorld(page,context,checks);
  }else if(process.argv.includes('--water-close-only')){
    await captureWaterClose(page,checks);
    metrics=await page.evaluate(()=>window.__game.metrics);
  }else if(process.argv.includes('--water-only')){
    await captureWaterReview(page,JSON.parse(original),checks);
    metrics=await page.evaluate(()=>window.__game.metrics);
  }else if(process.argv.includes('--slashes-only')){
    const config=JSON.parse(original);
    for(const zoom of ['default','close']){
      if(zoom==='close'){
        await page.mouse.move(720,480);await page.mouse.wheel(0,-10000);
        await page.waitForFunction(()=>window.__game.camera.zoom===window.__game.config.camera.maxZoom);
      }
      await page.waitForFunction(()=>{const g=window.__game,p=g.state.players.find(p=>p.id===g.playerId);return p&&p.cooldowns.attack<=g.state.time&&p.cooldowns.nova<=g.state.time;});
      const regular=await captureSlashSequence(page,'attack','Space',`regular-${zoom}`);
      const skill=await captureSlashSequence(page,'nova','q',`skill-${zoom}`);
      assert.equal(regular.arcDegrees,config.gameplay.attackArcDegrees);assert.equal(skill.arcDegrees,config.gameplay.skillArcDegrees);
      assert.equal(regular.radius,config.gameplay.attackRange);assert.equal(skill.radius,config.gameplay.skillRange);
      assert.ok(skill.opacity>regular.opacity);
      checks.push(`White and orange slashes visibly render across animation frames at ${zoom} zoom and disappear afterward`);
    }
    metrics=await page.evaluate(()=>window.__game.metrics);
  }else{
  if(!process.argv.includes('--legacy-editor-only')){
  await page.waitForFunction(()=>window.__game.performanceLog?.lastSample&&window.__game.performanceLog.status.includes('saved'),{},{timeout:15000}).catch(async error=>{console.error({errors,log:await page.evaluate(()=>window.__game.performanceLog)});throw error;});
  const perfSession=await page.evaluate(()=>window.__game.performanceLog.sessionId);
  const perfLines=(await readFile(`artifacts/performance/${perfSession}.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(perfLines[0].kind,'automated');assert.ok(perfLines.some(l=>l.type==='sample'&&l.frame.frames>0&&l.context.width===1440));checks.push('Browser performance samples reach local JSONL logs');
  await page.waitForTimeout(1000);await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/world.png'});checks.push('World and all Blender models loaded');
  await page.locator('.actionbar').screenshot({path:'artifacts/actionbar.png'});
  await page.setViewportSize({width:1566,height:884});await page.screenshot({path:'artifacts/reference.png'});await page.setViewportSize({width:1440,height:960});
  // Fast visual iteration uses the same isolated browser and normal editor controls.
  const initialZoom=await page.evaluate(()=>window.__game.camera.zoom);
  const wheel=async delta=>{await page.mouse.move(720,480);await page.mouse.wheel(0,delta);};
  await wheel(-10000);await page.waitForFunction(()=>window.__game.camera.zoom===window.__game.config.camera.maxZoom);
  await page.screenshot({path:'artifacts/zoom-max.png'});
  await wheel(10000);await page.waitForFunction(()=>window.__game.camera.zoom===window.__game.config.camera.minZoom);
  await page.screenshot({path:'artifacts/zoom-min.png'});
  await page.locator('#settings').click();await page.locator('#editor summary').filter({hasText:/^camera$/}).click();
  assert.equal(await page.locator('#setting-camera-distance, #setting-camera-zoom').count(),0);
  await page.locator('#setting-camera-minZoom').fill('0.8');await page.locator('#setting-camera-minZoom').dispatchEvent('input');
  await page.waitForFunction(()=>window.__game.camera.zoom===.8);
  await wheel(-10000);await page.waitForFunction(()=>window.__game.camera.zoom===window.__game.config.camera.maxZoom);
  await page.locator('#setting-camera-maxZoom').fill('1.5');await page.locator('#setting-camera-maxZoom').dispatchEvent('input');
  await page.waitForFunction(()=>window.__game.camera.zoom===1.5);
  await page.locator('#reload-config').click();await page.waitForFunction(()=>window.__game.config.camera.maxZoom===1.8);
  await page.locator('#editor summary').filter({hasText:/^camera$/}).click();await page.locator('#close-editor').click();
  await wheel(Math.log(1.5/initialZoom)/.0015);await page.waitForFunction(zoom=>Math.abs(window.__game.camera.zoom-zoom)<1e-6,initialZoom);
  checks.push('Mouse wheel reaches both zoom limits; editor limit changes clamp the current zoom immediately');
  }
  if(process.argv.includes('--visual-only')){
    await wheel(-10000);await page.waitForFunction(()=>window.__game.camera.zoom===window.__game.config.camera.maxZoom);await page.waitForTimeout(500);
    await page.screenshot({path:'artifacts/detail.png'});
    metrics=await page.evaluate(()=>window.__game.metrics);
    assert.ok(metrics.drawCalls<200);assert.ok(metrics.triangles<150000);
    checks.push('Visual review at default and close gameplay zoom remains within render budgets');
    await wheel(10000);await page.waitForFunction(()=>window.__game.camera.zoom===window.__game.config.camera.minZoom);
    await page.screenshot({path:'artifacts/water.png'});
    await page.locator('#settings').click();
    for(const opacity of [0,1,JSON.parse(original).water.opacity]){
      await page.locator('#setting-water-opacity').fill(String(opacity));await page.locator('#setting-water-opacity').dispatchEvent('input');
      await page.waitForFunction(value=>window.__game.config.water.opacity===value,opacity);
      await page.screenshot({path:`artifacts/water-opacity-${opacity}.png`});
    }
    await page.locator('#close-editor').click();
    metrics=await page.evaluate(()=>window.__game.metrics);assert.ok(metrics.drawCalls<200);assert.ok(metrics.triangles<150000);
    checks.push('Preview fully transparent, opaque, and default water through editor controls at overview zoom');
  }else{
  if(!process.argv.includes('--legacy-editor-only')){
  if(!process.argv.includes('--gameplay-only')){
  // Capture actual pixels throughout each animation, at normal and close zoom.
  const regularDefault=await captureSlashSequence(page,'attack','Space','regular-default');
  const skillDefault=await captureSlashSequence(page,'nova','q','skill-default');
  await wheel(-10000);await page.waitForFunction(()=>window.__game.camera.zoom===window.__game.config.camera.maxZoom);
  const baseColors=await page.evaluate(()=>window.__game.entities.find(e=>e.id===window.__game.playerId).materialColors);
  await page.waitForFunction(()=>{const g=window.__game,p=g.state.players.find(p=>p.id===g.playerId);return p.cooldowns.attack<=g.state.time&&p.cooldowns.nova<=g.state.time;});
  const regular=await captureSlashSequence(page,'attack','Space','regular-close');
  assert.equal(regular.color,'ffffff');assert.equal(regular.arcDegrees,JSON.parse(original).gameplay.attackArcDegrees);
  const skill=await captureSlashSequence(page,'nova','q','skill-close');
  assert.equal(skill.color,'ff790d');assert.equal(skill.arcDegrees,JSON.parse(original).gameplay.skillArcDegrees);assert.ok(skill.opacity>regular.opacity);
  assert.equal(regularDefault.arcDegrees,regular.arcDegrees);assert.equal(skillDefault.arcDegrees,skill.arcDegrees);
  assert.equal(regular.radius,JSON.parse(original).gameplay.attackRange);assert.equal(skill.radius,JSON.parse(original).gameplay.skillRange);
  assert.equal(regular.radius,regular.range);assert.equal(skill.radius,skill.range);
  assert.equal(new Set([regularDefault.variant,skillDefault.variant,regular.variant,skill.variant]).size,3);
  checks.push('Both slashes have visible colored pixels across multiple animation frames at default and close zoom, then disappear');
  // Arm before casting: transient effects must be observed on rendered frames,
  // rather than starting an asynchronous poll after they may have already faded.
  await page.evaluate(()=>{
    window.__potionCapture=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{stop();const g=window.__game;reject(new Error(`Potion capture timed out: ${JSON.stringify({player:g.state.players.find(p=>p.id===g.playerId),entity:g.entities.find(e=>e.id===g.playerId),focus:document.activeElement.tagName})}`));},30000);
      const stop=window.__game.observeFrames(()=>{
        const entity=window.__game.entities.find(e=>e.id===window.__game.playerId);
        if(entity?.potionTint>.5){clearTimeout(timeout);stop();resolve({entity,image:document.querySelector('#game').toDataURL('image/png')});}
      });
    });
  });
  await page.keyboard.press('Escape');await page.keyboard.press('e');
  const potion=await page.evaluate(()=>window.__potionCapture),tinted=potion.entity;assert.notDeepEqual(tinted.materialColors,baseColors);
  await writeFile('artifacts/potion-tint.png',Buffer.from(potion.image.split(',')[1],'base64'));
  await page.waitForFunction(()=>window.__game.entities.find(e=>e.id===window.__game.playerId)?.potionTint===0);
  assert.deepEqual(await page.evaluate(()=>window.__game.entities.find(e=>e.id===window.__game.playerId).materialColors),baseColors);
  await page.waitForFunction(()=>window.__game.effects.length===0);
  assert.ok(tinted.materialColors.every(hex=>{const value=parseInt(hex,16);return Math.max(value>>16,(value>>8)&255,value&255)-Math.min(value>>16,(value>>8)&255,value&255)<85;}),'Potion whitens the character');
  checks.push('White regular slash, brighter orange skill sweep, and white potion tint that restores original character colors');
  console.log('Visual sequences and potion capture passed; starting movement and multiplayer checks');
  await wheel(Math.log(JSON.parse(original).camera.maxZoom/initialZoom)/.0015);await page.waitForFunction(zoom=>Math.abs(window.__game.camera.zoom-zoom)<1e-6,initialZoom);
  }
  const initial=await page.evaluate(()=>{const g=window.__game;return g.state.players.find(p=>p.id===g.playerId);});
  await page.keyboard.down('d');await page.waitForFunction(initial=>{const g=window.__game,p=g.state.players.find(p=>p.id===g.playerId);return Math.hypot(p.x-initial.x,p.z-initial.z)>2.2;},initial,{timeout:15000});await page.keyboard.up('d');await page.waitForTimeout(200);
  const moved=await page.evaluate(()=>{const g=window.__game;return g.state.players.find(p=>p.id===g.playerId);});assert.ok(Math.hypot(moved.x-initial.x,moved.z-initial.z)>2);checks.push('Keyboard movement reaches authoritative server');
  const facing=await page.evaluate(()=>window.__game.entities.find(e=>e.id===window.__game.playerId));
  const dx=moved.x-initial.x,dz=moved.z-initial.z;
  assert.ok((Math.sin(facing.angle)*dx+Math.cos(facing.angle)*dz)/Math.hypot(dx,dz)>.99,'Rendered character faces its movement direction');
  await page.screenshot({path:'artifacts/equipment.png'});checks.push('Character faces forward while walking');
  const other=await context.newPage();await other.goto('http://127.0.0.1:5174');await other.waitForFunction(()=>window.__game?.ready);await page.waitForFunction(()=>window.__game.state.players.length===2);
  await other.keyboard.press('e');await page.waitForFunction(()=>window.__game.entities.some(e=>e.id!==window.__game.playerId&&!e.mob&&e.potionTint>.5));
  assert.equal(await page.evaluate(()=>window.__game.entities.find(e=>e.id===window.__game.playerId).potionTint),0);
  await page.waitForFunction(()=>window.__game.entities.every(e=>e.potionTint===0));checks.push('Remote potion tints only the caster and fades independently');
  await other.waitForFunction(id=>{const g=window.__game,e=g.entities.find(e=>e.id===id),p=g.state.players.find(p=>p.id===id);return e&&p&&Math.abs(e.angle-p.angle)<.001;},moved.id);checks.push('Remote player uses the same forward heading');
  await page.locator('#chat-input').fill('Hello from the playtest');await page.locator('#chat-input').press('Enter');await other.getByText('Hello from the playtest',{exact:false}).waitFor();checks.push('Second player joins and receives world chat');
  await other.close();await page.waitForFunction(()=>window.__game.state.players.length===1);
  console.log('Movement and multiplayer passed; starting close-range combat');
  // At ~3 FPS in SwiftShader, one keyboard frame at full speed can step past
  // a melee target and reverse its bearing. Use the normal validated setting
  // for precise combat movement, then restore it before editor verification.
  const combatSettings=JSON.parse(original);combatSettings.gameplay.moveSpeed=2;
  await writeFile('settings.json',JSON.stringify(combatSettings,null,2)+'\n');
  await page.waitForFunction(()=>window.__game.config.gameplay.moveSpeed===2);
  // Walk to an enemy using actual click-to-travel; no teleport/debug mutations.
  // World HUD may cover the destination. Start via keyboard, then click the open ground.
  await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');
  const travel=await page.evaluate(()=>window.__game.project(-6,-5));
  if(travel.x>320&&travel.y>100&&travel.x<1100&&travel.y<730)await page.locator('#game').click({position:travel});
  await page.waitForTimeout(1300);
  // Face nearby enemies through normal movement now that attacks are directional.
  const nearestAim=()=>page.evaluate(()=>{
      const g=window.__game,p=g.state.players.find(p=>p.id===g.playerId);
      const m=g.state.mobs.filter(m=>m.hp>0).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
      const directions=[['w',-1,-1],['s',1,1],['a',-1,1],['d',1,-1],['w','d',0,-1],['w','a',-1,0],['s','d',1,0],['s','a',0,1]];
      const score=d=>{const x=d.at(-2),z=d.at(-1);return ((m.x-p.x)*x+(m.z-p.z)*z)/Math.hypot(x,z);};
      directions.sort((a,b)=>score(b)-score(a));const d=directions[0],toward=Math.atan2(m.x-p.x,m.z-p.z)-p.angle;
      return {keys:d.slice(0,-2),angle:Math.atan2(d.at(-2),d.at(-1)),distance:Math.hypot(m.x-p.x,m.z-p.z),range:g.config.gameplay.attackRange,mobRange:g.config.gameplay.mobAttackRange,hp:p.hp,kills:p.kills,inArc:Math.abs(Math.atan2(Math.sin(toward),Math.cos(toward)))<g.config.gameplay.attackArcDegrees*Math.PI/360-.05};
    });
  const face=async aim=>{
    for(const key of aim.keys)await page.keyboard.down(key);
    // Let normal input run for a rendered frame so it also cancels click-to-travel.
    await page.evaluate(()=>new Promise(resolve=>{const stop=window.__game.observeFrames(()=>{stop();resolve();});}));
    // Allow an authoritative tick, then focus chat to send stop immediately.
    // Waiting several software-rendered frames here can overshoot a short range.
    await page.waitForTimeout(60);
    for(const key of aim.keys)await page.keyboard.up(key);
    await page.keyboard.press('Enter');await page.keyboard.press('Escape');
    await page.waitForFunction(angle=>{const g=window.__game,p=g.state.players.find(p=>p.id===g.playerId);return p&&Math.abs(p.angle-angle)<.001;},aim.angle,{timeout:15000});
  };
  // Capture in parallel with active combat. A missed swing must not leave the bot
  // idle until death while it waits for the very hit it still needs to deliver.
  await page.keyboard.press('Enter');await page.keyboard.press('Escape');
  let combat,combatError,playerCaptured=false,mobCaptured=false;
  for(let step=0;step<80;step++){
    let aim=await nearestAim();
    if(aim.kills>=1&&playerCaptured&&mobCaptured)break;
    if(!combat&&aim.distance<4){
      // Give each stage its own capture window. The bot must first survive an
      // enemy hit before attacking, especially under slow software rendering.
      combat=captureCombatFrame(page,'player-hit').then(()=>{
        playerCaptured=true;
        return captureCombatFrame(page,'mob-hit').then(()=>{mobCaptured=true;});
      }).catch(error=>{combatError=error;});
    }
    if(combatError)throw combatError;
    if(aim.hp<80)await page.keyboard.press('e');
    // First enter the enemy's shorter melee range and let it hit. Attacking
    // from the player's longer range can kill every target before it retaliates.
    const approachRange=playerCaptured?aim.range:aim.mobRange;
    if(aim.distance>approachRange*.85||!aim.inArc){await face(aim);aim=await nearestAim();}
    if(playerCaptured&&aim.distance<=aim.range&&aim.inArc){
      await page.keyboard.press('Space');
      // Keep the first hit nonfatal so the living mob's red flash can be captured.
      if(mobCaptured)await page.keyboard.press('q');
    }
    await page.waitForTimeout(350);
  }
  assert.ok(combat,'Walk into melee range before validating hit flashes');
  await combat;if(combatError)throw combatError;
  assert.ok(playerCaptured&&mobCaptured,'Capture both combat victims');
  checks.push('Mob attacks render slashes and victims flash red for player and mob hits');
  checks.push('Directional abilities reach server and render effects');
  await page.waitForFunction(()=>window.__game.state.players.find(p=>p.id===window.__game.playerId)?.kills>=1,{},{timeout:15000});checks.push('Actual movement and combat defeat a mossling');
  await page.waitForFunction(()=>{const g=window.__game,p=g.state.players.find(p=>p.id===g.playerId);return p.cooldowns.attack<=g.state.time;});
  await page.keyboard.press('e');await captureMovingSlash(page);
  checks.push('Slash follows the moving actor, radius equals range, and three swing planes are rendered');
  await writeFile('settings.json',original);
  await page.waitForFunction(speed=>window.__game.config.gameplay.moveSpeed===speed,JSON.parse(original).gameplay.moveSpeed);
  }
  await mkdir('artifacts',{recursive:true});
  console.log('Starting settings and prop editor checks');
  await page.locator('#settings').click();await page.locator('#editor').waitFor({state:'visible'});
  // Every placed model can be moved through normal editor fields, without saving previews.
  for(const model of ['pine','boulder','fern','log','lantern','dock','wardstone','campfire']){
    const prop=JSON.parse(originalPlacements).props.find(p=>p.model===model);
    await page.locator('#prop-type').selectOption(model);await page.locator('#prop-select').selectOption(prop.id);
    await page.locator('#prop-x').fill(String(prop.x+.25));
    await page.waitForFunction(p=>window.__game.placements.find(item=>item.id===p.id).x===p.x+.25,prop);
    assert.equal(JSON.parse(await readFile('placements.json','utf8')).props.find(p=>p.id===prop.id).x,prop.x);
    await page.locator('#reload-props').click();await page.waitForFunction(p=>window.__game.placements.find(item=>item.id===p.id).x===p.x,prop);
  }
  checks.push('All eight placed prop types preview moves and reload without changing the file');
  await page.locator('#prop-type').selectOption('campfire');await page.locator('#prop-select').selectOption('campfire-0001');
  await page.locator('#prop-x').fill('0');await page.locator('#prop-z').fill('3');await page.locator('#move-props').check();
  await page.waitForTimeout(300);
  const dragStart=await page.evaluate(()=>window.__game.project(0,3,.7));
  const dragEnd={x:dragStart.x+70,y:dragStart.y+25};
  const playerBeforeDrag=await page.evaluate(()=>{const g=window.__game;return g.state.players.find(p=>p.id===g.playerId);});
  await page.mouse.move(dragStart.x,dragStart.y);await page.mouse.down();await page.mouse.move(dragEnd.x,dragEnd.y,{steps:8});await page.mouse.up();
  const dragged=await page.evaluate(()=>window.__game.placements.find(p=>p.id==='campfire-0001'));
  assert.ok(Math.hypot(dragged.x,dragged.z-3)>.5,'Pointer dragging changes the campfire transform');
  const playerAfterDrag=await page.evaluate(()=>{const g=window.__game;return g.state.players.find(p=>p.id===g.playerId);});
  assert.ok(Math.hypot(playerAfterDrag.x-playerBeforeDrag.x,playerAfterDrag.z-playerBeforeDrag.z)<.1,'Dragging does not move the player');
  await page.screenshot({path:'artifacts/prop-editor.png'});
  placementsEdited=true;const propSave=page.waitForResponse(r=>r.url().endsWith('/__placements')&&r.request().method()==='PUT');await page.locator('#save-props').click();const propSaved=await propSave;assert.equal(propSaved.status(),200,await propSaved.text());
  assert.equal(JSON.parse(await readFile('placements.json','utf8')).props.find(p=>p.id===dragged.id).x,dragged.x);
  checks.push('Scene drag selects a prop, pauses player movement, and saves its transform');
  // A stale preview must not overwrite an external placement edit.
  await page.locator('#prop-x').fill(String(dragged.x+1));
  await writeFile('placements.json',originalPlacements);await page.getByText('File changed · Reload props before saving',{exact:true}).waitFor();
  expectedConflict=true;const propConflict=page.waitForResponse(r=>r.url().endsWith('/__placements')&&r.request().method()==='PUT');await page.locator('#save-props').click();assert.equal((await propConflict).status(),409);expectedConflict=false;
  assert.equal(await readFile('placements.json','utf8'),originalPlacements);
  await page.locator('#reload-props').click();await page.locator('#move-props').uncheck();
  checks.push('Prop save rejects stale file revisions and reload discards the preview');
  await page.locator('#prop-editor summary').click();
  await page.locator('#editor summary').filter({hasText:/^characters$/}).click();
  await page.locator('#setting-characters-playerScale').fill('1.05');await page.locator('#setting-characters-playerScale').dispatchEvent('input');
  await page.waitForFunction(()=>window.__game.entities.filter(e=>!e.mob).every(e=>e.scale===1.05));
  await page.locator('#setting-characters-playerScale').fill(String(JSON.parse(original).characters.playerScale));await page.locator('#setting-characters-playerScale').dispatchEvent('input');
  await page.waitForFunction(()=>window.__game.entities.filter(e=>!e.mob).every(e=>e.scale===window.__game.config.characters.playerScale));
  await page.locator('#editor summary').filter({hasText:/^characters$/}).click();
  checks.push('Character scale previews live through normal editor controls');
  await page.locator('#editor summary').filter({hasText:/^gameplay$/}).click();
  for(const [key,value] of Object.entries({attackArcDegrees:90,skillArcDegrees:180,attackRange:1.25,skillRange:1.6,mobAttackRange:1})){
    await page.locator(`#setting-gameplay-${key}`).fill(String(value));await page.locator(`#setting-gameplay-${key}`).dispatchEvent('input');
  }
  await page.waitForFunction(()=>window.__game.config.gameplay.attackArcDegrees===90&&window.__game.config.gameplay.skillArcDegrees===180);
  await page.locator('#editor summary').filter({hasText:/^gameplay$/}).click();
  await page.locator('#editor summary').filter({hasText:/^lighting$/}).click();
  for(const [key,value] of Object.entries({sunX:20,sunHeight:16,sunZ:-18})){
    await page.locator(`#setting-lighting-${key}`).fill(String(value));await page.locator(`#setting-lighting-${key}`).dispatchEvent('input');
  }
  await page.waitForTimeout(400);
  const sunOffset=await page.evaluate(()=>{const {sunPosition,sunTarget}=window.__game.lighting;return sunPosition.map((v,i)=>v-sunTarget[i]);});
  sunOffset.forEach((v,i)=>assert.ok(Math.abs(v-[20,16,-18][i])<1e-8));checks.push('Sun position sliders update the rendered light across animation frames');
  await page.screenshot({path:'artifacts/sun-position.png'});
  await page.locator('#setting-water-speed').fill('1.45');await page.locator('#setting-water-speed').dispatchEvent('input');
  await page.locator('#setting-water-opacity').fill('0.4');await page.locator('#setting-water-opacity').dispatchEvent('input');
  await page.waitForFunction(()=>window.__game.config.water.opacity===.4);
  await page.waitForFunction(()=>window.__game.config.water.speed===1.45);checks.push('Water slider updates live shader settings');
  await page.locator('#setting-water-color').fill('#3355aa');await page.locator('#setting-water-color').dispatchEvent('input');
  const configSave=page.waitForResponse(r=>r.url().endsWith('/__settings')&&r.request().method()==='PUT');await page.locator('#save-config').click();const configSaved=await configSave;assert.equal(configSaved.status(),200,await configSaved.text());
  const saved=JSON.parse(await readFile('settings.json','utf8'));assert.equal(saved.water.opacity,.4);assert.equal(saved.water.speed,1.45);assert.equal(saved.water.color,'#3355aa');assert.equal(saved.lighting.sunX,20);assert.equal(saved.lighting.sunHeight,16);assert.equal(saved.lighting.sunZ,-18);checks.push('Editor saves JSON including water opacity and sun position');
  assert.equal(saved.gameplay.attackArcDegrees,90);assert.equal(saved.gameplay.skillArcDegrees,180);
  for(const [key,value] of Object.entries({attackRange:1.25,skillRange:1.6,mobAttackRange:1})){
    assert.equal(saved.gameplay[key],value);
    await page.waitForTimeout(300);assert.equal(game.world.config[key],value);
  }
  await page.waitForTimeout(500);assert.equal(game.world.config.attackArcDegrees,90);assert.equal(game.world.config.skillArcDegrees,180);checks.push('Arc editor controls save and reload into authoritative server gameplay');
  await page.waitForTimeout(400);await page.screenshot({path:'artifacts/editor.png'});
  saved.water.speed=1.8;saved.lighting.sunIntensity=3.1;saved.lighting.sunX=-24;saved.lighting.sunHeight=32;saved.lighting.sunZ=12;saved.gameplay.moveSpeed=7;
  await writeFile('settings.json',JSON.stringify(saved,null,2)+'\n');await page.waitForFunction(()=>window.__game.config.water.speed===1.8);await page.waitForTimeout(400);assert.equal(game.world.config.moveSpeed,7);checks.push('External JSON edits reload in client and server');
  await page.waitForFunction(()=>{const {sunPosition:p,sunTarget:t}=window.__game.lighting;return Math.abs(p[0]-t[0]+24)<1e-8&&p[1]-t[1]===32&&Math.abs(p[2]-t[2]-12)<1e-8;});checks.push('Sun position reloads from external JSON edits');
  await page.locator('#setting-water-speed').fill('2');await page.locator('#setting-water-speed').dispatchEvent('input');saved.water.speed=1.9;
  await writeFile('settings.json',JSON.stringify(saved,null,2)+'\n');await page.getByText('File changed · Reload to discard your preview',{exact:true}).waitFor();
  expectedConflict=true;const conflictResponse=page.waitForResponse(r=>r.url().endsWith('/__settings')&&r.request().method()==='PUT');await page.locator('#save-config').click();assert.equal((await conflictResponse).status(),409);await page.getByText('File changed. Reload settings before saving.',{exact:true}).waitFor();assert.equal(JSON.parse(await readFile('settings.json','utf8')).water.speed,1.9);expectedConflict=false;
  await page.locator('#reload-config').click();await page.waitForFunction(()=>window.__game.config.water.speed===1.9);checks.push('Concurrent file edits cannot be overwritten by stale editor previews');
  await writeFile('settings.json','{"water":');await page.getByText('File error:',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.__game.config.water.speed),1.9);checks.push('Invalid file preserves last valid settings');
  await writeFile('settings.json',original);await page.waitForFunction(speed=>window.__game.config.water.speed===speed,JSON.parse(original).water.speed);
  await page.locator('#close-editor').click();await page.keyboard.press('F3');await page.waitForTimeout(1000);await page.screenshot({path:'artifacts/performance.png'});
  metrics=await page.evaluate(()=>window.__game.metrics);assert.ok(metrics.drawCalls<200,`Draw calls ${metrics.drawCalls} exceed budget`);assert.ok(metrics.triangles<150000,`Triangles ${metrics.triangles} exceed budget`);
  await page.keyboard.press('F3');await page.setViewportSize({width:640,height:800});await page.screenshot({path:'artifacts/compact.png'});checks.push('Compact layout renders');
  // Real file changes, not debug scene mutations: browser and server consume one source.
  const placements=JSON.parse(originalPlacements),tree=placements.props.find(p=>p.model==='pine');
  const before={...tree};tree.x=30;tree.z=30;placementsEdited=true;
  await writeFile('placements.json',JSON.stringify(placements,null,2)+'\n');
  await page.waitForFunction(id=>window.__game?.ready&&window.__game.placements.find(p=>p.id===id)?.x===30,tree.id,{timeout:30000});
  await page.waitForTimeout(600);assert.equal(TREES.find(p=>p.id===tree.id).x,30);checks.push('Placement JSON edits reload scene and authoritative tree collisions');
  await writeFile('placements.json','{"version":');
  await page.getByText('Invalid placements',{exact:false}).waitFor();assert.equal(await page.evaluate(id=>window.__game.placements.find(p=>p.id===id).x,tree.id),30);assert.equal(TREES.find(p=>p.id===tree.id).x,30);checks.push('Invalid placement file preserves last valid scene and collisions');
  await writeFile('placements.json',originalPlacements);
  await page.waitForFunction(p=>window.__game?.ready&&window.__game.placements.find(prop=>prop.id===p.id)?.x===p.x,before,{timeout:30000});
  }
  }
  assert.deepEqual(errors,[],'Browser errors');
  console.log(JSON.stringify({checks,metrics,errors},null,2));await writeFile(smoke?'artifacts/smoke-playtest.json':process.argv.includes('--map-only')?process.argv.includes('--coast-only')?'artifacts/coast-playtest.json':'artifacts/map-playtest.json':process.argv.includes('--water-close-only')?'artifacts/water-close-playtest.json':process.argv.includes('--water-only')?'artifacts/water-playtest.json':process.argv.includes('--slashes-only')?'artifacts/slash-playtest.json':'artifacts/playtest.json',JSON.stringify({checks,metrics,errors},null,2));
}finally{if(!smoke)await writeFile('settings.json',original);if(placementsEdited)await writeFile('placements.json',originalPlacements);await browser?.close();await vite?.close();game?.close();}
