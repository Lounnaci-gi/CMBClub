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

Le script crée aussi les tables de limitation des connexions et de révocation des
jetons. La table `users` doit être provisionnée séparément avec des mots de passe
au format PBKDF2 utilisé par l’application; aucun compte administrateur par défaut
n’est créé. Ne réutilisez pas de mots de passe temporaires basés sur une date de naissance.
Les nouveaux hachages utilisent PBKDF2-HMAC-SHA256 avec 600 000 itérations.
Les hachages existants moins coûteux sont revalidés puis renforcés lors d’une
connexion réussie. Sur Android, le calcul est exécuté par `react-native-quick-crypto`;
une nouvelle compilation native de l’application est nécessaire après l’installation
de cette dépendance.

Configurez ensuite `CORS_ORIGINS` comme variable Worker, avec une liste séparée
par des virgules contenant uniquement les origines Web exactes autorisées.
L’application mobile native n’envoie pas d’en-tête `Origin`.

Avant le déploiement, configurez une clé dédiée au chiffrement AES-GCM des noms
d’utilisateur stockés dans D1 :
```bash
npx wrangler secret put USERNAME_ENCRYPTION_KEY
```
Fournissez au moins 32 caractères générés aléatoirement. Cette clé reste dans
Cloudflare et ne doit jamais être ajoutée au `.env` mobile. Sauvegardez-la dans
votre gestionnaire de secrets : la remplacer sans rechiffrer les données rendrait
les noms déjà chiffrés illisibles. Les anciens noms
d’utilisateur XOR côté Worker sont convertis après une authentification réussie;
conservez l’ancienne `USERNAME_CIPHER_KEY` côté Worker jusqu’à la fin de cette
migration. Côté mobile, cette ancienne clé ne sert qu’à lire les valeurs XOR
existantes; les nouveaux noms utilisent une clé aléatoire du trousseau Keychain
et ne dépendent pas de cette variable.

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

1. Provisionnez un compte administrateur sur la base D1.
2. Ouvrez l'application **CMBClub**.
3. Rendez-vous dans **Configuration / Paramètres** après connexion locale.
4. Dans la section **Cloudflare Backend**, renseignez l'URL de votre API :
   `https://cmbclub-api.<votre-compte>.workers.dev`
5. Cliquez sur **Tester la connexion** puis **Enregistrer**.

En mode local sans backend configuré, la première ouverture demande de créer un
compte administrateur avec un mot de passe d’au moins 12 caractères. Il n’existe
plus d’identifiants par défaut.
