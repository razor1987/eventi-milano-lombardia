let EVENTS=[], FILTERS={q:'',period:'all',cat:'all',price:'all',zone:'all'}, map=null, markers=[];
const CATL={music:'Musica',comedy:'Stand-up',outdoor:"All'aperto",food:'Sagre & Food'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dstr=d=>d.toISOString().slice(0,10);
function todayStr(){return dstr(new Date())}
function parseD(s){return s?new Date(s+'T12:00:00'):null}
function ongoing(e,t){const s=parseD(e.startDate),en=parseD(e.endDate||e.startDate);return s&&en&&s<=t&&t<=en}
function intersects(e,a,b){const s=parseD(e.startDate),en=parseD(e.endDate||e.startDate);return s&&en&&s<=b&&en>=a}
function weekendRange(){const n=new Date(),d=n.getDay(),t=new Date(n);t.setHours(12,0,0,0);
  let sat=new Date(t);if(d===6)sat=new Date(t);else if(d===0)sat=new Date(t),sat.setDate(sat.getDate()-1);else sat.setDate(sat.getDate()+(6-d));
  let sun=new Date(sat);sun.setDate(sun.getDate()+1);return[sat,sun]}
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
    if(q){const h=(e.title+' '+(e.kind||'')+' '+(e.venue||'')+' '+e.city+' '+(e.details||'')).toLowerCase();if(!h.includes(q))return false}
    return true;
  }).sort((a,b)=>{const t=new Date();t.setHours(12,0,0,0);
    const ao=ongoing(a,t)?0:1,bo=ongoing(b,t)?0:1;
    if(ao!==bo)return ao-bo;
    return (a.startDate||'').localeCompare(b.startDate||'')||a.title.localeCompare(b.title)})}
function priceHTML(e){const c=e.priceType==='free'?'free':e.priceType==='paid'?'paid':'unknown';
  const t=e.priceType==='free'?'Gratis':e.priceType==='paid'?e.priceLabel:'Prezzo non pubblicato';
  return `<div class="price ${c}">${esc(t)}</div>`}
