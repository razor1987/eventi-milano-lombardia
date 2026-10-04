let EVENTS=[], FILTERS={q:'',period:'all',cat:'all',price:'all',zone:'all',sort:'date',maxDist:null}, map=null, markers=[];
const MILANO={lat:45.4642,lon:9.19};
const CATL={music:'Musica',comedy:'Stand-up',outdoor:"All'aperto",food:'Sagre & Food'};
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
  const R=6371,dLa=(e.latitude-MILANO.lat)*Math.PI/180,dLo=(e.longitude-MILANO.lon)*Math.PI/180;
  const a=Math.sin(dLa/2)**2+Math.cos(MILANO.lat*Math.PI/180)*Math.cos(e.latitude*Math.PI/180)*Math.sin(dLo/2)**2;
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
    if(FILTERS.cat!=='all'&&e.category!==FILTERS.cat)return false;
    if(FILTERS.price==='free'&&e.priceType!=='free')return false;
    if(FILTERS.price==='paid'&&e.priceType!=='paid')return false;
    if(FILTERS.zone!=='all'&&e.area!==FILTERS.zone)return false;
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
  const t=e.priceType==='free'?'Gratis':e.priceType==='paid'?e.priceLabel:'Prezzo n.d.';
  return `<span class="pricepill ${c}">${esc(t)}</span>`}
