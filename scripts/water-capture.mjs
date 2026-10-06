import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function captureWaterClose(page,checks){
  await mkdir('artifacts/water',{recursive:true});
  // Approach the lake using normal movement; keep the fixed follow camera.
  await page.keyboard.down('d');
  try{await page.waitForFunction(()=>{const g=window.__game;return g.state.players.find(p=>p.id===g.playerId)?.x>=5;});}
  finally{await page.keyboard.up('d');await page.keyboard.press('Enter');await page.keyboard.press('Escape');}
  await page.mouse.move(720,480);await page.mouse.wheel(0,-10000);
  await page.waitForFunction(()=>window.__game.camera.zoom===window.__game.config.camera.maxZoom);
  await page.waitForTimeout(1500);
  await page.screenshot({path:'artifacts/water/shore-close.png'});
  await page.locator('#settings').click();
  for(const [key,value] of Object.entries({speed:0,waveHeight:0,shimmer:0,transmission:0,reflection:0,foamStrength:1})){
    const input=page.locator(`#setting-water-${key}`);await input.fill(String(value));await input.dispatchEvent('input');
    await page.waitForFunction(({key,value})=>window.__game.config.water[key]===value,{key,value});
  }
  await page.locator('#close-editor').click();
  await page.screenshot({path:'artifacts/water/shore-close-foam.png'});
  const metrics=await page.evaluate(()=>window.__game.metrics);
  assert.ok(metrics.drawCalls<200&&metrics.triangles<150000,'Close-up water must remain within scene render budgets');
  checks.push('Walked to lake and inspected shoreline foam at maximum fixed-camera zoom');
}

