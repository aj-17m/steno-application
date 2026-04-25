const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { extractPDF }  = require('../utils/pdfExtractor');
const { generateAudio } = require('../utils/ttsHelper');
const { uploadBuffer, uploadFile, deleteByUrl } = require('../utils/cloudinaryHelper');

const User       = require('../models/User');
const Test       = require('../models/Test');
const Category   = require('../models/Category');
const Assignment = require('../models/Assignment');
const Result     = require('../models/Result');
const Review     = require('../models/Review');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

// ─── Ensure upload dirs exist (Render ephemeral FS won't have them) ───────────
const AUDIO_TMP = path.join(__dirname, '../../uploads/audio');
const PDF_DIR   = path.join(__dirname, '../../uploads/pdfs');
fs.mkdirSync(AUDIO_TMP, { recursive: true });
fs.mkdirSync(PDF_DIR,   { recursive: true });

// ─── Multer ───────────────────────────────────────────────────────────────────
// PDFs → local disk (we only need them long enough to extract text)
// Audio → memory buffer, then uploaded to Cloudinary for permanent storage
const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PDF_DIR),
  filename   : (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname)}`),
});
const memStorage = multer.memoryStorage();

// Smart storage: route audio to memory, PDFs to disk
const hybridStorage = {
  _handleFile(req, file, cb) {
    if (file.mimetype.startsWith('audio/')) {
      memStorage._handleFile(req, file, cb);
    } else {
      pdfStorage._handleFile(req, file, cb);
    }
  },
  _removeFile(req, file, cb) {
    if (file.buffer) cb(null); // memory — nothing to remove
    else pdfStorage._removeFile(req, file, cb);
  },
};

const upload = multer({
  storage: hybridStorage,
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || file.mimetype.startsWith('audio/');
    ok ? cb(null, true) : cb(new Error('Only PDF and audio files allowed'));
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// ─── CREATE TEST (PDF + upload audio  OR  PDF + gTTS) ────────────────────────
router.post(
  '/upload-test',
  upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'audio', maxCount: 1 }]),
  async (req, res) => {
    try {
      const { title, maxReplays, timer, category } = req.body;
      if (!title) return res.status(400).json({ message: 'Title required' });

      const pdfFile   = req.files?.pdf?.[0];
      const audioFile = req.files?.audio?.[0];

      // ── Determine master passage text ─────────────────────────────────────
      // Priority: manually pasted text > PDF extraction
      let extractedText = '';
      const manualText = req.body.masterText && req.body.masterText.trim();

      if (manualText) {
        // Admin pasted text directly — use as-is (text-first / text-only mode)
        extractedText = manualText;
      } else if (pdfFile) {
        // Extract from PDF
        const pdfData = await extractPDF(pdfFile.path);
        extractedText = pdfData.text;
      }

      if (!extractedText) {
        return res.status(400).json({
          message: 'Master passage text is required. Either upload a Unicode Hindi PDF or paste the text manually.',
        });
      }

      // pdfPath is optional now (text-only mode has no real PDF)
      const pdfPath = pdfFile ? `uploads/pdfs/${pdfFile.filename}` : null;

      let audioPath, audioType;
      const publicId = `${Date.now()}-${Math.round(Math.random()*1e9)}`;

      if (audioFile) {
        // Admin uploaded audio → buffer in memory → push to Cloudinary
        audioPath = await uploadBuffer(audioFile.buffer, publicId);
        audioType = 'uploaded';
      } else {
        // Generate audio using Python gTTS → temp file → push to Cloudinary
        const tmpPath = path.join(AUDIO_TMP, `${publicId}.mp3`);
        await generateAudio(extractedText, tmpPath);
        audioPath = await uploadFile(tmpPath, publicId); // also deletes tmpPath
        audioType = 'generated';
      }

      const test = await Test.create({
        title,
        pdfPath,
        extractedText,
        audioPath,
        audioType,
        isActive   : true,
        maxReplays : maxReplays ? Number(maxReplays) : 2,
        timer      : timer ? Number(timer) : 30,
        category   : category || null,
        createdBy  : req.user._id,
      });

      res.status(201).json({ message: 'Test created successfully', test });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Error creating test', error: err.message });
    }
  }
);

// ─── REPLACE AUDIO ────────────────────────────────────────────────────────────
router.put(
  '/tests/:id/audio',
  upload.single('audio'),
  async (req, res) => {
    try {
      const test = await Test.findById(req.params.id);
      if (!test) return res.status(404).json({ message: 'Test not found' });
      if (!req.file) return res.status(400).json({ message: 'Audio file required' });

      // Delete old Cloudinary asset (best-effort)
      await deleteByUrl(test.audioPath);

      // Upload new audio buffer to Cloudinary
      const publicId = `${Date.now()}-${Math.round(Math.random()*1e9)}`;
      const newUrl   = await uploadBuffer(req.file.buffer, publicId);

      test.audioPath = newUrl;
      test.audioType = 'uploaded';
      await test.save();

      res.json({ message: 'Audio replaced', audioPath: test.audioPath });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// ─── REGENERATE AUDIO (gTTS) ──────────────────────────────────────────────────
router.post('/tests/:id/regenerate-audio', async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Test not found' });

    // Delete old Cloudinary asset (best-effort)
    await deleteByUrl(test.audioPath);

    const publicId  = `${Date.now()}-${Math.round(Math.random()*1e9)}`;
    const tmpPath   = path.join(AUDIO_TMP, `${publicId}.mp3`);
    await generateAudio(test.extractedText, tmpPath);
    const newUrl    = await uploadFile(tmpPath, publicId); // deletes tmpPath

    test.audioPath = newUrl;
    test.audioType = 'generated';
    await test.save();

    res.json({ message: 'Audio regenerated', audioPath: test.audioPath });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── ACTIVATE / DEACTIVATE TEST ───────────────────────────────────────────────
router.patch('/tests/:id/status', async (req, res) => {
  const test = await Test.findById(req.params.id);
  if (!test) return res.status(404).json({ message: 'Test not found' });
  test.isActive = req.body.isActive !== undefined ? req.body.isActive : !test.isActive;
  await test.save();
  res.json({ message: `Test ${test.isActive ? 'activated' : 'deactivated'}`, isActive: test.isActive });
});

// ─── PREVIEW PDF TEXT (before creating test) ─────────────────────────────────
router.post('/preview-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'PDF required' });
    const data = await extractPDF(req.file.path);
    // clean up temp file after extraction
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.json({
      text         : data.text,
      hasDevanagari: data.hasDevanagari,
      pages        : data.pages,
      wordCount    : data.wordCount,
      warning      : data.warning,
      preview      : data.text.substring(0, 300),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── LIST ALL TESTS ───────────────────────────────────────────────────────────
router.get('/tests', async (req, res) => {
  const tests = await Test.find().select('-extractedText').populate('category', 'name icon color').sort({ createdAt: -1 });
  res.json(tests);
});

// ─── GET SINGLE TEST (with master passage) ────────────────────────────────────
router.get('/tests/:id', async (req, res) => {
  const test = await Test.findById(req.params.id);
  if (!test) return res.status(404).json({ message: 'Test not found' });
  res.json(test);
});

// ─── UPDATE TEST SETTINGS + CONTENT ──────────────────────────────────────────
router.put('/tests/:id', async (req, res) => {
  try {
    const { title, maxReplays, timer, isActive, category, extractedText, regenerateAudio: doRegen, practiceEnabled } = req.body;
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Test not found' });

    if (title            !== undefined) test.title           = title.trim();
    if (maxReplays       !== undefined) test.maxReplays      = Number(maxReplays);
    if (timer            !== undefined) test.timer           = Number(timer);
    if (isActive         !== undefined) test.isActive        = isActive;
    if (category         !== undefined) test.category        = category || null;
    if (extractedText    !== undefined) test.extractedText   = extractedText.trim();
    if (practiceEnabled  !== undefined) test.practiceEnabled = practiceEnabled;

    // ── Optional: regenerate audio from updated text ─────────────────────
    if (doRegen && test.extractedText) {
      await deleteByUrl(test.audioPath);
      const pid     = `${Date.now()}-${Math.round(Math.random()*1e9)}`;
      const tmpPath = path.join(AUDIO_TMP, `${pid}.mp3`);
      await generateAudio(test.extractedText, tmpPath);
      test.audioPath = await uploadFile(tmpPath, pid);
      test.audioType = 'generated';
    }

    await test.save();
    res.json({ message: 'Test updated', test });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE TEST ──────────────────────────────────────────────────────────────
router.delete('/tests/:id', async (req, res) => {
  const test = await Test.findByIdAndDelete(req.params.id);
  if (!test) return res.status(404).json({ message: 'Test not found' });
  await Assignment.deleteMany({ testId: req.params.id });
  res.json({ message: 'Test deleted' });
});

// ─── MIGRATE ALL LOCAL AUDIO → CLOUDINARY ────────────────────────────────────
// One-shot endpoint: regenerates TTS for every test whose audioPath is still a local
// "uploads/audio/…" path. Call once after setting up Cloudinary credentials.
router.post('/migrate-audio', async (req, res) => {
  try {
    const tests = await Test.find({ audioPath: { $not: /^https?:\/\// } });
    const results = [];
    for (const test of tests) {
      try {
        const pid     = `${Date.now()}-${Math.round(Math.random()*1e9)}`;
        const tmpPath = path.join(AUDIO_TMP, `${pid}.mp3`);
        await generateAudio(test.extractedText, tmpPath);
        test.audioPath = await uploadFile(tmpPath, pid);
        test.audioType = 'generated';
        await test.save();
        results.push({ id: test._id, title: test.title, ok: true, url: test.audioPath });
      } catch (e) {
        results.push({ id: test._id, title: test.title, ok: false, error: e.message });
      }
    }
    res.json({ migrated: results.filter(r=>r.ok).length, failed: results.filter(r=>!r.ok).length, results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── CHECK CLOUDINARY CONFIG ─────────────────────────────────────────────────
router.get('/check-cloudinary', async (req, res) => {
  try {
    const cloudinary = require('cloudinary').v2;
    // Ping Cloudinary with a no-op usage API call
    const result = await cloudinary.api.ping();
    res.json({
      ok        : true,
      status    : result.status,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '(not set)',
      api_key   : process.env.CLOUDINARY_API_KEY   ? '✓ set' : '✗ missing',
      api_secret: process.env.CLOUDINARY_API_SECRET ? '✓ set' : '✗ missing',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '(not set)',
      api_key   : process.env.CLOUDINARY_API_KEY   ? '✓ set' : '✗ missing',
      api_secret: process.env.CLOUDINARY_API_SECRET ? '✓ set' : '✗ missing',
    });
  }
});

// ─── TEST LEADERBOARD ─────────────────────────────────────────────────────────
router.get('/tests/:id/leaderboard', async (req, res) => {
  const results = await Result.find({ testId: req.params.id })
    .populate('userId', 'name email')
    .sort({ errorPercentage: 1, createdAt: 1 });

  const leaderboard = results.map((r, idx) => ({
    rank           : idx + 1,
    name           : r.userId?.name,
    email          : r.userId?.email,
    errorPercentage: r.errorPercentage,
    accuracy       : r.accuracy,
    wpm            : r.wpm,
    fullMistakes   : r.fullMistakes,
    halfMistakes   : r.halfMistakes,
    timeTaken      : r.timeTaken,
    submittedAt    : r.createdAt,
  }));
  res.json(leaderboard);
});

// ─── ALL USERS (non-admin) ────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const users = await User.find({ role: 'user' }).select('-password -activeToken').sort({ name: 1 });
  res.json(users);
});

// ─── CREATE USER ──────────────────────────────────────────────────────────────
router.post('/users', async (req, res) => {
  const { name, email, password, role, accessExpiry } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: 'Name, email and password required' });
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ message: 'Email already registered' });
  const user = await User.create({
    name, email, password,
    role: role || 'user',
    accessExpiry: accessExpiry ? new Date(accessExpiry) : null,
  });
  res.status(201).json({ message: 'User created', user: { id: user._id, name, email, role: user.role, accessExpiry: user.accessExpiry } });
});

// ─── UPDATE USER ACCESS / DEVICE RESET ───────────────────────────────────────
router.patch('/users/:id', async (req, res) => {
  const { accessExpiry, resetDevice, reAttemptCooldown } = req.body;
  const update = { accessExpiry: accessExpiry ? new Date(accessExpiry) : null };
  if (resetDevice) {
    update.deviceId    = null;
    update.activeToken = null;
  }
  if (reAttemptCooldown !== undefined) {
    update.reAttemptCooldown = Math.max(0, Math.min(5, Number(reAttemptCooldown) || 0));
  }
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ message: resetDevice ? 'Access and device reset' : 'Access updated', user });
});

// ─── DELETE USER ──────────────────────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Cannot delete an admin account' });
    await Assignment.deleteMany({ userId: req.params.id });
    await Result.deleteMany({ userId: req.params.id });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── CATEGORY CRUD ────────────────────────────────────────────────────────────
router.post('/categories', async (req, res) => {
  try {
    const { name, description, icon, color, instructions } = req.body;
    if (!name) return res.status(400).json({ message: 'Name required' });
    const cat = await Category.create({ name, description, icon, color, instructions, createdBy: req.user._id });
    res.status(201).json(cat);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/categories', async (req, res) => {
  const cats = await Category.find().sort({ createdAt: -1 });
  res.json(cats);
});

router.patch('/categories/:id', async (req, res) => {
  try {
    const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!cat) return res.status(404).json({ message: 'Not found' });
    res.json(cat);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/categories/:id', async (req, res) => {
  await Category.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted' });
});

// ─── ASSIGN TEST (single) ─────────────────────────────────────────────────────
router.post('/assign', async (req, res) => {
  const { userId, testId } = req.body;
  if (!userId || !testId)
    return res.status(400).json({ message: 'userId and testId required' });
  try {
    const assignment = await Assignment.create({ userId, testId, assignedBy: req.user._id });
    res.status(201).json({ message: 'Test assigned', assignment });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Already assigned' });
    res.status(500).json({ message: err.message });
  }
});

// ─── ASSIGN BULK ──────────────────────────────────────────────────────────────
router.post('/assign-bulk', async (req, res) => {
  const { userId, testIds } = req.body;
  if (!userId || !Array.isArray(testIds) || testIds.length === 0)
    return res.status(400).json({ message: 'userId and testIds[] required' });
  try {
    const docs = testIds.map(testId => ({ userId, testId, assignedBy: req.user._id }));
    const result = await Assignment.insertMany(docs, { ordered: false });
    res.status(201).json({ assigned: result.length, skipped: testIds.length - result.length });
  } catch (err) {
    // ordered:false — partial inserts are fine; writeErrors = duplicates
    const inserted = err.insertedDocs?.length ?? 0;
    const skipped  = testIds.length - inserted;
    if (inserted > 0) return res.status(201).json({ assigned: inserted, skipped });
    res.status(500).json({ message: err.message });
  }
});

// ─── LIST ASSIGNMENTS ─────────────────────────────────────────────────────────
router.get('/assignments', async (req, res) => {
  const assignments = await Assignment.find()
    .populate('userId', 'name email')
    .populate('testId', 'title isActive')
    .sort({ createdAt: -1 });
  res.json(assignments);
});

// ─── REMOVE ASSIGNMENT ────────────────────────────────────────────────────────
router.delete('/assign/:id', async (req, res) => {
  await Assignment.findByIdAndDelete(req.params.id);
  res.json({ message: 'Assignment removed' });
});

// ─── ALL RESULTS ──────────────────────────────────────────────────────────────
router.get('/results', async (req, res) => {
  const results = await Result.find()
    .populate('userId', 'name email')
    .populate('testId', 'title')
    .select('-typedText -wordComparison')          // summary list — no heavy fields
    .sort({ createdAt: -1 });
  res.json(results);
});

// ─── ALL RESULTS FOR ONE USER ─────────────────────────────────────────────────
router.get('/users/:userId/results', async (req, res) => {
  try {
    const results = await Result.find({ userId: req.params.userId })
      .populate('testId', 'title timer')
      .select('-typedText -wordComparison')        // list view — detail loaded separately
      .sort({ createdAt: -1 });
    res.json(results);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── SINGLE RESULT — FULL DETAIL (admin only) ─────────────────────────────────
router.get('/results/:resultId', async (req, res) => {
  try {
    const result = await Result.findById(req.params.resultId)
      .populate('userId', 'name email')
      .populate('testId', 'title extractedText timer'); // admin CAN see master passage
    if (!result) return res.status(404).json({ message: 'Not found' });
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── REVIEWS CRUD ─────────────────────────────────────────────────────────────
router.get('/reviews', async (req, res) => {
  const reviews = await Review.find().sort({ order: 1, createdAt: 1 });
  res.json(reviews);
});

router.post('/reviews', async (req, res) => {
  try {
    const { name, role, avatarColor, stars, reviewHi, reviewEn, order } = req.body;
    if (!name || !reviewHi) return res.status(400).json({ message: 'Name and Hindi review text are required' });
    const review = await Review.create({
      name, role, avatarColor, stars, reviewHi, reviewEn,
      order: order ?? 0,
      isActive: true,
      createdBy: req.user._id,
    });
    res.status(201).json(review);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/reviews/:id', async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json(review);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/reviews/:id', async (req, res) => {
  await Review.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
