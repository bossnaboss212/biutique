import express from 'express';
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// =============================
//   CONFIGURATION
// =============================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const WEBAPP_URL     = process.env.WEBAPP_URL || 'https://meek-meerkat-a2e41f.netlify.app';
const ADMIN_URL      = process.env.ADMIN_URL   || 'https://biutique-production.up.railway.app/admin.html';
const ADMIN_CHAT_ID  = (process.env.ADMIN_CHAT_ID || '').trim();
const ADMIN_USER_ID  = (process.env.ADMIN_USER_ID || '').trim();
const ADMIN_OPEN     = (process.env.ADMIN_OPEN || '').trim() === '1';
const DRIVER_CHAT_ID = (process.env.DRIVER_CHAT_ID || '').trim();
const ADMIN_PASS     = process.env.ADMIN_PASS || 'gangstaforlife12';
const MAPBOX_KEY     = process.env.MAPBOX_KEY;

const TG_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// =============================
//   TELEGRAM HELPERS
// =============================

async function tgSendMessage(chatId, text, extra = {}) {
  if (!TELEGRAM_TOKEN || !chatId) {
    console.warn('Telegram non configuré: TOKEN ou chatId manquant');
    return;
  }
  try {
    const response = await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text, 
        parse_mode: 'HTML', 
        ...extra 
      })
    });
    if (!response.ok) {
      console.error('Erreur Telegram:', await response.text());
    }
  } catch (e) {
    console.error('tgSendMessage error:', e.message);
  }
}

