// One schema drives validation, JSON loading, and all editor controls.
export const SCHEMA = {
  water: { color: ['color'], highlight: ['color'], speed: [0,3,.05], waveHeight: [0,.4,.01], scale: [.5,8,.1] },
  grass: { color: ['color'], tipColor: ['color'], density: [0,18000,500], height: [.1,1.5,.05], wind: [0,1,.01], speed: [0,4,.1] },
  lighting: { sunColor: ['color'], sunIntensity: [0,6,.1], ambientColor: ['color'], ambientGroundColor: ['color'], ambientIntensity: [0,5,.1], fogColor: ['color'], fogNear: [10,60,1], fogFar: [40,120,1], exposure: [.3,2,.05] },
  terrain: { color: ['color'], pathColor: ['color'] },
  camera: { distance: [12,40,1], angle: [30,70,1], zoom: [.6,1.8,.05] },
  gameplay: { moveSpeed: [2,12,.25], enemySpeed: [0,5,.1], enemyDamage: [0,20,1] },
  performance: { pixelRatio: [.75,2,.25], shadows: ['boolean'] }
};
export function validateConfig(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Settings must be a JSON object.');
  const clean={};
  for(const [domain,fields] of Object.entries(SCHEMA)) {
    clean[domain]={};
    for(const [key,rule] of Object.entries(fields)) {
      const v=value[domain]?.[key];
      if(rule[0]==='color' ? typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v) : rule[0]==='boolean' ? typeof v!=='boolean' : typeof v!=='number'||!Number.isFinite(v)||v<rule[0]||v>rule[1]) throw new Error(`Invalid ${domain}.${key}`);
      clean[domain][key]=v;
    }
  }
  if(clean.lighting.fogFar<=clean.lighting.fogNear) throw new Error('Fog far must be greater than fog near.');
  return clean;
}
