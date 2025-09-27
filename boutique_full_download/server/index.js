// server/index.js (demo)
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
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

let db;
(async () => {
  db = await open({ filename: path.join(__dirname, 'data.db'), driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    customer TEXT,
    type TEXT,
    address TEXT,
    items TEXT,
    total INTEGER
  )`);
})();

async function sendTelegram(chatId, text){
  const token = process.env.TELEGRAM_TOKEN;
  if(!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: chatId, text, parse_mode:'HTML' })
  });
}
async function sendDocument(chatId, filePath, caption=''){
  const token = process.env.TELEGRAM_TOKEN;
  if(!token || !chatId) return;
  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) form.append('caption', caption);
  form.append('document', fs.createReadStream(filePath));
  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method:'POST', body: form });
}

function makeReceiptPDF(order){
  const dir = path.join(__dirname, 'receipts');
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `receipt_${order.id}.pdf`);
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(fs.createWriteStream(file));
  doc.fontSize(18).text('Boutique Demo', { align:'left' });
  doc.moveDown();
  doc.fontSize(14).text('Reçu de commande', { underline:true });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Commande #${order.id}`);
  doc.text(`Date: ${new Date(order.created_at).toLocaleString('fr-FR')}`);
  doc.text(`Type: ${order.type}`);
  doc.moveDown();
  doc.fontSize(12).text('Articles:');
  const items = JSON.parse(order.items||'[]');
  items.forEach((it, i)=> doc.text(`${i+1}. ${it.name} - ${it.variant} - ${it.qty} × ${(it.price/100).toFixed(2)} € = ${(it.lineTotal/100).toFixed(2)} €`));
  doc.moveDown();
  doc.text('Adresse de livraison:');
  doc.fontSize(11).text(order.address || '—');
  doc.moveDown();
  doc.fontSize(13).text(`Total: ${(order.total/100).toFixed(2)} €`, { align:'right' });
  doc.end();
  return file;
}

app.get('/api/geocode', async (req,res)=>{
  try{
    const q = req.query.q||'';
    if(!q) return res.json({ features:[] });
    const key = process.env.MAPBOX_KEY;
    if(!key) return res.status(500).json({ error:'MAPBOX_KEY missing' });
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${key}&autocomplete=true&limit=6`;
    const r = await fetch(url); const j = await r.json();
    res.json(j);
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/create-order', async (req,res)=>{
  try{
    const { customer, type, address, items, total } = req.body;
    const result = await db.run('INSERT INTO orders (customer,type,address,items,total) VALUES (?,?,?,?,?)',
      customer||'Client', type, address, JSON.stringify(items||[]), total||0);
    const id = result.lastID;
    const order = await db.get('SELECT * FROM orders WHERE id=?', id);

    const lines = (items||[]).map((it,i)=> `${i+1}. ${it.name} - ${it.variant} - ${it.qty} × ${(it.price/100).toFixed(2)} € = ${(it.lineTotal/100).toFixed(2)} €`).join("\n");
    const text = `<b>Nouvelle commande</b>\n\nClient: ${order.customer}\nType: ${order.type}\nAdresse: ${order.address||'—'}\n\n${lines}\n\nTotal: ${(order.total/100).toFixed(2)} €\n#${id}`;

    const adminChat = process.env.ADMIN_CHAT_ID;
    if (adminChat) {
      await sendTelegram(adminChat, text);
      const pdf = makeReceiptPDF(order);
      await sendDocument(adminChat, pdf, `Reçu #${id}`);
    }

    res.json({ ok:true, id });
  }catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// Admin auth simple
const sessions = new Map();
app.post('/api/admin/login', (req,res)=>{
  const pass = (req.body?.password)||'';
  const expected = process.env.ADMIN_PASS||'';
  if (!expected) return res.status(500).json({ ok:false, error:'ADMIN_PASS not set' });
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
  res.json({ ok:true, orders:list });
});

app.get('*', (req,res)=> res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server on', PORT));
