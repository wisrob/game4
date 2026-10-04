import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateConfig } from '../shared/config.js';
// Dev-only, same-origin settings API. Production builds ship a static copy.
export function configPlugin() {
  const path=resolve('settings.json'); let revision=0;
  return { name:'live-world-settings',
    configureServer(server) {
      server.watcher.add(path);
      server.watcher.on('change',async file=>{if(resolve(file)!==path)return;try { const config=validateConfig(JSON.parse(await readFile(path,'utf8'))); revision++;server.ws.send({type:'custom',event:'world-config',data:{config,revision}}); } catch(e) {server.ws.send({type:'custom',event:'world-config-error',data:{message:e.message}});} });
      server.middlewares.use('/__settings',async (req,res)=>{
        res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
        try {
          if(req.method==='GET') {res.end(JSON.stringify({config:validateConfig(JSON.parse(await readFile(path,'utf8'))),revision}));return;}
          if(req.method!=='PUT'){res.statusCode=405;res.end('{}');return;}
          const origin=req.headers.origin;if(origin!==`http://${req.headers.host}`){res.statusCode=403;res.end(JSON.stringify({error:'Same-origin editor only'}));return;}
          let body='';for await(const chunk of req){body+=chunk;if(body.length>16000)throw new Error('Settings too large');}
          const payload=JSON.parse(body);if(payload.revision!==revision){res.statusCode=409;res.end(JSON.stringify({error:'File changed. Reload settings before saving.'}));return;}
          const config=validateConfig(payload.config);await writeFile(path+'.tmp',JSON.stringify(config,null,2)+'\n');await rename(path+'.tmp',path);revision++;
          server.ws.send({type:'custom',event:'world-config',data:{config,revision}});res.end(JSON.stringify({config,revision}));
        }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
      });
    },
    async generateBundle(){this.emitFile({type:'asset',fileName:'settings.json',source:await readFile(path,'utf8')});}
  };
}
