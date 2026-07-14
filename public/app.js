// ---------- catálogo de plataformas ----------
// mode 'open'  -> arma la URL con {text}/{url} y abre el compositor precargado
// mode 'copy'  -> copia el texto al portapapeles y abre la URL base (pegás a mano)
const BUILTIN = [
  { key:'linkedin',  label:'LinkedIn',  color:'#0a66c2', limit:3000, mode:'open',
    style:'profesional, hook fuerte en la 1a línea, saltos de línea, 1-3 hashtags al final',
    url:'https://www.linkedin.com/feed/?shareActive=true&text={text}' },
  { key:'x',         label:'X (Twitter)', color:'#111', limit:280, mode:'open',
    style:'punchy y conciso, una sola idea, máx 280, 0-2 hashtags',
    url:'https://twitter.com/intent/tweet?text={text}' },
  { key:'instagram', label:'Instagram', color:'#e1306c', limit:2200, mode:'copy',
    style:'cálido, con emojis moderados, CTA claro y hashtags al final',
    url:'https://www.instagram.com/' },
  { key:'threads',   label:'Threads',   color:'#444', limit:500, mode:'open',
    style:'casual y conversacional, máx 500',
    url:'https://www.threads.net/intent/post?text={text}' },
  { key:'bluesky',   label:'Bluesky',   color:'#1185fe', limit:300, mode:'open',
    style:'casual, sin exceso de hashtags, máx 300',
    url:'https://bsky.app/intent/compose?text={text}' },
  { key:'facebook',  label:'Facebook',  color:'#1877f2', limit:5000, mode:'copy',
    style:'cercano, algo más largo que X',
    url:'https://www.facebook.com/' },
  { key:'medium',    label:'Medium',    color:'#00ab6c', limit:100000, mode:'copy',
    style:'intro de artículo editorial, primer párrafo que enganche, tono largo',
    url:'https://medium.com/new-story' },
  { key:'whatsapp',  label:'WhatsApp',  color:'#25d366', limit:4000, mode:'open',
    style:'mensaje breve y directo para difusión',
    url:'https://wa.me/?text={text}' }
];

const LS_PLAT = 'pub_custom_platforms';
const LS_SEL  = 'pub_selected';

let state = { projects: [], current: null, drafts: {} };

function customPlatforms(){ try { return JSON.parse(localStorage.getItem(LS_PLAT)) || []; } catch { return []; } }
function allPlatforms(){ return [...BUILTIN, ...customPlatforms()]; }
function selectedKeys(){
  try { const s = JSON.parse(localStorage.getItem(LS_SEL)); if(Array.isArray(s)) return s; } catch {}
  return ['linkedin','x','instagram'];
}
function setSelected(keys){ localStorage.setItem(LS_SEL, JSON.stringify(keys)); }

// ---------- init ----------
async function init(){
  const r = await fetch('/api/projects').then(x=>x.json()).catch(()=>({projects:[]}));
  state.projects = r.projects || [];
  state.current = r.current || state.projects[0]?.name || null;
  renderProjectSelect();
  renderChips();
  bind();
}
function currentProject(){ return state.projects.find(p=>p.name===state.current) || {}; }

function renderProjectSelect(){
  const sel = document.getElementById('project');
  sel.innerHTML = state.projects.map(p=>`<option ${p.name===state.current?'selected':''}>${esc(p.name)}</option>`).join('')
    + '<option value="__new">+ nuevo proyecto…</option>';
  const url = currentProject().url || '';
  document.getElementById('url').value = url;
}

function renderChips(){
  const wrap = document.getElementById('platforms');
  const sel = new Set(selectedKeys());
  wrap.innerHTML = allPlatforms().map(p=>`
    <span class="chip ${sel.has(p.key)?'on':'off'}" data-k="${p.key}">
      <span class="ic" style="background:${p.color}"></span>${esc(p.label)}
    </span>`).join('');
  wrap.querySelectorAll('.chip').forEach(ch=>{
    ch.onclick = ()=>{
      const k = ch.dataset.k; const s = new Set(selectedKeys());
      s.has(k) ? s.delete(k) : s.add(k);
      setSelected([...s]); renderChips();
    };
  });
}

// ---------- generar ----------
async function generate(){
  const topic = document.getElementById('topic').value.trim();
  const url = document.getElementById('url').value.trim();
  const keys = selectedKeys();
  const status = document.getElementById('status');
  if(!topic){ status.textContent='Escribí un tema.'; status.className='status err'; return; }
  if(!keys.length){ status.textContent='Elegí al menos una red.'; status.className='status err'; return; }

  const platforms = allPlatforms().filter(p=>keys.includes(p.key))
    .map(p=>({ key:p.key, label:p.label, charLimit:p.limit, style:p.style }));

  status.className='status'; status.textContent='Generando con IA…';
  document.getElementById('generate').disabled = true;
  try{
    const res = await fetch('/api/generate',{
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ topic, url, projectName: state.current, platforms })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Error del servidor');
    state.drafts = data.drafts || {};
    status.textContent = 'Listo. Revisá, ajustá y abrí cada red.';
    renderResults(url);
  }catch(e){
    status.className='status err'; status.textContent = 'Error: '+e.message;
  }finally{
    document.getElementById('generate').disabled = false;
  }
}

