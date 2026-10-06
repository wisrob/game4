import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import WebSocket from 'ws';
import { startWatchedServer } from '../scripts/server-watch.mjs';

test('development watcher reloads backend and shared code and disconnects the old session', {timeout:30000},async()=>{
  await mkdir('artifacts',{recursive:true});const fixture=await mkdtemp(resolve('artifacts','reload-test-'));
  let watcher;const sockets=[],launches=[];
  const waitFor=async predicate=>{const deadline=Date.now()+10000;while(!predicate()){if(Date.now()>deadline)throw new Error('Backend reload timed out');await new Promise(r=>setTimeout(r,25));}};
  const connect=port=>new Promise((resolve,reject)=>{
    const socket=new WebSocket(`ws://127.0.0.1:${port}/ws`);sockets.push(socket);socket.once('error',reject);
    socket.on('message',raw=>{const data=JSON.parse(raw);if(data.type==='state')resolve({socket,state:data});});
  });
  try{
    for(const path of ['server','shared','world','settings.json','placements.json'])await cp(path,join(fixture,path),{recursive:true});
    watcher=startWatchedServer({cwd:fixture,env:{...process.env,GAME_PORT:'0'},stdio:['ignore','pipe','pipe'],onStart(child){
      launches.push(new Promise((resolve,reject)=>{
        let output='';child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);if(match)resolve(Number(match[1]));});
        child.stderr.on('data',chunk=>{output+=chunk;});child.once('error',reject);child.once('exit',code=>{if(code)reject(new Error(output));});
      }));
    }});
    const first=await connect(await launches[0]);assert.equal(first.state.players[0].name,'Wanderer');
    const simulation=join(fixture,'server','simulation.js');const original=await readFile(simulation,'utf8');
    await writeFile(simulation,original.replace("join(name='Wanderer')","join(name='Reloaded')"));
    await waitFor(()=>launches.length>=2);const second=await connect(await launches.at(-1));assert.equal(second.state.players[0].name,'Reloaded');
    await waitFor(()=>first.socket.readyState===WebSocket.CLOSED);
    const world=join(fixture,'shared','world.js');await writeFile(world,(await readFile(world,'utf8')).replace('SPAWN = { x: 0, z: 4 }','SPAWN = { x: 1, z: 4 }'));
    await waitFor(()=>launches.length>=3);const third=await connect(await launches.at(-1));assert.equal(third.state.players[0].x,1);assert.notEqual(third.state.players[0].id,second.state.players[0].id);
    await waitFor(()=>second.socket.readyState===WebSocket.CLOSED);
  }finally{for(const socket of sockets)socket.terminate();await watcher?.close();await rm(fixture,{recursive:true,force:true});}
});
