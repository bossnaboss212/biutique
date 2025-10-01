import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, Package, Download, Send, Bell, Calendar, DollarSign, ShoppingCart, AlertCircle, CheckCircle, Settings, FileText, MapPin } from 'lucide-react';

export default function AdminDashboard() {
  const [token, setToken] = useState(localStorage.getItem('admin_token') || '');
  const [password, setPassword] = useState('');
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [period, setPeriod] = useState('all');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [alerts, setAlerts] = useState([]);
  const [autoReports, setAutoReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const API_URL = window.location.origin;

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token, period]);

  const showMessage = (msg, isError = false) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const login = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.ok) {
        setToken(data.token);
        localStorage.setItem('admin_token', data.token);
        showMessage('✅ Connexion réussie');
      } else {
        showMessage('❌ Mot de passe incorrect', true);
      }
    } catch (e) {
      showMessage('❌ Erreur de connexion', true);
    }
  };

  const logout = () => {
    setToken('');
    localStorage.removeItem('admin_token');
  };

  const loadData = async () => {
    try {
      const [statsRes, ordersRes, alertsRes, reportsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/stats?period=${period}`, {
          headers: { 'x-admin-token': token }
        }),
        fetch(`${API_URL}/api/admin/orders`, {
          headers: { 'x-admin-token': token }
        }),
        fetch(`${API_URL}/api/admin/alerts`, {
          headers: { 'x-admin-token': token }
        }),
        fetch(`${API_URL}/api/admin/auto-reports`, {
          headers: { 'x-admin-token': token }
        })
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrders(ordersData.orders || []);
      }
      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData.alerts || []);
      }
      if (reportsRes.ok) {
        const reportsData = await reportsRes.json();
        setAutoReports(reportsData.reports || []);
      }
    } catch (e) {
      console.error('Erreur chargement:', e);
    }
  };

  const downloadPDF = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/recap-pdf?period=${period}`, {
        headers: { 'x-admin-token': token }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recap_${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      showMessage('✅ PDF téléchargé');
    } catch (e) {
      showMessage('❌ Erreur téléchargement', true);
    }
    setLoading(false);
  };

  const downloadCSV = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/export-csv`, {
        headers: { 'x-admin-token': token }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `commandes_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      showMessage('✅ CSV téléchargé');
    } catch (e) {
      showMessage('❌ Erreur téléchargement', true);
    }
    setLoading(false);
  };

  const sendToTelegram = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/send-recap-to-admin`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-token': token 
        }
      });
      const data = await res.json();
      if (data.ok) {
        showMessage('✅ Rapport envoyé sur Telegram');
      } else {
        showMessage('❌ ' + (data.error || 'Erreur'), true);
      }
    } catch (e) {
      showMessage('❌ Erreur envoi', true);
    }
    setLoading(false);
  };

  const addAlert = async (type, threshold) => {
    try {
      const chatId = prompt('Chat ID Telegram:');
      if (!chatId) return;
      
      const res = await fetch(`${API_URL}/api/admin/alerts`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-token': token 
        },
        body: JSON.stringify({ type, threshold: Number(threshold), chat_id: chatId })
      });
      
      if (res.ok) {
        showMessage('✅ Alerte créée');
        loadData();
      }
    } catch (e) {
      showMessage('❌ Erreur création alerte', true);
    }
  };

  const deleteAlert = async (id) => {
    if (!confirm('Supprimer cette alerte ?')) return;
    try {
      await fetch(`${API_URL}/api/admin/alerts/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': token }
      });
      showMessage('✅ Alerte supprimée');
      loadData();
    } catch (e) {
      showMessage('❌ Erreur', true);
    }
  };

  const addAutoReport = async (frequency) => {
    try {
      const chatId = prompt('Chat ID Telegram:');
      if (!chatId) return;
      
      const res = await fetch(`${API_URL}/api/admin/auto-reports`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-token': token 
        },
        body: JSON.stringify({ type: 'full', frequency, chat_id: chatId })
      });
      
      if (res.ok) {
        showMessage('✅ Rapport automatique créé');
        loadData();
      }
    } catch (e) {
      showMessage('❌ Erreur', true);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-full mb-4">
              <Settings className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Admin Panel</h1>
            <p className="text-gray-600 mt-2">Connexion sécurisée</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && login()}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Entrez le mot de passe"
                required
              />
            </div>
            
            <button
              onClick={login}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              Se connecter
            </button>
          </div>
          
          {message && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
              {message}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">DROGUA CENTER</h1>
            <p className="text-sm text-gray-600">Tableau de bord administrateur</p>
          </div>
          
          <div className="flex items-center gap-4">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Toutes périodes</option>
              <option value="today">Aujourd'hui</option>
              <option value="week">7 derniers jours</option>
              <option value="month">30 derniers jours</option>
            </select>
            
            <button
              onClick={logout}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* Message Toast */}
      {message && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          {message}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-2">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
              { id: 'orders', label: 'Commandes', icon: ShoppingCart },
              { id: 'reports', label: 'Rapports', icon: FileText },
              { id: 'alerts', label: 'Alertes', icon: Bell },
              { id: 'auto', label: 'Automatisation', icon: Settings }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && stats && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <ShoppingCart className="w-8 h-8 opacity-80" />
                  <span className="text-3xl font-bold">{stats.total_orders}</span>
                </div>
                <p className="text-green-100">Commandes</p>
              </div>

              <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <DollarSign className="w-8 h-8 opacity-80" />
                  <span className="text-3xl font-bold">{stats.total_revenue.toFixed(0)}€</span>
                </div>
                <p className="text-blue-100">Chiffre d'affaires</p>
              </div>

              <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className="w-8 h-8 opacity-80" />
                  <span className="text-3xl font-bold">{stats.avg_basket.toFixed(0)}€</span>
                </div>
                <p className="text-orange-100">Panier moyen</p>
              </div>

              <div className="bg-gradient-to-br from-pink-500 to-pink-600 text-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <Package className="w-8 h-8 opacity-80" />
                  <span className="text-3xl font-bold">-{stats.total_discounts.toFixed(0)}€</span>
                </div>
                <p className="text-pink-100">Remises fidélité</p>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Répartition par type */}
              <div className="bg-white rounded-xl p-6 shadow">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-indigo-600" />
                  Répartition par type
                </h3>
                <div className="space-y-3">
                  {Object.entries(stats.by_type).map(([type, count]) => {
                    const percentage = (count / stats.total_orders) * 100;
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{type}</span>
                          <span className="text-gray-600">{count} ({percentage.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-indigo-600 h-2 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Produits */}
              <div className="bg-white rounded-xl p-6 shadow">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  Top Produits
                </h3>
                <div className="space-y-3">
                  {Object.entries(stats.top_products).slice(0, 5).map(([name, data], i) => (
                    <div key={name} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center font-bold text-sm">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{name}</p>
                        <p className="text-xs text-gray-600">{data.qty} vendus • {data.revenue.toFixed(2)}€</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tendance quotidienne */}
            {stats.daily_trend && stats.daily_trend.length > 0 && (
              <div className="bg-white rounded-xl p-6 shadow">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  Tendance des 7 derniers jours
                </h3>
                <div className="flex items-end gap-2 h-40">
                  {stats.daily_trend.slice(-7).map((day, i) => {
                    const maxRevenue = Math.max(...stats.daily_trend.map(d => d.revenue));
                    const height = (day.revenue / maxRevenue) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2">
                        <div className="text-xs text-gray-600">{day.revenue.toFixed(0)}€</div>
                        <div
                          className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t transition-all hover:from-blue-600 hover:to-blue-500"
                          style={{ height: `${height}%` }}
                        />
                        <div className="text-xs text-gray-500">{new Date(day.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-xl shadow">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Commandes récentes</h2>
              <p className="text-gray-600 text-sm">Total: {orders.length} commande(s)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Articles</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.slice(0, 50).map(order => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium">#{order.id}</td>
                      <td className="px-6 py-4 text-sm">{order.customer}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(order.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          {order.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {order.items.reduce((sum, it) => sum + it.qty, 0)} articles
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-green-600">
                        {order.total.toFixed(2)}€
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow">
              <h2 className="text-xl font-semibold mb-4">Générer un rapport</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={downloadPDF}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Download className="w-5 h-5" />
                  Télécharger PDF
                </button>
                
                <button
                  onClick={downloadCSV}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-4 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <FileText className="w-5 h-5" />
                  Exporter CSV
                </button>
                
                <button
                  onClick={sendToTelegram}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                  Envoyer sur Telegram
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow">
              <h3 className="text-lg font-semibold mb-4">Contenu du rapport PDF</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Statistiques globales</p>
                    <p className="text-gray-600">Commandes, CA, panier moyen, remises</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Top produits & clients</p>
                    <p className="text-gray-600">Classements par performance</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Analyse temporelle</p>
                    <p className="text-gray-600">Tendances et prévisions</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Analyse géographique</p>
                    <p className="text-gray-600">Zones de livraison</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Graphiques visuels</p>
                    <p className="text-gray-600">Camemberts et barres</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Détails des commandes</p>
                    <p className="text-gray-600">Liste complète</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ALERTS TAB */}
        {activeTab === 'alerts' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow">
              <h2 className="text-xl font-semibold mb-4">Créer une alerte</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => addAlert('low_activity', prompt('Seuil (nb commandes min/jour):'))}
                  className="flex items-center justify-center gap-2 bg-orange-600 text-white px-6 py-4 rounded-lg hover:bg-orange-700"
                >
                  <AlertCircle className="w-5 h-5" />
                  Activité faible
                </button>
                
                <button
                  onClick={() => addAlert('high_revenue', prompt('Objectif CA journalier (€):'))}
                  className="flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-4 rounded-lg hover:bg-green-700"
                >
                  <TrendingUp className="w-5 h-5" />
                  Objectif CA atteint
                </button>
                
                <button
                  onClick={() => showMessage('⚠️ À implémenter avec gestion stock')}
                  className="flex items-center justify-center gap-2 bg-red-600 text-white px-6 py-4 rounded-lg hover:bg-red-700"
                >
                  <Package className="w-5 h-5" />
                  Stock faible
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow">
              <h3 className="text-lg font-semibold mb-4">Alertes actives ({alerts.length})</h3>
              <div className="space-y-3">
                {alerts.map(alert => (
                  <div key={alert.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-indigo-600" />
                      <div>
                        <p className="font-medium">
                          {alert.type === 'low_activity' ? 'Activité faible' : 
                           alert.type === 'high_revenue' ? 'Objectif CA' : alert.type}
                        </p>
                        <p className="text-sm text-gray-600">
                          Seuil: {alert.threshold} • Chat: {alert.chat_id}
                        </p>
                        {alert.last_triggered && (
                          <p className="text-xs text-gray-500">
                            Dernier déclenchement: {new Date(alert.last_triggered).toLocaleString('fr-FR')}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteAlert(alert.id)}
                      className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
                {alerts.length === 0 && (
                  <p className="text-gray-500 text-center py-8">Aucune alerte configurée</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AUTO TAB */}
        {activeTab === 'auto' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow">
              <h2 className="text-xl font-semibold mb-4">Rapports automatiques</h2>
              <p className="text-gray-600 mb-4">Les rapports seront envoyés automatiquement sur Telegram</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => addAutoReport('daily')}
                  className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700"
                >
                  <Calendar className="w-5 h-5" />
                  Rapport quotidien
                </button>
                
                <button
                  onClick={() => addAutoReport('weekly')}
                  className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-4 rounded-lg hover:bg-indigo-700"
                >
                  <Calendar className="w-5 h-5" />
                  Rapport hebdomadaire
                </button>
                
                <button
                  onClick={() => addAutoReport('monthly')}
                  className="flex items-center justify-center gap-2 bg-purple-600 text-white px-6 py-4 rounded-lg hover:bg-purple-700"
                >
                  <Calendar className="w-5 h-5" />
                  Rapport mensuel
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow">
              <h3 className="text-lg font-semibold mb-4">Rapports programmés ({autoReports.length})</h3>
              <div className="space-y-3">
                {autoReports.map(report => (
                  <div key={report.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-indigo-600" />
                      <div>
                        <p className="font-medium capitalize">{report.frequency}</p>
                        <p className="text-sm text-gray-600">Chat ID: {report.chat_id}</p>
                        {report.last_sent && (
                          <p className="text-xs text-gray-500">
                            Dernier envoi: {new Date(report.last_sent).toLocaleString('fr-FR')}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        if (confirm('Supprimer ce rapport ?')) {
                          await fetch(`${API_URL}/api/admin/auto-reports/${report.id}`, {
                            method: 'DELETE',
                            headers: { 'x-admin-token': token }
                          });
                          loadData();
                        }
                      }}
                      className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
                {autoReports.length === 0 && (
                  <p className="text-gray-500 text-center py-8">Aucun rapport automatique configuré</p>
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h4 className="font-semibold text-blue-800 mb-2">ℹ️ Comment ça fonctionne ?</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Les rapports sont vérifiés automatiquement toutes les heures</li>
                <li>• Vous recevrez un PDF complet avec toutes les statistiques</li>
                <li>• Les alertes sont vérifiées toutes les 30 minutes</li>
                <li>• Utilisez /whoami dans Telegram pour obtenir votre Chat ID</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
