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

// =============================
//   MIDDLEWARES
// =============================

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// =============================
//   CONFIGURATION
// =============================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://meek-meerkat-a2e41f.netlify.app';
const ADMIN_URL = process.env.ADMIN_URL || 'https://biutique-production.up.railway.app/admin.html';
const ADMIN_CHAT_ID = (process.env.ADMIN_CHAT_ID || '').trim();
const ADMIN_USER_ID = (process.env.ADMIN_USER_ID || '').trim();
const ADMIN_OPEN = (process.env.ADMIN_OPEN || '').trim() === '1';
const DRIVER_CHAT_ID = (process.env.DRIVER_CHAT_ID || '').trim();
const ADMIN_PASS = process.env.ADMIN_PASS || 'gangstaforlife12';
const MAPBOX_KEY = process.env.MAPBOX_KEY || '';

const TG_API = TELEGRAM_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_TOKEN}` : '';

// =============================
//   TELEGRAM HELPERS
// =============================

async function tgSendMessage(chatId, text, extra = {}) {
  if (!TELEGRAM_TOKEN || !chatId) {
    console.warn('Telegram non configuré: TOKEN ou chatId manquant');
    return { ok: false };
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
    const data = await response.json();
    if (!response.ok) {
      console.error('Erreur Telegram:', data);
    }
    return data;
  } catch (e) {
    console.error('tgSendMessage error:', e.message);
    return { ok: false };
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
    return { ok: false };
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

    const data = await response.json();
    if (!response.ok) {
      console.error('Erreur envoi PDF:', data);
    }
    return data;
  } catch (e) {
    console.error('tgSendPDF error:', e.message);
    return { ok: false };
  }
}

// =============================
//   ROUTES DE TEST
// =============================

app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'DROGUA CENTER API',
    version: '2.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/webhook', (_req, res) => {
  res.status(200).json({ status: 'Webhook OK 🚀' });
});

// Health check
app.get('/health', async (_req, res) => {
  try {
    await db.get('SELECT 1');
    res.json({
      status: 'healthy',
      database: 'connected',
      telegram: TELEGRAM_TOKEN ? 'configured' : 'not configured'
    });
  } catch (e) {
    res.status(500).json({
      status: 'unhealthy',
      error: e.message
    });
  }
});

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
      '• /debug  → voir les variables'
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

async function initDatabase() {
  try {
    db = await open({
      filename: path.join(__dirname, 'data.db'),
      driver: sqlite3.Database
    });

    // Table commandes
    await db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer TEXT NOT NULL,
        type TEXT DEFAULT 'Livraison',
        address TEXT,
        items TEXT NOT NULL,
        total REAL NOT NULL DEFAULT 0,
        discount REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Table stock
    await db.exec(`
      CREATE TABLE IF NOT EXISTS stock (
        product_id INTEGER NOT NULL,
        variant TEXT NOT NULL,
        qty INTEGER DEFAULT 0,
        PRIMARY KEY (product_id, variant)
      );
    `);

    // Table mouvements stock
    await db.exec(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        variant TEXT NOT NULL,
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        stock_after INTEGER NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Table produits
    await db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        farm TEXT,
        variants TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Table avis
    await db.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        name TEXT,
        stars INTEGER NOT NULL,
        text TEXT,
        approved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Table paramètres
    await db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Paramètres par défaut
    await db.run(`
      INSERT OR IGNORE INTO settings (key, value) VALUES 
      ('shop_name', 'DROGUA CENTER'),
      ('delivery_fee', '20'),
      ('loyalty_threshold', '10')
    `);

    // Index pour performances
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
    `);

    console.log('✓ Base de données initialisée');
  } catch (e) {
    console.error('✗ Erreur initialisation DB:', e);
    throw e;
  }
}

// Initialiser la DB au démarrage
initDatabase().catch(e => {
  console.error('Impossible de démarrer sans DB:', e);
  process.exit(1);
});

// =============================
//   UTILITAIRES
// =============================

function parseItems(itemsStr) {
  try {
    return JSON.parse(itemsStr || '[]');
  } catch {
    return [];
  }
}