export async function captureWaterReview(page,original,checks){
  await mkdir('artifacts/water',{recursive:true});
  await page.mouse.move(720,480);await page.mouse.wheel(0,10000);
  await page.waitForFunction(()=>window.__game.camera.zoom===window.__game.config.camera.minZoom);
  await page.locator('#settings').click();
  const set=async(domain,key,value)=>{
    const input=page.locator(`#setting-${domain}-${key}`);await input.fill(String(value));await input.dispatchEvent('input');
    await page.waitForFunction(({domain,key,value})=>window.__game.config[domain][key]===value,{domain,key,value});
  };
  const capture=async label=>{
    const shot=await page.evaluate(()=>new Promise(resolve=>{
      const stop=window.__game.observeFrames(()=>{
        stop();const game=window.__game,canvas=document.querySelector('#game');
        // Pixels from the WebGL canvas, with editor/HUD excluded.
        const crop=document.createElement('canvas');crop.width=600;crop.height=430;
        const center=game.project(14,-7,.15),ctx=crop.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(canvas,center.x-300,center.y-215,600,430,0,0,600,430);
        const pixels=ctx.getImageData(0,0,600,430).data,samples=[],foamSamples=[],deepSamples=[],rockSamples=[];
        for(let z=-11;z<=-3;z+=.4)for(let x=10;x<=18;x+=.4){
          const p=game.project(x,z,.15),sx=Math.round(p.x-center.x+300),sy=Math.round(p.y-center.y+215),i=(sy*600+sx)*4;
          if(sx>=0&&sx<600&&sy>=0&&sy<430)samples.push(...pixels.slice(i,i+3));
        }
        const lakeRocks=game.placements.filter(p=>p.model==='boulder'&&Math.hypot(p.x-14,p.z+7)<5.5);
        for(let z=-14;z<=0;z+=.2)for(let x=7;x<=21;x+=.2){
          const radius=Math.hypot(x-14,z+7);if(radius>7.3)continue;
          const p=game.project(x,z,.15),sx=Math.round(p.x-center.x+300),sy=Math.round(p.y-center.y+215),i=(sy*600+sx)*4;
          if(sx<0||sx>=600||sy<0||sy>=430)continue;
          const rgb=pixels.slice(i,i+3);foamSamples.push(...rgb);
          if(lakeRocks.some(rock=>Math.hypot(x-rock.x,z-rock.z)<rock.scale*1.5))rockSamples.push(...rgb);
          else if(radius<3)deepSamples.push(...rgb);
        }
        resolve({image:crop.toDataURL('image/png'),samples,foamSamples,deepSamples,rockSamples,metrics:game.metrics});
      });
    }));
    await writeFile(`artifacts/water/${label}.png`,Buffer.from(shot.image.split(',')[1],'base64'));return shot;
  };
  const delta=(a,b)=>a.samples.reduce((sum,v,i)=>sum+Math.abs(v-b.samples[i]),0)/a.samples.length;
  const sampleDelta=(a,b,key)=>a[key].reduce((sum,v,i)=>sum+Math.abs(v-b[key][i]),0)/a[key].length;
  const animated=await capture('default-1');await page.waitForTimeout(1100);const animated2=await capture('default-2');
  assert.ok(delta(animated,animated2)>.5,'Surface shimmer must change rendered water pixels over time');
  await set('water','speed',0);await set('water','waveHeight',0);await set('water','shimmer',0);await set('water','opacity',1);
  await set('water','transmission',0);await set('water','reflection',0);await set('water','foamStrength',0);
  const noFoam=await capture('no-foam');
  await set('water','foamDistance',.5);await set('water','foamStrength',1);const contactFoam=await capture('contact-foam');
  assert.ok(sampleDelta(noFoam,contactFoam,'foamSamples')>1,'Depth contacts must visibly foam');
  assert.ok(sampleDelta(noFoam,contactFoam,'rockSamples')>.2,'Interior rock contacts must foam independently of the shoreline radius');
  assert.ok(sampleDelta(noFoam,contactFoam,'deepSamples')<.5,'Deep open water must remain free of contact foam');
  await set('water','foamDistance',1);const wideFoam=await capture('wide-foam');
  assert.ok(sampleDelta(contactFoam,wideFoam,'foamSamples')>1,'Foam distance must widen the depth contact band');
  await set('water','foamStrength',0);await set('water','reflection',original.water.reflection);await set('water','transmission',original.water.transmission);
  await set('water','absorption',0);await set('water','scattering',0);
  const clear=await capture('clear');await set('water','absorption',3);const absorbed=await capture('absorption');
  assert.ok(delta(clear,absorbed)>3,'Absorption must change submerged light');
  await set('water','scattering',1);const scattered=await capture('scattering');
  assert.ok(delta(absorbed,scattered)>2,'Scattering must change depth haze');
  await set('water','transmission',0);const opaque=await capture('no-transmission');
  assert.ok(delta(scattered,opaque)>2,'Transmission must change visible lake-bed light');
  // Align the sun with the physical reflection direction through normal sliders.
  await page.locator('#editor summary').filter({hasText:/^lighting$/}).click();
  for(const [key,value] of Object.entries({sunX:-24,sunHeight:28,sunZ:-24,sunIntensity:6}))await set('lighting',key,value);
  await set('water','reflection',0);const matte=await capture('no-reflection');
  await set('water','reflection',1);const sun=await capture('sun-reflection');
  assert.ok(delta(matte,sun)>2,'Aligned sunlight must visibly reflect');
  await set('water','roughness',.5);const rough=await capture('rough');
  assert.ok(delta(sun,rough)>1,'Roughness must change sunlight spread');
  await set('water','ior',1);await set('water','reflection',0);const noInterface=await capture('ior-one');
  await set('water','reflection',3);const noInterfaceReflect=await capture('ior-one-reflection');
  assert.ok(delta(noInterface,noInterfaceReflect)<.2,'IOR 1 must remove interface reflection');
  await set('water','ior',original.water.ior);await set('water','reflection',original.water.reflection);
  await set('water','transmission',1);await set('water','absorption',0);await set('water','scattering',0);
  await set('water','waveHeight',.08);await set('water','shimmer',.65);await set('water','refraction',0);const straight=await capture('no-refraction');
  await set('water','refraction',2);const refracted=await capture('refraction');
  assert.ok(delta(straight,refracted)>1,'Refraction must visibly distort submerged scenery');
  // Restore through the editor, and verify the new optics survive a real save.
  await page.locator('#reload-config').click();
  await set('water','ior',1.4);await set('water','transmission',.82);await set('water','foamDistance',.65);await set('water','foamStrength',.85);await page.locator('#save-config').click();
  await page.getByText('Saved to settings.json',{exact:true}).waitFor();
  const saved=await page.evaluate(async()=>{const r=await fetch('/__settings');return (await r.json()).config;});
  assert.equal(saved.water.ior,1.4);assert.equal(saved.water.transmission,.82);
  assert.equal(saved.water.foamDistance,.65);assert.equal(saved.water.foamStrength,.85);
  await set('water','ior',original.water.ior);await set('water','transmission',original.water.transmission);
  await set('water','foamDistance',original.water.foamDistance);await set('water','foamStrength',original.water.foamStrength);
  const final=await capture('default');await page.locator('#close-editor').click();
  await page.screenshot({path:'artifacts/water.png'});
  const shots=[animated,animated2,noFoam,contactFoam,wideFoam,clear,absorbed,scattered,opaque,matte,sun,rough,straight,refracted,final];
  assert.ok(shots.every(s=>s.metrics.drawCalls<200&&s.metrics.triangles<150000),`Scene + refraction render budget: ${JSON.stringify(shots.map(s=>s.metrics))}`);
  const report={animationDelta:delta(animated,animated2),foamDelta:sampleDelta(noFoam,contactFoam,'foamSamples'),rockFoamDelta:sampleDelta(noFoam,contactFoam,'rockSamples'),deepFoamDelta:sampleDelta(noFoam,contactFoam,'deepSamples'),absorptionDelta:delta(clear,absorbed),scatteringDelta:delta(absorbed,scattered),reflectionDelta:delta(matte,sun),refractionDelta:delta(straight,refracted),metrics:final.metrics};
  await writeFile('artifacts/water/report.json',JSON.stringify(report,null,2));
  checks.push('Rendered pixels verify animated shimmer, sunlight reflection, roughness, transmission, absorption, scattering, and refraction');
  checks.push('Optics sliders preview and save; main view plus underwater capture stay within scene render budgets');
  checks.push('Depth foam appears at banks and interior rocks, stays out of deep water, and widens with foam distance');
}
