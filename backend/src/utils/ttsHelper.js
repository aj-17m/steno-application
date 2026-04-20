/**
 * TTS Helper — tries Python gTTS first (best Hindi quality),
 * falls back to node-gtts if Python is unavailable.
 */
const { spawn }   = require('child_process');
const path        = require('path');

const PYTHON_SCRIPT = path.join(__dirname, '../../scripts/gtts_hindi.py');

// Detect which Python binary is available (cache result)
let pythonBin = null;
async function detectPython() {
  if (pythonBin) return pythonBin;
  const candidates = ['python', 'python3', 'py'];
  for (const bin of candidates) {
    try {
      await new Promise((res, rej) => {
        const p = spawn(bin, ['--version'], { timeout: 5000 });
        p.on('close', code => code === 0 ? res() : rej());
        p.on('error', rej);
      });
      pythonBin = bin;
      return bin;
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Generate Hindi audio using Python gTTS (recommended).
 * @param {string} text  - Unicode Devanagari text
 * @param {string} outPath - Full path for the output .mp3
 */
async function generateWithPython(text, outPath) {
  const bin = await detectPython();
  if (!bin) throw new Error('Python not found');

  return new Promise((resolve, reject) => {
    const proc = spawn(bin, [PYTHON_SCRIPT, outPath], {
      timeout: 60000,
    });

    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.stdin.write(text, 'utf8');
    proc.stdin.end();

    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Python gTTS failed (exit ${code}): ${stderr}`));
    });
    proc.on('error', reject);
  });
}

/**
 * Fallback: node-gtts (lower quality for Hindi but works without Python)
 */
async function generateWithNodeGtts(text, outPath) {
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const lang  = hasDevanagari ? 'hi' : 'en';
  const gtts  = require('node-gtts')(lang);
  return new Promise((resolve, reject) =>
    gtts.save(outPath, text, (err) => (err ? reject(err) : resolve()))
  );
}

/**
 * Main entry point — always prefer Python gTTS for Hindi.
 */
async function generateAudio(text, outPath) {
  try {
    await generateWithPython(text, outPath);
    console.log(`[TTS] Python gTTS → ${path.basename(outPath)}`);
  } catch (pyErr) {
    console.warn(`[TTS] Python failed (${pyErr.message}), falling back to node-gtts`);
    await generateWithNodeGtts(text, outPath);
    console.log(`[TTS] node-gtts fallback → ${path.basename(outPath)}`);
  }
}

module.exports = { generateAudio };
