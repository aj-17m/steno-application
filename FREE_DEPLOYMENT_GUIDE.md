# FREE DEPLOYMENT GUIDE - 20+ Users, Zero Cost

## 🎯 Recommended Stack (100% FREE)

```
┌─────────────────────────────────────────────────────┐
│          VERCEL (Frontend) - FREE                   │
│   - Unlimited deploy · CDN · 0ms latency            │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│       RENDER (Backend API) - FREE                   │
│   - Node.js hosting · Auto-deploy from GitHub       │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│    MONGODB ATLAS (Database) - FREE                  │
│   - 512MB, no credit card · 3 replicas              │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│   FIREBASE STORAGE (File Upload) - FREE             │
│   - 5GB · Audio files · PDFs                        │
└─────────────────────────────────────────────────────┘
```

---

## STEP 1: Prepare Your Code

### 1.1 Update Backend Configuration

Create `backend/.env.production`:
```env
NODE_ENV=production
PORT=5000
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/stenographer
JWT_SECRET=your-super-secure-random-256-bit-key
CORS_ORIGIN=https://your-vercel-domain.vercel.app
```

### 1.2 Create Procfile (for Render)

Create `backend/Procfile`:
```
web: node src/index.js
```

### 1.3 Update package.json

Add to `backend/package.json`:
```json
{
  "engines": {
    "node": "18.x"
  },
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  }
}
```

### 1.4 Backend CORS Fix

Update `backend/src/index.js`:
```javascript
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
```

---

## STEP 2: Deploy Frontend (VERCEL)

### 2.1 Create Vercel Account
1. Go to https://vercel.com
2. Sign up with GitHub account
3. Click "Import Project"
4. Select your repository

### 2.2 Configure Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```
VITE_API_URL=https://your-backend.onrender.com
```

Update `frontend/vite.config.js`:
```javascript
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
});
```

### 2.3 Update axios config

Update `frontend/src/api/axios.js`:
```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});
```

### 2.4 Deploy
- Push to GitHub
- Vercel auto-deploys
- Get your domain: `https://your-app-name.vercel.app`

---

## STEP 3: Deploy Backend (RENDER)

### 3.1 Create Render Account
1. Go to https://render.com
2. Sign up with GitHub
3. Click "New +" → "Web Service"
4. Select your repository

### 3.2 Configuration

| Setting | Value |
|---------|-------|
| **Name** | st-application-backend |
| **Environment** | Node |
| **Build Command** | `cd backend && npm install` |
| **Start Command** | `cd backend && npm start` |
| **Publish Directory** | (leave empty) |
| **Auto-deploy** | Yes |

### 3.3 Add Environment Variables

In Render → Environment:
```
NODE_ENV=production
PORT=5000
MONGO_URI=mongodb+srv://user:pass@cluster0.mongodb.net/stenographer
JWT_SECRET=generate-random-256-char-string
CORS_ORIGIN=https://your-app-name.vercel.app
```

**Generate JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(128).toString('hex'))"
```

### 3.4 Deploy
- Click "Create Web Service"
- Wait for deployment (2-3 minutes)
- Get your URL: `https://st-application-backend.onrender.com`

---

## STEP 4: Database (MONGODB ATLAS)

### 4.1 Create Free Cluster
1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up
3. Click "Build a Cluster" → Select **M0 Free**
4. Select region closest to your users
5. Click "Create"

### 4.2 Create Database User
1. Go to "Database Access"
2. Add Database User
3. Username: `stenographer_user`
4. Password: Generate strong password
5. Add to Whitelist: `0.0.0.0/0` (allow all IPs)

### 4.3 Get Connection String
1. Click "Connect" on your cluster
2. Choose "Connect your application"
3. Copy the connection string:
```
mongodb+srv://stenographer_user:PASSWORD@cluster0.mongodb.net/stenographer?retryWrites=true&w=majority
```

Replace:
- `PASSWORD` with your actual password
- Keep `stenographer` as database name

### 4.4 Add to Render
Paste this in Render Environment Variables as `MONGO_URI`

---

## STEP 5: File Storage (FIREBASE)

### 5.1 Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click "Add Project"
3. Name: `stenographer-app`
4. Disable Analytics
5. Click "Create"

### 5.2 Setup Storage
1. Go to "Build" → "Storage"
2. Click "Get Started"
3. Start in **Test Mode** (free, unmetered)
4. Choose region (same as MongoDB)

### 5.3 Rules for Free Tier
Update Storage Rules:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 5.4 Get Credentials
1. Project Settings → Service Accounts
2. Generate new private key
3. Keep it safe (add to `.env`)

---

## STEP 6: Update Backend for Firebase Storage

### 6.1 Install Firebase Admin
```bash
cd backend
npm install firebase-admin
```

### 6.2 Update uploads handling

Create `backend/src/services/storage.js`:
```javascript
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_KEY, 'base64').toString()
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'your-project.appspot.com',
});

const bucket = admin.storage().bucket();

module.exports = {
  uploadFile: async (file, path) => {
    const blob = bucket.file(path);
    await blob.save(file.buffer, {
      metadata: { contentType: file.mimetype },
    });
    const [url] = await blob.getSignedUrl({ version: 'v4', expires: Date.now() + 15 * 60 * 1000 });
    return url;
  },
};
```

### 6.3 Update multer to use Firebase
Update `backend/src/routes/admin.js`:
```javascript
const storage = require('../services/storage');

// In upload-test route:
if (pdfFile) {
  const pdfUrl = await storage.uploadFile(pdfFile, `pdfs/${Date.now()}.pdf`);
  test.pdfPath = pdfUrl;
}

if (audioFile) {
  const audioUrl = await storage.uploadFile(audioFile, `audio/${Date.now()}.mp3`);
  test.audioPath = audioUrl;
}
```