function srcHTML(e){if(!e.sources||!e.sources.length)return'';
  return `<div class="src">Fonti: `+e.sources.map(s=>s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}${s.channel==='social'?' ·social':''}</a>`:`<span>${esc(s.name)}</span>`).join('')+`</div>`}
function dateBadge(e){const d=parseD(e.startDate);if(!d)return'';
  return `<span class="datebadge">${d.getDate()}<small>${MONTHS[d.getMonth()]}</small></span>`}
function cardHTML(e){const t=new Date();t.setHours(12,0,0,0);
  const og=ongoing(e,t)?'<span class="ongoing">in corso</span>':'';
  const dt=distTxt(e);
  return `<article class="card b-${e.category}" data-id="${e.id}">
    <div class="chead"><h3>${esc(e.title)}${og}</h3>${dateBadge(e)}</div>
    <div class="meta">${esc(e.venue||'')}${e.venue&&e.city?' · ':''}${esc(e.city||'')}${dt?` · <span class="dist">${esc(dt)} da Milano</span>`:''}</div>
    <div class="cfoot">${pricePill(e)}<span class="catpill">${CATL[e.category]||esc(e.category)}</span></div>
    <div class="more">
      ${e.dateLabel?`<p><b>${esc(e.dateLabel)}</b>${e.timeLabel?' · '+esc(e.timeLabel):''}</p>`:''}
      ${e.details?`<p>${esc(e.details)}</p>`:''}
      ${e.foodDetails?`<p><b>Food:</b> ${esc(e.foodDetails)}</p>`:''}
      ${e.address?`<p class="meta">${esc(e.address)}</p>`:''}
      ${e.caveat?`<p class="cav">⚠ ${esc(e.caveat)}</p>`:''}
      ${srcHTML(e)}
    </div></article>`}
function render(){const list=filtered();
  document.getElementById('count').textContent=list.length+' eventi';
  document.getElementById('mapcount').textContent=list.filter(e=>e.latitude&&e.longitude).length+' pin';
  document.getElementById('list').innerHTML=list.length?list.map(cardHTML).join(''):'<div class="empty">Nessun evento con questi filtri.<br>Prova ad allargare la distanza o il periodo.</div>';
  document.querySelectorAll('.card').forEach(c=>c.addEventListener('click',()=>c.classList.toggle('open')));
  updateFCount();renderMap(list)}
function updateFCount(){let n=0;
  if(FILTERS.period!=='all')n++;if(FILTERS.cat!=='all')n++;if(FILTERS.price!=='all')n++;
  if(FILTERS.zone!=='all')n++;if(FILTERS.sort!=='date')n++;if(FILTERS.maxDist!=null)n++;
  const el=document.getElementById('fcount');
  el.classList.toggle('hidden',!n);el.textContent=n||''}
function renderMap(list){if(!map)return;markers.forEach(m=>map.removeLayer(m));markers=[];
  const pts=list.filter(e=>e.latitude&&e.longitude);
  const colors={music:'#1d4ed8',comedy:'#b45309',outdoor:'#15803d',food:'#be123c'};
  pts.forEach(e=>{const m=L.circleMarker([e.latitude,e.longitude],{radius:9,color:colors[e.category]||'#444',fillOpacity:.92,weight:2});
    const dt=distTxt(e);
    m.bindPopup(`<b>${esc(e.title)}</b><br>${esc(e.dateLabel||'')}<br>${esc(e.venue||e.city||'')}${dt?`<br><b>${esc(dt)} da Milano</b>`:''}<br><button class="popbtn" onclick="openModal(${e.id})">Dettagli</button>`);
    markers.push(m);m.addTo(map)});
  if(pts.length){try{map.fitBounds(L.latLngBounds(pts.map(e=>[e.latitude,e.longitude])).pad(0.12))}catch(_){}}}
function openModal(id){const e=EVENTS.find(x=>x.id===id);if(!e)return;
  const dt=distTxt(e);
  document.getElementById('mbody').innerHTML=`<h2>${esc(e.title)}</h2>
    <span class="catpill">${CATL[e.category]||esc(e.category)}</span>
    <p class="meta"><b>${esc(e.dateLabel||'')}</b>${e.timeLabel?' · '+esc(e.timeLabel):''}</p>
    <p class="meta">${esc(e.venue||'')}${e.venue&&e.city?' · ':''}${esc(e.city||'')}${e.province?' ('+esc(e.province)+')':''}${dt?` · <span class="dist">${esc(dt)} da Milano</span>`:''}</p>
    ${e.kind?`<p class="meta">${esc(e.kind)}</p>`:''}<p>${pricePill(e)}</p>
    ${e.details?`<p>${esc(e.details)}</p>`:''}${e.foodDetails?`<p><b>Food:</b> ${esc(e.foodDetails)}</p>`:''}
    ${e.address?`<p class="meta">${esc(e.address)}</p>`:''}${e.caveat?`<p class="cav">⚠ ${esc(e.caveat)}</p>`:''}${srcHTML(e)}`;
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
  if(k==='near')on=FILTERS.maxDist===20&&FILTERS.sort==='dist';
  b.classList.toggle('on',on)})}
function bindFilters(){
  document.querySelectorAll('.fgroup[id]').forEach(g=>{
    g.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      g.querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
      FILTERS[g.id.slice(1).toLowerCase()]=b.dataset.v;syncChips();render()}))});
  const q=document.getElementById('q'),qc=document.getElementById('qclear');
  q.addEventListener('input',()=>{FILTERS.q=q.value;qc.classList.toggle('hidden',!q.value);render()});
  qc.addEventListener('click',()=>{q.value='';FILTERS.q='';qc.classList.add('hidden');render();q.focus()});
  const md=document.getElementById('maxDist'),mdl=document.getElementById('maxDistLabel');
  md.addEventListener('input',()=>{const v=+md.value;FILTERS.maxDist=v>=150?null:v;
    mdl.textContent=v>=150?'Qualsiasi':'entro '+v+' km';syncChips();render()});
  document.querySelectorAll('#chips button').forEach(b=>b.addEventListener('click',()=>{
    const k=b.dataset.chip;
    if(k==='today'){FILTERS.period=FILTERS.period==='today'?'all':'today';setGroup('fPeriod',FILTERS.period)}
    if(k==='weekend'){FILTERS.period=FILTERS.period==='weekend'?'all':'weekend';setGroup('fPeriod',FILTERS.period)}
    if(k==='free'){FILTERS.price=FILTERS.price==='free'?'all':'free';setGroup('fPrice',FILTERS.price)}
    if(k==='near'){const on=!(FILTERS.maxDist===20&&FILTERS.sort==='dist');
      FILTERS.maxDist=on?20:null;FILTERS.sort=on?'dist':'date';
      md.value=on?20:150;mdl.textContent=on?'entro 20 km':'Qualsiasi';
      setGroup('fSort',FILTERS.sort)}
    syncChips();render()}));
  document.getElementById('ftoggle').addEventListener('click',()=>{
    document.getElementById('filters').classList.toggle('hidden')});
  const lv=document.getElementById('listView'),mv=document.getElementById('mapView');
  const show=list=>{lv.classList.toggle('hidden',!list);mv.classList.toggle('hidden',list);
    document.getElementById('vList').classList.toggle('on',list);
    document.getElementById('vMap').classList.toggle('on',!list);
    if(!list){if(!map&&!initMap())return;
      const fix=()=>{if(!map)return;map.invalidateSize();renderMap(filtered())};
      requestAnimationFrame(()=>requestAnimationFrame(fix));setTimeout(fix,400)}};
  document.getElementById('vList').onclick=()=>show(true);
  document.getElementById('vMap').onclick=()=>show(false);
  document.getElementById('mclose').onclick=()=>document.getElementById('modal').classList.add('hidden');
  document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')e.target.classList.add('hidden')})}
fetch('data/events.json').then(r=>r.json()).then(d=>{EVENTS=d.events;
  const u=new Date(d.generatedAt);
  document.getElementById('updated').textContent=u.toLocaleDateString('it-IT',{day:'numeric',month:'long'})+' '+u.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  bindFilters();syncChips();render()}).catch(()=>{document.getElementById('list').innerHTML='<div class="empty">Dati non disponibili.</div>'});
