import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { walkable } from '../shared/world.js';

// Observe actual rendered frames, never pause time or mutate the game to stage an effect.
export async function captureSlashSequence(page,key,button,label) {
  await page.waitForFunction(()=>window.__game.effects.length===0);
  await page.evaluate(key=>new Promise(ready=>{
    // Sample the active stroke, not mostly its empty startup/fade frames.
    const frames=[],canvas=document.querySelector('#game'),phases=[0,.2,.35,.5,.65,.85];
    let started=false,index=0;
    window.__abilityCapture=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{unsubscribe();reject(new Error(`No complete rendered ${key} animation within 30 seconds`));},30000);
      function sample(){
        const effect=window.__game.effects.find(e=>e.key===key&&e.sourceId===window.__game.playerId);
        const player=window.__game.state.players.find(p=>p.id===window.__game.playerId);
        const center=window.__game.project(player.x,player.z,1.05);
        const endpoint=sign=>{const angle=effect.angle+sign*effect.arcDegrees*Math.PI/360;return window.__game.project(player.x+Math.sin(angle)*effect.radius,player.z+Math.cos(angle)*effect.radius,1.05);};
        const shot=stage=>frames.push({stage,effect,center,endpoints:effect?{left:endpoint(-1),right:endpoint(1)}:null,metrics:window.__game.metrics,image:canvas.toDataURL('image/png')});
        if(!frames.length){shot('before');ready();}
        if(effect){started=true;if(index<phases.length&&effect.age/effect.duration>=phases[index]){shot(`phase ${Math.round(phases[index]*100)}%`);index++;}}
        else if(started){shot('after');clearTimeout(timeout);unsubscribe();resolve(frames);return;}
      }
      const unsubscribe=window.__game.observeFrames(sample);
    });
  }),key);
  await page.keyboard.press(button);
  const frames=await page.evaluate(()=>window.__abilityCapture);
  const analysis=await page.evaluate(async({frames,key})=>{
    const bitmaps=await Promise.all(frames.map(async f=>createImageBitmap(await (await fetch(f.image)).blob())));
    const canvas=document.createElement('canvas');canvas.width=bitmaps[0].width;canvas.height=bitmaps[0].height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmaps[0],0,0);
    const baseline=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const counts=bitmaps.map((bitmap,i)=>{
      ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let visiblePixels=0,totalX=0,totalY=0;const center=frames[i].center;
      for(let y=Math.max(0,Math.floor(center.y-300));y<Math.min(canvas.height,center.y+300);y++)for(let x=Math.max(0,Math.floor(center.x-400));x<Math.min(canvas.width,center.x+400);x++){
        const n=(y*canvas.width+x)*4,r=data[n],g=data[n+1],b=data[n+2];
        const expected=key==='attack'?Math.min(r,g,b)>185&&Math.max(r,g,b)-Math.min(r,g,b)<35:r>210&&g>60&&g<190&&b<100&&r>g*1.25;
        const changed=r-baseline[n]>30&&(key!=='attack'||g-baseline[n+1]>30&&b-baseline[n+2]>30);
        if(expected&&changed){visiblePixels++;totalX+=x;totalY+=y;}
      }
      const ends=frames[i].endpoints,centroid=visiblePixels?{x:totalX/visiblePixels,y:totalY/visiblePixels}:null;
      const along=ends&&centroid?((centroid.x-ends.left.x)*(ends.right.x-ends.left.x)+(centroid.y-ends.left.y)*(ends.right.y-ends.left.y))/Math.max(1,(ends.right.x-ends.left.x)**2+(ends.right.y-ends.left.y)**2):null;
      return {stage:frames[i].stage,age:frames[i].effect?.age??null,visiblePixels,centroid,along};
    });
    const sheet=document.createElement('canvas');sheet.width=1600;sheet.height=Math.ceil(frames.length/4)*332;
    const paint=sheet.getContext('2d');paint.fillStyle='#182021';paint.fillRect(0,0,sheet.width,sheet.height);paint.font='16px sans-serif';
    bitmaps.forEach((bitmap,i)=>{
      const x=i%4*400,y=Math.floor(i/4)*332,c=frames[i].center;
      paint.drawImage(bitmap,c.x-400,c.y-300,800,600,x,y+32,400,300);
      paint.fillStyle='#ffffff';paint.fillText(`${counts[i].stage} · ${counts[i].visiblePixels} visible pixels`,x+8,y+23);bitmap.close();
    });
    return {counts,sheet:sheet.toDataURL('image/png')};
  },{frames,key});
  await mkdir(`artifacts/slashes/${label}`,{recursive:true});
  for(let i=0;i<frames.length;i++)await writeFile(`artifacts/slashes/${label}/${String(i).padStart(2,'0')}.png`,Buffer.from(frames[i].image.split(',')[1],'base64'));
  await writeFile(`artifacts/${label}-sequence.png`,Buffer.from(analysis.sheet.split(',')[1],'base64'));
  const effect=frames.find(f=>f.effect).effect;
  // Smaller configured radii intentionally occupy fewer screen pixels. Keep
  // the original threshold at each ability's old radius, scale with area,
  // and retain a floor (the skill previously used its 5.5-unit damage range).
  const referenceRadius=key==='nova'?5.5:2.8;
  const minVisiblePixels=Math.max(20,Math.round(100*Math.min(1,(effect.radius/referenceRadius)**2)));
  const report={key,radius:effect.radius,minVisiblePixels,frames:analysis.counts,metrics:frames.map(f=>f.metrics)};
  await writeFile(`artifacts/slashes/${label}/report.json`,JSON.stringify(report,null,2)+'\n');
  assert.equal(frames.length,8,`${label}: capture before, six animation phases, and after`);
  assert.ok(analysis.counts.filter(f=>f.age!==null&&f.visiblePixels>minVisiblePixels).length>=3,`${label}: stroke must be visibly colored in at least three frames, got ${JSON.stringify(analysis.counts)}`);
  assert.ok(analysis.counts.at(-1).visiblePixels<100,`${label}: slash must disappear after the animation`);
  const visible=analysis.counts.filter(f=>f.age!==null&&f.visiblePixels>minVisiblePixels);
  if(frames.find(f=>f.effect).effect.arcDegrees<300)assert.ok(visible.at(-1).along-visible[0].along>.2,`${label}: rendered stroke must travel from left to right, got ${JSON.stringify(visible)}`);
  assert.ok(frames.every(f=>f.metrics.drawCalls<200&&f.metrics.triangles<150000),`${label}: animation exceeds render budgets`);
  return frames.find(f=>f.effect).effect;
}