function renderResults(url){
  const box = document.getElementById('results');
  const keys = selectedKeys();
  box.innerHTML = allPlatforms().filter(p=>keys.includes(p.key)).map(p=>{
    const txt = state.drafts[p.key] || '';
    const over = txt.length > p.limit;
    return `<div class="pcard" data-k="${p.key}">
      <div class="pcard-top">
        <span class="ic" style="background:${p.color}"></span>
        <h4>${esc(p.label)}</h4>
        <span class="count ${over?'over':''}"><b class="cn">${txt.length}</b> / ${p.limit}</span>
      </div>
      <textarea class="draft">${esc(txt)}</textarea>
      <div class="pcard-actions">
        <button class="open-btn" style="background:${p.color}">
          ${p.mode==='open'?'Abrir para postear':'Copiar y abrir'}
        </button>
        <button class="copy-btn">Copiar</button>
        <button class="img-btn">🖼 Imagen</button>
        <span class="mode ${p.mode==='copy'?'copy':''}">${p.mode==='open'?'abre con el texto cargado':'copiá y pegá (la red no precarga)'}</span>
      </div>
      <div class="imgbox hidden">
        <label class="fld"><span>Prompt de la imagen <em>(editalo y regenerá)</em></span>
          <textarea class="img-prompt" rows="3"></textarea></label>
        <img class="img-preview hidden" alt="Imagen generada">
        <div class="img-actions">
          <button class="img-regen ghost small">Generar</button>
          <a class="img-dl ghost small hidden" download target="_blank">⬇ Descargar</a>
          <span class="img-status"></span>
        </div>
      </div>
    </div>`;
  }).join('');

  box.querySelectorAll('.pcard').forEach(card=>{
    const p = allPlatforms().find(x=>x.key===card.dataset.k);
    const ta = card.querySelector('.draft');
    ta.oninput = ()=>{
      state.drafts[p.key] = ta.value;
      const c = card.querySelector('.count'); const n = card.querySelector('.cn');
      n.textContent = ta.value.length;
      c.classList.toggle('over', ta.value.length > p.limit);
    };
    card.querySelector('.copy-btn').onclick = ()=>{ copy(ta.value); toast('Texto copiado'); };
    card.querySelector('.open-btn').onclick = ()=> openPlatform(p, ta.value, url);

    // ---- imagen ----
    const imgbox = card.querySelector('.imgbox');
    const promptTa = card.querySelector('.img-prompt');
    card.querySelector('.img-btn').onclick = ()=>{
      if(imgbox.classList.contains('hidden')){
        imgbox.classList.remove('hidden');
        if(!promptTa.value) promptTa.value = imagePrompt(p);
        generateImage(card, p);
      }else{
        imgbox.classList.add('hidden');
      }
    };
    card.querySelector('.img-regen').onclick = ()=> generateImage(card, p);
  });
}

function imagePrompt(p){
  const proj = currentProject();
  const topic = document.getElementById('topic').value.trim();
  return `Imagen para acompañar un post de ${p.label} de la marca "${proj.name||'la marca'}". `+
    `Tema del post: ${topic}. `+
    `Estética profesional, moderna y limpia, coherente con esta voz de marca: ${proj.voice||'profesional y clara'}. `+
    `Sin texto, sin letras y sin logos dentro de la imagen.`;
}

async function generateImage(card, p){
  const status = card.querySelector('.img-status');
  const img = card.querySelector('.img-preview');
  const dl = card.querySelector('.img-dl');
  const btn = card.querySelector('.img-regen');
  const prompt = card.querySelector('.img-prompt').value.trim();
  if(!prompt){ status.textContent = 'Escribí un prompt.'; return; }
  status.textContent = 'Generando imagen…'; btn.disabled = true;
  try{
    const res = await fetch('/api/image',{
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ prompt, platformKey: p.key })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Error del servidor');
    img.src = data.url; img.classList.remove('hidden');
    dl.href = data.url; dl.setAttribute('download', p.key + '_' + Date.now() + '.png');
    dl.classList.remove('hidden');
    btn.textContent = 'Regenerar';
    status.textContent = '';
  }catch(e){
    status.textContent = 'Error: ' + e.message;
  }finally{
    btn.disabled = false;
  }
}

