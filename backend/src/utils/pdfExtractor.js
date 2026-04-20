/**
 * Hindi-aware PDF extractor.
 * Uses the Python script (PyMuPDF) as primary method.
 * Falls back to pdf-parse if Python is unavailable.
 */
const { spawn }   = require('child_process');
const path        = require('path');
const fs          = require('fs');

const SCRIPT = path.join(__dirname, '../../scripts/extract_pdf.py');

// Cache the detected Python binary
let _pythonBin = null;
async function getPython() {
  if (_pythonBin) return _pythonBin;
  for (const bin of ['python', 'python3', 'py']) {
    const ok = await new Promise(res => {
      const p = spawn(bin, ['--version'], { timeout: 5000 });
      p.on('close', code => res(code === 0));
      p.on('error', () => res(false));
    });
    if (ok) { _pythonBin = bin; return bin; }
  }
  return null;
}

/**
 * Extract text from a PDF using the Python PyMuPDF script.
 * @param {string} pdfPath - Absolute path to the PDF file
 * @returns {Promise<{text, pages, hasDevanagari, wordCount, warning}>}
 */
async function extractWithPython(pdfPath) {
  const bin = await getPython();
  if (!bin) throw new Error('Python not available');

  return new Promise((resolve, reject) => {
    const proc = spawn(bin, [SCRIPT, pdfPath], { timeout: 60000 });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', d => { stderr += d.toString('utf8'); });

    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`Python extractor exited ${code}: ${stderr}`));
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (result.error) return reject(new Error(result.error));
        resolve(result);
      } catch {
        reject(new Error(`Failed to parse extractor output: ${stdout}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Fallback: pdf-parse (works for non-Hindi or simple PDFs)
 */
async function extractWithPdfParse(pdfPath) {
  const pdfParse = require('pdf-parse');
  const buf      = fs.readFileSync(pdfPath);
  const data     = await pdfParse(buf);
  const text     = data.text.trim();
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  return {
    text,
    pages: data.numpages,
    hasDevanagari,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    warning: hasDevanagari ? null :
      'Text may not be in Unicode Hindi. Please verify and edit the passage if needed.',
  };
}

/**
 * Main export — tries Python first, falls back to pdf-parse.
 */
async function extractPDF(pdfPath) {
  try {
    const result = await extractWithPython(pdfPath);
    console.log(`[PDF] Python PyMuPDF extracted ${result.wordCount} words, Hindi=${result.hasDevanagari}`);
    return result;
  } catch (pyErr) {
    console.warn(`[PDF] Python failed: ${pyErr.message} — using pdf-parse fallback`);
    const result = await extractWithPdfParse(pdfPath);
    console.log(`[PDF] pdf-parse extracted ${result.wordCount} words, Hindi=${result.hasDevanagari}`);
    return result;
  }
}

module.exports = { extractPDF };
