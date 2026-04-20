"""
Hindi-aware PDF text extractor using PyMuPDF (fitz).

Key fix: many Hindi PDFs authored in MS Word inject Calibri/Latin spaces
between Devanagari characters. We detect that at the span level and strip
those spurious inter-character spaces before reassembling words.

Usage:
  python extract_pdf.py <pdf_path>

Outputs JSON to stdout (UTF-8).
"""
import sys
import os
import json
import re
import unicodedata

# ── Force UTF-8 output on Windows ─────────────────────────────────────────────
sys.stdout = open(sys.stdout.fileno(), 'w', encoding='utf-8', closefd=False, buffering=1)
sys.stderr = open(sys.stderr.fileno(), 'w', encoding='utf-8', closefd=False, buffering=1)

DEVANAGARI_RE = re.compile(r'[\u0900-\u097F]')

# Characters that should never be preceded by a space
MATRAS = set(
    '\u093e\u093f\u0940\u0941\u0942\u0943\u0944'
    '\u0945\u0946\u0947\u0948'
    '\u0949\u094a\u094b\u094c'
    '\u094d'          # virama / halant
    '\u0902\u0903\u0900\u0901'
)
HALANT = '\u094d'


def is_devanagari(ch):
    return '\u0900' <= ch <= '\u097F'


def extract_page_rawdict(page):
    """
    Extract one page worth of text.
    Strategy:
      - Iterate blocks → lines → spans, keeping track of the *font* of each span.
      - Within a line, collect (font, char) pairs.
      - Post-process: remove a space character when it is from a different
        (Latin/Calibri) font and is surrounded by Devanagari on both sides.
    """
    try:
        d = page.get_text('rawdict', flags=0)
    except Exception:
        return ''

    line_texts = []

    for block in d.get('blocks', []):
        block_lines = []
        for line in block.get('lines', []):
            # Build a flat list of (char, font_name) for the entire line
            items = []  # list of (char: str, font: str)
            for span in line.get('spans', []):
                font = span.get('font', '')
                for ch_obj in span.get('chars', []):
                    c = ch_obj.get('c', '')
                    if c:
                        items.append((c, font))

            if not items:
                continue

            # ── Detect predominant Devanagari font in this line ──────────────
            dev_fonts = [fnt for ch, fnt in items if is_devanagari(ch)]
            from collections import Counter as _C
            dev_font_primary = _C(dev_fonts).most_common(1)[0][0] if dev_fonts else None

            # ── Remove spurious spaces between Devanagari chars ──────────────
            # Rules:
            #  A) Always remove space before a matra / after halant
            #  B) Remove a space whose font is the SAME as the Hindi font
            #     when it sits between two Devanagari chars (intra-word space)
            #     e.g. NirmalaUI-space between NirmalaUI chars
            #  C) Keep a space whose font differs from the Hindi font
            #     (Calibri-space) — these are real word boundaries
            result = []
            n = len(items)
            for i, (c, font) in enumerate(items):
                if c == ' ':
                    next_ch = items[i + 1][0] if i + 1 < n else ''
                    prev_ch = result[-1][0]    if result     else ''

                    # Rule A: matra / halant
                    if next_ch in MATRAS or prev_ch == HALANT:
                        continue

                    prev_dev = is_devanagari(prev_ch)
                    next_dev = is_devanagari(next_ch)

                    # Rule B: same-font space between Devanagari → spurious
                    if prev_dev and next_dev and font == dev_font_primary:
                        continue

                    # Rule C: foreign-font (Calibri) space → word boundary → keep
                result.append((c, font))

            line_text = ''.join(c for c, _ in result).strip()
            if line_text:
                block_lines.append(line_text)

        if block_lines:
            line_texts.append('\n'.join(block_lines))

    return '\n\n'.join(line_texts)


def extract_standard(doc):
    """Standard text extraction fallback."""
    parts = []
    for page in doc:
        try:
            t = page.get_text('text', flags=0)
            if t.strip():
                parts.append(t.strip())
        except Exception:
            pass
    return '\n\n'.join(parts)


def clean_text(text):
    """
    Final cleanup:
    - Strip invisible / zero-width chars
    - Remove spaces before matras (safety pass)
    - Remove spaces after halant
    - Normalise whitespace per line
    - Collapse 3+ blank lines → 2
    """
    if not text:
        return ''

    STRIP = set('\u200b\u200c\u200d\ufeff\u00ad')
    text = ''.join(ch for ch in text if ch not in STRIP)

    # Second-pass matra fix (catches anything missed above)
    chars = list(text)
    out = []
    i = 0
    while i < len(chars):
        ch = chars[i]
        if ch == ' ':
            nxt = chars[i + 1] if i + 1 < len(chars) else ''
            prv = out[-1] if out else ''
            if nxt in MATRAS or prv == HALANT:
                i += 1
                continue
        out.append(ch)
        i += 1
    text = ''.join(out)

    # Normalise spaces line-by-line
    lines = [' '.join(ln.split()) for ln in text.split('\n')]
    text = '\n'.join(lines)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No PDF path given'}, ensure_ascii=False))
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(json.dumps({'error': f'File not found: {pdf_path}'}, ensure_ascii=False))
        sys.exit(1)

    try:
        import fitz
    except ImportError:
        print(json.dumps({'error': 'PyMuPDF not installed. Run: pip install pymupdf'}, ensure_ascii=False))
        sys.exit(1)

    try:
        doc = fitz.open(pdf_path)
        num_pages = len(doc)

        # ── Primary: rawdict with spurious-space removal ──────────────────────
        page_texts = [extract_page_rawdict(page) for page in doc]
        raw_joined = '\n\n'.join(t for t in page_texts if t)
        text       = clean_text(raw_joined)

        has_dev = bool(DEVANAGARI_RE.search(text))

        # ── Fallback: standard extraction ─────────────────────────────────────
        if not text or len(text.strip()) < 20:
            fallback = extract_standard(doc)
            text     = clean_text(fallback)
            has_dev  = bool(DEVANAGARI_RE.search(text))

        result = {
            'text'         : text,
            'pages'        : num_pages,
            'hasDevanagari': has_dev,
            'charCount'    : len(text),
            'wordCount'    : len(text.split()),
            'warning'      : None if has_dev else
                             'No Hindi (Devanagari) text detected. The PDF may use a non-Unicode font '
                             '(e.g. KrutiDev/DevLys). Please paste the correct Unicode Hindi text manually.',
        }
        print(json.dumps(result, ensure_ascii=False))

    except Exception as exc:
        print(json.dumps({'error': str(exc)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == '__main__':
    main()