async function tgSendWebAppKeyboard(chatId, text, webUrl) {
  return tgSendMessage(chatId, text, {
    reply_markup: {
      keyboard: [[{ text: '🛍 Ouvrir la boutique', web_app: { url: webUrl } }]],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
}

async function tgSendAdminKeyboard(chatId, text, adminUrl) {
  return tgSendMessage(chatId, text, {
    reply_markup: {
      keyboard: [[{ text: "🛠 Ouvrir l'admin", web_app: { url: adminUrl } }]],
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
        { text: "🛠 Ouvrir l'admin", web_app: { url: adminUrl } }
      ]],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
}

async function tgSendPDF(chatId, filePath, caption = '') {
  if (!TELEGRAM_TOKEN || !chatId) {
    console.warn('Telegram non configuré pour envoi PDF');
    return;
  }
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    if (caption) form.append('caption', caption);
    form.append('document', fs.createReadStream(filePath));
    
    const response = await fetch(`${TG_API}/sendDocument`, {
      method: 'POST',
      body: form
    });
    
    if (!response.ok) {
      console.error('Erreur envoi PDF:', await response.text());
    }
  } catch (e) {
    console.error('tgSendPDF error:', e.message);
  }
}

// =============================
//   ROUTES DE TEST
// =============================

app.get('/', (_req, res) => res.status(200).send('OK'));
app.get('/webhook', (_req, res) => res.status(200).send('Webhook OK 🚀'));

// =============================
//   WEBHOOK TELEGRAM
// =============================

app.post('/webhook', express.json(), async (req, res) => {
  try {
    const msg = req.body?.message;
    if (!msg) return res.sendStatus(200);

    const chatId = msg.chat.id;
    const fromId = msg.from.id;
    const text = (msg.text || '').trim();

    const isAdminCtx =
      ADMIN_OPEN ||
      (ADMIN_CHAT_ID && String(chatId) === String(ADMIN_CHAT_ID)) ||
      (ADMIN_USER_ID && String(fromId) === String(ADMIN_USER_ID));

    // Commande /whoami
    if (text === '/whoami') {
      await tgSendMessage(
        chatId,
        `chatId: <code>${chatId}</code>\nuserId: <code>${fromId}</code>`
      );
      return res.sendStatus(200);
    }

    // Commande /debug
    if (text === '/debug') {
      await tgSendMessage(
        chatId,
        `chatId: <code>${chatId}</code>\n` +
        `userId: <code>${fromId}</code>\n` +
        `ADMIN_USER_ID: <code>${ADMIN_USER_ID}</code>\n` +
        `ADMIN_CHAT_ID: <code>${ADMIN_CHAT_ID}</code>\n` +
        `ADMIN_OPEN: <code>${ADMIN_OPEN ? '1' : '0'}</code>`
      );
      return res.sendStatus(200);
    }

    // Commande /start
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

    // Commande /admin
    if (text === '/admin') {
      if (!isAdminCtx) {
        await tgSendMessage(chatId, '⛔️ Accès refusé.');
      } else {
        await tgSendAdminKeyboard(chatId, '🔐 Accéder au panneau admin :', ADMIN_URL);
      }
      return res.sendStatus(200);
    }

    // Message par défaut
    await tgSendMessage(
      chatId,
      'Commandes disponibles :\n' +
      '• /start  → ouvrir la boutique 🛍\n' +
      '• /admin  → panneau admin 🔐\n' +
      '• /whoami → afficher vos IDs\n' +
      '• /debug  → voir les variables lues par le serveur'
    );
    return res.sendStatus(200);
  } catch (e) {
    console.error('webhook error:', e);
    return res.sendStatus(200);
  }
});

// =============================
//   BASE DE DONNÉES
// =============================

let db;
(async () => {
  try {
    db = await open({
      filename: path.join(__dirname, 'data.db'),
      driver: sqlite3.Database
    });

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
        qty INTEGER DEFAULT 999,
        PRIMARY KEY (product_id, variant)
      );
    `);

    console.log('Base de données initialisée ✓');
  } catch (e) {
    console.error('Erreur initialisation DB:', e);
    process.exit(1);
  }
})();

// =============================
//   GÉNÉRATION PDF
// =============================

function makeReceiptPDF(order) {
  const dir = path.join(__dirname, 'receipts');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const file = path.join(dir, `receipt_${order.id}.pdf`);
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(fs.createWriteStream(file));

  // En-tête
  doc.fontSize(18).text('DROGUA CENTER', { align: 'left' });
  doc.moveDown();
  doc.fontSize(14).text('Reçu de commande', { underline: true });
  doc.moveDown(0.5);

  // Informations commande
  doc.fontSize(11).text(`Commande #${order.id}`);
  doc.text(`Date: ${new Date(order.created_at).toLocaleString('fr-FR')}`);
  doc.text(`Client: ${order.customer || 'Client'}`);
  doc.text(`Type: ${order.type}`);
  doc.moveDown();

  // Articles
  doc.fontSize(12).text('Articles:');
  const items = JSON.parse(order.items || '[]');
  items.forEach((it, i) => {
    doc.fontSize(10).text(
      `${i + 1}. ${it.name} - ${it.variant} - ${it.qty} × ${Number(it.price).toFixed(2)} € = ${Number(it.lineTotal).toFixed(2)} €`
    );
  });

  // Adresse
  doc.moveDown();
  doc.fontSize(11).text('Adresse de livraison:');
  doc.text(order.address || '—');

  // Total
  doc.moveDown();
  if (order.discount > 0) {
    doc.fontSize(11).text(`Remise fidélité: -${Number(order.discount).toFixed(2)} €`);
  }
  doc.fontSize(13).text(`Total: ${Number(order.total).toFixed(2)} €`, { align: 'right' });

  doc.end();
  return file;
}

// =============================
//   FONCTION ENVOI REÇU CLIENT
// =============================

async function sendReceiptToCustomer(order, customerChatId) {
  if (!customerChatId) {
    console.log('Pas de chat_id client, reçu non envoyé');
    return false;
  }
  
  try {
    const items = JSON.parse(order.items || '[]');
    const linesPretty = items.map((it, i) =>
      ` ${i + 1}. ${it.name} - ${it.variant} - ${it.qty} × ${Number(it.price).toFixed(2)} € = ${Number(it.lineTotal).toFixed(2)} €`
    ).join('\n');

    const customerMessage = `✅ Commande confirmée !

🛍 DROGUA CENTER - Reçu de commande

⸻ Votre commande #${order.id} ⸻

${linesPretty}

📍 Livraison à:
${order.address || '—'}

💰 Montant total: ${order.total.toFixed(2)} €
${order.discount > 0 ? `🎁 Remise fidélité: -${order.discount.toFixed(2)} €` : ''}

⸻
Merci pour votre commande ! 🌟
Un livreur va vous contacter sous peu.`;

    await tgSendMessage(customerChatId, customerMessage);
    
    // Envoyer aussi le PDF
    try {
      const pdfPath = makeReceiptPDF(order);
      await tgSendPDF(customerChatId, pdfPath, `Votre reçu #${order.id}`);
      console.log(`Reçu envoyé au client ${customerChatId}`);
      return true;
    } catch (e) {
      console.error('Erreur envoi PDF client:', e);
      return false;
    }
  } catch (e) {
    console.error('Erreur sendReceiptToCustomer:', e);
    return false;
  }
}

// =============================
//   API GEOCODING
// =============================

app.get('/api/geocode', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q) return res.json({ features: [] });
    
    if (!MAPBOX_KEY) {
      return res.status(500).json({ error: 'MAPBOX_KEY non configurée' });
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_KEY}&autocomplete=true&limit=6`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('Geocode error:', e);
    res.status(500).json({ error: e.message });
  }
});

// =============================
//   API CRÉATION COMMANDE
// =============================

app.post('/api/create-order', async (req, res) => {
  try {
    const {
      customer = 'Client',
      type = 'Livraison',
      address = '',
      items = [],
      total = 0,
      telegram_user = null,
      telegram_init_data = null
    } = req.body;

    // Validation
    if (!items || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Panier vide' });
    }

    // Calcul fidélité: -10€ tous les 10 commandes
    const row = await db.get(
      'SELECT COUNT(*) as cnt FROM orders WHERE customer = ?',
      customer
    );
    const previousOrders = row ? row.cnt : 0;
    let discount = 0;
    
    if ((previousOrders + 1) % 10 === 0) {
      discount = 10;
    }

    const finalTotal = Math.max(0, Number(total) - discount);

    // Insertion commande
    const result = await db.run(
      'INSERT INTO orders (customer, type, address, items, total, discount) VALUES (?, ?, ?, ?, ?, ?)',
      customer,
      type,
      address,
      JSON.stringify(items),
      finalTotal,
      discount
    );

    const orderId = result.lastID;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', orderId);

    // Préparation messages
    const linesPretty = items.map((it, i) =>
      ` ${i + 1}. ${it.name} - ${it.variant} - ${it.qty} × ${Number(it.price).toFixed(2)} € = ${Number(it.lineTotal).toFixed(2)} €`
    ).join('\n');

    // Message admin complet
    const adminMessage = `🛍 Nouvelle Commande DROGUA CENTER

⸻ Détails de la commande ⸻
Commande #${orderId}
Client: ${customer}
${telegram_user ? `📱 Telegram: ${telegram_user}` : ''}
Type: ${order.type}

${linesPretty}

📍 Adresse de livraison:
${order.address || '—'}

💰 Montant total: ${order.total.toFixed(2)} €
${discount > 0 ? `🎁 Remise fidélité: -${order.discount.toFixed(2)} €` : ''}

⸻
Merci pour votre confiance 🌟`;

    // Envoi à l'admin
    if (ADMIN_CHAT_ID) {
      await tgSendMessage(ADMIN_CHAT_ID, adminMessage);
      
      // Génération et envoi du PDF
      try {
        const pdfPath = makeReceiptPDF(order);
        await tgSendPDF(ADMIN_CHAT_ID, pdfPath, `Reçu #${orderId}`);
      } catch (pdfError) {
        console.error('Erreur génération PDF admin:', pdfError);
      }
    }

    // Message livreur (sans nom client)
    if (DRIVER_CHAT_ID) {
      const driverMessage = `📦 Nouvelle Livraison

${linesPretty}

📍 Adresse:
${order.address || '—'}

💵 Total à encaisser: ${order.total.toFixed(2)} €`;

      await tgSendMessage(DRIVER_CHAT_ID, driverMessage);
    }

    // Envoi du reçu au client
    let customerChatId = null;
    let receiptSent = false;

    if (telegram_init_data) {
      try {
        const params = new URLSearchParams(telegram_init_data);
        const userJson = params.get('user');
        if (userJson) {
          const user = JSON.parse(userJson);
          customerChatId = user.id;
          console.log('Client Telegram détecté:', user.id, user.username);
        }
      } catch (e) {
        console.error('Erreur parsing Telegram init data:', e);
      }
    }

    if (!customerChatId && telegram_user) {
      if (!isNaN(telegram_user)) {
        customerChatId = telegram_user;
      }
    }

    if (customerChatId) {
      receiptSent = await sendReceiptToCustomer(order, customerChatId);
    }

    res.json({
      ok: true,
      id: orderId,
      discount: order.discount,
      total: order.total,
      receipt_sent: receiptSent
    });
  } catch (e) {
    console.error('create-order error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =============================
//   ADMIN: AUTHENTIFICATION
// =============================

const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
const sessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [token, timestamp] of sessions.entries()) {
    if (now - timestamp > SESSION_TIMEOUT) {
      sessions.delete(token);
    }
  }
}, 60 * 60 * 1000);