function openPlatform(p, text, url){
  copy(text); // siempre copiamos como respaldo
  let target;
  if(p.mode==='open' && p.url.includes('{text}')){
    target = p.url.replace('{text}', encodeURIComponent(text))
                  .replace('{url}', encodeURIComponent(url||''));
    toast('Abriendo '+p.label+' con el texto cargado');
  }else{
    target = p.mode==='copy' && url && p.key==='facebook'
      ? 'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url)
      : p.url;
    toast('Texto copiado — pegalo en '+p.label);
  }
  window.open(target, '_blank', 'noopener');
}

// ---------- modales proyecto ----------
function bind(){
  document.getElementById('generate').onclick = generate;
  document.getElementById('project').onchange = e=>{
    if(e.target.value==='__new'){ openProjModal(true); renderProjectSelect(); return; }
    state.current = e.target.value; saveState(); renderProjectSelect();
  };
  document.getElementById('editProj').onclick = ()=> openProjModal(false);
  document.getElementById('pProvider').onchange = toggleMcp;
  document.getElementById('cancelProj').onclick = ()=> hide('projModal');
  document.getElementById('saveProj').onclick = saveProject;
  document.getElementById('delProj').onclick = deleteProject;
  document.getElementById('addPlatform').onclick = ()=> show('platModal');
  document.getElementById('cancelPlat').onclick = ()=> hide('platModal');
  document.getElementById('savePlat').onclick = savePlatform;
}

function openProjModal(isNew){
  const p = isNew ? {name:'',voice:'',url:'',provider:'claudecode',model:''} : currentProject();
  document.getElementById('pName').value = p.name||'';
  document.getElementById('pVoice').value = p.voice||'';
  document.getElementById('pUrl').value = p.url||'';
  document.getElementById('pProvider').value = p.provider||'claudecode';
  document.getElementById('pModel').value = p.model||'';
  document.getElementById('pMcp').value = p.mcpConfig||'';
  document.getElementById('pTools').value = p.allowedTools||'';
  document.getElementById('projModal').dataset.new = isNew ? '1':'';
  document.getElementById('delProj').style.display = isNew ? 'none':'';
  toggleMcp();
  show('projModal');
}
function toggleMcp(){
  const isCC = document.getElementById('pProvider').value === 'claudecode';
  document.getElementById('mcpFields').style.display = isCC ? '' : 'none';
}
async function saveProject(){
  const isNew = document.getElementById('projModal').dataset.new==='1';
  const obj = {
    name: document.getElementById('pName').value.trim(),
    voice: document.getElementById('pVoice').value.trim(),
    url: document.getElementById('pUrl').value.trim(),
    provider: document.getElementById('pProvider').value,
    model: document.getElementById('pModel').value.trim(),
    mcpConfig: document.getElementById('pMcp').value.trim(),
    allowedTools: document.getElementById('pTools').value.trim()
  };
  if(!obj.name) return;
  const dup = state.projects.some(p => p.name === obj.name && (isNew || obj.name !== state.current));
  if(dup){ toast('Ya existe un proyecto con ese nombre'); return; }
  if(isNew){ state.projects.push(obj); }
  else{
    const i = state.projects.findIndex(p=>p.name===state.current);
    if(i>=0) state.projects[i] = obj;
  }
  state.current = obj.name;
  await saveState(); hide('projModal'); renderProjectSelect();
}
async function deleteProject(){
  state.projects = state.projects.filter(p=>p.name!==state.current);
  state.current = state.projects[0]?.name || null;
  await saveState(); hide('projModal'); renderProjectSelect();
}
function saveState(){
  return fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},
    body: JSON.stringify({ current: state.current, projects: state.projects })});
}

function savePlatform(){
  const label = document.getElementById('npLabel').value.trim();
  const url = document.getElementById('npUrl').value.trim();
  if(!label || !url) return;
  if(!/^https?:\/\//i.test(url)){ toast('La URL debe empezar con http:// o https://'); return; }
  const list = customPlatforms();
  list.push({
    key: 'c_'+label.toLowerCase().replace(/\W+/g,''),
    label, color:'#7b6efe',
    limit: parseInt(document.getElementById('npLimit').value)||500,
    style: document.getElementById('npStyle').value.trim() || 'natural',
    mode: url.includes('{text}') ? 'open':'copy',
    url
  });
  localStorage.setItem(LS_PLAT, JSON.stringify(list));
  hide('platModal'); renderChips();
  ['npLabel','npUrl','npStyle'].forEach(id=>document.getElementById(id).value='');
}

// ---------- utils ----------
function copy(t){ navigator.clipboard?.writeText(t).catch(()=>{}); }
function show(id){ document.getElementById(id).classList.remove('hidden'); }
function hide(id){ document.getElementById(id).classList.add('hidden'); }
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
let toastT;
function toast(msg){
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastT); toastT = setTimeout(()=>t.classList.add('hidden'), 2600);
}

init();