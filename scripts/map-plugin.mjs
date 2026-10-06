import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { compileMap } from '../shared/map.js';
export function mapPlugin(){
  const path=resolve('world/map.json');let queue=Promise.resolve(),cached,source;
  const revision=s=>createHash('sha256').update(s).digest('hex');
  async function read(){const s=await readFile(path,'utf8');if(source!==s){cached=compileMap(JSON.parse(s));source=s;}return {document:cached.map,revision:revision(s)};}
  return {name:'large-world-map',async buildStart(){await read();},configureServer(server){
    server.middlewares.use(async(req,res,next)=>{
      const url=new URL(req.url,'http://local');if(url.pathname!=='/__map'&&url.pathname!=='/world/manifest.json'&&!url.pathname.startsWith('/world/chunks/'))return next();
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
      try{const current=await read();
        if(req.method==='GET'){
          if(url.pathname==='/__map')return res.end(JSON.stringify(current));
          if(url.pathname==='/world/manifest.json')return res.end(JSON.stringify({version:1,map:cached.map,chunks:[...cached.chunks.keys()],propCount:cached.props.length,revision:current.revision}));
          const key=decodeURIComponent(url.pathname).match(/^\/world\/chunks\/(-?\d+,-?\d+)\.json$/)?.[1],chunk=cached.chunks.get(key);if(!chunk){res.statusCode=404;return res.end('{}');}return res.end(JSON.stringify(chunk));
        }
        if(url.pathname!=='/__map'||req.method!=='PUT'){res.statusCode=405;return res.end('{}');}
        if(req.headers.origin!==`http://${req.headers.host}`){res.statusCode=403;return res.end(JSON.stringify({error:'Same-origin editor only'}));}
        let body='';for await(const part of req){body+=part;if(body.length>2000000)throw new Error('Map too large');}const payload=JSON.parse(body),compiled=compileMap(payload.document);
        const save=queue.then(async()=>{if(payload.revision!==(await read()).revision){res.statusCode=409;return res.end(JSON.stringify({error:'Map changed on disk. Export your draft and reload before saving.'}));}const s=JSON.stringify(compiled.map,null,2)+'\n';await writeFile(path+'.tmp',s);await rename(path+'.tmp',path);res.end(JSON.stringify(await read()));});queue=save.catch(()=>{});await save;
      }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
    });
  },async handleHotUpdate({file,server}){if(resolve(file)!==path)return;try{await read();server.ws.send({type:'custom',event:'large-world-map',data:{revision:revision(source)}});return [];}catch{return [];}},async generateBundle(){await read();this.emitFile({type:'asset',fileName:'world/manifest.json',source:JSON.stringify({version:1,map:cached.map,chunks:[...cached.chunks.keys()],propCount:cached.props.length})});for(const [key,chunk] of cached.chunks)this.emitFile({type:'asset',fileName:`world/chunks/${key}.json`,source:JSON.stringify(chunk)});}};
}
