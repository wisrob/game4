// One schema drives validation, JSON loading, and all editor controls.
export const SCHEMA = {
  water: { color: ['color'], highlight: ['color'], opacity: [0,1,.01], transmission: [0,1,.01], ior: [1,2,.001], refraction: [0,2,.05], absorptionColor: ['color'], absorption: [0,5,.05], scattering: [0,2,.01], roughness: [.05,1,.01], reflection: [0,3,.05], shimmer: [0,2,.05], foamColor: ['color'], foamStrength: [0,1,.05], foamDistance: [.05,2,.05], speed: [0,3,.05], waveHeight: [0,.4,.01], scale: [.5,8,.1] },
  grass: { color: ['color'], tipColor: ['color'], density: [0,18000,500], height: [.1,1.5,.05], wind: [0,1,.01], speed: [0,4,.1] },
  lighting: { sunColor: ['color'], sunIntensity: [0,6,.1], sunX: [-40,40,1], sunHeight: [2,60,1], sunZ: [-40,40,1], ambientColor: ['color'], ambientGroundColor: ['color'], ambientIntensity: [0,5,.1], fogColor: ['color'], fogNear: [10,60,1], fogFar: [40,120,1], exposure: [.3,2,.05] },
  terrain: { color: ['color'], pathColor: ['color'] },
  camera: { minZoom: [.3,3,.05], maxZoom: [.3,3,.05], angle: [30,70,1] },
  characters: { playerScale: [.8,1.4,.05] },
  postProcessing: { enabled: ['boolean'], brightness: [.5,1.5,.01], contrast: [.5,1.5,.01], saturation: [0,1.5,.01] },
  gameplay: { moveSpeed: [2,12,.25], enemySpeed: [0,5,.1], enemyDamage: [0,20,1], attackArcDegrees: [10,360,5], skillArcDegrees: [10,360,5], attackRange: [.5,6,.05], skillRange: [.5,6,.05], mobAttackRange: [.5,6,.05] },
  performance: { pixelRatio: [.75,2,.25], shadows: ['boolean'] },
  streaming: { radius: [1,2,1], grassPerChunk: [0,1800,100] }
};
export const POST_PROCESSING_HELP={
  enabled:'Apply color grading to the world view. The HUD is unaffected.',
  brightness:'Overall brightness after tone mapping. 1 leaves brightness unchanged.',
  contrast:'Separation between lights and darks. 1 leaves contrast unchanged.',
  saturation:'Color intensity. 0 is grayscale; 1 leaves saturation unchanged.'
};
export const WATER_HELP={
  color:'Color of scattered light and the non-transmitting water body.',
  highlight:'Sky reflection and shoreline foam color.',
  opacity:'Surface coverage. 0 hides the water; 1 uses the full optical result. Use transmission for clarity.',
  transmission:'How much submerged light passes through the surface before absorption and scattering.',
  ior:'Index of refraction. 1 has no interface bending or Fresnel reflection; water defaults to 1.333.',
  refraction:'Strength of submerged-image distortion. 0 disables bending; 1 uses the optical ray; 2 exaggerates it.',
  absorptionColor:'Channels absorbed by water. More red removes more red light, leaving cooler transmitted light.',
  absorption:'Absorption coefficient per world unit. Deeper water loses more light exponentially.',
  scattering:'Scattering coefficient per world unit. Higher values add colored haze and reduce lake-bed clarity.',
  roughness:'Sun reflection spread. Low values give sharp glints; high values give broad, soft highlights.',
  reflection:'Multiplier for Fresnel sky reflection and the sun highlight. 1 is the default optical response.',
  shimmer:'Strength of animated small surface ripples that break sunlight into moving glints.',
  foamColor:'Color of contact foam around shallow ground, rocks, and dock piles.',
  foamStrength:'Contact foam visibility. 0 disables foam.',
  foamDistance:'Maximum vertical depth gap for contact foam, in world units. Higher values widen the contact band.'
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
  if(clean.camera.maxZoom<clean.camera.minZoom) throw new Error('Camera max zoom must be greater than or equal to min zoom.');
  if(!Number.isInteger(clean.streaming.radius)||!Number.isInteger(clean.streaming.grassPerChunk))throw new Error('Streaming radius and grass count must be integers.');
  return clean;
}
