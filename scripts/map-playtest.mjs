import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
export async function testOpenWorld(page,context,checks){
  const original=await readFile('world/map.json','utf8'),startMetrics=await page.evaluate(()=>window.__game.metrics);const editor=await context.newPage();let edited=false;
  editor.on('pageerror',e=>{throw e;});
  try{
    await editor.goto('http://127.0.0.1:5174/map-editor.html');await editor.locator('#status').filter({hasText:'Loaded world/map.json'}).waitFor();
    await editor.screenshot({path:'artifacts/map-studio.png'});
    await editor.locator('#selection').selectOption('frostlands');const coordinate=editor.getByLabel('Vertex 1 X');const old=await coordinate.inputValue();await coordinate.fill('76');await coordinate.dispatchEvent('change');
    await editor.locator('#undo').click();assert.equal(await editor.getByLabel('Vertex 1 X').inputValue(),old);await editor.locator('#redo').click();assert.equal(await editor.getByLabel('Vertex 1 X').inputValue(),'76');await editor.locator('#undo').click();
    await editor.locator('#tool').selectOption('region');await editor.locator('#material').selectOption('rock');const box=await editor.locator('#atlas').boundingBox();
    for(const [x,y] of [[.66,.65],[.74,.65],[.74,.73],[.66,.73]])await editor.mouse.click(box.x+box.width*x,box.y+box.height*y);
    await editor.locator('#finish').click();await editor.locator('#density').fill('250');await editor.locator('#scatter').click();await editor.locator('#status').filter({hasText:'Placement generated'}).waitFor();
    const save=editor.waitForResponse(r=>r.url().endsWith('/__map')&&r.request().method()==='PUT');edited=true;await editor.locator('#save').click();assert.equal((await save).status(),200);await editor.locator('#status').filter({hasText:'Saved world/map.json'}).waitFor();
    const saved=JSON.parse(await readFile('world/map.json','utf8'));assert.equal(saved.regions.length,JSON.parse(original).regions.length+1);assert.ok(saved.scatter.some(s=>s.density===250));assert.equal(saved.regions.find(r=>r.id==='frostlands').material,'snow','Creation controls must not alter the previous selection');
    await editor.screenshot({path:'artifacts/map-studio-edit.png'});checks.push('Separate editor draws regions, edits precise coordinates, undoes/redoes, scatters biome props and saves map source');
    if(process.argv.includes('--editor-only'))return startMetrics;
    await page.close();await writeFile('world/map.json',original);await editor.waitForTimeout(800);await editor.close();
    page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://127.0.0.1:5174');await page.waitForFunction(()=>window.__game?.ready);await page.setViewportSize({width:960,height:640});
    await page.waitForFunction(()=>window.__game.streaming.loaded.length===9&&!window.__game.streaming.pending.length);
    const travelQuality=async()=>{await page.locator('#settings').click();await page.locator('#setting-grass-density').focus();await page.keyboard.press('Home');if(!await page.locator('#setting-performance-shadows').isVisible())await page.locator('#editor summary').filter({hasText:/^performance$/}).click();await page.locator('#setting-performance-shadows').setChecked(false);await page.locator('#close-editor').click();};
    const captureQuality=async()=>{await page.locator('#settings').click();await page.locator('#reload-config').click();await page.locator('#close-editor').click();await page.waitForTimeout(500);};
    await travelQuality();
    const initial=await page.evaluate(()=>window.__game.streaming);
    const walk=async(x,z)=>{const deadline=Date.now()+120000;while(Date.now()<deadline){const p=await page.evaluate(()=>{const g=window.__game;return g.state.players.find(p=>p.id===g.playerId);});const distance=Math.hypot(x-p.x,z-p.z);if(distance<.6)return;const step=Math.min(6,distance),target={x:p.x+(x-p.x)*step/distance,z:p.z+(z-p.z)*step/distance};const screen=await page.evaluate(p=>window.__game.project(p.x,p.z),target);await page.mouse.click(screen.x,screen.y);if(p.hp<80)await page.keyboard.press('e');await page.waitForTimeout(450);}console.error(JSON.stringify({destination:{x,z},players:await page.evaluate(()=>window.__game.state.players)}));await page.screenshot({path:'artifacts/map-travel-failure.png'});throw new Error(`Could not walk to ${x},${z}`);};
    await walk(0,-2);for(let x=-3;x>=-42;x-=3)await walk(x,-2+Math.sin(x*.15)*2);await walk(-80,0);await walk(-100,0);
    await page.waitForFunction(()=>window.__game.streaming.loaded.length===9&&!window.__game.streaming.pending.length);const west=await page.evaluate(()=>window.__game.streaming);assert.ok(west.totalUnloaded>0);assert.ok(west.totalLoaded>initial.totalLoaded);assert.ok(west.loaded.every(k=>Number(k.split(',')[0])<0));
    await captureQuality();await page.screenshot({path:'artifacts/open-world-town.png'});await travelQuality();console.log('Open-world town reached; chunks loaded and evicted.');checks.push('Player walks past the old boundary into a town; new chunks load and old chunks unload');
    if(process.argv.includes('--coast-only')){await walk(-130,0);await walk(-155,40);await walk(-170,100);await walk(-210,150);await walk(-240,190);await walk(-268,196);await page.waitForFunction(()=>window.__game.streaming.loaded.length===9&&!window.__game.streaming.pending.length);await captureQuality();await page.screenshot({path:'artifacts/open-world-coast.png'});const metrics=await page.evaluate(()=>window.__game.metrics);assert.ok(metrics.drawCalls<200);assert.ok(metrics.triangles<150000);assert.equal(await page.evaluate(()=>window.__game.streaming.error),null);assert.deepEqual(errors,[]);checks.push('Normal coastal road travel loads sand, palm groves and procedural shoreline water');return metrics;}
    await walk(-80,0);for(let x=-42;x<=0;x+=3)await walk(x,-2+Math.sin(x*.15)*2);for(let z=-5;z>=-44;z-=3)await walk(Math.sin(z*.12)*2,z);await walk(0,-70);await walk(20,-100);await walk(55,-130);await walk(90,-160);await walk(150,-190);
    await page.waitForFunction(()=>window.__game.streaming.loaded.length===9&&!window.__game.streaming.pending.length);await captureQuality();await page.screenshot({path:'artifacts/open-world-snow.png'});const metrics=await page.evaluate(()=>window.__game.metrics);assert.ok(metrics.drawCalls<200);assert.ok(metrics.triangles<150000);assert.equal(await page.evaluate(()=>window.__game.streaming.error),null);checks.push('Normal road travel reaches snowy trees and houses while retaining nine chunks within render budgets');
    assert.deepEqual(errors,[]);return metrics;
  }finally{if(edited)await writeFile('world/map.json',original);if(!editor.isClosed()){editor.on('dialog',d=>d.accept());await editor.close();}}
}
