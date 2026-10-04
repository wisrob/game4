import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { World } from './simulation.js';
import { readFileSync, watchFile, unwatchFile } from 'node:fs';
import { resolve } from 'node:path';
import { validateConfig } from '../shared/config.js';
import { applyPlacements } from '../shared/world.js';
import { pathToFileURL } from 'node:url';
export function startServer(port=Number(process.env.GAME_PORT||3001)) {
  const world=new World();
  const settings=resolve('settings.json');
  function loadSettings(){try{world.config=validateConfig(JSON.parse(readFileSync(settings,'utf8'))).gameplay;}catch(e){console.error('Keeping last valid gameplay settings:',e.message);}}
  loadSettings();watchFile(settings,{interval:250},loadSettings);
  const placements=resolve('placements.json');
  function loadPlacements(){try{applyPlacements(JSON.parse(readFileSync(placements,'utf8')));}catch(e){console.error('Keeping last valid prop placements:',e.message);}}
  loadPlacements();watchFile(placements,{interval:250},loadPlacements);
  const http=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,players:world.players.size,time:world.time}));});
  const wss=new WebSocketServer({server:http,path:'/ws',maxPayload:2048});
  wss.on('connection',ws=>{ if(world.players.size>=64){ws.close(1013,'World full');return;} const p=world.join(); let budget=120,last=Date.now(); ws.send(JSON.stringify({type:'welcome',id:p.id})); ws.on('message',raw=>{const now=Date.now();budget=Math.min(120,budget+(now-last)*.06);last=now;if(--budget<0){ws.close(1008,'Rate limit');return;} try{const msg=JSON.parse(raw.toString());if(msg.type==='input')world.input(p.id,msg);if(msg.type==='ability')world.ability(p.id,msg.key);if(msg.type==='chat'&&typeof msg.text==='string'&&now-(p.chatAt||0)>800){p.chatAt=now;const text=msg.text.trim().slice(0,160);if(text)broadcast({type:'chat',name:p.name,text});}}catch{/* Malformed messages never escape the connection handler. */}});ws.on('close',()=>world.players.delete(p.id));ws.on('error',()=>{}); });
  function broadcast(data){const s=JSON.stringify(data);for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<65536)ws.send(s);}
  let count=0; const timer=setInterval(()=>{world.tick(.05);if(++count%2===0)broadcast(world.snapshot());},50);
  http.listen(port,'127.0.0.1',()=>console.log(`World server listening on http://127.0.0.1:${http.address().port}`));
  return {world,http,wss,close:()=>{clearInterval(timer);unwatchFile(settings,loadSettings);unwatchFile(placements,loadPlacements);for(const ws of wss.clients)ws.terminate();wss.close();http.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) startServer();