function formatOrderMessage(order, includeCustomerName = true) {
  const items = parseItems(order.items);
  const linesPretty = items.map((it, i) =>
    ` ${i + 1}. ${it.name} - ${it.variant} - ${it.qty} × ${Number(it.price).toFixed(2)} € = ${Number(it.lineTotal).toFixed(2)} €`
  ).join('\n');

  let message = `🛍 ${includeCustomerName ? 'Nouvelle' : ''} Commande #${order.id}\n\n`;
  
  if (includeCustomerName) {
    message += `Client: ${order.customer}\n`;
  }
  
  message += `Type: ${order.type}\n\n`;
  message += `${linesPretty}\n\n`;
  message += `📍 Adresse:\n${order.address || '—'}\n\n`;
  message += `💰 Total: ${Number(order.total).toFixed(2)} €`;
  
  if (order.discount > 0) {
    message += `\n🎁 Remise fidélité: -${Number(order.discount).toFixed(2)} €`;
  }

  return message;
}

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
  const items = parseItems(order.items);
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
//   ENVOI REÇU CLIENT
// =============================

async function sendReceiptToCustomer(order, customerChatId) {
  if (!customerChatId || !TELEGRAM_TOKEN) {
    console.log('Pas de chat_id client ou Telegram non configuré');
    return false;
  }

  try {
    const message = formatOrderMessage(order, false) + '\n\n✅ Commande confirmée !\nMerci pour votre commande ! 🌟';
    await tgSendMessage(customerChatId, message);

    try {
      const pdfPath = makeReceiptPDF(order);
      await tgSendPDF(customerChatId, pdfPath, `Votre reçu #${order.id}`);
      console.log(`✓ Reçu envoyé au client ${customerChatId}`);
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
      return res.status(503).json({ error: 'Service de géocodage non disponible' });
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

    if (total <= 0) {
      return res.status(400).json({ ok: false, error: 'Montant invalide' });
    }

    // Calcul fidélité
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
      'INSERT INTO orders (customer, type, address, items, total, discount, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      customer,
      type,
      address,
      JSON.stringify(items),
      finalTotal,
      discount,
      'pending'
    );

    const orderId = result.lastID;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', orderId);

    // Message admin
    const adminMessage = formatOrderMessage(order, true);
    if (ADMIN_CHAT_ID) {
      await tgSendMessage(ADMIN_CHAT_ID, adminMessage);
      try {
        const pdfPath = makeReceiptPDF(order);
        await tgSendPDF(ADMIN_CHAT_ID, pdfPath, `Reçu #${orderId}`);
      } catch (pdfError) {
        console.error('Erreur génération PDF admin:', pdfError);
      }
    }

    // Message livreur
    if (DRIVER_CHAT_ID) {
      const driverMessage = formatOrderMessage(order, false);
      await tgSendMessage(DRIVER_CHAT_ID, driverMessage);
    }

    // Envoi reçu client
    let customerChatId = null;
    let receiptSent = false;

    if (telegram_init_data) {
      try {
        const params = new URLSearchParams(telegram_init_data);
        const userJson = params.get('user');
        if (userJson) {
          const user = JSON.parse(userJson);
          customerChatId = user.id;
        }
      } catch (e) {
        console.error('Erreur parsing Telegram init data:', e);
      }
    }

    if (!customerChatId && telegram_user && !isNaN(telegram_user)) {
      customerChatId = telegram_user;
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

const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 heures
const sessions = new Map();

// Nettoyage des sessions expirées
setInterval(() => {
  const now = Date.now();
  for (const [token, timestamp] of sessions.entries()) {
    if (now - timestamp > SESSION_TIMEOUT) {
      sessions.delete(token);
    }
  }
}, 60 * 60 * 1000); // Toutes les heures

app.post('/api/admin/login', (req, res) => {
  try {
    const { password = '' } = req.body;

    if (password !== ADMIN_PASS) {
      return res.status(401).json({ ok: false, error: 'invalid' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now());

    res.json({ ok: true, token });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Middleware de protection admin
function guardAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || '';

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const timestamp = sessions.get(token);
  if (Date.now() - timestamp > SESSION_TIMEOUT) {
    sessions.delete(token);
    return res.status(401).json({ ok: false, error: 'session_expired' });
  }

  sessions.set(token, Date.now());
  next();
}

// =============================
//   ADMIN: STATISTIQUES
// =============================

app.get('/api/admin/stats', guardAdmin, async (req, res) => {
  try {
    // Commandes
    const orders = await db.all('SELECT * FROM orders');
    const totalCA = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalOrders = orders.length;
    const avgOrder = totalOrders > 0 ? totalCA / totalOrders : 0;

    // Produit le plus vendu
    const itemCounts = {};
    orders.forEach(o => {
      const items = parseItems(o.items);
      items.forEach(it => {
        itemCounts[it.name] = (itemCounts[it.name] || 0) + it.qty;
      });
    });
    const topProduct = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

    // Stock (pour les stats, on peut retourner des valeurs par défaut si pas de table stock)
    let stockValue = 0;
    let stockOut = 0;
    let stockLow = 0;

    try {
      const stockItems = await db.all('SELECT * FROM stock');
      // Calcul simplifié car on n'a pas les prix dans la table stock
      stockValue = stockItems.reduce((sum, s) => sum + s.qty * 10, 0); // Prix moyen estimé
      stockOut = stockItems.filter(s => s.qty === 0).length;
      stockLow = stockItems.filter(s => s.qty > 0 && s.qty < 10).length;
    } catch (e) {
      console.warn('Table stock non disponible:', e.message);
    }

    res.json({
      ok: true,
      stats: {
        totalCA,
        totalOrders,
        avgOrder,
        topProduct,
        stockValue,
        stockOut,
        stockLow
      }
    });
  } catch (e) {
    console.error('stats error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =============================
//   ADMIN: COMMANDES
// =============================

app.get('/api/admin/orders', guardAdmin, async (req, res) => {
  try {
    const { status = 'all', limit = 1000 } = req.query;

    let query = 'SELECT * FROM orders';
    const params = [];

    if (status !== 'all') {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const orders = await db.all(query, params);

    orders.forEach(order => {
      order.items = parseItems(order.items);
    });

    res.json({ ok: true, orders });
  } catch (e) {
    console.error('admin/orders error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/admin/orders/:id', guardAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = ['customer', 'type', 'address', 'status', 'total'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ ok: false, error: 'no_valid_fields' });
    }

    values.push(id);
    await db.run(
      `UPDATE orders SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('update order error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/admin/orders/:id', guardAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM orders WHERE id = ?', id);
    res.json({ ok: true });
  } catch (e) {
    console.error('delete order error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Export CSV des commandes
app.get('/api/admin/orders/export/csv', guardAdmin, async (req, res) => {
  try {
    const orders = await db.all('SELECT * FROM orders ORDER BY created_at DESC');

    let csv = 'ID,Date,Client,Type,Adresse,Total,Remise,Statut\n';
    orders.forEach(o => {
      const date = new Date(o.created_at).toLocaleString('fr-FR');
      csv += `${o.id},"${date}","${o.customer}","${o.type}","${(o.address || '').replace(/"/g, '""')}",${o.total},${o.discount || 0},"${o.status || 'pending'}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders_${Date.now()}.csv"`);
    res.send('\ufeff' + csv); // BOM UTF-8
  } catch (e) {
    console.error('export csv error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =============================
//   ADMIN: STOCK
// =============================

app.get('/api/admin/stock', guardAdmin, async (req, res) => {
  try {
    const stock = await db.all('SELECT * FROM stock ORDER BY product_id, variant');
    res.json({ ok: true, stock });
  } catch (e) {
    console.error('stock error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/admin/stock/movement', guardAdmin, async (req, res) => {
  try {
    const { product_id, variant, type, quantity, reason = '' } = req.body;

    if (!product_id || !variant || !type || !quantity) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    // Récupérer le stock actuel
    let stock = await db.get(
      'SELECT qty FROM stock WHERE product_id = ? AND variant = ?',
      product_id, variant
    );

    let currentQty = stock ? stock.qty : 0;
    let newQty = currentQty;

    if (type === 'in') {
      newQty = currentQty + parseInt(quantity);
    } else if (type === 'out') {
      newQty = Math.max(0, currentQty - parseInt(quantity));
    } else {
      return res.status(400).json({ ok: false, error: 'invalid_type' });
    }

    // Mettre à jour ou insérer le stock
    await db.run(
      'INSERT INTO stock (product_id, variant, qty) VALUES (?, ?, ?) ON CONFLICT(product_id, variant) DO UPDATE SET qty = ?',
      product_id, variant, newQty, newQty
    );

    // Enregistrer le mouvement
    await db.run(
      'INSERT INTO stock_movements (product_id, variant, type, quantity, stock_after, reason) VALUES (?, ?, ?, ?, ?, ?)',
      product_id, variant, type, quantity, newQty, reason
    );

    res.json({ ok: true, newQty });
  } catch (e) {
    console.error('stock movement error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/admin/stock/movements', guardAdmin, async (req, res) => {
  try {
    const movements = await db.all(
      'SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ ok: true, movements });
  } catch (e) {
    console.error('stock movements error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =============================
//   ADMIN: PRODUITS
// =============================

app.get('/api/admin/products', guardAdmin, async (req, res) => {
  try {
    const products = await db.all('SELECT * FROM products ORDER BY name');
    products.forEach(p => {
      p.variants = parseItems(p.variants);
    });
    res.json({ ok: true, products });
  } catch (e) {
    console.error('products error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/admin/products/:id', guardAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, farm, variants, active } = req.body;

    await db.run(
      'UPDATE products SET name = ?, category = ?, farm = ?, variants = ?, active = ? WHERE id = ?',
      name, category || '', farm || '', JSON.stringify(variants), active ? 1 : 0, id
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('update product error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =============================
//   ADMIN: AVIS
// =============================

app.get('/api/admin/reviews', guardAdmin, async (req, res) => {
  try {
    const reviews = await db.all('SELECT * FROM reviews ORDER BY created_at DESC');
    res.json({ ok: true, reviews });
  } catch (e) {
    console.error('reviews error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/admin/reviews/:id', guardAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { approved } = req.body;

    await db.run('UPDATE reviews SET approved = ? WHERE id = ?', approved ? 1 : 0, id);
    res.json({ ok: true });
  } catch (e) {
    console.error('update review error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/admin/reviews/:id', guardAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM reviews WHERE id = ?', id);
    res.json({ ok: true });
  } catch (e) {
    console.error('delete review error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =============================
//   ADMIN: PARAMÈTRES
// =============================

app.get('/api/admin/settings', guardAdmin, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM settings');
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json({ ok: true, settings });
  } catch (e) {
    console.error('settings error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/admin/settings', guardAdmin, async (req, res) => {
  try {
    const { settings } = req.body;

    for (const [key, value] of Object.entries(settings)) {
      await db.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        key, value
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('update settings error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =============================
//   GESTION DES ERREURS
// =============================

// 404 pour les routes API non trouvées
app.use('/api/*', (req, res) => {
  res.status(404).json({
    ok: false,
    error: 'route_not_found',
    path: req.path
  });
});

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({
    ok: false,
    error: 'internal_server_error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue'
  });
});

// =============================
//   SPA FALLBACK
// =============================

// Pour toutes les autres routes (pas API, pas fichiers statiques déjà servis)
app.use((req, res) => {
  // Si c'est une route API, retourner 404 JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      ok: false,
      error: 'route_not_found',
      path: req.path
    });
  }
  
  // Pour tout le reste, servir index.html (SPA)
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// =============================
//   DÉMARRAGE SERVEUR
// =============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('');
  console.log('🚀 ═══════════════════════════════════════');
  console.log('   DROGUA CENTER - Serveur démarré');
  console.log('═══════════════════════════════════════');
  console.log(`📡 Port: ${PORT}`);
  console.log(`📱 Webapp: ${WEBAPP_URL}`);
  console.log(`🛠  Admin: ${ADMIN_URL}`);
  console.log('');
  console.log('Configuration:');
  console.log(`  ${TELEGRAM_TOKEN ? '✓' : '✗'} Telegram Bot`);
  console.log(`  ${MAPBOX_KEY ? '✓' : '✗'} Mapbox Geocoding`);
  console.log(`  ${ADMIN_CHAT_ID ? '✓' : '✗'} Admin Chat ID`);
  console.log(`  ${DRIVER_CHAT_ID ? '✓' : '✗'} Driver Chat ID`);
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('');
});

// Gestion propre de l'arrêt
process.on('SIGTERM', async () => {
  console.log('SIGTERM reçu, arrêt propre du serveur...');
  if (db) await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT reçu, arrêt propre du serveur...');
  if (db) await db.close();
  process.exit(0);
});
