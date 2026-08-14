# 🚀 Backend Cloudflare D1 & Worker pour CMBClub

Ce backend fournit l'API REST serverless connectée à une base de données relationnelle **Cloudflare D1** (SQLite managé mondialement par Cloudflare) pour l'application mobile **CMBClub**.

---

## 📋 Prérequis

1. Un compte [Cloudflare](https://dash.cloudflare.com/) (gratuit).
2. [Node.js](https://nodejs.org/) installé sur votre machine.

---

## 🛠️ Configuration et Déploiement en 5 étapes

### Étape 1 : Installer les dépendances
Ouvrez un terminal dans le dossier `backend` :
```bash
cd backend
npm install
```

### Étape 2 : Se connecter à Cloudflare avec Wrangler
```bash
npx wrangler login
```
*(Une fenêtre de navigateur s'ouvrira pour autoriser la connexion).*

### Étape 3 : Créer la base de données Cloudflare D1
```bash
npx wrangler d1 create cmbclub-db
```
Vous obtiendrez un message similaire à :
```text
[[d1_databases]]
binding = "DB"
database_name = "cmbclub-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copiez le `database_id` généré et collez-le dans votre fichier [`backend/wrangler.toml`](./wrangler.toml) :
```toml
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### Étape 4 : Initialiser le schéma SQL et les tables sur D1
Exécutez le script SQL sur Cloudflare :
```bash
npm run d1:init:remote
```
*(ou `npx wrangler d1 execute cmbclub-db --remote --file=./schema.sql`)*

### Étape 5 : Déployer le Worker
```bash
npm run deploy
```
Wrangler affichera l'URL publique de votre API, par exemple :
```text
https://cmbclub-api.<votre-compte>.workers.dev
```

---

## 🧪 Tester en local (Optionnel)

Pour tester l'API et la base D1 en local sans impacter la production :
```bash
# Initialiser la base locale
npm run d1:init:local

# Lancer le serveur local
npm run dev
```
L'API sera disponible sur `http://localhost:8787` (ou `http://10.0.2.2:8787` sur émulateur Android).

---

## 📱 Lier l'API à l'Application Mobile

1. Ouvrez l'application **CMBClub**.
2. Connectez-vous en tant qu'administrateur (`admin` / `admin123`).
3. Rendez-vous dans **Configuration / Paramètres**.
4. Dans la section **Cloudflare Backend**, renseignez l'URL de votre API :
   `https://cmbclub-api.<votre-compte>.workers.dev`
5. Cliquez sur **Tester la connexion** puis **Enregistrer**.
