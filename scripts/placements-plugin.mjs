import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validatePlacements } from '../shared/placements.js';

export function placementsPlugin() {
  const path=resolve('placements.json');
  async function read(){const source=await readFile(path,'utf8');validatePlacements(JSON.parse(source));return source;}
  return {
    name:'world-prop-placements',
    async buildStart(){await read();},
    async handleHotUpdate({file,server}){
      if(resolve(file)!==path)return;
      try{await read();}catch(error){
        server.ws.send({type:'custom',event:'world-placements-error',data:{message:error.message}});
        return []; // Keep the existing scene when a partially written file is invalid.
      }
    },
    async generateBundle(){this.emitFile({type:'asset',fileName:'placements.json',source:await read()});}
  };
}
