let EVENTS=[], FILTERS={q:'',period:'all',cat:'all',price:'all',zone:'all',sort:'date',maxDist:null,only:''}, map=null, markers=[];
const MILANO={lat:45.4642,lon:9.19};
// Punto di riferimento per le distanze: posizione utente se concessa, altrimenti Milano.
// Salvato in localStorage così sopravvive alle visite.
let REF={lat:MILANO.lat,lon:MILANO.lon,label:'Milano',custom:false};
try{const s=JSON.parse(localStorage.getItem('ev_ref')||'null');
  if(s&&typeof s.lat==='number'&&typeof s.lon==='number')REF=s;}catch(_){}
function saveRef(){try{localStorage.setItem('ev_ref',JSON.stringify(REF))}catch(_){}}
function refLabel(){return REF.custom?('da '+REF.label):'da Milano'}
function updateLocUI(){const el=document.getElementById('refLabel');if(!el)return;
  el.textContent='riferimento: '+(REF.custom?REF.label:'Milano');
  const md=document.getElementById('maxDist'),mdl=document.getElementById('maxDistLabel');
  if(md&&mdl){const v=+md.value;mdl.textContent=v>=150?'Qualsiasi':'entro '+v+' km '+refLabel()}}
function applyRef(){saveRef();updateLocUI();render();
  if(map){try{map.setView([REF.lat,REF.lon],9)}catch(_){}}}
function useMyPosition(){const b=document.getElementById('useMyPos');
  if(!navigator.geolocation){alert('Geolocalizzazione non supportata dal browser.');return}
  if(b)b.textContent='⏳ Localizzo…';
  navigator.geolocation.getCurrentPosition(p=>{
    REF={lat:+p.coords.latitude.toFixed(4),lon:+p.coords.longitude.toFixed(4),label:'te',custom:true};
    applyRef();if(b)b.textContent='📍 La mia posizione';
  },()=>{
    alert('Posizione non disponibile: controlla i permessi del browser.');
    if(b)b.textContent='📍 La mia posizione';
  },{timeout:10000})}
async function setCustomAddress(q){q=(q||'').trim();if(!q)return;
  const lbl=document.getElementById('refLabel');if(lbl)lbl.textContent='ricerca…';
  try{const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q='+encodeURIComponent(q),
      {headers:{'Accept':'application/json'}});
    const j=await r.json();
    if(j&&j.length){const name=(j[0].display_name||'').split(',').slice(0,2).join(',').trim()||q;
      REF={lat:+parseFloat(j[0].lat).toFixed(4),lon:+parseFloat(j[0].lon).toFixed(4),label:name,custom:true};
      applyRef();
    }else alert('Indirizzo non trovato, prova con città o CAP.');
  }catch(_){alert('Ricerca indirizzo non riuscita, riprova.')}
  updateLocUI()}
// ---------- Preferiti (solo locale: localStorage) ----------
let FAVS=[];
try{FAVS=JSON.parse(localStorage.getItem('ev_favs')||'[]')}catch(_){FAVS=[]}
function saveFavs(){try{localStorage.setItem('ev_favs',JSON.stringify(FAVS))}catch(_){}}
function isFav(id){return FAVS.some(f=>f.id===id)}
function favSnapshot(e){return{id:e.id,title:e.title,startDate:e.startDate,endDate:e.endDate||null,
  dateLabel:e.dateLabel||'',venue:e.venue||'',city:e.city||'',province:e.province||'',
  priceLabel:e.priceLabel||'',free:!!e.free,remind:false,notified:false,savedAt:Date.now()}}
function toggleFav(ev,id){if(ev)ev.stopPropagation();
  const i=FAVS.findIndex(f=>f.id===id);
  if(i>=0){FAVS.splice(i,1)}else{const e=EVENTS.find(x=>x.id===id);if(e)FAVS.push(favSnapshot(e))}
  saveFavs();updateFavUI();renderFavs();
  // aggiorna i cuoricini visibili
  document.querySelectorAll('[data-favbtn="'+id+'"]').forEach(b=>b.classList.toggle('on',isFav(id)));
  if(!document.getElementById('modal').classList.contains('hidden'))openModal(id)}
