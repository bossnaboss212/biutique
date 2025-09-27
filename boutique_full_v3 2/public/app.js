// app.js v3
const tg = window.Telegram?.WebApp; try{ tg?.ready(); tg?.expand(); }catch(e){}
const SHOP_NAME = "Boutique Center";
// IMPORTANT: remplace API par l'URL de ton backend si le front est sur Netlify
// ex: const API = "https://TON_BACKEND.up.railway.app/api";
const API = "/api";

const PRODUCTS = Array.from({length:11}).map((_,i)=> ({
  id: "p"+(i+1),
  name: "Produit "+(i+1),
  tag: i%2? "Best-seller":"Nouveauté",
  description: "Description courte du produit "+(i+1)+".",
  media: i%3===0 ? {type:"video", src:"https://cdn.coverr.co/videos/coverr-shopping-4932/1080p.mp4"} : {type:"image", src:`https://picsum.photos/seed/item${i}/800/800`},
  variants: [ { label:"10g", price:17000 }, { label:"5g", price:9000 }, { label:"1g", price:2000 } ]
}));

const REVIEWS = [{author:"Alex",stars:5,text:"Super qualité et service rapide.",date:"12/10/2025"}];

const state = { cart:{}, current:null };
const fmt = (c)=> new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(c/100);
const el = s=> document.querySelector(s);
const els = s=> [...document.querySelectorAll(s)];
const hide = (n,b=true)=> n.classList.toggle("hidden", b);

function renderGrid(){
  const grid = el("#grid"); grid.innerHTML="";
  PRODUCTS.forEach(p=>{
    const card=document.createElement("div"); card.className="card";
    if(p.media.type==='image'){
      card.innerHTML=`<div style="position:relative"><img class="thumb" src="${p.media.src}" /><div class="title">${p.tag}</div></div><div class="name">${p.name}</div>`;
    } else {
      card.innerHTML=`<div style="position:relative"><video class="thumb" src="${p.media.src}" autoplay muted playsinline loop></video><div class="title">${p.tag}</div></div><div class="name">${p.name}</div>`;
    }
    card.onclick=()=>openDetail(p.id);
    grid.appendChild(card);
  });
  el("#count").textContent=PRODUCTS.length;
}

function openDetail(id){
  const p = PRODUCTS.find(x=>x.id===id); state.current=p;
  el("#media").innerHTML = p.media.type==='image'?`<img src="${p.media.src}" />`:`<video src="${p.media.src}" autoplay muted playsinline loop controls></video>`;
  el("#title").textContent=p.name; el("#tag").textContent=p.tag; el("#desc").textContent=p.description;
  const box=el("#variants"); box.innerHTML='';
  p.variants.forEach(v=>{
    const row=document.createElement("div"); row.className='variant';
    row.innerHTML=`<div><strong>${v.label}</strong><div class="muted">${fmt(v.price)}</div></div>
      <div class="qty"><button class="icon dec">-</button><span class="q">1</span><button class="icon inc">+</button><button class="primary add">Ajouter</button></div>`;
    let q=1;
    row.querySelector('.dec').onclick=()=>{ q=Math.max(1,q-1); row.querySelector('.q').textContent=q; };
    row.querySelector('.inc').onclick=()=>{ q++; row.querySelector('.q').textContent=q; };
    row.querySelector('.add').onclick=()=>addToCart(p,v,q);
    box.appendChild(row);
  });
  hide(el("#home"), true); hide(el("#filters"), true); hide(el("#detail"), false);
}
el("#back").onclick=()=>{ hide(el("#detail"), true); hide(el("#home"), false); hide(el("#filters"), false); };

function addToCart(p,v,q){
  const entry = state.cart[p.id] || { name:p.name, lines:{} };
  entry.lines[v.label] = { price:v.price, qty:(entry.lines[v.label]?.qty||0)+q };
  state.cart[p.id]=entry; updateBadge();
}
function updateBadge(){ const c = Object.values(state.cart).reduce((s,e)=> s + Object.values(e.lines).reduce((a,b)=>a+b.qty,0),0); el("#badge").textContent=c; }

