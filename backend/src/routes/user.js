const express    = require('express');
const Assignment = require('../models/Assignment');
const Result     = require('../models/Result');
const Test       = require('../models/Test');
const Category   = require('../models/Category');
const { authenticate }   = require('../middleware/auth');
const { evaluateSSC }    = require('../utils/hindiEvaluation');

const router = express.Router();
router.use(authenticate);

// ─── GET CATEGORIES ───────────────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const cats = await Category.find().sort({ name: 1 });
    res.json(cats);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET ASSIGNED TESTS ───────────────────────────────────────────────────────
router.get('/tests', async (req, res) => {
  const assignments = await Assignment.find({ userId: req.user._id })
    .populate({
      path: 'testId',
      select: '-extractedText -pdfPath',          // never send master passage
      populate: { path: 'category', model: 'Category' },
    })
    .sort({ createdAt: -1 });

  const activePairs = assignments
    .filter((a) => a.testId && a.testId.isActive)
    .map((a) => ({ assignmentId: a._id, test: a.testId }));

  // ── Per-test cooldown status ───────────────────────────────────────────────
  let cooldownMap = {};
  const cooldownHours = req.user.reAttemptCooldown || 0;
  if (cooldownHours > 0 && activePairs.length > 0) {
    const testIds = activePairs.map(p => p.test._id);
    const latestResults = await Result.aggregate([
      { $match: { userId: req.user._id, testId: { $in: testIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$testId', lastAttempt: { $first: '$createdAt' } } },
    ]);
    const cooldownMs = cooldownHours * 3600 * 1000;
    latestResults.forEach(r => {
      const until = new Date(r.lastAttempt).getTime() + cooldownMs;
      if (until > Date.now()) cooldownMap[r._id.toString()] = new Date(until);
    });
  }

  const tests = activePairs.map(p => ({
    assignmentId  : p.assignmentId,
    test          : p.test,
    cooldownUntil : cooldownMap[p.test._id.toString()] || null,
  }));

  res.json(tests);
});

// ─── GET SINGLE TEST (only if assigned + active) ──────────────────────────────
router.get('/tests/:testId', async (req, res) => {
  const assignment = await Assignment.findOne({
    userId: req.user._id,
    testId: req.params.testId,
  });
  if (!assignment) return res.status(403).json({ message: 'Access denied' });

  const test = await Test.findById(req.params.testId);
  if (!test) return res.status(404).json({ message: 'Test not found' });
  if (!test.isActive) return res.status(403).json({ message: 'Test is not active' });

  // ── Cooldown gate ─────────────────────────────────────────────────────────
  const cooldownHours = req.user.reAttemptCooldown || 0;
  if (cooldownHours > 0) {
    const last = await Result.findOne({ userId: req.user._id, testId: test._id }).sort({ createdAt: -1 });
    if (last) {
      const cooldownUntil = new Date(last.createdAt.getTime() + cooldownHours * 3600000);
      if (cooldownUntil > new Date()) {
        return res.status(423).json({ message: 'Cooldown active', cooldownUntil });
      }
    }
  }

  await test.populate('category');

  // Don't expose master passage
  res.json({
    _id       : test._id,
    title     : test.title,
    audioPath : test.audioPath,
    timer     : test.timer ?? 30,
    maxReplays: test.maxReplays,
    category  : test.category ? {
      _id         : test.category._id,
      name        : test.category.name,
      icon        : test.category.icon,
      color       : test.category.color,
      instructions: test.category.instructions,
    } : null,
  });
});

// ─── GET PRACTICE-ENABLED TESTS (assigned + practiceEnabled=true) ────────────
router.get('/practice-tests', async (req, res) => {
  try {
    const assignments = await Assignment.find({ userId: req.user._id })
      .populate({
        path: 'testId',
        select: '-extractedText -pdfPath',
        populate: { path: 'category', model: 'Category' },
      });

    const practicePairs = assignments
      .filter(a => a.testId && a.testId.isActive && a.testId.practiceEnabled)
      .map(a => ({
        assignmentId: a._id,
        test: a.testId,
      }));

    res.json(practicePairs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PRACTICE MODE (returns passage text for typing practice) ─────────────────
router.get('/tests/:testId/practice', async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      userId: req.user._id,
      testId: req.params.testId,
    });
    if (!assignment) return res.status(403).json({ message: 'Access denied' });

    const test = await Test.findById(req.params.testId).populate('category');
    if (!test || !test.isActive) return res.status(404).json({ message: 'Test not found or inactive' });
    if (!test.practiceEnabled) return res.status(403).json({ message: 'Practice not enabled for this test' });

    res.json({
      _id          : test._id,
      title        : test.title,
      extractedText: test.extractedText,
      timer        : test.timer ?? 30,
      category     : test.category ? {
        _id  : test.category._id,
        name : test.category.name,
        icon : test.category.icon,
        color: test.category.color,
      } : null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── SUBMIT TEST ──────────────────────────────────────────────────────────────
router.post('/tests/:testId/submit', async (req, res) => {
  const assignment = await Assignment.findOne({
    userId: req.user._id,
    testId: req.params.testId,
  });
  if (!assignment) return res.status(403).json({ message: 'Access denied' });

  const { typedText, timeTaken, pasteDetected } = req.body;
  if (!typedText) return res.status(400).json({ message: 'typedText required' });

  const test = await Test.findById(req.params.testId);
  if (!test) return res.status(404).json({ message: 'Test not found' });

  // SSC Hindi evaluation
  const evaluation = evaluateSSC(test.extractedText, typedText);

  const timerSeconds = (test.timer ?? 30) * 60;
  const actualTime   = timeTaken || timerSeconds;
  const wordCount    = typedText.trim().split(/\s+/).filter(Boolean).length;
  const wpm          = actualTime > 0 ? Math.round((wordCount / actualTime) * 60) : 0;

  const result = await Result.create({
    userId          : req.user._id,
    testId          : test._id,
    typedText,
    wordComparison  : evaluation.wordComparison,
    accuracy        : evaluation.accuracy,
    wpm,
    fullMistakes    : evaluation.fullMistakes,
    halfMistakes    : evaluation.halfMistakes,
    totalError      : evaluation.totalError,
    errorPercentage : evaluation.errorPercentage,
    totalWords      : evaluation.totalWords,
    typedWords      : evaluation.typedWords,
    correctWords    : evaluation.correctWords,
    wrongWords      : evaluation.wrongWords,
    replaceErrors   : evaluation.replaceErrors,
    extraWords      : evaluation.extraWords,
    missingWords    : evaluation.missingWords,
    timeTaken       : actualTime,
    pasteDetected   : pasteDetected || false,
    analysisSummary : evaluation.analysisSummary,
  });

  res.json({
    message : 'Test submitted',
    resultId: result._id,
    result  : {
      _id             : result._id,
      accuracy        : evaluation.accuracy,
      wpm,
      fullMistakes    : evaluation.fullMistakes,
      halfMistakes    : evaluation.halfMistakes,
      totalError      : evaluation.totalError,
      errorPercentage : evaluation.errorPercentage,
      totalWords      : evaluation.totalWords,
      typedWords      : evaluation.typedWords,
      correctWords    : evaluation.correctWords,
      wrongWords      : evaluation.wrongWords,
      replaceErrors   : evaluation.replaceErrors,
      extraWords      : evaluation.extraWords,
      missingWords    : evaluation.missingWords,
      timeTaken       : actualTime,
      pasteDetected   : pasteDetected || false,
      analysisSummary : evaluation.analysisSummary,
    },
  });
});

// ─── GET ALL ATTEMPTS FOR A TEST (history) ────────────────────────────────────
router.get('/tests/:testId/history', async (req, res) => {
  // Verify assignment
  const assignment = await Assignment.findOne({ userId: req.user._id, testId: req.params.testId });
  if (!assignment) return res.status(403).json({ message: 'Access denied' });

  const results = await Result.find({ userId: req.user._id, testId: req.params.testId })
    .select('-wordComparison -typedText')
    .sort({ createdAt: -1 });

  res.json(results);
});

// ─── GET LEADERBOARD FOR A TEST ───────────────────────────────────────────────
router.get('/tests/:testId/leaderboard', async (req, res) => {
  const assignment = await Assignment.findOne({ userId: req.user._id, testId: req.params.testId });
  if (!assignment) return res.status(403).json({ message: 'Access denied' });

  const results = await Result.find({ testId: req.params.testId })
    .populate('userId', 'name')
    .select('-typedText -wordComparison -pasteDetected') // other users' typed text must never leak
    .sort({ errorPercentage: 1, createdAt: 1 });

  const myId = req.user._id.toString();

  const leaderboard = results.map((r, idx) => ({
    rank           : idx + 1,
    name           : r.userId?.name,
    isMe           : r.userId?._id.toString() === myId,
    errorPercentage: r.errorPercentage,
    accuracy       : r.accuracy,
    wpm            : r.wpm,
    timeTaken      : r.timeTaken,
    submittedAt    : r.createdAt,
  }));

  res.json(leaderboard);
});

// ─── GET PROFILE SUMMARY ──────────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  const results = await Result.find({ userId: req.user._id })
    .populate('testId', 'title')
    .select('-wordComparison -typedText')
    .sort({ createdAt: -1 });

  const total  = results.length;
  const avgAcc = total ? +(results.reduce((s, r) => s + (r.accuracy || 0), 0) / total).toFixed(1) : 0;
  const avgWpm = total ? Math.round(results.reduce((s, r) => s + (r.wpm || 0), 0) / total) : 0;
  const bestErr= total ? +Math.min(...results.map(r => r.errorPercentage || 0)).toFixed(2) : null;
  const avgErr = total ? +(results.reduce((s, r) => s + (r.errorPercentage || 0), 0) / total).toFixed(2) : 0;

  // Per-test best scores
  const testMap = {};
  for (const r of results) {
    const tid = r.testId?._id?.toString();
    if (!tid) continue;
    if (!testMap[tid]) testMap[tid] = { title: r.testId.title, attempts: 0, best: null };
    testMap[tid].attempts++;
    if (!testMap[tid].best || r.errorPercentage < testMap[tid].best.errorPercentage) {
      testMap[tid].best = {
        errorPercentage: r.errorPercentage,
        accuracy       : r.accuracy,
        wpm            : r.wpm,
        timeTaken      : r.timeTaken,
      };
    }
  }

  res.json({
    user: {
      name        : req.user.name,
      email       : req.user.email,
      role        : req.user.role,
      accessExpiry: req.user.accessExpiry,
      deviceLocked: !!req.user.deviceId,
      memberSince : req.user.createdAt,
    },
    stats: { total, avgAcc, avgWpm, bestErr, avgErr },
    tests: Object.values(testMap),
    recentResults: results.slice(0, 15),
  });
});

// ─── GET ALL RESULTS FOR CURRENT USER ────────────────────────────────────────
router.get('/results', async (req, res) => {
  const results = await Result.find({ userId: req.user._id })
    .populate('testId', 'title')
    .select('-wordComparison -typedText')         // strip answer text
    .sort({ createdAt: -1 });
  res.json(results);
});

// ─── GET SINGLE RESULT (full detail with comparison) ─────────────────────────
router.get('/results/:id', async (req, res) => {
  const result = await Result.findOne({ _id: req.params.id, userId: req.user._id })
    .populate('testId', 'title')                  // NO extractedText — master passage stays server-side
    .select('-typedText');                         // strip raw answer text; wordComparison has everything needed
  if (!result) return res.status(404).json({ message: 'Result not found' });
  res.json(result);
});

module.exports = router;