---

## STEP 7: Setup GitHub & Auto-Deploy

### 7.1 Create GitHub Repository
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/st-application.git
git push -u origin main
```

### 7.2 Vercel Auto-Deploy
- Vercel auto-deploys on every push to main
- Takes 2-3 minutes

### 7.3 Render Auto-Deploy
- Render auto-deploys on every push to main
- Takes 3-5 minutes

---

## STEP 8: Testing & Verification

### 8.1 Test Frontend
```bash
# In frontend/
npm install
npm run build
# Test build locally
npm run preview
```

### 8.2 Test Backend
```bash
# In backend/
npm install
npm start
# Should log: "Server running on port 5000"
```

### 8.3 Check Database Connection
```bash
# In MongoDB Atlas, run command:
db.version()  # Should return version
```

### 8.4 Verify Deployment
1. Open https://your-app-name.vercel.app
2. Try login with test credentials
3. Try taking a test
4. Check Render logs for errors: Dashboard → Backend → Logs

---

## ⚠️ FREE TIER LIMITATIONS & SOLUTIONS

| Issue | Limit | Solution |
|-------|-------|----------|
| **Render Spindown** | Inactive > 15 min | Use UptimeRobot (free) to ping every 14 min |
| **MongoDB Storage** | 512MB | Enough for 100+ users (optimize later) |
| **Firebase Storage** | 5GB | Enough for 1000+ audio files |
| **Vercel Bandwidth** | 100GB/month | Enough for 20 concurrent users |
| **Render CPU** | Shared | May slow down under heavy load |

### Solution: Keep Backend Awake

Create uptime monitor (FREE):
1. Go to https://uptimerobot.com
2. Sign up (free)
3. Add Monitor:
   - URL: `https://your-backend.onrender.com/api/health`
   - Check every: 14 minutes
4. Done! Backend stays alive

---

## SCALING TO 100+ USERS (Still Free Tier)

When you hit free tier limits:

| Component | Free → Paid |
|-----------|-----------|
| Frontend | Vercel Free → Still Free (generous limits) |
| Backend | Render Free ($7/month) → Railway ($5/month) |
| Database | MongoDB 512MB → M2 Tier ($9/month, 10GB) |
| Storage | Firebase Free (5GB) → Still free (pay only overage) |

**Monthly cost for 100 users: ~$15-20** (still super cheap)

---

## PERFORMANCE TIPS FOR 20 USERS

### 1. Enable Caching (Backend)
```javascript
const cache = require('memory-cache');

app.get('/api/user/tests', (req, res) => {
  const cached = cache.get('all-tests');
  if (cached) return res.json(cached);
  
  // ... fetch from DB
  cache.put('all-tests', result, 5 * 60 * 1000); // 5 min
  res.json(result);
});
```

### 2. Optimize Database Queries
- Add indexes (done in previous guide)
- Use `.lean()` for read-only queries
- Pagination for large lists

### 3. Use CDN for Static Assets
- Vercel already uses edge network (auto)
- Images/PDFs served from Firebase (fast)

### 4. Compress Responses
```javascript
const compression = require('compression');
app.use(compression());
```

---

## DEPLOYMENT CHECKLIST

- [ ] GitHub repo created & pushed
- [ ] Vercel project created & domain noted
- [ ] Render backend deployed & domain noted
- [ ] MongoDB Atlas cluster created & connection string saved
- [ ] Firebase project created & credentials saved
- [ ] Environment variables set in Vercel
- [ ] Environment variables set in Render
- [ ] Backend CORS updated with Vercel domain
- [ ] Frontend API URL updated
- [ ] Test login works
- [ ] Test file upload works
- [ ] Test results display
- [ ] UptimeRobot monitor created (optional but recommended)

---

## TROUBLESHOOTING

### Frontend blank page?
```
Check: Browser console (F12) → Network tab
Look for 404 errors on API calls
Solution: Update VITE_API_URL in Vercel settings
```

### Backend 502 error?
```
Check: Render logs → Build tab → Logs
Issue: Usually build command or missing dependency
Solution: npm install, check Procfile syntax
```

### Database connection fails?
```
Check: MongoDB Atlas → Network Access
Issue: IP whitelist blocking Render
Solution: Add 0.0.0.0/0 to IP whitelist (free tier only)
```

### Render backend keeps spinning down?
```
Issue: Free tier spins down after 15 min inactivity
Solution: Set up UptimeRobot to ping every 14 min (FREE)
Alternative: Upgrade to Railway ($5/month) or use Heroku alternative
```

---

## ESTIMATED COSTS

**At 20 concurrent users (100% FREE):**
- Frontend: $0 (Vercel free)
- Backend: $0 (Render free, limited)
- Database: $0 (MongoDB Atlas free)
- Storage: $0 (Firebase free tier)
- **TOTAL: $0/month** ✅

**If you need better performance (500 GB traffic/month):**
- Frontend: $0 (still free)
- Backend: $7-15/month (Railway or Render paid)
- Database: $9/month (MongoDB M2)
- Storage: $0-5/month (Firebase overage)
- **TOTAL: ~$20/month**

---

## NEXT STEPS

1. Follow steps 1-7 above
2. Test everything locally
3. Push to GitHub
4. Deploy to Vercel & Render
5. Share your app with 20 users
6. Monitor performance
7. Scale up when needed

**You now have a production-ready app supporting 20+ users for FREE!** 🚀

