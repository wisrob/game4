export const PROP_MODELS = ['pine','fern','boulder','log','lantern','dock','wardstone','campfire'];

// Versioned, engine-independent transforms for file edits and a future placement editor.
export function validatePlacements(document) {
  if(document?.version!==1||!Array.isArray(document.props)||document.props.length>5000)throw new Error('Expected placement version 1 and at most 5000 props');
  const ids=new Set();
  const props=document.props.map(p=>{
    if(!p||typeof p.id!=='string'||! /^[a-zA-Z0-9_-]{1,80}$/.test(p.id)||ids.has(p.id))throw new Error('Prop IDs must be unique letters, numbers, hyphens or underscores');
    ids.add(p.id);
    if(!PROP_MODELS.includes(p.model))throw new Error(`Unknown prop model: ${p.model}`);
    for(const key of ['x','y','z','rotation','scale'])if(!Number.isFinite(p[key]))throw new Error(`Invalid ${p.id}.${key}`);
    if(Math.abs(p.x)>44||Math.abs(p.z)>44||Math.abs(p.y)>20||p.scale<=0||p.scale>5)throw new Error(`Prop transform outside world bounds: ${p.id}`);
    if(p.tint!==undefined&&(typeof p.tint!=='string'||!/^#[0-9a-f]{6}$/i.test(p.tint)))throw new Error(`Invalid ${p.id}.tint`);
    return {id:p.id,model:p.model,x:p.x,y:p.y,z:p.z,rotation:p.rotation,scale:p.scale,...(p.tint?{tint:p.tint}:{})};
  });
  return {version:1,props};
}
