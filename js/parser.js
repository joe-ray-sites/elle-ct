// Turns raw ACT text (from a PDF, a paste, a scan-to-text) into structured questions.
// Deliberately forgiving: PDF text extraction is messy, so every rule has a fallback.
//
// Two modes fall out of the same pass:
//  · booklet mode — the text contains real section headers (ENGLISH TEST …).
//    Subjects come from the headers, numbering restarts per section, passage
//    text is only accepted under an explicit PASSAGE header, and the scoring
//    keys / conversion table printed at the back are parsed too.
//  · loose mode — anything pasted by hand. Subject is guessed per question and
//    any long block of text before question 1 is treated as a passage.
//
// Page markers (⟪PAGE n⟫) are inserted by the PDF extractor. They let every
// question and passage remember which page it came from, so the rendered page
// image (with the figures text extraction loses) can be shown alongside.

const LETTERS = 'ABCDEFGHJK';
const SET_A = 'ABCDE', SET_F = 'FGHJK';
const JUNK = [
  /^\s*go on to the next page/i,
  /^\s*do your figuring here/i,
  /^\s*end of test/i,
  /^\s*stop!? if you finish/i,
  /^\s*act[-–]?\s?[a-z]?\d{2,4}[a-z]?\s*$/i,   // form codes: ACT-1874C, ACT-J04
  /^\s*\d{1,3}\s*$/,                          // stray page / line numbers
  /^\s*(page\s+)?\d{1,3}\s*\|\s*/i,
  /^\s*copyright|^\s*©/i,
];

const isJunk = (line) => JUNK.some(re => re.test(line));
const PAGE_MARK = /^\s*⟪PAGE (\d+)⟫\s*$/;
const SECTION = /^\s*(ENGLISH|MATHEMATICS|MATH|READING|SCIENCE|WRITING)\s+TEST\b/i;
const STOP = /^\s*(scoring guide|scoring key|.*scoring key \(for form|conversion of raw scores)/i;
const QSTART = /^\s{0,6}\(?(\d{1,3})\s*[.):]\s+(\S.*)$/;
const CHOICE = /^\s{0,8}\(?([A-K])\s*[.):]\s*(.*)$/;
const CHOICE_INLINE = /\(?\b([A-K])[.)]\s+/g;
const PASSAGE_HEAD = /^\s*(passage\s+[ivx\d]+[a-z]?)\b(.*)$/i;
const PARA_MARK = /^\s*\[(\d{1,2}|[A-H])\]\s*$/;     // English paragraph / point markers
const KEY_PAIR = /(\d{1,3})\s*[.):\-–]?\s*([A-K])\b/g;

const clean = (s) => s.replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim();

const SUBJECT_OF = { ENGLISH: 'English', MATHEMATICS: 'Math', MATH: 'Math', READING: 'Reading', SCIENCE: 'Science', WRITING: 'Writing' };

function normalize(raw) {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/-\n(?=[a-z])/g, '')          // de-hyphenate line-broken words
    .split('\n')
    .filter(l => !isJunk(l))
    .join('\n');
}

/** Figure debris: axis numbers, single labels, "Key", "Figure 2". Only judged
 *  inside a question or a booklet passage — the page image carries the figure. */
function isDebris(line) {
  const t = line.trim();
  if (!t) return true;
  if (t.length <= 2) return true;
  if (/^[\d\s.,°%()\-−–+×÷=<>/:]+$/.test(t)) return true;          // numbers & math punct only
  if (t.length <= 8 && !/[a-z]/.test(t)) return true;                // "RO (%)", "Q", "MDL"
  if (/^(key|day|trial \d+|figure \d+|table \d+|study \d+|experiment \d+)$/i.test(t)) return true;
  return false;
}