function openCart(){
  const lines = el("#lines"); lines.innerHTML=''; let total=0;
  for(const [pid,entry] of Object.entries(state.cart)){
    for(const [label,info] of Object.entries(entry.lines)){
      const p = PRODUCTS.find(x=>x.id===pid); total += info.price*info.qty;
      const row = document.createElement("div"); row.className='line';
      row.innerHTML=`<img src="${p.media.type==='image'?p.media.src:'https://picsum.photos/seed/fallback/100/100'}" />
        <div style="flex:1"><div style="font-weight:700">${entry.name} — ${label}</div><div class="muted">${fmt(info.price)} / unité</div></div>
        <div class="qtyctrl"><button class="icon minus">-</button><div>${info.qty}</div><button class="icon plus">+</button><button class="icon del">🗑️</button></div>`;
      row.querySelector('.minus').onclick=()=>{ if(info.qty>1){ info.qty--; openCart(); } };
      row.querySelector('.plus').onclick=()=>{ info.qty++; openCart(); };
      row.querySelector('.del').onclick=()=>{ delete entry.lines[label]; if(Object.keys(entry.lines).length===0) delete state.cart[pid]; openCart(); };
      lines.appendChild(row);
    }
  }
  el("#total").textContent = fmt(total);
  hide(el("#cartSheet"), false);
}
function closeCart(){ hide(el("#cartSheet"), true); }

async function checkout(){
  const delivery = [...document.querySelectorAll('input[name="delivery"]')].find(x=>x.checked)?.value||'';
  const address = delivery.startsWith('Livraison extérieure')? el('#addrExt').value : el('#addrLocal').value;
  let total=0, items=[];
  for(const [pid,entry] of Object.entries(state.cart)){
    for(const [label,info] of Object.entries(entry.lines)){
      const lineTotal = info.price*info.qty; total+=lineTotal;
      items.push({ name: entry.name, variant: label, qty: info.qty, price: info.price, lineTotal });
    }
  }
  if (delivery.includes('+20')) total+=2000;
  let tgUserId=null; try{ tgUserId = tg?.initDataUnsafe?.user?.id || null; }catch(e){}
  const body = { shop: SHOP_NAME, type: delivery, address, items, total, telegram_user_id: tgUserId };
  const r = await fetch(`${API}/create-order`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const j = await r.json();
  if (j.ok) { alert(`Commande validée (ID #${j.id}). Un reçu vous est envoyé.`); state.cart={}; updateBadge(); closeCart(); hide(el("#detail"), true); hide(el("#home"), false); hide(el("#filters"), false); }
  else { alert('Erreur: '+(j.error||'inconnue')); }
}

// Address autocomplete via proxy
let timer=null;
['addrLocal','addrExt'].forEach(id=>{
  const input = document.getElementById(id);
  input.addEventListener('input', ()=>{
    clearTimeout(timer);
    timer = setTimeout(async ()=>{
      const q = input.value; if(!q || q.length<2){ document.getElementById('suggestions').innerHTML=''; return; }
      const r = await fetch(`${API}/geocode?q=${encodeURIComponent(q)}`);
      const j = await r.json(); const list = j.features||[];
      document.getElementById('suggestions').innerHTML = list.map(f=>`<div data-value="${encodeURIComponent(f.place_name)}">${f.place_name}</div>`).join('');
      [...document.getElementById('suggestions').children].forEach(div=>{
        div.onclick = ()=>{ input.value = decodeURIComponent(div.dataset.value); document.getElementById('suggestions').innerHTML=''; };
      });
    }, 300);
  });
});

document.getElementById('cartBtn').onclick = openCart;
document.getElementById('closeCart').onclick = closeCart;
document.getElementById('openCart').onclick = openCart;
document.getElementById('checkout').onclick = checkout;

renderGrid();
