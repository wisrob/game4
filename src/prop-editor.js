import { validatePlacements, PROP_MODELS } from '../shared/placements.js';
import { applyPlacements } from '../shared/world.js';

export async function createPropEditor(environment,toast){
  const dev=import.meta.env.DEV,endpoint=dev?'/__placements':'/placements.json';
  async function read(){const r=await fetch(endpoint,{cache:'no-store'});if(!r.ok)throw new Error('Could not load props');const data=await r.json();return dev?data:{document:data};}
  let loaded=await read(),document=validatePlacements(loaded.document),revision=loaded.revision,dirty=false,selected=null;
  const section=globalThis.document.createElement('details');section.open=true;section.id='prop-editor';
  section.innerHTML='<summary>Props</summary><label><span>Move props in scene</span><input id="move-props" type="checkbox"></label><p>Enable, then click and drag a prop. Select any prop below to edit its position.</p><label>Type<select id="prop-type"><option value="">All props</option></select></label><label>Prop<select id="prop-select"><option value="">Select a prop</option></select></label><div id="prop-fields"></div><div class="prop-actions"><button id="save-props">Save props</button><button id="reload-props">Reload props</button></div><p id="prop-status" role="status">Props loaded</p>';
  globalThis.document.querySelector('.editor-body').prepend(section);
  const query=s=>section.querySelector(s),fields=new Map();
  for(const model of PROP_MODELS){const option=new Option(model,model);query('#prop-type').add(option);}
  for(const [key,min,max,step] of [['x',-44,44,.1],['y',-20,20,.1],['z',-44,44,.1],['rotation',null,null,.05],['scale',.01,5,.05]]){
    const row=globalThis.document.createElement('label');row.textContent=key==='rotation'?'Rotation (radians)':key.toUpperCase();const input=globalThis.document.createElement('input');input.type='number';input.id=`prop-${key}`;input.step=step;if(min!==null)input.min=min;if(max!==null)input.max=max;row.append(input);query('#prop-fields').append(row);fields.set(key,input);
    input.step='any';input.addEventListener('input',()=>{if(input.value==='')return;change({[key]:Number(input.value)});});
  }
  function status(text,error=false){query('#prop-status').textContent=text;query('#prop-status').classList.toggle('error',error);}
  function options(){const select=query('#prop-select'),filter=query('#prop-type').value;select.replaceChildren(new Option('Select a prop',''));for(const p of document.props)if(!filter||p.model===filter)select.add(new Option(p.id,p.id));select.value=selected??'';}
  function select(id){selected=id||null;const p=document.props.find(p=>p.id===selected);if(p&&query('#prop-type').value&&query('#prop-type').value!==p.model){query('#prop-type').value='';options();}query('#prop-select').value=selected??'';for(const [key,input] of fields){input.disabled=!p;if(input!==globalThis.document.activeElement)input.value=p?String(p[key]):'';}environment.selectProp(pane?.hidden?null:selected);}
  function change(values){if(!selected)return;const next=structuredClone(document),p=next.props.find(p=>p.id===selected);Object.assign(p,values);try{document=validatePlacements(next);dirty=true;environment.updateProps(document.props);select(selected);status('Unsaved props · Save props to keep changes');}catch(error){status(error.message,true);}}
  query('#prop-type').addEventListener('change',()=>{selected=null;options();select(null);});query('#prop-select').addEventListener('change',e=>select(e.target.value));
  query('#move-props').addEventListener('change',()=>{if(!query('#move-props').checked)environment.selectProp(null);else environment.selectProp(selected);});
  const pane=globalThis.document.querySelector('#editor');new MutationObserver(()=>environment.selectProp(pane.hidden?null:selected)).observe(pane,{attributes:true,attributeFilter:['hidden']});
  function accept(data){const incoming=validatePlacements(data.document);if(incoming.props.length!==document.props.length||incoming.props.some((p,i)=>p.id!==document.props[i].id||p.model!==document.props[i].model)){location.reload();return;}document=incoming;revision=data.revision;dirty=false;applyPlacements(document);environment.updateProps(document.props);options();select(selected);}
  query('#save-props').addEventListener('click',async()=>{const button=query('#save-props');button.disabled=true;try{if(!dev){const url=URL.createObjectURL(new Blob([JSON.stringify(document,null,2)+'\n'],{type:'application/json'}));const a=globalThis.document.createElement('a');a.href=url;a.download='placements.json';a.click();URL.revokeObjectURL(url);status('placements.json downloaded');return;}const r=await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({document,revision})});const data=await r.json();if(!r.ok)throw new Error(data.error);accept(data);status('Saved to placements.json');toast('Props saved');}catch(error){status(error.message,true);}finally{button.disabled=false;}});
  query('#reload-props').addEventListener('click',async()=>{try{accept(await read());status('Reloaded placements.json');}catch(error){status(error.message,true);}});
  if(import.meta.hot)import.meta.hot.on('world-placements',data=>{if(dirty){status('File changed · Reload props before saving',true);return;}accept(data);status('Props reloaded from file');});
  options();select(null);
  return {get active(){return !globalThis.document.querySelector('#editor').hidden&&section.open&&query('#move-props').checked;},select,move(x,z){change({x:Math.max(-44,Math.min(44,x)),z:Math.max(-44,Math.min(44,z))});},get selected(){return document.props.find(p=>p.id===selected);}};
}
