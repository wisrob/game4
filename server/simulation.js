import { randomUUID } from 'node:crypto';
import { SPAWN, MOB_SPAWNS, PROPS, move } from '../shared/world.js';
export const ABILITIES = { attack: { cooldown: .55, damage: 24 }, nova: { cooldown: 5, damage: 38 }, heal: { cooldown: 9 } };
export class World {
  constructor() { this.config={moveSpeed:6,enemySpeed:2.1,enemyDamage:8,attackArcDegrees:120,skillArcDegrees:150,attackRange:1.5,skillRange:1.9,mobAttackRange:1.15}; this.players=new Map(); this.time=0; this.events=[]; this.mobs=MOB_SPAWNS.map(([x,z],i)=>({id:`mob-${i}`,x,z,homeX:x,homeZ:z,hp:60,respawn:0,hitAt:0})); }
  join(name='Wanderer') { const p={id:randomUUID(), name:String(name).slice(0,20),...SPAWN,hp:100,xp:0,gold:0,kills:0,quest:false,level:1,angle:0, input:{x:0,z:0}, cooldowns:{attack:0,nova:0,heal:0}}; this.players.set(p.id,p); return p; }
  input(id,data) { const p=this.players.get(id); if(!p) return; const x=Number(data.x),z=Number(data.z); if(!Number.isFinite(x)||!Number.isFinite(z)) return; const length=Math.max(1,Math.hypot(x,z)); p.input={x:x/length,z:z/length}; p.inputAt=this.time; }
  ability(id,key) {
    const p=this.players.get(id),a=ABILITIES[key];
    if(!p||!a||p.cooldowns[key]>this.time||p.hp<=0) return false;
    p.cooldowns[key]=this.time+a.cooldown;
    const arcDegrees=key==='attack'?this.config.attackArcDegrees:this.config.skillArcDegrees;
    const range=key==='attack'?this.config.attackRange:this.config.skillRange;
    const slashVariant=key==='heal'?undefined:((p.slashCount??0)%3);if(key!=='heal')p.slashCount=(p.slashCount??0)+1;
    this.events.push({type:'ability',id,key,x:p.x,z:p.z,angle:p.angle,range:key==='heal'?undefined:range,radius:key==='heal'?undefined:range,slashVariant,arcDegrees:key==='heal'?undefined:arcDegrees});
    if(key==='heal') { p.hp=Math.min(100,p.hp+40); return true; }
    const halfArc=arcDegrees*Math.PI/360;
    for(const m of this.mobs) {
      const dx=m.x-p.x,dz=m.z-p.z,distance=Math.hypot(dx,dz),heading=Math.atan2(dx,dz)-p.angle;
      const offset=Math.abs(Math.atan2(Math.sin(heading),Math.cos(heading)));
      if(m.hp<=0||distance>range||(distance>1e-8&&offset>halfArc+1e-8)) continue;
      m.hp=Math.max(0,m.hp-a.damage);this.events.push({type:'damage',id:m.id,x:m.x,z:m.z,amount:a.damage});
      if(m.hp===0) { m.respawn=this.time+15;p.kills++;p.xp+=20;p.gold+=8;if(p.kills>=5&&!p.quest) {p.quest=true;p.xp+=150;p.gold+=50;this.events.push({type:'quest',id});}p.level=1+Math.floor(p.xp/100); }
    }
    return true;
  }
  tick(dt) { this.time+=dt; const camps=PROPS.filter(p=>p.model==='campfire');for(const p of this.players.values()) { if(this.time-(p.inputAt??0)>.35) p.input={x:0,z:0}; const {x,z}=p.input; move(p,x*this.config.moveSpeed*dt,z*this.config.moveSpeed*dt); if(x||z) p.angle=Math.atan2(x,z); if(p.hp<=0) {p.hp=100;p.x=SPAWN.x;p.z=SPAWN.z;this.events.push({type:'respawn',id:p.id});} if(camps.some(c=>Math.hypot(p.x-c.x,p.z-c.z)<4*c.scale)) p.hp=Math.min(100,p.hp+dt*5); }
    for(const m of this.mobs) {
      if(m.hp<=0) {if(this.time>=m.respawn){m.hp=60;m.x=m.homeX;m.z=m.homeZ;}continue;}
      let target=null,nearest=9;
      for(const p of this.players.values()){
        const distance=Math.hypot(m.x-p.x,m.z-p.z);
        if(distance<nearest){target=p;nearest=distance;}
      }
      const tx=target?.x??m.homeX,tz=target?.z??m.homeZ;
      const dx=tx-m.x,dz=tz-m.z,d=Math.hypot(dx,dz);
      const stopDistance=target?this.config.mobAttackRange:1.25;
      if(d>0&&(target||d>stopDistance))m.angle=Math.atan2(dx,dz);
      // Clamp each step to the distance still available, so even a long tick
      // cannot overshoot melee range. Back away if the player closes the gap.
      if(d>0&&(target||d>stopDistance)){
        const gap=d-stopDistance,step=Math.sign(gap)*Math.min(Math.abs(gap),this.config.enemySpeed*dt);
        move(m,dx/d*step,dz/d*step);
      }else if(target&&d===0){
        const step=Math.min(stopDistance,this.config.enemySpeed*dt),angle=m.angle??0;
        move(m,-Math.sin(angle)*step,-Math.cos(angle)*step);
      }
      const distance=target?Math.hypot(target.x-m.x,target.z-m.z):Infinity;
      if(target&&distance<=this.config.mobAttackRange+1e-8&&this.time>=m.hitAt){
        target.hp=Math.max(0,target.hp-this.config.enemyDamage);m.hitAt=this.time+1.1;
        this.events.push({type:'mob-attack',id:m.id,key:'attack',x:m.x,z:m.z,angle:m.angle??0,range:this.config.mobAttackRange,radius:this.config.mobAttackRange,slashVariant:(m.slashCount??0)%3,arcDegrees:this.config.attackArcDegrees});
        m.slashCount=(m.slashCount??0)+1;
        if(this.config.enemyDamage>0)this.events.push({type:'hurt',id:target.id,x:target.x,z:target.z,amount:this.config.enemyDamage});
      }
    }
  }
  snapshot() { return {type:'state',time:this.time,players:[...this.players.values()].map(({input,inputAt,slashCount,...p})=>p),mobs:this.mobs.map(({homeX,homeZ,slashCount,...m})=>m),events:this.events.splice(0)}; }
}
