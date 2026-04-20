/**
 * SSC Hindi Stenographer Pattern — Error Evaluation Engine v2
 *
 * Scoring rules (SSC-accurate):
 *   Half Mistake (0.5) : exactly 1-char/matra difference  |  punctuation-only diff  |  comma diff
 *   Full Mistake (1.0) : 2+ char mismatch (substitution)  |  incomplete word  |  omission  |
 *                        extra/addition word               |  repetition
 *   Replace Error (1.0): Completely different word (dist ≥ 60 % of longer word length) —
 *                        tracked as its own counter but still scored as a full mistake
 *   Paragraph breaks   : NOT counted as errors (all whitespace / newlines collapsed on tokenisation)
 *   Numbers            : "20" == "बीस" treated as correct (bidirectional map)
 *   Chandrabindu (ँ)   : ignored in comparison
 */

// ─── Unicode constants ────────────────────────────────────────────────────────
const CHANDRABINDU = /\u0901/g;
const DANDA        = /[।॥]/g;
const ZERO_WIDTH   = /[\u200B-\u200D\uFEFF]/g;

// ─── Number ↔ Hindi word map ─────────────────────────────────────────────────
const NUM_TO_HINDI = {
  '0':'शून्य','1':'एक','2':'दो','3':'तीन','4':'चार','5':'पाँच',
  '6':'छह','7':'सात','8':'आठ','9':'नौ','10':'दस','11':'ग्यारह',
  '12':'बारह','13':'तेरह','14':'चौदह','15':'पंद्रह','16':'सोलह',
  '17':'सत्रह','18':'अठारह','19':'उन्नीस','20':'बीस','21':'इक्कीस',
  '22':'बाईस','23':'तेईस','24':'चौबीस','25':'पच्चीस','26':'छब्बीस',
  '27':'सत्ताईस','28':'अट्ठाईस','29':'उनतीस','30':'तीस','31':'इकतीस',
  '32':'बत्तीस','33':'तैंतीस','34':'चौंतीस','35':'पैंतीस','36':'छत्तीस',
  '37':'सैंतीस','38':'अड़तीस','39':'उनतालीस','40':'चालीस','41':'इकतालीस',
  '42':'बयालीस','43':'तैंतालीस','44':'चवालीस','45':'पैंतालीस','46':'छियालीस',
  '47':'सैंतालीस','48':'अड़तालीस','49':'उनचास','50':'पचास',
  '60':'साठ','70':'सत्तर','80':'अस्सी','90':'नब्बे','100':'सौ',
  '1000':'हजार','100000':'लाख','10000000':'करोड़',
};
const HINDI_TO_NUM = Object.fromEntries(Object.entries(NUM_TO_HINDI).map(([k,v])=>[v,k]));

// ─── Levenshtein distance ────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// ─── Normalise a single word for comparison ──────────────────────────────────
function normaliseWord(w) {
  return w
    .replace(CHANDRABINDU, '')   // ignore chandrabindu
    .replace(ZERO_WIDTH, '')
    .trim()
    .toLowerCase();
}

// ─── Check numeric equivalence (20 == बीस) ───────────────────────────────────
function numericEquivalent(a, b) {
  const na = normaliseWord(a), nb = normaliseWord(b);
  if (NUM_TO_HINDI[na] === nb) return true;
  if (HINDI_TO_NUM[na] === nb) return true;
  if (na === nb) return true;
  return false;
}

// ─── Tokenise text into word tokens ──────────────────────────────────────────
// Paragraph breaks (\n\n) are treated as plain whitespace — no error is raised
// for changing/skipping paragraph structure.
function tokenise(text) {
  return text
    .replace(DANDA, ' । ')
    .replace(/[,،.]/g, ' $& ')
    .trim()
    .split(/\s+/)          // splits on ALL whitespace, including newlines/para breaks
    .filter(Boolean);
}

