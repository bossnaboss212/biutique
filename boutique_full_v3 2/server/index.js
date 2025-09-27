// server/index.js - v3
import express from 'express';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import FormData from 'form-data';
import { stringify } from 'csv-stringify/sync';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// In-memory admin sessions: token -> { created_at }
const adminSessions = new Map();

let db;
(async () => {
  db = await open({ filename: path.join(__dirname, 'data.db'), driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    shop TEXT,
    type TEXT,
    address TEXT,
    items TEXT,
    total INTEGER
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT,
    stock INTEGER,
    price INTEGER,
    meta TEXT
  )`);
  // seed products if empty
  const row = await db.get('SELECT COUNT(1) as c FROM products');
  if (row && row.c === 0) {
    const stmt = await db.prepare('INSERT INTO products (id,name,stock,price,meta) VALUES (?,?,?,?,?)');
    for (let i=1;i<=11;i++){
      await stmt.run('p'+i, 'Produit '+i, 100, 1000 * (i%3+1), JSON.stringify({img:`https://picsum.photos/seed/p${i}/800/800`}));
    }
    await stmt.finalize();
  }
})();

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) { console.warn('TELEGRAM_TOKEN missing'); return; }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    return res.json();
  } catch (err) { console.error('Telegram send error', err); }
}

async function sendTelegramDocument(chatId, filePath, caption='') {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) { console.warn('TELEGRAM_TOKEN missing'); return; }
  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) form.append('caption', caption);
  form.append('document', fs.createReadStream(filePath));
  try {
    const res = await fetch(url, { method: 'POST', body: form });
    return await res.json();
  } catch (e) { console.error('sendDocument error', e); }
}

function genReceiptPDF(order) {
  const dir = path.join(__dirname, 'receipts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `receipt_${order.id}.pdf`);
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(fs.createWriteStream(file));
  doc.fontSize(18).text(order.shop || 'Boutique Center', { align: 'left' });
  doc.moveDown();
  doc.fontSize(14).text('Reçu de commande', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Commande #${order.id}`);
  doc.text(`Date: ${new Date(order.created_at || Date.now()).toLocaleString('fr-FR')}`);
  doc.text(`Type de commande: ${order.type}`);
  doc.moveDown();
  doc.fontSize(12).text('Articles:');
  doc.moveDown(0.3);
  const items = JSON.parse(order.items || '[]');
  items.forEach((it, i) => {
    doc.text(`${i+1}. ${it.name} - ${it.variant} - ${it.qty} × ${(it.price/100).toFixed(2)} EUR = ${(it.lineTotal/100).toFixed(2)} EUR`);
  });
  doc.moveDown();
  doc.fontSize(12).text('Adresse de livraison:');
  doc.fontSize(11).text(order.address || '—');
  doc.moveDown();
  doc.fontSize(13).text(`Total: ${(order.total/100).toFixed(2)} EUR`, { align: 'right' });
  doc.end();
  return file;
}

// Proxy Mapbox geocoding
app.get('/api/geocode', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q) return res.json({ features: [] });
    const key = process.env.MAPBOX_KEY;
    if (!key) return res.status(500).json({ error: 'MAPBOX_KEY missing' });
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${key}&autocomplete=true&limit=6`;
    const r = await fetch(url);
    const j = await r.json();
    res.json(j);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// Create order: save, notify admin, generate PDF, notify client
app.post('/api/create-order', async (req, res) => {
  try {
    const { shop, type, address, items, total, telegram_user_id } = req.body;
    const itemsStr = JSON.stringify(items || []);
    const result = await db.run('INSERT INTO orders (shop,type,address,items,total) VALUES (?,?,?,?,?)',
      shop || 'Boutique Center', type, address, itemsStr, total
    );
    const id = result.lastID;
    const orderRow = await db.get('SELECT * FROM orders WHERE id=?', id);

    const lines = (items||[]).map((it,i)=> `${i+1}. ${it.name} - ${it.variant} - ${it.qty} × ${(it.price/100).toFixed(2)} EUR = ${(it.lineTotal/100).toFixed(2)} EUR`).join("\n");

    const receiptTxt =
`Commande ${orderRow.shop}

⸻ Détails de la commande ⸻
Type de commande : ${type}
${lines}

Adresse de livraison :
${address || '—'}

Total de la commande : ${(total/100).toFixed(2)} EUR

ID commande: #${id}
`;

    const adminId = process.env.ADMIN_CHAT_ID;
    if (adminId) {
      await sendTelegramMessage(adminId, `<b>Nouvelle commande</b>\n\n${receiptTxt}`);
      const pdfPath = genReceiptPDF(orderRow);
      await sendTelegramDocument(adminId, pdfPath, `Reçu commande #${id}`);
    }

    // send PDF to client if telegram_user_id provided
    if (telegram_user_id) {
      try {
        const pdfPathClient = genReceiptPDF(orderRow);
        await sendTelegramDocument(telegram_user_id, pdfPathClient, `Votre reçu - commande #${id}`);
      } catch(e){ console.error('send to client failed', e); }
    }

    res.json({ ok:true, id });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, error:e.message }); }
});

// Admin: login -> returns token (store in memory)
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASS || '';
  if (!adminPass) return res.status(500).json({ ok:false, error:'ADMIN_PASS not set' });
  if (password !== adminPass) return res.status(401).json({ ok:false, error:'invalid' });
  const token = crypto.randomBytes(24).toString('hex');
  adminSessions.set(token, { created: Date.now() });
  res.json({ ok:true, token });
});

// middleware to check admin token
function checkAdmin(req, res, next){
  const tok = req.headers['x-admin-token'] || '';
  if (!tok || !adminSessions.has(tok)) return res.status(401).json({ ok:false, error:'unauthorized' });
  next();
}

// Admin: list orders
app.get('/api/admin/orders', checkAdmin, async (req,res) => {
  try {
    const rows = await db.all('SELECT * FROM orders ORDER BY created_at DESC');
    const parsed = rows.map(r=>({...r, items: JSON.parse(r.items)}));
    res.json({ ok:true, orders: parsed });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// Admin: stats (CA, orders count, revenue)
app.get('/api/admin/stats', checkAdmin, async (req,res) => {
  try {
    const rows = await db.all('SELECT COUNT(*) as orders, SUM(total) as revenue FROM orders');
    const products = await db.all('SELECT id,name,stock,price FROM products');
    res.json({ ok:true, stats: rows[0], products });
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// Admin: export CSV
app.get('/api/admin/export', checkAdmin, async (req,res) => {
  try {
    const rows = await db.all('SELECT * FROM orders ORDER BY created_at DESC');
    const data = rows.map(r=>({ id:r.id, created_at:r.created_at, shop:r.shop, type:r.type, address:r.address, items:r.items, total:r.total }));
    const csv = stringify(data, { header: true });
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="orders.csv"');
    res.send(csv);
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// Admin: update product stock
app.post('/api/admin/product/update', checkAdmin, async (req,res) => {
  try {
    const { id, stock } = req.body;
    await db.run('UPDATE products SET stock=? WHERE id=?', stock, id);
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// Serve frontend (SPA)
app.get('*', (req,res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('Server started on', PORT));