export async function captureCombatFrame(page,kind){
  const shot=await page.evaluate(kind=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{
      unsubscribe();const g=window.__game,player=g.state.players.find(p=>p.id===g.playerId);
      const nearest=g.state.mobs.filter(m=>m.hp>0).map(m=>({id:m.id,x:m.x,z:m.z,distance:player?Math.hypot(m.x-player.x,m.z-player.z):null})).sort((a,b)=>a.distance-b.distance).slice(0,2);
      reject(new Error(`No visible ${kind} combat frame within 60 seconds: ${JSON.stringify({player,nearest,effects:g.effects,flashes:g.entities.filter(e=>e.hitTint>0)})}`));
    },60000);
    const unsubscribe=window.__game.observeFrames(()=>{
      const g=window.__game,mob=kind==='mob-hit';
      const victim=g.entities.find(e=>e.mob===mob&&(mob||e.id===g.playerId)&&e.hitTint>.5&&(mob?g.state.mobs:g.state.players).find(p=>p.id===e.id)?.hp>0);
      const slash=g.effects.find(e=>e.mob&&e.sweep>.15&&e.sweep<.9);
      if(!victim||(!mob&&!slash))return;
      clearTimeout(timeout);unsubscribe();resolve({victim,slash,point:g.project(victim.x,victim.z,1),image:document.querySelector('#game').toDataURL('image/png')});
    });
  }),kind);
  await writeFile(`artifacts/${kind==='mob-hit'?'mob-hit':'mob-slash-player-hit'}.png`,Buffer.from(shot.image.split(',')[1],'base64'));
  const redPixels=await page.evaluate(async shot=>{
    const bitmap=await createImageBitmap(await(await fetch(shot.image)).blob()),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let count=0;for(let y=Math.max(0,Math.floor(shot.point.y-65));y<Math.min(canvas.height,shot.point.y+65);y++)for(let x=Math.max(0,Math.floor(shot.point.x-50));x<Math.min(canvas.width,shot.point.x+50);x++){
      const n=(y*canvas.width+x)*4,r=data[n],g=data[n+1],b=data[n+2];if(r>140&&r>g*1.4&&r>b*1.4)count++;
    }
    return count;
  },shot);
  assert.ok(redPixels>20,`${kind}: victim must visibly flash red in the rendered frame (got ${redPixels} pixels)`);
  return shot;
}

