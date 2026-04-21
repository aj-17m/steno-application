# Stenographer Practice Platform

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB running locally on port 27017

### 1. Backend Setup
```bash
cd backend
npm install
node seed.js          # creates admin user
npm run dev           # starts on http://localhost:5000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev           # starts on http://localhost:5173
```

### Default Admin Credentials
- Email: `admin@steno.com`
- Password: `admin123`

## Workflow
1. Login as admin → Upload PDF test → Assign to users
2. Login as user → Start test → Listen to audio → Type → Submit → View results

## Folder Structure
```
st-application/
├── backend/
│   ├── src/
│   │   ├── models/         # Mongoose models
│   │   ├── routes/         # Express routes
│   │   ├── middleware/     # JWT auth middleware
│   │   ├── utils/          # Evaluation logic
│   │   └── index.js
│   ├── uploads/
│   │   ├── pdfs/           # Uploaded PDFs
│   │   └── audio/          # Generated MP3s
│   ├── seed.js
│   └── package.json
└── frontend/
    ├── src/
    │   ├── pages/          # Login, Dashboard, TestPage, ResultPage, AdminDashboard
    │   ├── context/        # AuthContext
    │   └── api/            # Axios instance
    └── package.json
```

## Evaluation Rules
- Exact match → correct
- Levenshtein distance ≤ 30% → 0.5 mistake
- Wrong word → 1 mistake
- Extra word typed → 1.5 mistakes total















---------------------------------------------------------------------------------------------