// ─── Align master words to typed words via DP ────────────────────────────────
function alignWords(masterWords, typedWords) {
  const m = masterWords.length, n = typedWords.length;
  const INF = 1e9;

  // wordCost — used only for DP alignment (not final classification)
  // dist === 1  → 0.5 (half mistake)
  // dist >= 2   → 1.0 (full mistake of any kind)
  function wordCost(mi, ti) {
    if (numericEquivalent(mi, ti)) return 0;
    const a = normaliseWord(mi), b = normaliseWord(ti);
    if (a === b) return 0;
    const dist = levenshtein(a, b);
    if (dist === 1) return 0.5;
    return 1;
  }

  const dp  = Array.from({ length: m+1 }, () => new Array(n+1).fill(INF));
  const ops = Array.from({ length: m+1 }, () => new Array(n+1).fill(''));
  dp[0][0] = 0;
  for (let i = 1; i <= m; i++) { dp[i][0] = i;     ops[i][0] = 'del'; }
  for (let j = 1; j <= n; j++) { dp[0][j] = 1.5*j; ops[0][j] = 'ins'; }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const sc = dp[i-1][j-1] + wordCost(masterWords[i-1], typedWords[j-1]);
      const dc = dp[i-1][j]   + 1;    // omission (full)
      const ic = dp[i][j-1]   + 1.5;  // addition  (full + small alignment penalty)
      if (sc <= dc && sc <= ic) { dp[i][j] = sc; ops[i][j] = 'sub'; }
      else if (dc <= ic)        { dp[i][j] = dc; ops[i][j] = 'del'; }
      else                      { dp[i][j] = ic; ops[i][j] = 'ins'; }
    }
  }

  // Backtrack
  const alignment = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ops[i][j] === 'sub') {
      alignment.unshift({ master: masterWords[i-1], typed: typedWords[j-1] });
      i--; j--;
    } else if (i > 0 && (j === 0 || ops[i][j] === 'del')) {
      alignment.unshift({ master: masterWords[i-1], typed: null });
      i--;
    } else {
      alignment.unshift({ master: null, typed: typedWords[j-1] });
      j--;
    }
  }
  return alignment;
}

// ─── Classify a (master, typed) pair ─────────────────────────────────────────
// Returns: { status, mistakeType, errorCategory, fullScore, halfScore }
//
//  status values:
//    'correct'  — exact match
//    'half'     — 1-char/matra diff, punctuation diff, comma diff
//    'full'     — 2+ char substitution, incomplete word, repetition
//    'replace'  — completely different word (dist ≥ 60% max-len), scored as full
//    'missing'  — word omitted by typist
//    'extra'    — word typed that does not exist in master
//
function classifyPair(master, typed) {
  // ── Extra word (addition) ──────────────────────────────────────────
  if (!master && typed) {
    return { status:'extra', mistakeType:'addition', errorCategory:'full', fullScore:1, halfScore:0 };
  }
  // ── Missing word (omission) ────────────────────────────────────────
  if (master && !typed) {
    return { status:'missing', mistakeType:'omission', errorCategory:'full', fullScore:1, halfScore:0 };
  }

  const mn = normaliseWord(master), tn = normaliseWord(typed);

  // ── Correct (exact / numeric equivalent) ──────────────────────────
  if (numericEquivalent(master, typed) || mn === tn) {
    return { status:'correct', mistakeType:'correct', errorCategory:'none', fullScore:0, halfScore:0 };
  }

  // ── Incomplete word (typed < 50 % of master length) ───────────────
  if (tn.length > 0 && tn.length < mn.length * 0.5) {
    return { status:'full', mistakeType:'incomplete', errorCategory:'full', fullScore:1, halfScore:0 };
  }

  const dist   = levenshtein(mn, tn);
  const maxLen = Math.max(mn.length, tn.length, 1);

  // ── Punctuation-only difference → half ────────────────────────────
  if (mn.replace(/[,।.;:!?]/g,'') === tn.replace(/[,।.;:!?]/g,'')) {
    return { status:'half', mistakeType:'punctuation', errorCategory:'half', fullScore:0, halfScore:1 };
  }
  // ── Comma difference → half ────────────────────────────────────────
  if (mn.replace(/,/g,'') === tn.replace(/,/g,'')) {
    return { status:'half', mistakeType:'comma', errorCategory:'half', fullScore:0, halfScore:1 };
  }

  // ── 1-char/matra difference → half mistake ────────────────────────
  if (dist === 1) {
    return { status:'half', mistakeType:'spelling', errorCategory:'half', fullScore:0, halfScore:1 };
  }

  // ── Completely different word (dist ≥ 60 % of longer word) → replace error ──
  // Replace errors are full mistakes but tracked in their own counter
  if (dist >= maxLen * 0.6) {
    return { status:'replace', mistakeType:'replace', errorCategory:'full', fullScore:1, halfScore:0 };
  }

  // ── 2+ char substitution → full mistake ───────────────────────────
  return { status:'full', mistakeType:'substitution', errorCategory:'full', fullScore:1, halfScore:0 };
}

// ─── Repetition detection ────────────────────────────────────────────────────
function detectRepetitions(typedWords) {
  const repeated = new Set();
  for (let i = 1; i < typedWords.length; i++) {
    if (normaliseWord(typedWords[i]) === normaliseWord(typedWords[i-1])) {
      repeated.add(i);
    }
  }
  return repeated;
}

