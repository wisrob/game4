import { SCHEMA, WATER_HELP, POST_PROCESSING_HELP, validateConfig } from '../shared/config.js';
const label = name=>name==='ior'?'IOR':name.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
export async function createEditor(onChange,toast) {
  const dev=import.meta.env.DEV;
  let response=await fetch(dev?'/__settings':'/settings.json',{cache:'no-store'});if(!response.ok)throw new Error('Could not load settings.json');
  const initial=await response.json();let config=validateConfig(dev?initial.config:initial),saved=structuredClone(config),revision=initial.revision??0,dirty=false;
  const pane=document.createElement('aside');pane.className='editor panel';pane.id='editor';pane.hidden=true;
  pane.innerHTML='<div class="editor-head"><div><h2>World editor</h2><small>LIVE PREVIEW · settings.json</small></div><button id="close-editor" aria-label="Close world editor">×</button></div><div id="editor-status" class="editor-status">Settings loaded</div><div class="editor-body"></div><div class="editor-footer"><button class="save" id="save-config">Save to JSON</button><button id="reload-config">Reload file</button><p>Sliders preview visuals instantly. Save applies gameplay settings to the server. File edits reload automatically.</p></div>';
  document.body.append(pane);const body=pane.querySelector('.editor-body'),status=pane.querySelector('#editor-status');const controls=new Map();
  function setStatus(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
  for(const [domain,fields] of Object.entries(SCHEMA)) {
    const section=document.createElement('details');section.open=['water','grass'].includes(domain);const summary=document.createElement('summary');summary.textContent=domain==='postProcessing'?'post-processing':domain;section.append(summary);
    for(const [key,rule] of Object.entries(fields)) {
      const row=document.createElement('label');row.append(document.createTextNode(label(key)));const input=document.createElement('input');input.id=`setting-${domain}-${key}`;input.setAttribute('aria-label',`${label(domain)} ${label(key)}`);const output=document.createElement('output');
      if(domain==='water'&&WATER_HELP[key]){row.title=WATER_HELP[key];input.setAttribute('aria-description',WATER_HELP[key]);}
      if(domain==='postProcessing'){row.title=POST_PROCESSING_HELP[key];input.setAttribute('aria-description',POST_PROCESSING_HELP[key]);}
      if(rule[0]==='color')input.type='color';else if(rule[0]==='boolean')input.type='checkbox';else{input.type='range';[input.min,input.max,input.step]=rule;row.append(output);}
      row.append(input);section.append(row);controls.set(`${domain}.${key}`,{input,output});
      input.addEventListener('input',()=>{const next=structuredClone(config);next[domain][key]=input.type==='checkbox'?input.checked:input.type==='color'?input.value:Number(input.value);try{config=validateConfig(next);dirty=true;output.textContent=input.value;onChange(config);setStatus('Unsaved preview · Save to keep changes');}catch(e){setStatus(e.message,true);}});
    }body.append(section);
  }
  function sync(){for(const [domain,fields] of Object.entries(config))for(const [key,v] of Object.entries(fields)){const {input,output}=controls.get(`${domain}.${key}`);if(input.type==='checkbox')input.checked=v;else input.value=v;output.textContent=String(v);}onChange(config);}
  function toggle(){pane.hidden=!pane.hidden;document.body.classList.toggle('editor-open',!pane.hidden);}document.querySelector('#settings').addEventListener('click',toggle);pane.querySelector('#close-editor').addEventListener('click',toggle);
  pane.querySelector('#save-config').addEventListener('click',async()=>{const button=pane.querySelector('#save-config');button.disabled=true;try{if(!dev){const blob=new Blob([JSON.stringify(config,null,2)+'\n'],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='settings.json';a.click();URL.revokeObjectURL(a.href);setStatus('JSON downloaded');return;}const r=await fetch('/__settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({config,revision})});const data=await r.json();if(!r.ok)throw new Error(data.error);revision=data.revision;saved=structuredClone(data.config);dirty=false;setStatus('Saved to settings.json');toast('World settings saved');}catch(e){setStatus(e.message,true);}finally{button.disabled=false;}});
  pane.querySelector('#reload-config').addEventListener('click',async()=>{try{const r=await fetch(dev?'/__settings':'/settings.json',{cache:'no-store'});if(!r.ok)throw new Error('Could not load settings');const data=await r.json();config=validateConfig(dev?data.config:data);saved=structuredClone(config);revision=data.revision??0;dirty=false;sync();setStatus('Reloaded settings.json');}catch(e){setStatus(e.message,true);}});
  if(import.meta.hot){import.meta.hot.on('world-config',data=>{const incoming=validateConfig(data.config);if(dirty){setStatus('File changed · Reload to discard your preview',true);return;}revision=data.revision;config=incoming;saved=structuredClone(config);sync();setStatus('File changed · live settings reloaded');toast('settings.json reloaded');});import.meta.hot.on('world-config-error',data=>{setStatus(`File error: ${data.message}`,true);toast('Invalid settings · keeping last valid configuration');});}
  sync();return {get config(){return config;},toggle,get saved(){return saved;}};
}
