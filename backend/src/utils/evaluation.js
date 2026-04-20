// Levenshtein distance between two strings
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function evaluateText(original, typed) {
  const origWords = original.trim().split(/\s+/);
  const typedWords = typed.trim().split(/\s+/);

  let fullMistakes = 0;
  let halfMistakes = 0;

  const maxLen = Math.max(origWords.length, typedWords.length);

  for (let i = 0; i < maxLen; i++) {
    const oWord = (origWords[i] || '').toLowerCase();
    const tWord = (typedWords[i] || '').toLowerCase();

    if (!oWord && tWord) {
      // Extra word typed
      fullMistakes += 1;
      halfMistakes += 0.5;
      continue;
    }

    if (!tWord) {
      // Missing word
      fullMistakes += 1;
      continue;
    }

    if (oWord === tWord) {
      // Exact match - correct
      continue;
    }

    const dist = levenshtein(oWord, tWord);
    const maxWordLen = Math.max(oWord.length, tWord.length);
    const ratio = dist / maxWordLen;

    if (ratio <= 0.3) {
      // Slight difference
      halfMistakes += 0.5;
    } else {
      // Wrong word
      fullMistakes += 1;
    }
  }

  const totalWords = origWords.length;
  const correctWords = totalWords - fullMistakes - halfMistakes / 2;
  const accuracy = Math.max(0, (correctWords / totalWords) * 100);

  return {
    fullMistakes: Math.round(fullMistakes * 2) / 2,
    halfMistakes: Math.round(halfMistakes * 2) / 2,
    accuracy: Math.round(accuracy * 100) / 100,
    totalWords,
  };
}

module.exports = { evaluateText };