async function toggleRemind(ev,id){if(ev)ev.stopPropagation();
  const f=FAVS.find(x=>x.id===id);if(!f)return;
  if(!f.remind&&'Notification' in window&&Notification.permission==='default'){
    try{await Notification.requestPermission()}catch(_){}}
  f.remind=!f.remind;f.notified=false;saveFavs();renderFavs();
  document.querySelectorAll('[data-rembtn="'+id+'"]').forEach(b=>b.classList.toggle('on',f.remind));
  const mb=document.getElementById('modalRem');if(mb)mb.classList.toggle('on',f.remind)}
function updateFavUI(){const n=FAVS.length,el=document.getElementById('favcount');
  if(el){el.textContent=n;el.classList.toggle('hidden',!n)}}
function cleanupFavs(){const t=dstr(new Date());const before=FAVS.length;
  FAVS=FAVS.filter(f=>!f.startDate||f.startDate>=t);
  if(FAVS.length!==before){saveFavs();updateFavUI()}}
function checkReminders(){ // promemoria locali: controllo a ogni apertura pagina
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  const now=new Date();const t0=dstr(now);const t1=dstr(new Date(now.getTime()+864e5));
  let changed=false;
  FAVS.forEach(f=>{if(f.remind&&!f.notified&&f.startDate>=t0&&f.startDate<=t1){
    try{new Notification('⏰ '+f.title,{body:(f.dateLabel||'')+' · '+(f.venue||f.city||''),
      tag:'ev-'+f.id})}catch(_){}
    f.notified=true;changed=true}});
  if(changed)saveFavs()}
function renderFavs(){const box=document.getElementById('favlist');if(!box)return;
  cleanupFavs();
  const tot=document.getElementById('favtotal');
  if(!FAVS.length){box.innerHTML='<div class="empty">Nessun preferito.<br>Tocca il ♡ sulle schede per salvare gli eventi.</div>';
    if(tot)tot.textContent='0 eventi';return}
  if(tot)tot.textContent=FAVS.length+(FAVS.length===1?' evento':' eventi');
  const list=[...FAVS].sort((a,b)=>(a.startDate||'').localeCompare(b.startDate||''));
  box.innerHTML=list.map(f=>`
  <article class="card favcard">
    <div class="chead"><h3>${esc(f.title)}</h3>
      <button class="iconbtn ${f.remind?'on':''}" data-rembtn="${f.id}" onclick="toggleRemind(event,${f.id})" title="Ricordamelo" aria-label="Attiva promemoria">🔔</button>
      <button class="iconbtn danger" onclick="toggleFav(event,${f.id})" title="Rimuovi" aria-label="Rimuovi dai preferiti">✕</button>
    </div>
    <div class="meta">${esc(f.dateLabel||'')}</div>
    <div class="meta">${esc(f.venue||'')}${f.venue&&f.city?' · ':''}${esc(f.city||'')}</div>
    <div class="cfoot"><span class="pill ${f.free?'free':'paid'}">${esc(f.priceLabel||(f.free?'Gratis':'A pagamento'))}</span>
    ${f.remind?'<span class="pill rem">🔔 promemoria attivo</span>':''}</div>
  </article>`).join('')}
const CATL={music:'Musica',fest:'Festival',comedy:'Stand-up',outdoor:"All'aperto",food:'Sagre & Food'};
const INAUG_RE=/(inaugur|opening|vernissage|apertura|open day)/i;
const FEST_RE=/fest(?!a\b|e\b)/i; // festival veri, non "festa/feste" di paese
function isFest(e){return FEST_RE.test(((e.kind||'')+' '+(e.title||'')))}
function catOf(e){return isFest(e)?'fest':e.category}
function matchCat(e){const c=FILTERS.cat;if(c==='all')return true;
  if(c==='fest')return isFest(e);
  return e.category===c&&!isFest(e)}
function matchOnly(e){if(!FILTERS.only)return true;
  if(FILTERS.only==='party')return (e.kind||'').toLowerCase().includes('party');
  if(FILTERS.only==='inaug')return INAUG_RE.test((e.kind||'')+' '+(e.title||'')+' '+(e.details||''));
  return true}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dstr=d=>d.toISOString().slice(0,10);
