import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { validatePlacements } from '../shared/placements.js';

export function placementsPlugin() {
  const path=resolve('placements.json');
  async function read(){const source=await readFile(path,'utf8');validatePlacements(JSON.parse(source));return source;}
  const revision=source=>createHash('sha256').update(source).digest('hex');
  let queue=Promise.resolve();
  return {
    name:'world-prop-placements',
    async buildStart(){await read();},
    configureServer(server){
      server.middlewares.use('/__placements',async(req,res)=>{
        res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
        try{
          if(req.method==='GET'){const source=await read();res.end(JSON.stringify({document:JSON.parse(source),revision:revision(source)}));return;}
          if(req.method!=='PUT'){res.statusCode=405;res.end('{}');return;}
          if(req.headers.origin!==`http://${req.headers.host}`){res.statusCode=403;res.end(JSON.stringify({error:'Same-origin editor only'}));return;}
          let body='';for await(const chunk of req){body+=chunk;if(body.length>2000000)throw new Error('Placements too large');}
          const payload=JSON.parse(body),document=validatePlacements(payload.document);
          const save=queue.then(async()=>{
            if(payload.revision!==revision(await read())){res.statusCode=409;res.end(JSON.stringify({error:'File changed. Reload props before saving.'}));return;}
            const source=JSON.stringify(document,null,2)+'\n';await writeFile(path+'.tmp',source);await rename(path+'.tmp',path);
            res.end(JSON.stringify({document,revision:revision(source)}));
          });queue=save.catch(()=>{});await save;
        }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}
      });
    },
    async handleHotUpdate({file,server}){
      if(resolve(file)!==path)return;
      try{const source=await read();server.ws.send({type:'custom',event:'world-placements',data:{document:JSON.parse(source),revision:revision(source)}});return [];}catch(error){
        server.ws.send({type:'custom',event:'world-placements-error',data:{message:error.message}});
        return []; // Keep the existing scene when a partially written file is invalid.
      }
    },
    async generateBundle(){this.emitFile({type:'asset',fileName:'placements.json',source:await read()});}
  };
}