// ─── Build analysis summary text ─────────────────────────────────────────────
function buildSummary(stats) {
  const { totalWords, typedWordsCount, correctWords, wrongWords,
          fullMistakes, halfMistakes, replaceErrors, extraWords,
          missingWords, totalError, errorPercentage, accuracy } = stats;

  const parts = [
    `कुल शब्द (Total): ${totalWords}`,
    `टाइप किए (Typed): ${typedWordsCount}`,
    `सही शब्द (Correct): ${correctWords}`,
    `गलत शब्द (Wrong): ${wrongWords}`,
  ];
  if (missingWords > 0)  parts.push(`छूटे शब्द (Missing): ${missingWords}`);
  if (extraWords  > 0)   parts.push(`अतिरिक्त (Extra): ${extraWords}`);
  if (replaceErrors > 0) parts.push(`बिल्कुल अलग शब्द (Replace): ${replaceErrors}`);
  parts.push(`पूर्ण गलती (Full): ${fullMistakes}`);
  parts.push(`आधी गलती (Half): ${halfMistakes}`);
  parts.push(`कुल त्रुटि (Total Error): ${totalError}`);
  parts.push(`त्रुटि % (Error%): ${errorPercentage.toFixed(2)}%`);
  parts.push(`शुद्धता (Accuracy): ${accuracy.toFixed(2)}%`);
  return parts.join(' | ');
}

// ─── Main evaluation function ────────────────────────────────────────────────
function evaluateSSC(masterText, typedText) {
  const masterTokens = tokenise(masterText);
  const typedTokens  = tokenise(typedText);
  const repeated     = detectRepetitions(typedTokens);

  const alignment = alignWords(masterTokens, typedTokens);

  let fullMistakes  = 0;
  let halfMistakes  = 0;
  let replaceErrors = 0;
  let extraWords    = 0;
  let missingWords  = 0;
  let correctWords  = 0;

  const wordComparison = [];
  let typedIdx = 0;

  for (const pair of alignment) {
    let cls = classifyPair(pair.master, pair.typed);

    // ── Override: consecutive repetition → full mistake ───────────────
    if (pair.typed && repeated.has(typedIdx)) {
      cls = { status:'full', mistakeType:'repetition', errorCategory:'full', fullScore:1, halfScore:0 };
    }

    // ── Tally ──────────────────────────────────────────────────────────
    switch (cls.status) {
      case 'correct':  correctWords++;  break;
      case 'missing':  missingWords++;  break;
      case 'extra':    extraWords++;    break;
      case 'replace':  replaceErrors++; break;
      default: break; // full / half handled below
    }

    fullMistakes += cls.fullScore;
    halfMistakes += cls.halfScore;

    wordComparison.push({
      master       : pair.master,
      typed        : pair.typed,
      status       : cls.status,
      mistakeType  : cls.mistakeType,
      errorCategory: cls.errorCategory,
    });

    if (pair.typed) typedIdx++;
  }

  // wrongWords = any word position that had a mistake (not missing / extra)
  const wrongWords = wordComparison.filter(
    w => w.status !== 'correct' && w.status !== 'missing' && w.status !== 'extra'
  ).length;

  const totalWords      = masterTokens.length;
  const typedWordsCount = typedTokens.length;
  const totalError      = fullMistakes + halfMistakes / 2;
  const errorPercentage = totalWords > 0
    ? Math.round((totalError / totalWords) * 10000) / 100
    : 0;
  const accuracy = Math.max(0, Math.round((100 - errorPercentage) * 100) / 100);

  const analysisSummary = buildSummary({
    totalWords, typedWordsCount, correctWords, wrongWords,
    fullMistakes : Math.round(fullMistakes * 2) / 2,
    halfMistakes : Math.round(halfMistakes * 2) / 2,
    replaceErrors, extraWords, missingWords,
    totalError   : Math.round(totalError * 2) / 2,
    errorPercentage, accuracy,
  });

  return {
    // Core scoring
    fullMistakes  : Math.round(fullMistakes  * 2) / 2,
    halfMistakes  : Math.round(halfMistakes  * 2) / 2,
    totalError    : Math.round(totalError    * 2) / 2,
    errorPercentage,
    accuracy,

    // Word counts
    totalWords,
    typedWords    : typedWordsCount,
    correctWords,
    wrongWords,
    replaceErrors,
    extraWords,
    missingWords,

    // Detail + summary
    wordComparison,
    analysisSummary,
  };
}

module.exports = { evaluateSSC };