export async function captureMovingSlash(page){
  // Cooldowns use server time; animation age uses rendered frames. On a slow
  // software GPU the earlier combat swing may still be visible after cooldown.
  await page.waitForFunction(()=>{const g=window.__game,p=g.state.players.find(p=>p.id===g.playerId);return p&&p.cooldowns.attack<=g.state.time&&!g.effects.some(e=>e.sourceId===g.playerId&&e.key==='attack');},{},{timeout:30000});
  // Plan a clear ordinary walking direction instead of assuming the player
  // always ends combat beside the same unobstructed patch of ground.
  const positions=await page.evaluate(()=>{const g=window.__game;return [g.state.players.find(p=>p.id===g.playerId),g.entities.find(p=>p.id===g.playerId)].map(p=>({x:p.x,z:p.z}));});
  const directions=[['s',1,1],['w',-1,-1],['a',-1,1],['d',1,-1],['w','d',0,-1],['w','a',-1,0],['s','d',1,0],['s','a',0,1]];
  const clearance=direction=>{
    const x=direction.at(-2),z=direction.at(-1),length=Math.hypot(x,z);let clear=0;
    for(let distance=.15;distance<=3;distance+=.15){if(positions.some(p=>!walkable(p.x+x/length*distance,p.z+z/length*distance)))break;clear=distance;}
    return clear;
  };
  directions.sort((a,b)=>clearance(b)-clearance(a));
  assert.ok(clearance(directions[0])>.3,'Find clear ground for the moving-attack capture');
  const keys=directions[0].slice(0,-2);
  await page.evaluate(()=>{
    window.__movingSlashCapture=new Promise((resolve,reject)=>{
      const frames=[];let started=false;
      const timeout=setTimeout(()=>{stop();reject(new Error('Moving slash capture timed out'));},30000);
      const stop=window.__game.observeFrames(()=>{
        const g=window.__game,effect=g.effects.find(e=>e.sourceId===g.playerId&&e.key==='attack');
        if(effect){
          started=true;const actor=g.entities.find(e=>e.id===g.playerId);
          frames.push({effect,actor,image:document.querySelector('#game').toDataURL('image/png')});
        }else if(started){clearTimeout(timeout);stop();resolve(frames);}
      });
    });
  });
  try{
    // Capture the cast before walking; slow input delivery can otherwise use
    // up the planned clear path before the first captured animation frame.
    await page.keyboard.press('Space');for(const key of keys)await page.keyboard.down(key);
    const frames=await page.evaluate(()=>window.__movingSlashCapture);
    assert.ok(frames.length>=3);
    assert.ok(frames.every(({effect,actor})=>Math.hypot(effect.x-actor.x,effect.z-actor.z)<1e-6&&effect.radius===effect.range));
    for(const [i,frame] of [frames[0],frames[Math.floor(frames.length/2)],frames.at(-1)].entries())await writeFile(`artifacts/moving-slash-${i}.png`,Buffer.from(frame.image.split(',')[1],'base64'));
    await writeFile('artifacts/moving-slash.json',JSON.stringify({positions,keys,clearance:clearance(directions[0]),frames:frames.map(({image,...frame})=>frame)},null,2));
    assert.ok(Math.hypot(frames.at(-1).actor.x-frames[0].actor.x,frames.at(-1).actor.z-frames[0].actor.z)>.2);
  }finally{
    for(const key of keys)await page.keyboard.up(key);await page.keyboard.press('Enter');await page.keyboard.press('Escape');
  }
}