/** Answer key: "1. A  2. J  3. C" in any layout, including a column per line. */
export function parseKey(text) {
  const key = new Map();
  if (!text || !text.trim()) return key;
  let m;
  KEY_PAIR.lastIndex = 0;
  while ((m = KEY_PAIR.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    const letter = m[2].toUpperCase();
    if (!LETTERS.includes(letter) || letter === 'I') continue;
    if (n < 1 || n > 999) continue;
    if (!key.has(n)) key.set(n, letter);
  }
  return key;
}

/** Explanations laid out as "12. The correct answer is F because ..." */
export function parseExplanations(text) {
  const out = new Map();
  if (!text || !/correct answer|because|explanation/i.test(text)) return out;
  const lines = normalize(text).split('\n');
  let cur = null, buf = [];
  const flush = () => { if (cur !== null && buf.length) out.set(cur, clean(buf.join(' '))); };
  for (const line of lines) {
    const m = line.match(/^\s*\(?(\d{1,3})\s*[.):]\s+(.*)$/);
    if (m && /correct answer|the answer is|best answer/i.test(m[2])) {
      flush(); cur = parseInt(m[1], 10); buf = [m[2]];
    } else if (cur !== null) buf.push(line);
  }
  flush();
  return out;
}

// ---------------------------------------------------------- booklet keys
/** ACT's printed reporting-category codes → readable tags. */
const CATEGORY = {
  POW: 'production-of-writing', KLA: 'knowledge-of-language', CSE: 'conventions-of-standard-english',
  'PHM-A': 'algebra', 'PHM-F': 'functions', 'PHM-G': 'geometry', 'PHM-N': 'number-quantity',
  'PHM-S': 'statistics-probability', IES: 'essential-skills', MDL: 'modeling',
  KID: 'key-ideas-details', CS: 'craft-structure', IKI: 'integration-knowledge-ideas',
  IOD: 'interpretation-of-data', SIN: 'scientific-investigation', EMI: 'evaluation-models-inferences',
};

/**
 * Scoring keys printed at the back of an ACT booklet. Each section is a
 * column of rows: number, letter, optional "(Mark 1)", then category codes.
 * Returns { English: Map(number → {answer, tags}), Math: …, … }.
 */
export function parseBookletKeys(text) {
  const out = {};
  const re = /^\s*(English|Mathematics|Math|Reading|Science)\s+Scoring Key\b.*$/gim;
  const starts = [];
  let m;
  while ((m = re.exec(text)) !== null) starts.push({ subject: SUBJECT_OF[m[1].toUpperCase()], at: m.index });
  // A row is "number letter categories". Different extractors put the three
  // on one line or on three, so whitespace here may span newlines; the
  // strictly sequential numbering is what keeps "of 17 / Conventions" out.
  const ROW = /(?:^|\s)(\d{1,2})\s+([A-K])\s+([A-Z][A-Z\-]*(?:\s*,\s*[A-Z][A-Z\-]*)*)(?=\s|$)/g;
  for (let i = 0; i < starts.length; i++) {
    const seg = text.slice(starts[i].at, starts[i + 1]?.at ?? text.length).replace(/\(mark 1\)/gi, ' ');
    const map = new Map();
    let expect = 1, r;
    ROW.lastIndex = 0;
    while ((r = ROW.exec(seg)) !== null) {
      if (parseInt(r[1], 10) !== expect) continue;
      const tags = r[3].split(/\s*,\s*/).map(c => CATEGORY[c] || c.toLowerCase()).filter(Boolean);
      map.set(expect, { answer: r[2], tags });
      expect++;
    }
    if (map.size) out[starts[i].subject] = map;
  }
  return out;
}

/**
 * ACT's "My Answer Key Report": per section, a CORRECT ANSWERS row of letters
 * like "BHDFCFDFAJ BFDJC^^^^^ …". A caret is a field-test item that was not
 * scored and is absent from the booklet, so the scored letters number
 * sequentially with carets skipped — the same numbering the booklet uses.
 * Only the CORRECT ANSWERS row is read; a YOUR ANSWERS row is ignored.
 * Returns { English: Map(number → {answer, tags:[]}), … } when sections are
 * labelled, or { '*': Map } for a bare CORRECT ANSWERS line.
 */
export function parseReportKeys(text) {
  if (!text || !/correct answers?\s*:/i.test(text)) return {};
  const out = {};
  const lines = text.replace(/\r/g, '').split('\n');
  let section = '*';
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^\s*(ENGLISH|MATHEMATICS|MATH|READING|SCIENCE)\b\s*:?\s*$/i);
    if (head) { section = SUBJECT_OF[head[1].toUpperCase()]; continue; }
    const m = lines[i].match(/correct answers?\s*:\s*(.*)$/i);
    if (!m) continue;
    // the letter row may sit on the same line or on the next non-empty one
    let row = m[1].trim();
    if (!/[A-K]/.test(row)) row = (lines.slice(i + 1).find(l => l.trim()) || '').trim();
    const letters = row.replace(/[^A-K^*\-]/gi, '').toUpperCase();
    if (letters.replace(/[^A-K]/g, '').length < 5) continue;
    const map = new Map();
    let n = 0;
    for (const ch of letters) {
      if (ch === '^') continue;                              // field-test item, not in the booklet
      n++;
      if (/[A-K]/.test(ch) && ch !== 'I') map.set(n, { answer: ch, tags: [] });
    }
    if (map.size) out[section] = map;
  }
  return out;
}

