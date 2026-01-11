# Klimaatapp Backend

IoT klimaatmonitoring applicatie met TTN (The Things Network) integratie.

## Quick Start - Railway Deployment

### 1. Push naar GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/JOUW-USERNAME/klimaatapp.git
git push -u origin main
```

### 2. Railway Setup
1. Ga naar [railway.app](https://railway.app)
2. "New Project" → "Deploy from GitHub repo"
3. Selecteer je `klimaatapp` repository
4. Railway detecteert automatisch Node.js

### 3. MySQL Database toevoegen
1. In je Railway project → "New" → "Database" → "MySQL"
2. Railway koppelt automatisch de database variabelen

### 4. Database tabellen aanmaken
1. Klik op MySQL service → "Data" tab
2. Voer de SQL uit van `schema.sql`

### 5. TTN Webhook instellen
1. Ga naar TTN Console → je Application → Integrations → Webhooks
2. Add webhook:
   - **Webhook ID:** `klimaatapp`
   - **Webhook format:** JSON
   - **Base URL:** `https://jouw-app.up.railway.app`
   - **Downlink API key:** (leeg laten)
   - **Uplink message:** aanvinken, path: `/api/webhook/ttn`

## API Endpoints

| Method | Endpoint | Beschrijving |
|--------|----------|--------------|
| GET | `/api/rooms` | Alle kamers |
| GET | `/api/rooms/:id` | Kamer detail met devices |
| POST | `/api/rooms` | Nieuwe kamer |
| PUT | `/api/rooms/:id` | Kamer bijwerken |
| DELETE | `/api/rooms/:id` | Kamer verwijderen |
| GET | `/api/measurements` | Historische metingen |
| GET | `/api/measurements/chart` | Data voor grafieken |
| POST | `/api/webhook/ttn` | TTN webhook |
| GET | `/api/health` | Health check |

## Lokaal ontwikkelen

```bash
npm install
cp .env.example .env
# Vul .env in met je database gegevens
npm start
```

## Tech Stack
- Node.js + Express
- MySQL
- The Things Network (webhooks)