const MONTHS=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
function todayStr(){return dstr(new Date())}
function parseD(s){return s?new Date(s+'T12:00:00'):null}
function ongoing(e,t){const s=parseD(e.startDate),en=parseD(e.endDate||e.startDate);return s&&en&&s<=t&&t<=en}
function intersects(e,a,b){const s=parseD(e.startDate),en=parseD(e.endDate||e.startDate);return s&&en&&s<=b&&en>=a}
function weekendRange(){const n=new Date(),d=n.getDay(),t=new Date(n);t.setHours(12,0,0,0);
  let sat=new Date(t);if(d===6)sat=new Date(t);else if(d===0)sat=new Date(t),sat.setDate(sat.getDate()-1);else sat.setDate(sat.getDate()+(6-d));
  let sun=new Date(sat);sun.setDate(sun.getDate()+1);return[sat,sun]}
function distKm(e){if(!e.latitude||!e.longitude)return null;
  const R=6371,dLa=(e.latitude-REF.lat)*Math.PI/180,dLo=(e.longitude-REF.lon)*Math.PI/180;
  const a=Math.sin(dLa/2)**2+Math.cos(REF.lat*Math.PI/180)*Math.cos(e.latitude*Math.PI/180)*Math.sin(dLo/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
function distTxt(e){const d=distKm(e);if(d==null)return'';return d<1?'meno di 1 km':Math.round(d)+' km'}
function matchPeriod(e){const t=new Date();t.setHours(12,0,0,0);const p=FILTERS.period;
  if(p==='all'){const en=parseD(e.endDate||e.startDate);return en&&en>=t}
  if(p==='today')return ongoing(e,t);
  if(p==='weekend'){const[a,b]=weekendRange();return intersects(e,a,b)}
  if(p==='d7'){const b=new Date(t);b.setDate(b.getDate()+7);return intersects(e,t,b)}
  if(p==='d30'){const b=new Date(t);b.setDate(b.getDate()+30);return intersects(e,t,b)}
  return true}
function filtered(){const q=FILTERS.q.toLowerCase();
  return EVENTS.filter(e=>{
    if(!matchPeriod(e))return false;
    if(FILTERS.cat!=='all'&&!matchCat(e))return false;
    if(FILTERS.price==='free'&&e.priceType!=='free')return false;
    if(FILTERS.price==='paid'&&e.priceType!=='paid')return false;
    if(FILTERS.zone!=='all'&&e.area!==FILTERS.zone)return false;
    if(!matchOnly(e))return false;
    if(FILTERS.maxDist!=null){const d=distKm(e);if(d==null||d>FILTERS.maxDist)return false}
    if(q){const h=(e.title+' '+(e.kind||'')+' '+(e.venue||'')+' '+e.city+' '+(e.details||'')).toLowerCase();if(!h.includes(q))return false}
    return true;
  }).sort((a,b)=>{if(FILTERS.sort==='dist'){const da=distKm(a),db=distKm(b);
    if(da==null&&db==null)return 0;if(da==null)return 1;if(db==null)return -1;return da-db}
    const t=new Date();t.setHours(12,0,0,0);
    const ao=ongoing(a,t)?0:1,bo=ongoing(b,t)?0:1;
    if(ao!==bo)return ao-bo;
    return (a.startDate||'').localeCompare(b.startDate||'')||a.title.localeCompare(b.title)})}
function pricePill(e){const c=e.priceType==='free'?'free':e.priceType==='paid'?'paid':'unknown';
  const lbl=e.priceType==='paid'?(e.priceLabel&&e.priceLabel.length<=24?e.priceLabel:(e.priceLabel?'A pagamento':'Prezzo n.d.')):(e.priceType==='free'?'Gratis':'Prezzo n.d.');
  return `<span class="pricepill ${c}">${esc(lbl)}</span>`}
function priceSection(e){ // scheda: etichetta prezzo lunga mostrata per esteso
  if(e.priceType!=='paid'||!e.priceLabel||e.priceLabel.length<=24)return '';
  return `<div class="msec"><h3>Prezzi</h3><p class="mdesc">${esc(e.priceLabel)}</p></div>`}
function srcHTML(e){if(!e.sources||!e.sources.length)return'';
  return `<div class="src">Fonti: `+e.sources.map(s=>s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}${s.channel==='social'?' ·social':''}</a>`:`<span>${esc(s.name)}</span>`).join('')+`</div>`}
function dateBadge(e){const d=parseD(e.startDate);if(!d)return'';
  const e2=e.endDate&&e.endDate!==e.startDate?parseD(e.endDate):null;
  let txt=`${d.getDate()}<small>${MONTHS[d.getMonth()]}</small>`,cls='';
  if(e2){ // evento su più giorni: mostra il range in formato compatto
    cls=' range';
    if(e2.getFullYear()===d.getFullYear()&&e2.getMonth()===d.getMonth())
      txt=`${d.getDate()}–${e2.getDate()} <small>${MONTHS[d.getMonth()]}</small>`;
    else txt=`${d.getDate()} <small>${MONTHS[d.getMonth()]}</small> – ${e2.getDate()} <small>${MONTHS[e2.getMonth()]}</small>`}
  return `<span class="datebadge${cls}">${txt}</span>`}
function cardHTML(e){const t=new Date();t.setHours(12,0,0,0);
  const og=ongoing(e,t)?'<span class="ongoing">in corso</span>':'';
  const dt=distTxt(e);
  return `<article class="card b-${catOf(e)}" data-id="${e.id}">
    <div class="chead"><h3>${esc(e.title)}${og}</h3>${dateBadge(e)}</div>
    <div class="meta">${esc(e.venue||'')}${e.venue&&e.city?' · ':''}${esc(e.city||'')}${dt?` · <span class="dist">${esc(dt)} ${refLabel()}</span>`:''}</div>
    <div class="cfoot">${pricePill(e)}<span class="catpill">${CATL[catOf(e)]}</span><button class="favbtn ${isFav(e.id)?'on':''}" data-favbtn="${e.id}" onclick="toggleFav(event,${e.id})" aria-label="Salva nei preferiti">♡</button><button class="sharemini" data-share="${e.id}" onclick="shareEvent(${e.id},event)" aria-label="Condividi ${esc(e.title)}">↗</button></div>
    <div class="more">
      ${e.dateLabel?`<p><b>${esc(e.dateLabel)}</b>${e.timeLabel?' · '+esc(e.timeLabel):''}</p>`:''}
      ${e.details?`<p>${esc(e.details)}</p>`:''}
      ${e.foodDetails?`<p><b>Food:</b> ${esc(e.foodDetails)}</p>`:''}
      ${e.address?`<p class="meta">${esc(e.address)}</p>`:''}
      ${e.caveat?`<p class="cav">⚠ ${esc(e.caveat)}</p>`:''}
      ${srcHTML(e)}
    </div></article>`}
let LAST_LIST=[],RENDERED=0;const BATCH=40;const OPEN=new Set();
function render(){LAST_LIST=filtered();RENDERED=Math.min(BATCH,LAST_LIST.length);paintList();
  document.getElementById('count').textContent=LAST_LIST.length+' eventi';
  const pts=LAST_LIST.filter(e=>e.latitude&&e.longitude);
  const places=new Set(pts.map(e=>e.latitude.toFixed(4)+','+e.longitude.toFixed(4))).size;
  document.getElementById('mapcount').textContent=places+' luoghi · '+pts.length+' eventi';
  updateFCount();renderMap(LAST_LIST)}
function paintList(){
  // banner in-feed ogni 20 eventi: scorre con la lista
  const AD_EVERY=20;
  const parts=[];
  for(let i=0;i<RENDERED;i++){parts.push(cardHTML(LAST_LIST[i]));
    if((i+1)%AD_EVERY===0&&i+1<RENDERED)
      parts.push('<div class="adslot" role="complementary" aria-label="Spazio pubblicitario"><span>Spazio pubblicitario</span></div>')}
  if(RENDERED<LAST_LIST.length)
    parts.push(`<button id="morebtn" onclick="moreEvents()">Mostra altri (${LAST_LIST.length-RENDERED} rimasti)</button>`);
  const box=document.getElementById('list');
  box.innerHTML=LAST_LIST.length?parts.join(''):'<div class="empty">Nessun evento con questi filtri.<br>Prova ad allargare la distanza o il periodo.</div>';
  box.querySelectorAll('.card').forEach(c=>{const id=+c.dataset.id;
    if(OPEN.has(id))c.classList.add('open');
    c.addEventListener('click',()=>{c.classList.toggle('open');
      c.classList.contains('open')?OPEN.add(id):OPEN.delete(id)})})}
function moreEvents(){RENDERED=Math.min(RENDERED+BATCH,LAST_LIST.length);paintList()}
// scroll infinito: carica altri eventi avvicinandosi al fondo
let scrollTick=false;
window.addEventListener('scroll',()=>{if(scrollTick)return;scrollTick=true;
  requestAnimationFrame(()=>{scrollTick=false;
    if(document.getElementById('listView').classList.contains('hidden'))return;
    if(RENDERED>=LAST_LIST.length)return;
    if(window.innerHeight+window.scrollY>document.documentElement.scrollHeight-900)moreEvents()})},{passive:true});
function updateFCount(){let n=0;
  if(FILTERS.period!=='all')n++;if(FILTERS.cat!=='all')n++;if(FILTERS.price!=='all')n++;
  if(FILTERS.zone!=='all')n++;if(FILTERS.sort!=='date')n++;if(FILTERS.maxDist!=null)n++;
  if(FILTERS.only)n++;
  const el=document.getElementById('fcount');
  el.classList.toggle('hidden',!n);el.textContent=n||''}
function renderMap(list){if(!map)return;markers.forEach(m=>map.removeLayer(m));markers=[];
  const pts=list.filter(e=>e.latitude&&e.longitude);
  const colors={music:'#1d4ed8',fest:'#7c3aed',comedy:'#b45309',outdoor:'#15803d',food:'#be123c'};
  // raggruppa per coordinate (4 decimali): niente più pin sovrapposti invisibili
  const groups={};
  pts.forEach(e=>{const k=e.latitude.toFixed(4)+','+e.longitude.toFixed(4);
    (groups[k]=groups[k]||[]).push(e)});
  const gkeys=Object.keys(groups);
  document.getElementById('mapcount').textContent=gkeys.length+' luoghi · '+pts.length+' eventi';
  gkeys.forEach(k=>{const evs=groups[k];
    const catCount={};evs.forEach(e=>{const c=catOf(e);catCount[c]=(catCount[c]||0)+1});
    const domCat=Object.keys(catCount).sort((a,b)=>catCount[b]-catCount[a])[0];
    const m=L.circleMarker([evs[0].latitude,evs[0].longitude],
      {radius:evs.length>1?13:9,color:colors[domCat]||'#444',fillOpacity:.92,weight:2});
    if(evs.length>1)m.bindTooltip(String(evs.length),{permanent:true,direction:'center',className:'pcount'});
    const items=evs.map(e=>{const dt=distTxt(e);
      return `<button class="popitem" onclick="openModal(${e.id})"><b>${esc(e.title)}</b><span>${esc(e.dateLabel||'')}${dt?' · '+esc(dt)+' '+refLabel():''}</span></button>`}).join('');
    m.bindPopup(`<div class="poplist">${items}</div>`);
    markers.push(m);m.addTo(map)});
  if(pts.length){try{map.fitBounds(L.latLngBounds(pts.map(e=>[e.latitude,e.longitude])).pad(0.12))}catch(_){}}}
function eventUrl(id){return location.origin+location.pathname+'?evento='+encodeURIComponent(id)}
async function shareEvent(id,ev){if(ev)ev.stopPropagation();
  const e=EVENTS.find(x=>x.id===id);if(!e)return;
  const url=eventUrl(id), title=e.title+' — Eventi Milano Lombardia';
  const text=`${e.title}${e.dateLabel?' · '+e.dateLabel:''}${e.venue?' @ '+e.venue:''}`;
  if(navigator.share){try{await navigator.share({title,text,url});return}catch(_){/* annullato */}
  }
  try{await navigator.clipboard.writeText(url);
    const b=document.querySelectorAll(`[data-share="${id}"]`);
    b.forEach(x=>{const o=x.textContent;x.textContent='Copiato!';setTimeout(()=>x.textContent=o,1800)});
  }catch(_){prompt('Copia il link:',url)}}
function ticketCTA(e){const s=(e.sources||[]).find(x=>x.channel==='ticketing'&&x.url);
  if(!s)return '';
  return `<a class="ticketbtn" href="${esc(s.url)}" target="_blank" rel="noopener">🎟 Biglietti su ${esc(s.name)}</a>`}
function toggleDesc(btn){const p=btn.previousElementSibling;if(!p)return;
  p.classList.toggle('clamp');
  btn.textContent=p.classList.contains('clamp')?'Leggi tutto ▾':'Mostra meno ▴'}
function openModal(id){const e=EVENTS.find(x=>x.id===id);if(!e)return;
  const dt=distTxt(e);
  const longDesc=e.details&&e.details.length>280;
  document.getElementById('mbody').innerHTML=`<span class="catpill">${CATL[catOf(e)]}</span>
    <h2>${esc(e.title)}</h2>
    <p class="meta"><b>${esc(e.dateLabel||'')}</b>${e.timeLabel?' · '+esc(e.timeLabel):''}</p>
    <p class="meta">${esc(e.venue||'')}${e.venue&&e.city?' · ':''}${esc(e.city||'')}${e.province?' ('+esc(e.province)+')':''}${dt?` · <span class="dist">${esc(dt)} ${refLabel()}</span>`:''}</p>
    ${e.kind?`<p class="meta">${esc(e.kind)}</p>`:''}<p>${pricePill(e)}</p>
    ${ticketCTA(e)}
    ${priceSection(e)}
    ${e.details?`<div class="msec"><h3>Dettagli</h3><p class="mdesc${longDesc?' clamp':''}">${esc(e.details)}</p>${longDesc?`<button class="descbtn" onclick="toggleDesc(this)">Leggi tutto ▾</button>`:''}</div>`:''}
    ${e.foodDetails?`<div class="msec"><h3>Food</h3><p class="mdesc">${esc(e.foodDetails)}</p></div>`:''}
    ${e.address?`<p class="meta addr">${esc(e.address)}</p>`:''}${e.caveat?`<p class="cav">⚠ ${esc(e.caveat)}</p>`:''}${srcHTML(e)}
    <div class="mrowbtns"><button id="modalFav" class="mbtn ${isFav(e.id)?'on':''}" onclick="toggleFav(event,${e.id})">♡ Salva</button>
    ${isFav(e.id)?`<button id="modalRem" class="mbtn ${(FAVS.find(f=>f.id===e.id)||{}).remind?'on':''}" onclick="toggleRemind(event,${e.id})">🔔 Ricordamelo</button>`:''}
    <button class="sharebtn" data-share="${e.id}" onclick="shareEvent(${e.id},event)">↗ Condividi</button></div>`;
  document.getElementById('modal').classList.remove('hidden')}
function initMap(){if(typeof L==='undefined'){document.getElementById('map').innerHTML='<div class="empty">Mappa non caricata: controlla la connessione e ricarica.</div>';return false}
  map=L.map('map',{tap:true}).setView([45.46,9.19],9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  return true}
function setGroup(id,val){const g=document.getElementById(id);if(!g)return;
  g.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.v===val))}
function syncChips(){document.querySelectorAll('#chips button').forEach(b=>{
  const k=b.dataset.chip;let on=false;
  if(k==='today')on=FILTERS.period==='today';
  if(k==='weekend')on=FILTERS.period==='weekend';
  if(k==='free')on=FILTERS.price==='free';
  if(k==='party')on=FILTERS.only==='party';
  if(k==='inaug')on=FILTERS.only==='inaug';
  if(k==='near')on=FILTERS.maxDist===20&&FILTERS.sort==='dist';
  b.classList.toggle('on',on)})}
function bindFilters(){
  document.querySelectorAll('.fgroup[id]').forEach(g=>{
    g.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      g.querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
      FILTERS[g.id.slice(1).toLowerCase()]=b.dataset.v;
      if(g.id==='fZone'&&b.dataset.v==='milano')resetDist();
      syncChips();render()}))});
  function resetDist(){const md=document.getElementById('maxDist'),mdl=document.getElementById('maxDistLabel');
    if(!md)return;FILTERS.maxDist=null;md.value=150;mdl.textContent='Qualsiasi'}
  const q=document.getElementById('q'),qc=document.getElementById('qclear');
  let qT=null;
  q.addEventListener('input',()=>{clearTimeout(qT);qT=setTimeout(()=>{FILTERS.q=q.value;qc.classList.toggle('hidden',!q.value);render()},220)});
  qc.addEventListener('click',()=>{q.value='';FILTERS.q='';qc.classList.add('hidden');render();q.focus()});
  const md=document.getElementById('maxDist'),mdl=document.getElementById('maxDistLabel');
  md.addEventListener('input',()=>{const v=+md.value;FILTERS.maxDist=v>=150?null:v;
    mdl.textContent=v>=150?'Qualsiasi':'entro '+v+' km '+refLabel();syncChips();render()});
  document.getElementById('useMyPos').addEventListener('click',useMyPosition);
  const ca=document.getElementById('customAddr');
  ca.addEventListener('keydown',e=>{if(e.key==='Enter')setCustomAddress(ca.value)});
  ca.addEventListener('change',()=>setCustomAddress(ca.value));
  updateLocUI();
  document.querySelectorAll('#chips button').forEach(b=>b.addEventListener('click',()=>{
    const k=b.dataset.chip;
    if(k==='today'){FILTERS.period=FILTERS.period==='today'?'all':'today';setGroup('fPeriod',FILTERS.period)}
    if(k==='weekend'){FILTERS.period=FILTERS.period==='weekend'?'all':'weekend';setGroup('fPeriod',FILTERS.period)}
    if(k==='free'){FILTERS.price=FILTERS.price==='free'?'all':'free';setGroup('fPrice',FILTERS.price)}
    if(k==='party'){FILTERS.only=FILTERS.only==='party'?'':'party'}
    if(k==='inaug'){FILTERS.only=FILTERS.only==='inaug'?'':'inaug'}
    if(k==='near'){const on=!(FILTERS.maxDist===20&&FILTERS.sort==='dist');
      FILTERS.maxDist=on?20:null;FILTERS.sort=on?'dist':'date';
      md.value=on?20:150;mdl.textContent=on?'entro 20 km '+refLabel():'Qualsiasi';
      setGroup('fSort',FILTERS.sort);
      if(on&&!REF.custom)useMyPosition()}
    syncChips();render()}));
  document.getElementById('ftoggle').addEventListener('click',()=>{
    document.getElementById('filters').classList.toggle('hidden')});
  const lv=document.getElementById('listView'),mv=document.getElementById('mapView'),fv=document.getElementById('favView');
  const show=v=>{lv.classList.toggle('hidden',v!=='list');mv.classList.toggle('hidden',v!=='map');fv.classList.toggle('hidden',v!=='favs');
    document.getElementById('vList').classList.toggle('on',v==='list');
    document.getElementById('vMap').classList.toggle('on',v==='map');
    document.getElementById('vFavs').classList.toggle('on',v==='favs');
    if(v==='map'){if(!map&&!initMap())return;
      const fix=()=>{if(!map)return;map.invalidateSize();renderMap(filtered())};
      requestAnimationFrame(()=>requestAnimationFrame(fix));setTimeout(fix,400)}
    if(v==='favs')renderFavs()};
  document.getElementById('vList').onclick=()=>show('list');
  document.getElementById('vMap').onclick=()=>show('map');
  document.getElementById('vFavs').onclick=()=>show('favs');
  document.getElementById('mclose').onclick=()=>document.getElementById('modal').classList.add('hidden');
  document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')e.target.classList.add('hidden')})}
fetch('data/events.json').then(r=>r.json()).then(d=>{EVENTS=d.events;
  const u=new Date(d.generatedAt);
  document.getElementById('updated').textContent=u.toLocaleDateString('it-IT',{day:'numeric',month:'long'})+' '+u.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  bindFilters();syncChips();updateFavUI();render();checkReminders();
  // Deep link: ?evento=ID apre direttamente la scheda evento
  try{const eid=new URLSearchParams(location.search).get('evento');
    if(eid!=null){const id=Number(eid);if(Number.isFinite(id))openModal(id)}}catch(_){}
}).catch(()=>{document.getElementById('list').innerHTML='<div class="empty">Dati non disponibili.</div>'});