/**
 * The form-specific "Conversion of Raw Scores to Scale Scores" table: five
 * tokens per row — scale, then raw (or range, or —) for E / M / R / S.
 * Returns { English: [[rawNeeded, scale] …], …, items: {English: 40, …} }.
 */
export function parseConversion(text) {
  // The table's own title carries "(for Form …)"; the prose on the page before
  // mentions the table by name too, so prefer the title and fall back to the
  // last mention.
  let i = text.search(/conversion of raw scores\s+to\s+scale scores\s*\(for form/i);
  if (i < 0) i = text.toLowerCase().lastIndexOf('conversion of raw scores');
  if (i < 0) return null;
  // Whitespace-tokenised so one-cell-per-line and one-row-per-line layouts read the same.
  const toks = text.slice(i).split(/\s+/).filter(Boolean);
  const start = toks.indexOf('36');
  if (start < 0) return null;
  const sections = ['English', 'Math', 'Reading', 'Science'];
  const table = { English: [], Math: [], Reading: [], Science: [] };
  const items = {};
  let expect = 36;
  for (let p = start; p + 4 < toks.length && expect >= 1; p += 5) {
    if (toks[p] !== String(expect)) break;
    sections.forEach((s, k) => {
      const r = toks[p + 1 + k].match(/^(\d{1,2})(?:[–\-](\d{1,2}))?$/);
      if (!r) return;
      const lo = parseInt(r[1], 10), hi = r[2] ? parseInt(r[2], 10) : lo;
      table[s].push([lo, expect]);
      items[s] = Math.max(items[s] || 0, hi);
    });
    expect--;
  }
  if (!Object.keys(items).length) return null;
  return { ...table, items };
}

// ------------------------------------------------------------ subjects
function guessSubject(q, passageText = '') {
  const stem = (q.stem || '').toLowerCase();
  const all = (stem + ' ' + q.choices.map(c => c.text).join(' ')).toLowerCase();
  const ctx = passageText.toLowerCase();
  if (/no change/.test(all) || /omit the underlined/.test(all)) return 'English';
  if (/the writer|the essay|this paragraph|the preceding sentence|underlined portion/.test(stem)) return 'English';
  if (q.choices.length === 5) return 'Math';
  if (/which of the following|solve|equation|graph|triangle|\bx\s*=|integer|slope/.test(stem)
      && /[0-9=+\-*/^√π]/.test(q.choices.map(c => c.text).join(''))) return 'Math';
  if (/figure \d|table \d|trial \d|study \d|experiment \d|scientist \d|according to (figure|table)|data in/.test(stem)) return 'Science';
  if (/\b(figure|table|trial|hypothesis)\b/.test(stem) && /(figure|table|trial|experiment) \d/.test(ctx)) return 'Science';
  if (/passage|the author|the narrator|main idea|it can reasonably be inferred|as it is used in line/.test(stem)) return 'Reading';
  return 'English';
}

/** Auto-tag from the wording of the question — powers the "weak spots" drill. */
export function autoTags(q, subject) {
  const s = (q.stem + ' ' + q.choices.map(c => c.text).join(' ')).toLowerCase();
  const t = new Set();
  if (subject === 'English') {
    if (/,/.test(q.choices.map(c => c.text).join('')) && /no change/.test(s)) t.add('punctuation');
    if (/;|:|--|—/.test(q.choices.map(c => c.text).join(''))) t.add('semicolon-colon-dash');
    if (/\bwhich choice|most effectively|best accomplishes|most logical|relevant/.test(s)) t.add('rhetorical-skills');
    if (/should (the writer|this|that)|if the writer were to delete|essay/.test(s)) t.add('author-purpose');
    if (/most logical place|placement|sentence \d/.test(s)) t.add('organization');
    if (/redundant|wordy|concise/.test(s)) t.add('conciseness');
    const texts = q.choices.map(c => c.text.toLowerCase());
    const pairs = [['was','were'],['is','are'],['has','have'],['had','has'],['does','do'],['their','its']];
    if (pairs.some(([a, b]) => texts.some(t1 => new RegExp(`\\b${a}\\b`).test(t1)) &&
                               texts.some(t2 => new RegExp(`\\b${b}\\b`).test(t2)))) t.add('agreement-tense');
    if (texts.some(t1 => /\b(it's|its|they're|their|there|who's|whose)\b/.test(t1))) t.add('pronouns-apostrophes');
  } else if (subject === 'Math') {
    if (/triangle|angle|circle|radius|perimeter|area|parallel|degrees/.test(s)) t.add('geometry');
    if (/slope|line|coordinate|\(x, ?y\)|graph/.test(s)) t.add('coordinate-geometry');
    if (/probability|average|mean|median|mode|ratio|percent/.test(s)) t.add('statistics-probability');
    if (/sin|cos|tan|trig/.test(s)) t.add('trigonometry');
    if (/equation|solve for|expression|factor|inequality|x\^?2|quadratic/.test(s)) t.add('algebra');
    if (/matrix|imaginary|logarithm|vector|sequence/.test(s)) t.add('advanced');
    if (/how many|total cost|per hour|if .* then/.test(s)) t.add('word-problem');
  } else if (subject === 'Reading') {
    if (/as it is used in line|most nearly means/.test(s)) t.add('vocab-in-context');
    if (/main idea|main purpose|primarily|as a whole/.test(s)) t.add('big-picture');
    if (/inferred|suggests|implies|most likely/.test(s)) t.add('inference');
    if (/according to the passage|states that|line \d+/.test(s)) t.add('detail');
    if (/compare|both passages|passage a|passage b/.test(s)) t.add('paired-passages');
  } else if (subject === 'Science') {
    if (/figure|table|graph/.test(s)) t.add('data-representation');
    if (/experiment|trial|study/.test(s)) t.add('research-summaries');
    if (/scientist \d|hypothesis|viewpoint|would (most likely )?agree/.test(s)) t.add('conflicting-viewpoints');
    if (/increase|decrease|trend|as .* increases/.test(s)) t.add('trends');
    if (/based on .* and .* knowledge|prior knowledge/.test(s)) t.add('outside-knowledge');
  }
  return [...t];
}

// ---------------------------------------------------------- main parse
/**
 * Returns { questions, passages, prompts, warnings, keys, conversion, booklet }.
 * Numbers restart per section, so a detected "1." after "60." is treated as a new section.
 */
export function parseTest(raw, opts = {}) {
  const text = normalize(raw || '');
  const lines = text.split('\n');
  const warnings = [];
  const promptHit = /write a unified, coherent essay|essay task|perspective (one|1)\b/i.test(text);

  const passages = [];
  const questions = [];
  let booklet = false;          // saw a real section header
  let stop = false;             // reached the scoring pages at the back
  let section = null;           // subject from the current section header
  let page = null;
  let curPassage = null;        // { label, parts, pages, idx|null }
  let cur = null;               // question under construction
  let lastNum = 0;

  const finalizePassage = () => {
    if (!curPassage) return;
    if (curPassage.idx == null) {
      const body = clean(curPassage.parts.join('\n'));
      const keep = booklet ? body.length > 40 : body.length > 220;
      if (keep) {
        curPassage.idx = passages.length;
        passages.push({ label: curPassage.label, text: body, pages: [...curPassage.pages].filter(Boolean) });
      }
    } else {
      // English passages continue after their first questions — extend in place.
      const p = passages[curPassage.idx];
      p.text = clean(curPassage.parts.join('\n'));
      p.pages = [...curPassage.pages].filter(Boolean);
    }
  };

  const flushQuestion = () => {
    if (!cur) return;
    cur.stem = clean(cur.stemLines.join(' '));
    if (cur.stem && cur.choices.length >= 2) questions.push(cur);
    else if (cur.stem) warnings.push(`Question ${cur.number} had no answer choices — skipped.`);
    cur = null;
  };

  // A question starts when its number follows on from the last one (a gap of
  // a couple is tolerated for anything we failed to parse) and a choice line
  // shows up before the next, HIGHER question number. Lower numbers in the
  // lookahead are list items inside the stem ("1. Pack soil in the box.") or
  // fraction fragments ("24 . Which of") and must not abort the search. The
  // window is long because a stem can be followed by a whole data table.
  const looksLikeQuestionStart = (i, num) => {
    const next = num === lastNum + 1 || (num > lastNum && num - lastNum <= 3);
    const restart = num === 1 && (lastNum === 0 || lastNum >= 20);
    if (!next && !restart) return false;
    for (let j = i + 1; j < Math.min(i + 60, lines.length); j++) {
      if (CHOICE.test(lines[j])) return true;
      const q2 = lines[j].match(QSTART);
      if (q2 && parseInt(q2[1], 10) > num) return false;
      if (SECTION.test(lines[j]) || PAGE_MARK.test(lines[j])) return false;
    }
    return false;
  };

  // Lines that repeat verbatim on the same page are figure legends and axis
  // labels ("8 weeks", "age when fin"), not prose — the page image has them.
  const repeats = new Map();
  {
    let pg = 0, counts = null;
    for (const l of lines) {
      const pm = l.match(PAGE_MARK);
      if (pm) { pg = parseInt(pm[1], 10); counts = new Map(); repeats.set(pg, counts); continue; }
      const t = l.trim();
      if (counts && t && t.length < 40) counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const isLegend = (line) => (repeats.get(page)?.get(line.trim()) || 0) >= 2 && !CHOICE.test(line);

  const passageLine = (line) => {
    if (!curPassage) {
      if (booklet) return;                       // directions & cover junk
      curPassage = { label: null, parts: [], pages: new Set([page]), idx: null };
    }
    if (booklet && (isDebris(line) || isLegend(line)) && !PARA_MARK.test(line)) return;
    curPassage.parts.push(line);
    curPassage.pages.add(page);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const pm = line.match(PAGE_MARK);
    if (pm) { flushQuestion(); page = parseInt(pm[1], 10); continue; }

    if (!line.trim()) { if (cur) cur.stemLines.push(''); else if (curPassage) curPassage.parts.push(''); continue; }

    const sec = line.match(SECTION);
    if (sec && !cur) {
      flushQuestion(); finalizePassage();
      if (!booklet) { passages.length = 0; questions.length = 0; }   // cover pages
      booklet = true; section = SUBJECT_OF[sec[1].toUpperCase()];
      curPassage = null; lastNum = 0; stop = false;
      continue;
    }
    if (booklet && STOP.test(line)) { flushQuestion(); finalizePassage(); curPassage = null; stop = true; continue; }
    if (stop) continue;

    const ph = line.match(PASSAGE_HEAD);
    const headerAlone = ph && !clean(ph[2] || '').replace(/^[:.—\-]+/, '');
    if (ph && (!cur || headerAlone)) {
      flushQuestion(); finalizePassage();
      curPassage = { label: clean(ph[1] + ' ' + (ph[2] || '')), parts: [], pages: new Set([page]), idx: null };
      continue;
    }

    // An English paragraph marker after a question's choices means the
    // passage has resumed in the left column.
    if (cur && cur.choices.length >= 2 && PARA_MARK.test(line)) { flushQuestion(); passageLine(line); continue; }

    const qs = line.match(QSTART);
    if (qs && looksLikeQuestionStart(i, parseInt(qs[1], 10))) {
      flushQuestion();
      finalizePassage();
      lastNum = parseInt(qs[1], 10);
      cur = {
        number: lastNum, stemLines: [qs[2]], choices: [], page,
        section, passageIdx: curPassage && curPassage.idx != null ? curPassage.idx : null,
      };
      continue;
    }

    const ch = cur && line.match(CHOICE);
    if (ch && LETTERS.includes(ch[1])) {
      const letter = ch[1];
      const first = cur.choices[0]?.letter;
      const sameSet = !first || (SET_A.includes(first) === SET_A.includes(letter));
      const already = cur.choices.some(c => c.letter === letter);
      if (sameSet && !already) { cur.choices.push({ letter, text: clean(ch[2]) }); continue; }
      if (!ch[2].trim()) continue;                // stray figure marker ("H. ")
      // otherwise fall through and treat as continuation text
    }

    if (cur) {
      if (booklet && (isDebris(line) || isLegend(line))) continue;
      if (cur.choices.length) cur.choices[cur.choices.length - 1].text = clean(cur.choices.at(-1).text + ' ' + line);
      else cur.stemLines.push(line);
    } else {
      passageLine(line);
    }
  }
  flushQuestion();
  finalizePassage();

  // Second pass: choices crammed onto one line ("A. NO CHANGE B. having ran C. ...")
  for (const q of questions) {
    if (q.choices.length >= 2) continue;
    const hits = [...q.stem.matchAll(CHOICE_INLINE)];
    if (hits.length >= 3) {
      const line = q.stem;
      q.stem = clean(line.slice(0, hits[0].index));
      q.choices = hits.map((h, k) => ({
        letter: h[1],
        text: clean(line.slice(h.index + h[0].length, k + 1 < hits.length ? hits[k + 1].index : line.length)),
      }));
    }
  }

  const forced = opts.subject && opts.subject !== 'auto' ? opts.subject : null;
  const out = questions
    .filter(q => q.choices.length >= 2)
    .map(q => {
      const ptext = q.passageIdx != null && passages[q.passageIdx] ? passages[q.passageIdx].text : '';
      const subject = forced || q.section || guessSubject(q, ptext);
      return {
        number: q.number, stem: q.stem, choices: q.choices, subject,
        passageIdx: q.passageIdx, page: q.page,
        tags: [...new Set([...(opts.tags || []), ...autoTags(q, subject)])],
        answer: null, explanation: '',
      };
    });

  const prompts = [];
  if (promptHit && out.length === 0) prompts.push({ title: opts.source || 'Writing prompt', text: clean(text) });

  if (!out.length && !prompts.length) {
    warnings.push('No questions found. If this came from a scanned PDF the text layer may be missing — try pasting the text instead.');
  }

  const keys = booklet ? parseBookletKeys(raw) : {};
  const conversion = booklet ? parseConversion(raw) : null;
  return { questions: out, passages, prompts, warnings, keys, conversion, booklet };
}

/** Make sure the answer letter exists as a choice (figure-only choices
 *  sometimes lose their markers in extraction). */
function ensureChoice(q, letter) {
  if (q.choices.some(c => c.letter === letter)) return;
  const set = SET_A.includes(letter) ? SET_A : SET_F;
  const have = new Set(q.choices.map(c => c.letter));
  const upto = Math.max(set.indexOf(letter), ...q.choices.map(c => set.indexOf(c.letter)));
  for (let i = 0; i <= upto; i++) if (!have.has(set[i])) q.choices.push({ letter: set[i], text: '' });
  q.choices.sort((a, b) => set.indexOf(a.letter) - set.indexOf(b.letter));
}

/** Apply a flat key (and optional explanations) onto parsed questions. */
export function applyKey(questions, key, explanations = new Map()) {
  let hit = 0;
  for (const q of questions) {
    const letter = key.get(q.number);
    if (letter) { ensureChoice(q, letter); q.answer = letter; hit++; }
    const ex = explanations.get(q.number);
    if (ex) q.explanation = ex;
  }
  return hit;
}

/** Apply per-section booklet keys; also merges the official category tags. */
export function applyBookletKeys(questions, keys) {
  let hit = 0;
  for (const q of questions) {
    const k = keys[q.subject]?.get(q.number);
    if (!k) continue;
    ensureChoice(q, k.answer);
    q.answer = k.answer;
    q.tags = [...new Set([...(k.tags || []), ...(q.tags || [])])];
    hit++;
  }
  return hit;
}

/** CSV: question,A,B,C,D[,E],answer[,subject][,explanation][,tags] */
export function parseCSV(text) {
  const rows = csvRows(text);
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  const idx = (n) => head.indexOf(n);
  const hasHeader = idx('question') >= 0 || idx('stem') >= 0;
  const body = hasHeader ? rows.slice(1) : rows;
  const col = {
    stem: hasHeader ? (idx('question') >= 0 ? idx('question') : idx('stem')) : 0,
    answer: hasHeader ? idx('answer') : -1,
    subject: hasHeader ? idx('subject') : -1,
    expl: hasHeader ? (idx('explanation') >= 0 ? idx('explanation') : idx('why')) : -1,
    tags: hasHeader ? idx('tags') : -1,
  };
  const letterCols = LETTERS.split('').map(L => ({ L, i: hasHeader ? head.indexOf(L.toLowerCase()) : -1 }))
                            .filter(c => c.i >= 0);
  return body.filter(r => r.length > 1 && r[col.stem]).map(r => ({
    stem: r[col.stem].trim(),
    choices: (letterCols.length ? letterCols : [{ L: 'A', i: 1 }, { L: 'B', i: 2 }, { L: 'C', i: 3 }, { L: 'D', i: 4 }])
      .map(c => ({ letter: c.L, text: (r[c.i] || '').trim() })).filter(c => c.text),
    answer: col.answer >= 0 ? (r[col.answer] || '').trim().toUpperCase().slice(0, 1) || null : null,
    subject: col.subject >= 0 ? (r[col.subject] || '').trim() : 'English',
    explanation: col.expl >= 0 ? (r[col.expl] || '').trim() : '',
    tags: col.tags >= 0 ? (r[col.tags] || '').split(/[;|]/).map(s => s.trim()).filter(Boolean) : [],
  }));
}

function csvRows(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim()));
}
