import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import ThemeToggle from '../components/ThemeToggle';
import DiffViewer from '../components/DiffViewer';
import {
  processHindiBuffer, processInscriptBuffer,
  LANGUAGE_CATEGORIES, LAYOUT_MAPS, isPassThrough, isKrutidev,
  getCategoryForLayout, FONTS,
} from '../utils/keyboardLayouts';
import { kru2uni } from '../utils/krutidevConverter';

/* ── helpers ────────────────────────────────────────────────────────────────── */

function getSegments(text) {
  if (!text) return [];
  try {
    return [...new Intl.Segmenter('hi', { granularity: 'grapheme' }).segment(text)]
      .map(s => s.segment);
  } catch {
    return [...text];
  }
}

function fmt(secs) {
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ── Grade config ─────────────────────────────────── */
function getGrade(errPct) {
  if (errPct <= 2)  return { label:'Excellent',         emoji:'🏆', color:'#10b981', bg:'rgba(16,185,129,0.12)',  ring:'#10b981' };
  if (errPct <= 5)  return { label:'Very Good',         emoji:'🌟', color:'#3b82f6', bg:'rgba(59,130,246,0.12)',  ring:'#3b82f6' };
  if (errPct <= 8)  return { label:'Good',              emoji:'✨', color:'#6366f1', bg:'rgba(99,102,241,0.12)',  ring:'#6366f1' };
  if (errPct <= 12) return { label:'Average',           emoji:'📈', color:'#f59e0b', bg:'rgba(245,158,11,0.12)', ring:'#f59e0b' };
  return                   { label:'Keep Practicing',   emoji:'💪', color:'#ef4444', bg:'rgba(239,68,68,0.12)',   ring:'#ef4444' };
}

/* ── Circular Progress Ring ───────────────────────────────── */
function ProgressRing({ value, max = 100, size = 120, stroke = 10, color, label, sublabel }) {
  const radius = (size - stroke) / 2;
  const circ   = 2 * Math.PI * radius;
  const pct    = Math.min(value / max, 1);
  const offset = circ * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{width:size, height:size}}>
        <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
          {/* Track */}
          <circle cx={size/2} cy={size/2} r={radius}
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}/>
          {/* Progress */}
          <circle cx={size/2} cy={size/2} r={radius}
            fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{
              transition:'stroke-dashoffset 1.2s ease-out',
              filter:`drop-shadow(0 0 6px ${color}80)`,
            }}/>
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black text-white">{label}</span>
          {sublabel && <span className="text-xs text-white/40">{sublabel}</span>}
        </div>
      </div>
    </div>
  );
}

/* ── main component ─────────────────────────────────────────────────────────── */

