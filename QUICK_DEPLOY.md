# QUICK START - Deploy in 30 Minutes

## ⚡ TL;DR (30-min deployment)

### 1. Frontend → Vercel (5 min)
```bash
# Push to GitHub
git push origin main

# Go to https://vercel.com → Import GitHub project
# Add env var: VITE_API_URL = https://your-backend.onrender.com
# Done! ✓
```

### 2. Backend → Render (10 min)
```bash
# Go to https://render.com → New Web Service
# Connect GitHub repo
# Build: cd backend && npm install
# Start: cd backend && npm start

# Add env vars:
NODE_ENV=production
MONGO_URI=your-mongodb-connection-string
JWT_SECRET=your-random-256-char-key
CORS_ORIGIN=https://your-app.vercel.app

# Deploy! ✓
```

### 3. Database → MongoDB Atlas (5 min)
```
Go to https://mongodb.com/cloud/atlas
Create free cluster (M0)
Add user: stenographer_user / password
Copy connection string
Add to Render env vars as MONGO_URI ✓
```

### 4. Storage → Firebase (5 min)
```
Go to https://console.firebase.google.com
Create project
Go to Storage → Get Started (Test Mode)
Done! ✓
```

### 5. Keep Backend Alive (5 min - OPTIONAL but RECOMMENDED)
```
Go to https://uptimerobot.com
Add monitor for: https://your-backend.onrender.com/api/health
Check every 14 minutes
DONE! Backend stays awake ✓
```

---

## 📋 Required Credentials Checklist

Before starting, you need these FREE accounts:

```
☐ GitHub account (free)
☐ Vercel account (free - sign in with GitHub)
☐ Render account (free - sign in with GitHub)  
☐ MongoDB Atlas account (free - no card needed)
☐ Firebase account (free - Google account)
☐ UptimeRobot account (free - optional but recommended)
```

---

## 🔑 Environment Variables You'll Need

**Render Backend:**
```
NODE_ENV=production
PORT=5000
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/stenographer
JWT_SECRET=[use: node -e "console.log(require('crypto').randomBytes(128).toString('hex'))"]
CORS_ORIGIN=https://your-app-name.vercel.app
```

**Vercel Frontend:**
```
VITE_API_URL=https://your-backend.onrender.com
```

---

## 🚨 Common Mistakes to Avoid

| ❌ Mistake | ✅ Fix |
|-----------|--------|
| Forgot to update CORS_ORIGIN | Update in Render env vars |
| Frontend can't reach backend | Check VITE_API_URL in Vercel |
| "API not found" errors | Ensure backend is deployed successfully |
| Backend spins down (Render free) | Set up UptimeRobot to ping every 14 min |
| MongoDB connection fails | Check IP whitelist = 0.0.0.0/0 |
| File uploads don't work | Firebase not configured (optional for now) |

---

## ✅ Deployment Verification

After deploying, test these:

```bash
# 1. Frontend loads
curl https://your-app.vercel.app
# Should show HTML

# 2. Backend API responds
curl https://your-backend.onrender.com/api/health
# Should return: {"status":"healthy",...}

# 3. Can login
- Go to app
- Try: admin@steno.com / admin123
- Should see dashboard

# 4. Can take a test
- Click any test
- Type something
- Submit
- Should see results

# 5. Can access leaderboard
- Go to Profile → Leaderboard
- Should show rankings
```

---

## 📊 Performance at 20 Users

With this setup:

| Metric | Performance |
|--------|-------------|
| **Page Load** | < 2s (Vercel CDN) |
| **API Response** | 200-500ms (Render + MongoDB) |
| **Concurrent Users** | 20+ ✅ |
| **Monthly Cost** | $0 (completely free) ✅ |
| **Uptime** | 99.5% (with UptimeRobot) |
| **Storage** | 512MB MongoDB + 5GB Firebase |

---

## 🆘 If Something Breaks

**Error: "Cannot find module"**
```
Fix: Render → Logs → Check build output
Run: npm install in backend/ locally first
```

**Error: "CORS error"**
```
Fix: Update CORS_ORIGIN in Render to match Vercel domain
Format: https://your-app-name.vercel.app (no trailing slash)
```

**Error: "MongoDB connection timeout"**
```
Fix: MongoDB Atlas → Network Access → Add 0.0.0.0/0
Wait 5 minutes for whitelist to update
```

**Backend not responding**
```
Fix: Check Render logs for errors
Likely: Missing env vars or build failed
Try: Redeploy from Render dashboard
```

---

## 📈 When to Upgrade (If needed)

**If you get:**
- "Backend timeout" → Upgrade Render to paid ($7/month)
- "Storage full" → Upgrade MongoDB to M2 ($9/month)
- Lots of file uploads → Firebase is free, no action needed

**Cost to support 100 users: ~$20/month**

---

## 🎯 Summary

**You can deploy this application for FREE supporting 20 concurrent users with:**
- ✅ Vercel (Frontend)
- ✅ Render (Backend)
- ✅ MongoDB Atlas (Database)
- ✅ Firebase (File Storage)
- ✅ UptimeRobot (Keep backend alive)

**Total: $0/month for 20 users**

Start deploying now! Follow the steps in `FREE_DEPLOYMENT_GUIDE.md` for detailed instructions.