app.post('/api/admin/login', (req, res) => {
  const { password = '' } = req.body;
  
  if (password !== ADMIN_PASS) {
    return res.status(401).json({ ok: false, error: 'invalid' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now());
  
  res.json({ ok: true, token });
});

function guardAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || '';
  
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const timestamp = sessions.get(token);
  if (Date.now() - timestamp > SESSION_TIMEOUT) {
    sessions.delete(token);
    return res.status(401).json({ ok: false, error: 'session expired' });
  }

  sessions.set(token, Date.now());
  next();
}

// =============================
//   ADMIN: LISTE COMMANDES
// =============================

app.get('/api/admin/orders', guardAdmin, async (req, res) => {
  try {
    const orders = await db.all('SELECT * FROM orders ORDER BY created_at DESC');
    
    orders.forEach(order => {
      order.items = JSON.parse(order.items || '[]');
    });

    const totalCA = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);

    res.json({
      ok: true,
      orders,
      ca: totalCA
    });
  } catch (e) {
    console.error('admin/orders error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =============================
//   SPA FALLBACK
// =============================

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// =============================
//   DÉMARRAGE SERVEUR
// =============================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📱 Webapp URL: ${WEBAPP_URL}`);
  console.log(`🛠  Admin URL: ${ADMIN_URL}`);
  if (!TELEGRAM_TOKEN) console.warn('⚠️  TELEGRAM_TOKEN non configuré');
  if (!MAPBOX_KEY) console.warn('⚠️  MAPBOX_KEY non configuré');
});
