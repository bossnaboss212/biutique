const API = "/api";
const fmt = n => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n/100);
const grid = document.getElementById('grid');
const badge = document.getElementById('badge'); let cart = {};
const PRODUCTS = [
  {id:'p1',name:'Produit 1',price:17000,img:'https://picsum.photos/seed/p1/600/600'},
  {id:'p2',name:'Produit 2',price:9000,img:'https://picsum.photos/seed/p2/600/600'},
  {id:'p3',name:'Produit 3',price:2000,img:'https://picsum.photos/seed/p3/600/600'},
  {id:'p4',name:'Produit 4',price:12000,img:'https://picsum.photos/seed/p4/600/600'}
];
function render(){
  grid.innerHTML='';
  for(const p of PRODUCTS){
    const div = document.createElement('div'); div.className='card';
    div.innerHTML = `<img class="thumb" src="${p.img}"/><div class="meta"><b>${p.name}</b><div>${fmt(p.price)}</div><button data-id="${p.id}" class="primary">Ajouter</button></div>`;
    grid.appendChild(div);
  }
  document.querySelectorAll('button[data-id]').forEach(b=> b.onclick = ()=> add(b.dataset.id));
}
function add(id){
  const p = PRODUCTS.find(x=>x.id===id);
  cart[id] = cart[id] || { name:p.name, price:p.price, img:p.img, qty:0 };
  cart[id].qty += 1;
  updateBadge();
}
function updateBadge(){ badge.textContent = Object.values(cart).reduce((s,l)=>s+l.qty,0); }
document.getElementById('cartBtn').onclick = openCart;
document.getElementById('closeCart').onclick = ()=> document.getElementById('cartSheet').classList.add('hidden');
document.getElementById('checkout').onclick = checkout;
function openCart(){
  const box = document.getElementById('lines'); box.innerHTML='';
  let total=0;
  for(const l of Object.values(cart)){
    total += l.price * l.qty;
    const row = document.createElement('div'); row.className='line';
    row.innerHTML = `<img src="${l.img}"/><div style="flex:1"><b>${l.name}</b><div>${fmt(l.price)} x ${l.qty}</div></div>`;
    box.appendChild(row);
  }
  document.getElementById('total').textContent = fmt(total);
  document.getElementById('cartSheet').classList.remove('hidden');
}
let timer=null;
const addr = document.getElementById('addr');
addr.addEventListener('input', ()=>{
  clearTimeout(timer);
  timer = setTimeout(async ()=>{
    const q = addr.value; if(!q || q.length<2){ document.getElementById('suggestions').innerHTML=''; return; }
    const r = await fetch(`${API}/geocode?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    document.getElementById('suggestions').innerHTML = (j.features||[]).map(f=>`<div data-v="${encodeURIComponent(f.place_name)}">${f.place_name}</div>`).join('');
    [...document.getElementById('suggestions').children].forEach(d=> d.onclick=()=>{ addr.value = decodeURIComponent(d.dataset.v); document.getElementById('suggestions').innerHTML=''; });
  },300);
});
async function checkout(){
  const items=[]; let total=0;
  for(const l of Object.values(cart)){ const lineTotal = l.price*l.qty; total+=lineTotal; items.push({ name:l.name, variant:'std', qty:l.qty, price:l.price, lineTotal }); }
  const delivery = [...document.querySelectorAll('input[name="delivery"]')].find(x=>x.checked)?.value||'Livraison locale';
  if (delivery.includes('+20')) total += 2000;
  const address = addr.value;
  const body = { customer:'Web', type:delivery, address, items, total };
  const r = await fetch(`${API}/create-order`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const j = await r.json();
  if(j.ok){ alert('Commande créée #' + j.id); cart={}; updateBadge(); document.getElementById('cartSheet').classList.add('hidden'); }
  else alert('Erreur: '+(j.error||'unknown'));
}
render();