function srcHTML(e){if(!e.sources||!e.sources.length)return'';
  return `<div class="src">Fonti: `+e.sources.map(s=>s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}${s.channel==='social'?' ·social':''}</a>`:`<span>${esc(s.name)}</span>`).join('')+`</div>`}
function cardHTML(e){const t=new Date();t.setHours(12,0,0,0);
  const og=ongoing(e,t)?' · <b>in corso</b>':'';
  return `<article class="card" data-id="${e.id}">
    <div class="top"><h3>${esc(e.title)}</h3><span class="badge b-${e.category}">${CATL[e.category]||e.category}</span></div>
    <div class="meta">${esc(e.dateLabel||'')}${og}${e.timeLabel?' · '+esc(e.timeLabel):''}</div>
    <div class="meta">${esc(e.venue||'')}${e.venue&&e.city?' · ':''}${esc(e.city||'')}${e.kind?' · '+esc(e.kind):''}</div>
    ${priceHTML(e)}
    <div class="more">
      ${e.details?`<p>${esc(e.details)}</p>`:''}
      ${e.foodDetails?`<p><b>Food:</b> ${esc(e.foodDetails)}</p>`:''}
      ${e.address?`<p class="meta">${esc(e.address)}</p>`:''}
      ${e.caveat?`<p class="cav">⚠ ${esc(e.caveat)}</p>`:''}
      ${srcHTML(e)}
    </div></article>`}
function render(){const list=filtered();
  document.getElementById('count').textContent=list.length+' eventi';
  document.getElementById('list').innerHTML=list.length?list.map(cardHTML).join(''):'<div class="empty">Nessun evento con questi filtri.</div>';
  document.querySelectorAll('.card').forEach(c=>c.addEventListener('click',()=>c.classList.toggle('open')));
  renderMap(list)}
function renderMap(list){if(!map)return;markers.forEach(m=>map.removeLayer(m));markers=[];
  const pts=list.filter(e=>e.latitude&&e.longitude);
  const colors={music:'#1a56db',comedy:'#9a6200',outdoor:'#157f3d',food:'#b4232f'};
  pts.forEach(e=>{const m=L.circleMarker([e.latitude,e.longitude],{radius:9,color:colors[e.category]||'#111',fillOpacity:.9,weight:2});
    m.bindPopup(`<b>${esc(e.title)}</b><br>${esc(e.dateLabel||'')}<br>${esc(e.venue||e.city||'')}<br><button onclick="openModal(${e.id})" style="margin-top:6px;padding:6px 12px;border:none;border-radius:8px;background:#111;color:#fff;cursor:pointer">Dettagli</button>`);
    markers.push(m);m.addTo(map)});
  if(pts.length){map.fitBounds(L.latLngBounds(pts.map(e=>[e.latitude,e.longitude])).pad(0.15))}}
function openModal(id){const e=EVENTS.find(x=>x.id===id);if(!e)return;
  document.getElementById('mbody').innerHTML=`<h2>${esc(e.title)}</h2>
    <span class="badge b-${e.category}">${CATL[e.category]||e.category}</span>
    <p class="meta"><b>${esc(e.dateLabel||'')}</b>${e.timeLabel?' · '+esc(e.timeLabel):''}</p>
    <p class="meta">${esc(e.venue||'')}${e.venue&&e.city?' · ':''}${esc(e.city||'')}${e.province?' ('+esc(e.province)+')':''}</p>
    ${e.kind?`<p class="meta">${esc(e.kind)}</p>`:''}${priceHTML(e)}
    ${e.details?`<p>${esc(e.details)}</p>`:''}${e.foodDetails?`<p><b>Food:</b> ${esc(e.foodDetails)}</p>`:''}
    ${e.address?`<p class="meta">${esc(e.address)}</p>`:''}${e.caveat?`<p class="cav">⚠ ${esc(e.caveat)}</p>`:''}${srcHTML(e)}`;
  document.getElementById('modal').classList.remove('hidden')}
function initMap(){if(typeof L==='undefined'){document.getElementById('map').innerHTML='<div class="empty">Mappa non caricata: controlla la connessione e ricarica la pagina.</div>';return false}
  map=L.map('map',{tap:true}).setView([45.46,9.19],9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  return true}
function bindFilters(){document.querySelectorAll('.fgroup[id]').forEach(g=>{
  g.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    g.querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
    FILTERS[g.id.slice(1).toLowerCase()]=b.dataset.v;render()}))});
  document.getElementById('q').addEventListener('input',e=>{FILTERS.q=e.target.value;render()});
  const lv=document.getElementById('listView'),mv=document.getElementById('mapView');
  document.getElementById('vList').onclick=()=>{lv.classList.remove('hidden');mv.classList.add('hidden');
    document.getElementById('vList').classList.add('on');document.getElementById('vMap').classList.remove('on')};
  document.getElementById('vMap').onclick=()=>{mv.classList.remove('hidden');lv.classList.add('hidden');
    document.getElementById('vMap').classList.add('on');document.getElementById('vList').classList.remove('on');
    if(!map&&!initMap())return;
    const fix=()=>{if(!map)return;map.invalidateSize();renderMap(filtered())};
    requestAnimationFrame(()=>requestAnimationFrame(fix));setTimeout(fix,400)};
  document.getElementById('mclose').onclick=()=>document.getElementById('modal').classList.add('hidden');
  document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')e.target.classList.add('hidden')})}
fetch('data/events.json').then(r=>r.json()).then(d=>{EVENTS=d.events;
  const u=new Date(d.generatedAt);
  document.getElementById('updated').textContent=u.toLocaleDateString('it-IT',{day:'numeric',month:'long'})+' '+u.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  bindFilters();render()}).catch(()=>{document.getElementById('list').innerHTML='<div class="empty">Dati non disponibili.</div>'});
