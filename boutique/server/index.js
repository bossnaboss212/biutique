import express from 'express';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import FormData from 'form-data';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Healthcheck (utile pour tester rapidement)
app.get('/', (req, res) => res.send('OK'));

// =============================
//   TELEGRAM WEBHOOK COMPLET
// =============================

// Variables d'env attendues (Railway → Variables)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const WEBAPP_URL     = process.env.WEBAPP_URL || 'https://meek-meerkat-a2e41f.netlify.app';
const ADMIN_URL      = process.env.ADMIN_URL   || 'https://biutique-production.up.railway.app/admin.html';
const ADMIN_CHAT_ID  = process.env.ADMIN_CHAT_ID || ''; // ex: -4634037286 (groupe) ou chat privé (positif)
const ADMIN_USER_ID  = process.env.ADMIN_USER_ID || ''; // ex: 123456789 (ton user id)

const TG_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ---------- helpers ----------
async function tgSendMessage(chatId, text, extra = {}) {
  try {
    await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra })
    });
  } catch (e) {
    console.error('tgSendMessage error:', e);
  }
}

async function tgSendWebAppKeyboard(chatId, text, webUrl) {
  return tgSendMessage(chatId, text, {
    reply_markup: {
      keyboard: [[ { text: '🛍 Ouvrir la boutique', web_app: { url: webUrl } } ]],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
}

async function tgSendAdminKeyboard(chatId, text, adminUrl) {
  return tgSendMessage(chatId, text, {
    reply_markup: {
      keyboard: [[ { text: "🛠 Ouvrir l’admin", web_app: { url: adminUrl } } ]],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
}

async function tgSendBothKeyboards(chatId, text, webUrl, adminUrl) {
  return tgSendMessage(chatId, text, {
    reply_markup: {
      keyboard: [[
        { text: '🛍 Ouvrir la boutique', web_app: { url: webUrl } },
        { text: "🛠 Ouvrir l’admin",    web_app: { url: adminUrl } }
      ]],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
}

// ---------- routes de test ----------
app.get('/', (_req, res) => res.status(200).send('OK'));
app.get('/webhook', (_req, res) => res.status(200).send('Webhook OK 🚀'));

// =============================
//   TELEGRAM WEBHOOK COMPLET
// =============================

// Variables d'env attendues (Railway → Variables)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const WEBAPP_URL     = process.env.WEBAPP_URL || 'https://meek-meerkat-a2e41f.netlify.app';
const ADMIN_URL      = process.env.ADMIN_URL   || 'https://biutique-production.up.railway.app/admin.html';
const ADMIN_CHAT_ID  = (process.env.ADMIN_CHAT_ID || '').trim();  // ex: -4634037286 (groupe) ou chat privé (positif)
const ADMIN_USER_ID  = (process.env.ADMIN_USER_ID || '').trim();  // ex: 123456789 (ton user id)
const ADMIN_OPEN     = (process.env.ADMIN_OPEN || '').trim() === '1'; // bypass temporaire

const TG_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ---------- helpers ----------
async function tgSendMessage(chatId, text, extra = {}) {
  try {
    await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra })
    });
  } catch (e) {
    console.error('tgSendMessage error:', e);
  }
}

async function tgSendWebAppKeyboard(chatId, text, webUrl) {
  return tgSendMessage(chatId, text, {
    reply_markup: {
      keyboard: [[ { text: '🛍 Ouvrir la boutique', web_app: { url: webUrl } } ]],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
}

async function tgSendAdminKeyboard(chatId, text, adminUrl) {
  return tgSendMessage(chatId, text, {
    reply_markup: {
      keyboard: [[ { text: "🛠 Ouvrir l’admin", web_app: { url: adminUrl } } ]],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
}

async function tgSendBothKeyboards(chatId, text, webUrl, adminUrl) {
  return tgSendMessage(chatId, text, {
    reply_markup: {
      keyboard: [[
        { text: '🛍 Ouvrir la boutique', web_app: { url: webUrl } },
        { text: "🛠 Ouvrir l’admin",    web_app: { url: adminUrl } }
      ]],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
}

// ---------- routes de test ----------
app.get('/', (_req, res) => res.status(200).send('OK'));
app.get('/webhook', (_req, res) => res.status(200).send('Webhook OK 🚀'));

// ---------- webhook Telegram ----------
app.post('/webhook', express.json(), async (req, res) => {
  try {
    const update = req.body;
    const msg    = update?.message;
    if (!msg) return res.sendStatus(200);

    const chatId = msg.chat.id;
    const fromId = msg.from.id;
    const text   = (msg.text || '').trim();

    // Détection admin (user OU chat) + bypass
    const isAdminCtx =
      ADMIN_OPEN ||
      (ADMIN_CHAT_ID && String(chatId) === String(ADMIN_CHAT_ID)) ||
      (ADMIN_USER_ID && String(fromId) === String(ADMIN_USER_ID));

    // ---- commandes debug utiles ----
    if (text === '/whoami') {
      await tgSendMessage(chatId, `chatId: <code>${chatId}</code>\nuserId: <code>${fromId}</code>`);
      return res.sendStatus(200);
    }
    if (text === '/debug') {
      await tgSendMessage(chatId,
        `chatId: <code>${chatId}</code>\n` +
        `userId: <code>${fromId}</code>\n` +
        `ADMIN_USER_ID: <code>${ADMIN_USER_ID}</code>\n` +
        `ADMIN_CHAT_ID: <code>${ADMIN_CHAT_ID}</code>\n` +
        `ADMIN_OPEN: <code>${ADMIN_OPEN ? '1' : '0'}</code>`
      );
      return res.sendStatus(200);
    }

    // ---- /start ----
    if (text === '/start') {
      if (isAdminCtx) {
        await tgSendBothKeyboards(
          chatId,
          'Bienvenue 👋\nChoisis une action :',
          WEBAPP_URL,
          ADMIN_URL
        );
      } else {
        await tgSendWebAppKeyboard(
          chatId,
          'Bienvenue 👋\nAppuie sur le bouton pour ouvrir la boutique.',
          WEBAPP_URL
        );
      }
      return res.sendStatus(200);
    }

    // ---- /admin ----
    if (text === '/admin') {
      if (!isAdminCtx) {
        await tgSendMessage(chatId, '⛔️ Accès refusé.');
      } else {
        await tgSendAdminKeyboard(chatId, '🔐 Accéder au panneau admin :', ADMIN_URL);
      }
      return res.sendStatus(200);
    }

    // ---- aide par défaut ----
    await tgSendMessage(
      chatId,
      'Commandes disponibles :\n' +
      '• /start  → ouvrir la boutique 🛍\n' +
      '• /admin  → panneau admin 🔐\n' +
      '• /whoami → afficher vos IDs\n' +
      '• /debug  → voir les variables lues par le serveur'
    );

    return res.sendStatus(200);
  } catch (err) {
    console.error('webhook error:', err);
    return res.sendStatus(200);
  }
});

// ---------- DB ----------
let db;
(async () => {
  db = await open({ filename: path.join(__dirname, 'data.db'), driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer TEXT,
      type TEXT,
      address TEXT,
      items TEXT,
      total REAL,
      discount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS stock (
      product_id INTEGER,
      variant TEXT,
      qty INTEGER DEFAULT 999
    );
  `);
})();

function fmt(n){ return Number(n).toFixed(2) + ' €'; }

// ---------- Telegram ----------
async function sendTelegram(chatId, text){
  const token = process.env.TELEGRAM_TOKEN;
  if(!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: chatId, text })
  });
}
async function sendPDF(chatId, filePath, caption=''){
  const token = process.env.TELEGRAM_TOKEN;
  if(!token || !chatId) return;
  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) form.append('caption', caption);
  form.append('document', fs.createReadStream(filePath));
  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method:'POST', body: form });
}

// ---------- PDF ----------
function makeReceiptPDF(order){
  const dir = path.join(__dirname, 'receipts');
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `receipt_${order.id}.pdf`);

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(fs.createWriteStream(file));

  doc.fontSize(18).text('DROGUA CENTER', { align: 'left' });
  doc.moveDown();
  doc.fontSize(14).text('Reçu de commande', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Commande #${order.id}`);
  doc.text(`Date: ${new Date(order.created_at).toLocaleString('fr-FR')}`);
  doc.text(`Type: ${order.type}`);
  doc.moveDown();
  doc.fontSize(12).text('Articles:');

  const items = JSON.parse(order.items || '[]');
  items.forEach((it, i)=> doc.text(`${i+1}. ${it.name} - ${it.variant} - ${it.qty} × ${Number(it.price).toFixed(2)} € = ${Number(it.lineTotal).toFixed(2)} €`));

  doc.moveDown();
  doc.text('Adresse de livraison:');
  doc.fontSize(11).text(order.address || '—');

  doc.moveDown();
  doc.fontSize(13).text(`Remise fidélité: ${Number(order.discount||0).toFixed(2)} €`, { align:'left' });
  doc.fontSize(13).text(`Total: ${Number(order.total).toFixed(2)} €`, { align:'right' });

  doc.end();
  return file;
}

// ---------- API: Geocode (Mapbox proxy) ----------
app.get('/api/geocode', async (req,res)=>{
  try{
    const q = req.query.q||'';
    if(!q) return res.json({ features: [] });
    const key = process.env.MAPBOX_KEY;
    if(!key) return res.status(500).json({ error:'MAPBOX_KEY missing' });
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${key}&autocomplete=true&limit=6`;
    const r = await fetch(url);
    const j = await r.json();
    res.json(j);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// ---------- API: Create Order + fidélité ----------
app.post('/api/create-order', async (req,res)=>{
  try{
    const { customer='Client', type='Livraison', address='', items=[], total=0 } = req.body;

    // fidélité: -10€ à chaque 10e commande de ce "customer"
    const row = await db.get('SELECT COUNT(*) as cnt FROM orders WHERE customer = ?', customer);
    const prev = row ? row.cnt : 0;
    let discount = 0;
    if ((prev + 1) % 10 === 0) discount = 10;

    const finalTotal = Math.max(0, Number(total) - discount);

    // Décrémenter le stock si on veut (optionnel: ici pas strict)
    // items.forEach(async it => {
    //   await db.run('UPDATE stock SET qty = qty - ? WHERE product_id=? AND variant=?', it.qty, it.product_id, it.variant);
    // });

    const result = await db.run(
      'INSERT INTO orders (customer,type,address,items,total,discount) VALUES (?,?,?,?,?,?)',
      customer, type, address, JSON.stringify(items||[]), finalTotal, discount
    );
    const id = result.lastID;
    const order = await db.get('SELECT * FROM orders WHERE id=?', id);

    // Texte reçu
    const linesPretty = (items||[]).map((it,i)=>
      ` ${i+1}. ${it.name} - ${it.variant} - ${it.qty} × ${Number(it.price).toFixed(2)} EUR = ${Number(it.lineTotal).toFixed(2)} EUR`
    ).join('\n');

    const text = `Commande DROGUA CENTER

⸻ Détails de la commande ⸻
Type de commande : ${order.type}
${linesPretty}

Adresse de livraison :
${order.address || '—'}

Total de la commande : ${order.total.toFixed(2)} EUR
Remise fidélité : ${order.discount.toFixed(2)} EUR

Nous vous remercions sincèrement pour votre commande 🌟.
Votre livreur dédié 🚚 vous contactera afin d’assurer une expérience de livraison impeccable.
`;

    const adminChat = process.env.ADMIN_CHAT_ID;
    if (adminChat){
      await sendTelegram(adminChat, text);
      const pdf = makeReceiptPDF(order);
      await sendPDF(adminChat, pdf, `Reçu #${id}`);
    }

    // Livreur (anonyme): items + adresse + total, sans nom client (si DRIVER_CHAT_ID est défini)
    const driverChat = process.env.DRIVER_CHAT_ID;
    if (driverChat){
      const driverText = `Nouvelle livraison 📦

${linesPretty}

Adresse :
${order.address || '—'}

Total à encaisser : ${order.total.toFixed(2)} EUR
`;
      await sendTelegram(driverChat, driverText);
    }

    res.json({ ok:true, id, discount: order.discount, total: order.total });
  }catch(e){ res.status(500).json({ ok:false, error: e.message }); }
});

// ---------- Admin: login + liste commandes + CA ----------
const sessions = new Map();
app.post('/api/admin/login', (req,res)=>{
  const pass = req.body?.password || '';
  const expected = process.env.ADMIN_PASS || 'gangstaforlife12';
  if (pass !== expected) return res.status(401).json({ ok:false, error:'invalid' });
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now());
  res.json({ ok:true, token });
});
function guard(req,res,next){
  const tok = req.headers['x-admin-token']||'';
  if(!tok || !sessions.has(tok)) return res.status(401).json({ ok:false, error:'unauthorized' });
  next();
}
app.get('/api/admin/orders', guard, async (req,res)=>{
  const list = await db.all('SELECT * FROM orders ORDER BY created_at DESC');
  list.forEach(o=> o.items = JSON.parse(o.items||'[]'));
  const ca = list.reduce((s,o)=> s + Number(o.total||0), 0);
  res.json({ ok:true, orders:list, ca });
});

// ---------- SPA fallback ----------
app.get('*', (req,res)=> res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server on', PORT));
