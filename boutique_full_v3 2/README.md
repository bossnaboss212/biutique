# Boutique - v3 (Frontend + Backend)

Ne **committez jamais** vos secrets. Définissez ces variables d'environnement sur Railway/Render/Heroku :
- TELEGRAM_TOKEN
- ADMIN_CHAT_ID
- MAPBOX_KEY
- ADMIN_PASS  (ex: gangstaforlife12)

## Démarrer en local
npm install
npm start

## Déploiement
- Backend : Railway/Render/Heroku (npm start)
- Frontend : Netlify, Publish directory = public (Build command vide)

Si backend sur un autre domaine que Netlify, dans public/app.js :
const API = "https://TON_BACKEND.up.railway.app/api";