export default function PracticePage() {
  const { testId } = useParams();
  const navigate   = useNavigate();

  // data
  const [tests,        setTests]        = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [loadingTests, setLoadingTests] = useState(true);
  const [loadingText,  setLoadingText]  = useState(false);
  const [error,        setError]        = useState('');

  // typing
  const [typedText, setTypedText] = useState('');
  const [elapsed,   setElapsed]   = useState(0);
  const [started,   setStarted]   = useState(false);
  const [done,      setDone]      = useState(false);

  // layout / font
  const [layout, setLayout] = useState('gail');
  const [font,   setFont]   = useState(FONTS[0].value);

  // refs
  const textareaRef       = useRef(null);
  const timerRef          = useRef(null);
  const krutidevBufRef    = useRef('');
  const hindiBufRef       = useRef('');
  const cursorSpanRef     = useRef(null);

  const referenceText = selectedTest?.extractedText ?? '';
  const refSegs       = useMemo(() => getSegments(referenceText), [referenceText]);
  const typedSegs     = useMemo(() => getSegments(typedText),     [typedText]);
  const typedLen      = typedSegs.length;
  const refLen        = refSegs.length;

  // ── stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (typedLen === 0) return { accuracy: 100, mistakes: 0, cpm: 0, wpm: 0, progress: 0, correct: 0 };
    let correct = 0;
    for (let i = 0; i < typedLen; i++) {
      if (typedSegs[i] === refSegs[i]) correct++;
    }
    const mistakes = typedLen - correct;
    const accuracy = Math.round(correct / typedLen * 100);
    const cpm      = elapsed > 0 ? Math.round(correct / elapsed * 60) : 0;
    const wpm      = Math.round(cpm / 5);
    const progress = refLen > 0 ? Math.min(100, Math.round(typedLen / refLen * 100)) : 0;
    return { accuracy, mistakes, cpm, wpm, progress, correct };
  }, [typedSegs, refSegs, elapsed, typedLen, refLen]);

  // ── load tests ─────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/user/tests')
      .then(r => {
        setTests(r.data);
        if (testId) loadPracticeText(testId);
        else setLoadingTests(false);
      })
      .catch(() => { setError('Failed to load tests'); setLoadingTests(false); });
  }, []);

  async function loadPracticeText(id) {
    setLoadingText(true);
    setLoadingTests(false);
    setError('');
    try {
      const r = await api.get(`/user/tests/${id}/practice`);
      setSelectedTest(r.data);
      resetTyping(false);
    } catch (e) {
      setError(e.response?.data?.message ?? 'Failed to load practice text');
    } finally {
      setLoadingText(false);
    }
  }

  function resetTyping(focus = true) {
    clearInterval(timerRef.current);
    timerRef.current = null;
    setTypedText('');
    setElapsed(0);
    setStarted(false);
    setDone(false);
    krutidevBufRef.current = '';
    hindiBufRef.current    = '';
    if (textareaRef.current) {
      textareaRef.current.value = '';
      if (focus) setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  useEffect(() => () => clearInterval(timerRef.current), []);

  useEffect(() => {
    krutidevBufRef.current = '';
    hindiBufRef.current    = '';
  }, [layout]);

  // auto-scroll reference text to keep cursor visible
  useEffect(() => {
    cursorSpanRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [typedLen]);

  // completion check
  useEffect(() => {
    if (refLen > 0 && typedLen >= refLen && !done) {
      setDone(true);
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [typedLen, refLen, done]);

  function startTimer() {
    if (started) return;
    setStarted(true);
    timerRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
  }

  // ── keyboard handler ───────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (done) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (isPassThrough(layout)) return; // handled by onChange

    const el = textareaRef.current;
    if (!el) return;

    const NAV = [
      'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Tab',
      'Escape','CapsLock','Shift','F1','F2','F3','F4','F5','F6','F7',
      'F8','F9','F10','F11','F12','Control','Alt','Meta',
      'PageUp','PageDown','Insert','PrintScreen',
    ];
    if (NAV.includes(e.key)) return;

    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') startTimer();

    /* ── KrutiDev ── */
    if (isKrutidev(layout)) {
      e.preventDefault();
      if (e.key === 'Backspace')    { const a = [...krutidevBufRef.current]; a.pop(); krutidevBufRef.current = a.join(''); }
      else if (e.key === 'Delete')  { krutidevBufRef.current = ''; }
      else if (e.key === 'Enter')   { krutidevBufRef.current += '\n'; }
      else if (e.key.length === 1)  { krutidevBufRef.current += e.key; }
      else return;
      const uni = kru2uni(krutidevBufRef.current);
      el.value = uni;
      el.selectionStart = el.selectionEnd = uni.length;
      setTypedText(uni);
      return;
    }

    /* ── Hindi buffer (inscript / cbi / gail) ── */
    const map = LAYOUT_MAPS[layout];
    if (!map) return;
    e.preventDefault();
    if (e.key === 'Backspace')    { const a = [...hindiBufRef.current]; a.pop(); hindiBufRef.current = a.join(''); }
    else if (e.key === 'Delete')  { hindiBufRef.current = ''; }
    else if (e.key === 'Enter')   { hindiBufRef.current += '\n'; }
    else if (e.key.length === 1)  { hindiBufRef.current += e.key; }
    else return;
    const uni = layout === 'inscript'
      ? processInscriptBuffer(hindiBufRef.current)
      : processHindiBuffer(hindiBufRef.current, map);
    el.value = uni;
    el.selectionStart = el.selectionEnd = uni.length;
    setTypedText(uni);
  }, [layout, done]);

  const handleChange = useCallback((e) => {
    if (!isPassThrough(layout)) return;
    const val = e.target.value;
    if (val.trim()) startTimer();
    setTypedText(val);
  }, [layout]);

  // ── layout helpers ─────────────────────────────────────────────────────────
  const activeCat = getCategoryForLayout(layout);
  const catObj    = LANGUAGE_CATEGORIES.find(c => c.value === activeCat);

  // ── loading screen ─────────────────────────────────────────────────────────
  if (loadingTests || loadingText) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-base)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--accent)' }} />
      </div>
    );
  }

  // ── stat cards data ─────────────────────────────────────────────────────────
  const statItems = [
    { label: 'Accuracy', value: `${stats.accuracy}%`,
      color: stats.accuracy >= 90 ? '#10b981' : stats.accuracy >= 70 ? '#f59e0b' : '#ef4444' },
    { label: 'Mistakes', value: stats.mistakes,
      color: stats.mistakes === 0 ? '#10b981' : stats.mistakes <= 5 ? '#f59e0b' : '#ef4444' },
    { label: 'CPM',      value: stats.cpm,      color: '#6366f1' },
    { label: 'WPM',      value: stats.wpm,      color: '#8b5cf6' },
    { label: 'Time',     value: fmt(elapsed),   color: 'var(--text-2)' },
    { label: 'Progress', value: `${stats.progress}%`, color: '#06b6d4' },
  ];

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--text-1)' }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{
          background: 'var(--bg-nav)',
          borderBottom: '1px solid var(--border)',
          backdropFilter: 'blur(12px)',
        }}>
        <button onClick={() => navigate('/dashboard')}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-2)' }}>
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black" style={{ color: 'var(--text-1)' }}>Typing Practice</h1>
          {selectedTest && (
            <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{selectedTest.title}</p>
          )}
        </div>
        <ThemeToggle />
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {error && (
          <div className="p-3 rounded-xl text-sm"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
            {error}
          </div>
        )}

        {/* ── TEST SELECTOR ── */}
        {!selectedTest && (
          <div>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-2)' }}>
              Select a test to practice
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tests.map(({ test, assignmentId }) => (
                <button key={assignmentId}
                  onClick={() => loadPracticeText(test._id)}
                  className="text-left p-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-100"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xl">📝</span>
                    <span className="font-bold text-sm leading-snug" style={{ color: 'var(--text-1)' }}>
                      {test.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {test.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--bg-surface)', color: 'var(--text-3)' }}>
                        {test.category.icon} {test.category.name}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {test.timer} min
                    </span>
                  </div>
                </button>
              ))}
              {tests.length === 0 && (
                <p className="text-sm col-span-2 text-center py-10" style={{ color: 'var(--text-3)' }}>
                  No tests assigned yet.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── PRACTICE AREA ── */}
        {selectedTest && (
          <>
            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-2">

              {/* Category buttons */}
              {LANGUAGE_CATEGORIES.map(cat => {
                const isActive = activeCat === cat.value;
                return (
                  <button key={cat.value}
                    onClick={() => {
                      if (cat.layouts) setLayout(cat.layouts[0].value);
                      else setLayout(cat.value);
                    }}
                    className="text-xs px-3 py-1.5 rounded-xl font-bold transition-all"
                    style={{
                      background: isActive ? 'var(--accent)' : 'var(--bg-surface)',
                      color: isActive ? '#fff' : 'var(--text-2)',
                      border: `1px solid ${isActive ? 'transparent' : 'var(--border)'}`,
                    }}>
                    {cat.icon} {cat.label}
                  </button>
                );
              })}

              {/* Sub-layouts (Hindi only) */}
              {catObj?.layouts && (
                <div className="flex gap-1">
                  {catObj.layouts.map(sub => (
                    <button key={sub.value}
                      onClick={() => setLayout(sub.value)}
                      className="text-xs px-2.5 py-1 rounded-lg font-semibold transition-all"
                      style={{
                        background: layout === sub.value ? 'rgba(99,102,241,0.2)' : 'var(--bg-surface)',
                        color: layout === sub.value ? '#818cf8' : 'var(--text-3)',
                        border: `1px solid ${layout === sub.value ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
                      }}>
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="ml-auto flex items-center gap-2">
                {/* Font */}
                <select value={font} onChange={e => setFont(e.target.value)}
                  className="text-xs px-2 py-1.5 rounded-xl outline-none"
                  style={{ background: 'var(--bg-surface)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>

                {/* Change test */}
                <button
                  onClick={() => { setSelectedTest(null); resetTyping(false); clearInterval(timerRef.current); }}
                  className="text-xs px-3 py-1.5 rounded-xl font-semibold transition-all hover:scale-105"
                  style={{ background: 'var(--bg-surface)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  Change Test
                </button>
              </div>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {statItems.map(st => (
                <div key={st.label} className="text-center py-2.5 rounded-xl"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="text-lg font-black tabular-nums leading-none" style={{ color: st.color }}>
                    {st.value}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide mt-1"
                    style={{ color: 'var(--text-3)' }}>
                    {st.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${stats.progress}%`,
                  background: done ? '#10b981' : 'var(--accent)',
                  boxShadow: done ? '0 0 8px rgba(16,185,129,0.5)' : '0 0 8px rgba(99,102,241,0.4)',
                }} />
            </div>

            {/* ── Reference text with live highlighting ── */}
            <div className="p-5 rounded-2xl overflow-auto max-h-56 leading-loose text-[1.1rem] select-none"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                fontFamily: font,
                scrollBehavior: 'smooth',
              }}>
              {refSegs.map((seg, i) => {
                /* determine appearance */
                let bg = '', color = 'var(--text-1)', opacity = 0.3;
                if (i < typedLen) {
                  if (typedSegs[i] === seg) {
                    color = '#10b981'; opacity = 1;  // correct → green
                  } else {
                    bg = 'rgba(239,68,68,0.25)'; color = '#f87171'; opacity = 1; // wrong → red
                  }
                } else if (i === typedLen) {
                  bg = 'var(--accent)'; color = '#fff'; opacity = 1; // cursor
                }

                return (
                  <span key={i}
                    ref={i === typedLen ? cursorSpanRef : null}
                    style={{
                      background: bg || 'transparent',
                      color,
                      opacity,
                      borderRadius: '3px',
                      padding: bg ? '1px 1px' : '0',
                      transition: 'color 0.08s, background 0.08s',
                      whiteSpace: seg === '\n' ? 'pre' : undefined,
                    }}>
                    {seg === '\n' ? '↵\n' : seg}
                  </span>
                );
              })}
              {typedLen >= refLen && refLen > 0 && (
                <span style={{ color: '#10b981', marginLeft: '4px' }}>✓</span>
              )}
            </div>

            {/* ── Typing area ── */}
            {!done ? (
              <>
                <textarea
                  ref={textareaRef}
                  rows={5}
                  placeholder={`Type here${!isPassThrough(layout) ? ` (${layout})` : ''}…`}
                  className="w-full resize-none rounded-2xl p-4 text-[1.05rem] outline-none transition-all"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                    fontFamily: font,
                    caretColor: 'var(--accent)',
                  }}
                  onKeyDown={handleKeyDown}
                  onChange={handleChange}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(99,102,241,0.18)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow   = 'none';
                  }}
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                />
                <div className="flex items-center justify-between">
                  <button onClick={() => resetTyping(true)}
                    className="text-xs px-3 py-2 rounded-xl font-semibold transition-all hover:scale-105"
                    style={{ background: 'var(--bg-surface)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                    ↺ Reset
                  </button>
                  <span className="text-xs tabular-nums" style={{ color: 'var(--text-3)' }}>
                    {typedLen} / {refLen}
                  </span>
                </div>
              </>
            ) : (
              /* ── RESULT VIEW ── */
              <div className="space-y-6 animate-fade-in-up">
                {/* ── Grade hero ──────────────────────────────────────── */}
                {(() => {
                  const errPct = stats.mistakes > 0 ? Math.round((stats.mistakes / typedLen) * 100) : 0;
                  const grade = getGrade(errPct);
                  return (
                    <>
                      <div className="relative overflow-hidden rounded-3xl p-6 animate-tilt-in shimmer-card"
                        style={{
                          background: grade.bg,
                          border: `1px solid ${grade.ring}35`,
                          boxShadow: `0 24px 70px rgba(0,0,0,0.45), 0 0 50px ${grade.ring}22, inset 0 1px 0 rgba(255,255,255,0.06)`,
                        }}>
                        <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-3xl"
                          style={{background:`linear-gradient(90deg,transparent,${grade.ring},transparent)`}}/>

                        <div className="flex flex-col sm:flex-row items-center gap-8">
                          {/* Progress rings */}
                          <div className="flex gap-6 shrink-0">
                            <ProgressRing value={stats.accuracy} max={100} size={110} stroke={9}
                              color={grade.ring} label={`${stats.accuracy}%`} sublabel="accuracy"/>
                            <ProgressRing value={Math.max(0, 100-errPct)} max={100} size={110} stroke={9}
                              color={errPct<=5?'#10b981':errPct<=10?'#f59e0b':'#ef4444'}
                              label={`${errPct}%`} sublabel="error"/>
                          </div>

                          {/* Grade info */}
                          <div className="text-center sm:text-left flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-4xl">{grade.emoji}</span>
                              <h2 className="font-black text-2xl" style={{color:'var(--text-1)'}}>{grade.label}</h2>
                            </div>
                            <p className="mb-4" style={{color:'var(--text-2)'}}>
                              <strong>{stats.wpm} WPM</strong> · {stats.cpm} CPM · {fmt(elapsed)}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <span className="px-3 py-1 rounded-full text-sm font-semibold"
                                style={{background:'rgba(99,102,241,0.15)', color:'#a5b4fc', border:'1px solid rgba(99,102,241,0.3)'}}>
                                {stats.correct} correct
                              </span>
                              <span className="px-3 py-1 rounded-full text-sm font-semibold"
                                style={{background:'rgba(239,68,68,0.15)', color:'#fca5a5', border:'1px solid rgba(239,68,68,0.3)'}}>
                                {stats.mistakes} mistake{stats.mistakes !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── Stats Cards ──────────────────────────────────────── */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label:'Words Typed', value: typedLen, icon:'📝', color:'#6366f1' },
                          { label:'Words Match', value: refLen, icon:'✓', color:'#10b981' },
                          { label:'Progress', value: `${stats.progress}%`, icon:'📊', color:'#f59e0b' },
                          { label:'Time', value: fmt(elapsed), icon:'⏱', color:'#8b5cf6' },
                        ].map(s => (
                          <div key={s.label} className="p-4 rounded-2xl text-center"
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                            <div className="text-2xl mb-1">{s.icon}</div>
                            <p className="text-lg font-black" style={{color:s.color}}>{s.value}</p>
                            <p className="text-xs mt-0.5" style={{color:'var(--text-3)'}}>{s.label}</p>
                          </div>
                        ))}
                      </div>

                      {/* ── Word Comparison ──────────────────────────────────────── */}
                      <div className="rounded-2xl overflow-hidden"
                        style={{background:'var(--bg-card)', border:'1px solid var(--border)'}}>
                        <div className="px-4 py-3 font-black flex items-center gap-2"
                          style={{background:'var(--bg-surface)', borderBottom:'1px solid var(--border)'}}>
                          <span className="text-lg">📝</span>
                          <span style={{color:'var(--text-1)'}}>Word-by-Word Comparison</span>
                        </div>
                        <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
                          {refSegs.length === 0 ? (
                            <p className="text-center py-8" style={{color:'var(--text-3)'}}>No reference text</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {refSegs.map((seg, i) => {
                                const match = typedSegs[i] === seg;
                                const typed = typedSegs[i];
                                let bg = '', color = 'var(--text-3)', opacity = 0.4;

                                if (i < typedLen) {
                                  if (match) {
                                    bg = 'rgba(16,185,129,0.15)';
                                    color = '#10b981';
                                    opacity = 1;
                                  } else {
                                    bg = 'rgba(239,68,68,0.20)';
                                    color = '#f87171';
                                    opacity = 1;
                                  }
                                }

                                return (
                                  <span key={i}
                                    className="inline-flex items-center px-2 py-1 rounded-lg text-sm transition-colors"
                                    style={{
                                      background: bg || 'transparent',
                                      color,
                                      opacity,
                                      border: match ? `1px solid ${color}40` : '1px solid transparent',
                                      fontFamily: 'Nirmala UI, Mangal, serif',
                                    }}>
                                    {typed && typed !== seg ? (
                                      <>
                                        <span style={{textDecoration:'line-through', opacity:0.6}}>{typed}</span>
                                        <span className="mx-1 text-xs opacity-50">→</span>
                                        <span className="font-semibold">{seg}</span>
                                      </>
                                    ) : (
                                      <span className="font-semibold">{seg || '∅'}</span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Actions ──────────────────────────────────────── */}
                      <div className="flex gap-3">
                        <button onClick={() => resetTyping(true)}
                          className="flex-1 px-6 py-3 rounded-2xl font-black text-white transition-all active:scale-95"
                          style={{
                            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            boxShadow: '0 0 20px rgba(99,102,241,0.4)',
                          }}>
                          🔄 Practice Again
                        </button>
                        <button onClick={() => { setSelectedTest(null); resetTyping(false); clearInterval(timerRef.current); }}
                          className="flex-1 px-6 py-3 rounded-2xl font-black transition-all hover:scale-105 active:scale-95"
                          style={{
                            background: 'var(--bg-surface)',
                            color: 'var(--text-2)',
                            border: '1px solid var(--border)',
                          }}>
                          📚 Change Test
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
