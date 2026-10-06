import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { resolve } from 'node:path';

// Keep Vite alive while replacing the backend process and its entire module graph.
export function startWatchedServer({cwd=process.cwd(),entry='server/index.js',directories=['server','shared'],env=process.env,stdio='inherit',onStart=()=>{}}={}) {
  let child,timer,stopped=false,restarting=false,again=false;
  function launch(){
    child=spawn(process.execPath,[resolve(cwd,entry)],{cwd,env,stdio,windowsHide:true});
    child.on('error',error=>console.error('Backend process error:',error.message));
    onStart(child);
  }
  async function terminate(){
    if(!child||child.exitCode!==null||child.signalCode!==null)return;
    const current=child;await new Promise(resolve=>{current.once('exit',resolve);current.kill();});
  }
  async function restart(){
    if(stopped)return;
    if(restarting){again=true;return;}
    restarting=true;
    try{console.log('Backend code changed · restarting server (in-memory progress resets)');await terminate();if(!stopped)launch();}
    finally{restarting=false;if(again){again=false;void restart();}}
  }
  const watchers=directories.map(directory=>watch(resolve(cwd,directory),{recursive:true},(_event,file)=>{
    if(stopped||!file?.endsWith('.js'))return;
    clearTimeout(timer);timer=setTimeout(()=>void restart(),120);
  }));
  launch();
  return {get pid(){return child?.pid;},async close(){stopped=true;clearTimeout(timer);for(const watcher of watchers)watcher.close();await terminate();}};
}
