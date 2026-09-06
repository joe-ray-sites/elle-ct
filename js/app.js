import * as DB from './db.js?v=5';
import { parseTest, parseKey, parseExplanations, applyKey, applyBookletKeys, parseReportKeys, parseCSV, autoTags } from './parser.js?v=5';
import * as Coach from './coach.js?v=5';
import * as Score from './scoring.js?v=5';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);

const S = {
  questions: [], passages: [], prompts: [], responses: [], attempts: [], scores: [],
  goal: null, pending: null, drill: null,
  filters: { subjects: new Set(), sources: new Set(), tags: new Set() },
};

// ------------------------------------------------------------- boot
async function boot() {
  await reload();
  bindNav();
  bindImport();
  bindDrill();
  bindLibrary();
  bindPrompts();
  bindCoach();
  bindGoals();
  show(location.hash.slice(1) || 'study');
}

async function reload() {
  [S.questions, S.passages, S.prompts, S.responses, S.attempts, S.scores] = await Promise.all(
    ['questions', 'passages', 'prompts', 'responses', 'attempts', 'scores'].map(DB.all));
  S.goal = await DB.getMeta('goal', null);
  // Conversion tables from imported booklets, keyed by source name.
  S.forms = Object.fromEntries((await DB.all('meta')).filter(r => r.k.startsWith('conv:')).map(r => [r.k.slice(5), r.v]));
  renderCounts();
}

/** The booklet conversion table to score a section with, if exactly one imported source has one. */
function formFor(subject) {
  const forms = Object.values(S.forms || {}).filter(f => f?.[subject]?.length);
  return forms.length === 1 ? forms[0] : null;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function renderCounts() {
  const withKey = S.questions.filter(q => q.answer).length;
  $('#topCounts').textContent =
    `${plural(S.questions.length, 'question')} · ${withKey} graded · ${plural(S.prompts.length, 'prompt')}`;
}

function bindNav() {
  $$('.tab[data-view]').forEach(b => b.onclick = () => show(b.dataset.view));
  window.addEventListener('hashchange', () => show(location.hash.slice(1) || 'study'));

  // Overflow sheet for the tabs that don't fit a phone's bottom bar.
  const sheet = $('#navSheet'), scrim = $('#scrim'), more = $('#moreBtn');
  const closeSheet = () => {
    sheet.hidden = true; scrim.hidden = true; more.setAttribute('aria-expanded', 'false');
  };
  more.onclick = () => {
    const open = sheet.hidden;
    sheet.hidden = !open; scrim.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
  };
  scrim.onclick = closeSheet;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  bindNav.closeSheet = closeSheet;

  bindTheme();
}

/** auto → light → dark, remembered. Tokens do the rest. */
function bindTheme() {
  const btn = $('#themeBtn');
  const apply = (mode) => {
    if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    btn.title = `Theme: ${mode}`;
    btn.style.color = mode === 'auto' ? '' : 'var(--primary)';
  };
  let mode = localStorage.getItem('theme') || 'auto';
  apply(mode);
  btn.onclick = () => {
    mode = { auto: 'light', light: 'dark', dark: 'auto' }[mode];
    localStorage.setItem('theme', mode);
    apply(mode);
    toast(`Theme: ${mode}`, 1400);
  };
}

function show(view) {
  if (!$('#view-' + view)) view = 'study';
  $$('.view').forEach(v => v.classList.add('hidden'));
  $('#view-' + view).classList.remove('hidden');
  $$('.tab[data-view]').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  bindNav.closeSheet?.();
  history.replaceState(null, '', '#' + view);
  window.scrollTo({ top: 0, behavior: 'instant' });
  ({ study: renderStudySetup, library: renderLibrary, prompts: renderPrompts,
     coach: renderCoach, goals: renderGoals, stats: renderStats }[view] || (() => {}))();
}

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

// =============================================================== IMPORT
function bindImport() {
  const dz = $('#dropzone'), fi = $('#fileInput');
  $('#browseBtn').onclick = () => fi.click();
  fi.onchange = () => handleFiles([...fi.files]);
  ['dragenter', 'dragover'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', ev => handleFiles([...ev.dataTransfer.files]));
  $('#parseBtn').onclick = () => runParse($('#pasteBox').value);
  $('#discardBtn').onclick = () => { S.pending = null; $('#previewPanel').classList.add('hidden'); };
  $('#saveBtn').onclick = savePending;
  $('#manualBtn').onclick = addManual;
}

async function handleFiles(files) {
  for (const f of files) {
    try {
      const name = f.name.replace(/\.[^.]+$/, '');
      if (!$('#srcName').value) $('#srcName').value = name;
      if (/\.json$/i.test(f.name)) { await importJSON(JSON.parse(await f.text())); continue; }
      if (/\.csv$/i.test(f.name)) { previewParsed(parseCSV(await f.text()).map(finishQ), []); continue; }
      S.pendingPdf = null;
      const text = /\.pdf$/i.test(f.name) ? await pdfText(f) : await f.text();
      // An answer-key report has no questions in it — it belongs in the key box.
      if (/correct answers?\s*:/i.test(text) && !/^\s{0,8}\(?[A-K]\s*[.):]\s*\S/m.test(text)) {
        $('#keyBox').value = text;
        S.pendingPdf = null;
        toast('Loaded an answer key report into the key box. Now drop or paste the test itself.', 5000);
        if ($('#pasteBox').value.trim()) runParse($('#pasteBox').value);
        continue;
      }
      $('#pasteBox').value = text;
      runParse(text);
    } catch (err) {
      toast(`${f.name}: ${err.message}`, 5000);
      console.error(err);
    }
  }
}

let pdfjs = null;
async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  try {
    pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
  } catch {
    throw new Error('PDF reading needs an internet connection the first time. Otherwise: open the PDF, select all, and paste the text in the box below.');
  }
  return pdfjs;
}

/**
 * Text of every page, each prefixed with a ⟪PAGE n⟫ marker the parser uses to
 * remember where questions came from. Lines are rebuilt from pdf.js text
 * items: a new line on a vertical jump or an explicit EOL, and a space wherever
 * two items sit apart horizontally (pdf.js often omits it). The document is
 * kept on S.pendingPdf so referenced pages can be rendered to images at save.
 */
async function pdfText(file) {
  toast('Reading PDF…', 8000);
  await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const parts = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines = [];
    let line = '', lastY = null, lastEnd = null;
    for (const it of content.items) {
      if (typeof it.str !== 'string') continue;
      const x = it.transform[4], y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; lastEnd = null; }
      if (lastEnd !== null && x - lastEnd > 1.5 && line && !/\s$/.test(line) && !/^\s/.test(it.str)) line += ' ';
      line += it.str;
      lastEnd = x + (it.width || 0); lastY = y;
      if (it.hasEOL) { lines.push(line); line = ''; lastEnd = null; }
    }
    if (line) lines.push(line);
    parts.push(`⟪PAGE ${p}⟫\n${lines.join('\n')}`);
    if (p % 8 === 0) toast(`Reading PDF… page ${p} of ${doc.numPages}`, 4000);
  }
  const text = parts.join('\n');
  if (text.replace(/⟪PAGE \d+⟫/g, '').replace(/\s/g, '').length < 200)
    throw new Error('That PDF has no text layer (it is a scan). Run it through OCR, or type/paste the questions.');
  S.pendingPdf = { doc, name: file.name };
  return text;
}

/** Render one PDF page to a JPEG data URL (~150–250 KB at this scale).
 *  intent:'print' matters: with the default 'display' intent pdf.js paces the
 *  render on requestAnimationFrame, which never fires in a background tab —
 *  switch tabs during an import and every page would stall forever. */
async function renderPdfPage(n, scale = 1.6) {
  const page = await S.pendingPdf.doc.getPage(n);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, intent: 'print' });
  const timeout = new Promise((_, rej) => setTimeout(() => { task.cancel(); rej(new Error('render timed out')); }, 30000));
  await Promise.race([task.promise, timeout]);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function opts() {
  return {
    source: $('#srcName').value.trim() || 'Untitled',
    subject: $('#srcSubject').value,
    tags: $('#srcTags').value.split(',').map(s => s.trim()).filter(Boolean),
  };
}

function runParse(text) {
  if (!text.trim()) return toast('Nothing to parse — paste some text or drop a file.');
  const o = opts();
  const res = parseTest(text, o);
  const warnings = [...res.warnings];

  // Keys printed in the booklet itself come first; a pasted key fills gaps.
  const fromBooklet = res.booklet ? applyBookletKeys(res.questions, res.keys) : 0;
  const pasted = $('#keyBox').value;
  const report = parseReportKeys(pasted);
  let fromPaste = 0;
  if (report['*'] && !res.booklet) {
    // a bare CORRECT ANSWERS row: flat numbering
    fromPaste = applyKey(res.questions.filter(q => !q.answer), new Map([...report['*']].map(([n, v]) => [n, v.answer])));
  } else if (Object.keys(report).length) {
    fromPaste = applyBookletKeys(res.questions.filter(q => !q.answer), report);
  } else {
    const key = parseKey(pasted);
    const expl = parseExplanations(pasted);
    fromPaste = key.size ? applyKey(res.questions.filter(q => !q.answer), key, expl) : 0;
  }
  const keyed = fromBooklet + fromPaste;
  if (fromPaste && Object.keys(report).length) warnings.push(`Applied the answer key report: ${fromPaste} questions keyed from its CORRECT ANSWERS rows (field-test items skipped).`);

  if (fromBooklet) warnings.push(`Answer key found inside the booklet: ${fromBooklet} of ${res.questions.length} questions keyed, each tagged with its official ACT reporting category.`);
  if (res.conversion) warnings.push('Found this form\'s raw-to-scale conversion table — score estimates for these questions will use it.');
  if (res.questions.length && !keyed)
    warnings.push('No answer key matched these questions — paste one in the answer key box so drills can grade you. (You can also add answers later from the Library tab.)');
  else if (keyed < res.questions.length)
    warnings.push(`Answer key covered ${keyed} of ${res.questions.length} questions. The rest will be shown ungraded until you fill them in.`);
  if (S.pendingPdf) warnings.push('Each question will keep an image of its test page, so figures, tables and equations the text loses are still there when you drill.');
  previewParsed(res.questions, res.passages, res.prompts, warnings, { conversion: res.conversion, booklet: res.booklet });
}

function finishQ(q) {
  const subject = q.subject || 'English';
  return { ...q, subject, tags: q.tags?.length ? q.tags : autoTags(q, subject) };
}

function previewParsed(questions, passages = [], prompts = [], warnings = [], extra = {}) {
  S.pending = { questions, passages, prompts, opts: opts(), ...extra };
  const p = $('#previewPanel');
  p.classList.remove('hidden');
  const bySubject = {};
  for (const q of questions) bySubject[q.subject] = (bySubject[q.subject] || 0) + 1;
  const breakdown = Object.entries(bySubject).map(([s, n]) => `${s} ${n}`).join(' · ');
  $('#previewCount').textContent =
    `${plural(questions.length, 'question')}${breakdown ? ` (${breakdown})` : ''} · ${questions.filter(q => q.answer).length} with answers · ${plural(passages.length, 'passage')}${prompts.length ? ` · ${plural(prompts.length, 'prompt')}` : ''}`;
  $('#previewList').innerHTML =
    warnings.map(w => `<div class="pv" style="border-color:var(--warning)">⚠ ${esc(w)}</div>`).join('') +
    questions.slice(0, 40).map(q => `
      <div class="pv">
        <div class="n">#${q.number ?? '—'} · ${esc(q.subject)}${q.page ? ' · p.' + q.page : ''}${q.tags?.length ? ' · ' + q.tags.map(esc).join(', ') : ''}</div>
        <div class="st">${esc(q.stem.slice(0, 400))}</div>
        <div class="ch">${q.choices.map(c => c.letter === q.answer
          ? `<b>${c.letter}. ${esc(c.text || '(see page)')} ✓</b>` : `${c.letter}. ${esc(c.text || '(see page)')}`).join('<br>')}</div>
      </div>`).join('') +
    (questions.length > 40 ? `<div class="pv muted">…and ${questions.length - 40} more</div>` : '');
  p.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function savePending() {
  if (!S.pending) return;
  const { questions, passages, prompts, opts: o, conversion } = S.pending;
  const pIds = passages.map(() => DB.uid());
  await DB.putMany('passages', passages.map((p, i) => ({
    id: pIds[i], source: o.source, label: p.label || 'Passage', text: p.text, pages: p.pages || [],
  })));
  await DB.putMany('questions', questions.map(q => ({
    id: DB.uid(), source: o.source, subject: q.subject, number: q.number ?? null,
    stem: q.stem, choices: q.choices, answer: q.answer || null,
    explanation: q.explanation || '', tags: q.tags || [],
    passageId: q.passageIdx != null && pIds[q.passageIdx] ? pIds[q.passageIdx] : null,
    page: q.page ?? null,
    flagged: false, createdAt: Date.now(),
    srs: { seen: 0, correct: 0, wrong: 0, box: 0, dueAt: 0, lastSeen: 0 },
  })));
  if (prompts?.length) await DB.putMany('prompts', prompts.map(p => ({
    id: DB.uid(), source: o.source, title: p.title, text: p.text, createdAt: Date.now(),
  })));
  if (conversion) await DB.setMeta('conv:' + o.source, conversion);

  // Page images: only the pages something actually references.
  if (S.pendingPdf) {
    const wanted = new Set();
    questions.forEach(q => q.page && wanted.add(q.page));
    passages.forEach(p => (p.pages || []).forEach(n => wanted.add(n)));
    const nums = [...wanted].sort((a, b) => a - b);
    let done = 0;
    for (const n of nums) {
      try {
        const image = await renderPdfPage(n);
        await DB.put('pages', { id: `${o.source}::${n}`, source: o.source, n, image });
      } catch (err) { console.warn('page render failed', n, err); }
      if (++done % 4 === 0) toast(`Saving page images… ${done} of ${nums.length}`, 3000);
    }
    S.pendingPdf = null;
  }

  S.pending = null;
  $('#previewPanel').classList.add('hidden');
  $('#pasteBox').value = ''; $('#keyBox').value = '';
  await reload();
  toast(`Saved ${plural(questions.length, 'question')} to “${o.source}”.`);
}

async function importJSON(data) {
  if (Array.isArray(data)) {
    previewParsed(data.map(d => finishQ({
      number: d.number ?? null, stem: d.stem || d.question || '',
      choices: d.choices || Object.entries(d).filter(([k]) => /^[A-K]$/.test(k)).map(([k, v]) => ({ letter: k, text: v })),
      answer: (d.answer || '').toString().toUpperCase().slice(0, 1) || null,
      explanation: d.explanation || '', subject: d.subject, tags: d.tags || [],
    })), []);
    return;
  }
  // full backup
  for (const store of ['questions', 'passages', 'prompts', 'responses', 'attempts', 'scores', 'pages']) {
    if (Array.isArray(data[store])) await DB.putMany(store, data[store]);
  }
  for (const [src, conv] of Object.entries(data.forms || {})) await DB.setMeta('conv:' + src, conv);
  if (data.goal) await DB.setMeta('goal', data.goal);
  await reload();
  toast('Backup restored.');
}

function addManual() {
  const stem = prompt('Question text?');
  if (!stem) return;
  const raw = prompt('Choices, one per line as "A. text"\n(or comma separated)');
  if (!raw) return;
  const choices = raw.split(/\n|(?=,\s*[A-K][.)])/).map((l, i) => {
    const m = l.trim().match(/^\(?([A-K])[.)]\s*(.*)$/);
    return m ? { letter: m[1], text: m[2] } : { letter: 'ABCDE'[i], text: l.replace(/^,/, '').trim() };
  }).filter(c => c.text);
  const answer = (prompt('Correct letter?') || '').toUpperCase().slice(0, 1) || null;
  previewParsed([finishQ({ stem, choices, answer, subject: $('#srcSubject').value === 'auto' ? 'English' : $('#srcSubject').value, explanation: '' })], []);
}

// =============================================================== STUDY
function renderStudySetup() {
  $('#drill').classList.add('hidden');
  $('#summary').classList.add('hidden');
  $('#studySetup').classList.remove('hidden');

  const count = (fn) => S.questions.filter(fn).length;
  const chip = (label, on, n) => `<button class="chip${on ? ' on' : ''}" data-v="${esc(label)}">${esc(label)}<span class="n">${n}</span></button>`;

  const subjects = [...new Set(S.questions.map(q => q.subject))].sort();
  $('#subjChips').innerHTML = subjects.length
    ? subjects.map(s => chip(s, S.filters.subjects.has(s), count(q => q.subject === s))).join('')
    : '<span class="muted">Nothing imported yet — head to the Import tab.</span>';

  const sources = [...new Set(S.questions.map(q => q.source))].sort();
  $('#sourceChips').innerHTML = sources.map(s => chip(s, S.filters.sources.has(s), count(q => q.source === s))).join('') || '<span class="muted">—</span>';

  const tagCounts = {};
  S.questions.forEach(q => (q.tags || []).forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1));
  const tags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]).slice(0, 24);
  $('#tagChips').innerHTML = tags.map(t => chip(t, S.filters.tags.has(t), tagCounts[t])).join('') || '<span class="muted">—</span>';

  const wire = (el, set) => $$('.chip', el).forEach(c => c.onclick = () => {
    const v = c.dataset.v;
    set.has(v) ? set.delete(v) : set.add(v);
    renderStudySetup();
  });
  wire($('#subjChips'), S.filters.subjects);
  wire($('#sourceChips'), S.filters.sources);
  wire($('#tagChips'), S.filters.tags);

  const pool = pickPool();
  $('#poolNote').textContent = pool.length
    ? `${pool.length} question${pool.length === 1 ? '' : 's'} match. ${pool.filter(q => !q.answer).length} of them have no answer key (you'll be shown them ungraded).`
    : S.questions.length ? 'No questions match those filters.' : '';
  $('#startBtn').disabled = !pool.length;
}

function pickPool() {
  const f = S.filters;
  return S.questions.filter(q =>
    (!f.subjects.size || f.subjects.has(q.subject)) &&
    (!f.sources.size || f.sources.has(q.source)) &&
    (!f.tags.size || (q.tags || []).some(t => f.tags.has(t))));
}

function buildQueue() {
  const mode = $('#modeSel').value;
  const len = parseInt($('#lenSel').value, 10);
  let pool = pickPool();
  const now = Date.now();
  const acc = (q) => q.srs.seen ? q.srs.correct / q.srs.seen : null;

  if (mode === 'flagged') pool = pool.filter(q => q.flagged);
  if (mode === 'unseen') pool = pool.filter(q => !q.srs.seen);
  if (mode === 'weak') pool = pool.filter(q => q.srs.seen && acc(q) < 0.8);

  const weight = (q) => {
    if (mode === 'random') return 1;
    let w = 1;
    if (!q.srs.seen) w += 2.5;
    else {
      const a = acc(q);
      w += (1 - a) * 5;
      if (q.srs.dueAt && now >= q.srs.dueAt) w += 3;
      const days = (now - (q.srs.lastSeen || 0)) / 864e5;
      w += Math.min(2, days / 7);
      if (mode === 'smart' && q.srs.box >= 4 && now < q.srs.dueAt) w *= 0.15;
    }
    if (q.flagged) w += 2;
    return w;
  };

  const picked = [];
  const bag = pool.map(q => ({ q, w: weight(q) }));
  const limit = len === 0 ? Math.min(pool.length, 200) : Math.min(len, pool.length);
  while (picked.length < limit && bag.length) {
    const total = bag.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total, i = 0;
    while (i < bag.length - 1 && (r -= bag[i].w) > 0) i++;
    picked.push(bag.splice(i, 1)[0].q);
  }
  return picked;
}

function bindDrill() {
  $('#startBtn').onclick = startDrill;
  $('#nextBtn').onclick = next;
  $('#skipBtn').onclick = () => { record(null, true); next(); };
  $('#revealBtn').onclick = reveal;
  $('#explainBtn').onclick = () => explain(true);
  $('#flagBtn').onclick = toggleFlag;
  $('#quitBtn').onclick = endSession;
  $('#passageToggle').onclick = () => $('#qPassage').classList.toggle('collapsed');
  $('#pageToggle').onclick = () => $('#qPageWrap').classList.toggle('collapsed');
  $('#pageImg').onclick = (e) => e.target.classList.toggle('zoom');   // tap to zoom
  document.addEventListener('keydown', onKey);
}

function startDrill() {
  const queue = buildQueue();
  if (!queue.length) return toast('Nothing matches those filters.');
  S.drill = {
    queue, i: -1, answered: false, chosen: null, started: 0,
    limit: parseInt($('#timerSel').value, 10), tick: null,
    results: [], endless: $('#lenSel').value === '0',
  };
  $('#studySetup').classList.add('hidden');
  $('#summary').classList.add('hidden');
  $('#drill').classList.remove('hidden');
  next();
}

function next() {
  const d = S.drill;
  if (!d) return;
  if (!d.answered && d.i >= 0 && d.chosen === null) { /* moving on without answering */ }
  d.i++;
  if (d.i >= d.queue.length) {
    if (d.endless) d.queue.push(...buildQueue());
    if (d.i >= d.queue.length) return endSession();
  }
  showQuestion(d.queue[d.i]);
}

function showQuestion(q) {
  const d = S.drill;
  d.answered = false; d.chosen = null; d.started = Date.now();
  $('#qSubject').textContent = q.subject;
  $('#qSource').textContent = `${q.source}${q.number ? ' · #' + q.number : ''}` +
    (q.srs.seen ? ` · seen ${q.srs.seen}×, ${Math.round(100 * q.srs.correct / q.srs.seen)}%` : ' · new');
  $('#qProgress').textContent = d.endless ? `${d.i + 1}` : `${d.i + 1}/${d.queue.length}`;
  $('#qbarFill').style.width = d.endless ? '100%' : `${((d.i + 1) / d.queue.length) * 100}%`;
  $('#flagBtn').style.color = q.flagged ? 'var(--warning)' : '';

  const passage = q.passageId && S.passages.find(p => p.id === q.passageId);
  const pw = $('#qPassage');
  if (passage) {
    pw.classList.remove('hidden');
    pw.classList.add('collapsed');
    $('#passageToggle').textContent = `${passage.label || 'Passage'} ▾`;
    $('#passageBody').textContent = passage.text;
  } else pw.classList.add('hidden');

  // The rendered test page — where the figures, tables and equations live.
  // Opened by default for Math/Science and for any choice the text lost.
  const pv = $('#qPageWrap');
  const img = $('#pageImg');
  img.removeAttribute('src'); img.classList.remove('zoom');
  if (q.page) {
    pv.classList.remove('hidden');
    const open = q.subject === 'Math' || q.subject === 'Science' || q.choices.some(c => !c.text);
    pv.classList.toggle('collapsed', !open);
    $('#pageToggle').innerHTML = `Test page ${q.page} <span aria-hidden="true">▾</span>`;
    DB.get('pages', `${q.source}::${q.page}`).then(row => {
      if (row && S.drill && S.drill.queue[S.drill.i] === q) img.src = row.image;
    });
  } else pv.classList.add('hidden');

  $('#qStem').textContent = q.stem;
  $('#qChoices').innerHTML = q.choices.map(c =>
    `<button class="choice" data-l="${c.letter}"><span class="ltr">${c.letter}</span><span>${esc(c.text)}</span></button>`).join('');
  $$('#qChoices .choice').forEach(b => b.onclick = () => answer(b.dataset.l));
  $('#verdict').classList.add('hidden');
  $('#qExplanation').classList.add('hidden');
  $('#qExplanation').innerHTML = '';

  clearInterval(d.tick);
  const tEl = $('#qTimer');
  if (d.limit) {
    let left = d.limit;
    const paint = () => {
      tEl.textContent = `${left}s`;
      tEl.classList.toggle('low', left <= 10);
    };
    paint();
    d.tick = setInterval(() => {
      left--; paint();
      if (left <= 0) { clearInterval(d.tick); if (!d.answered) reveal(true); }
    }, 1000);
  } else tEl.textContent = '';
}

function answer(letter) {
  const d = S.drill;
  if (!d || d.answered) return;
  d.chosen = letter;
  grade();
}

function reveal(timedOut = false) {
  const d = S.drill;
  if (!d || d.answered) return;
  d.chosen = d.chosen || null;
  grade(timedOut);
}

function grade(timedOut = false) {
  const d = S.drill;
  const q = d.queue[d.i];
  d.answered = true;
  clearInterval(d.tick);

  const correct = q.answer ? d.chosen === q.answer : null;
  $$('#qChoices .choice').forEach(b => {
    b.disabled = true;
    if (q.answer && b.dataset.l === q.answer) b.classList.add('correct');
    if (b.dataset.l === d.chosen) {
      b.classList.add('picked');
      if (q.answer && d.chosen !== q.answer) b.classList.add('wrong');
    }
  });

  const v = $('#verdict');
  v.classList.remove('hidden', 'good', 'bad');
  if (!q.answer) {
    v.textContent = 'No answer key stored for this one — add it from the Library tab.';
  } else if (correct) {
    v.classList.add('good');
    v.textContent = timedOut ? `Out of time — the answer was ${q.answer}.` : 'Correct.';
  } else {
    v.classList.add('bad');
    v.textContent = d.chosen
      ? `You picked ${d.chosen}. The answer is ${q.answer}.`
      : `The answer is ${q.answer}.`;
  }

  record(d.chosen, false, correct, timedOut);
  if (correct !== true) explain(false);
  else ensureVisible(v);
}

/** On a phone the verdict often lands under the sticky action dock. Nudge it
 *  into view, but only when it is actually off-screen. */
function ensureVisible(el) {
  if (!el) return;
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    const dock = document.querySelector('.drill-foot');
    const floor = window.innerHeight - (dock?.offsetHeight || 0) - 24;
    if (r.top < 60 || r.bottom > floor) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

async function record(chosen, skipped, correct, timedOut) {
  const d = S.drill;
  const q = d.queue[d.i];
  const ms = Date.now() - d.started;
  const pick = q.choices.find(c => c.letter === chosen);
  const corr = q.choices.find(c => c.letter === q.answer);

  await DB.put('attempts', {
    id: DB.uid(), questionId: q.id, subject: q.subject, source: q.source,
    chosen: chosen || null, correct: !!correct, skipped: !!skipped, timedOut: !!timedOut,
    chosenText: pick?.text || '', correctText: corr?.text || '',
    chosenLen: pick?.text.length || 0, correctLen: corr?.text.length || 0,
    ms, at: Date.now(), day: today(), idx: d.i,
  });

  if (!skipped && q.answer) {
    const s = q.srs;
    s.seen++; s.lastSeen = Date.now();
    if (correct) { s.correct++; s.box = Math.min(5, s.box + 1); }
    else { s.wrong++; s.box = 0; }
    const gaps = [10 * 60e3, 864e5, 3 * 864e5, 7 * 864e5, 16 * 864e5, 35 * 864e5];
    s.dueAt = Date.now() + gaps[s.box];
    await DB.put('questions', q);
  }
  d.results.push({ q, chosen, correct: !!correct, skipped: !!skipped });
  S.attempts = await DB.all('attempts');
  renderCounts();
}

async function explain(forceAI) {
  const d = S.drill;
  if (!d) return;
  const q = d.queue[d.i];
  const box = $('#qExplanation');
  box.classList.remove('hidden');

  if (q.explanation && !forceAI) {
    box.classList.remove('tip');
    box.innerHTML = `<span class="lbl">Explanation (from your material)</span>${esc(q.explanation)}`;
    ensureVisible(box);
    return;
  }
  const wantAI = forceAI || ($('#autoExplain')?.checked && Coach.getKey());
  if (wantAI && Coach.getKey()) {
    box.classList.remove('tip');
    box.innerHTML = `<span class="lbl">Explanation</span>Thinking…`;
    try {
      const passage = q.passageId && S.passages.find(p => p.id === q.passageId);
      const text = await Coach.aiExplain(q, d.chosen, passage?.text || '');
      box.innerHTML = `<span class="lbl">Explanation</span>${mdBold(text)}`;
      q.explanation = text;
      await DB.put('questions', q);
    } catch (err) {
      box.classList.add('tip');
      box.innerHTML = `<span class="lbl">Couldn't reach Claude (${esc(err.message)})</span>${esc(Coach.fallbackExplain(q, d.chosen))}`;
    }
    ensureVisible(box);
    return;
  }
  box.classList.add('tip');
  box.innerHTML = `<span class="lbl">${q.explanation ? 'Explanation' : 'What to watch for'}</span>` +
    esc(q.explanation || Coach.fallbackExplain(q, d.chosen));
  ensureVisible(box);
}

const mdBold = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

async function toggleFlag() {
  const d = S.drill; if (!d) return;
  const q = d.queue[d.i];
  q.flagged = !q.flagged;
  await DB.put('questions', q);
  $('#flagBtn').style.color = q.flagged ? 'var(--warning)' : '';
  toast(q.flagged ? 'Flagged for later.' : 'Unflagged.');
}

function onKey(e) {
  if ($('#view-study').classList.contains('hidden') || !S.drill) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k = e.key.toUpperCase();
  if (/^[A-K]$/.test(k) && !S.drill.answered) {
    const btn = $(`#qChoices .choice[data-l="${k}"]`);
    if (btn) { e.preventDefault(); answer(k); }
  } else if (e.key === 'Enter') { e.preventDefault(); S.drill.answered ? next() : reveal(); }
  else if (k === 'S') { e.preventDefault(); record(null, true); next(); }
  else if (k === 'F') { e.preventDefault(); toggleFlag(); }
  else if (k === 'E') { e.preventDefault(); explain(true); }
}

function endSession() {
  const d = S.drill;
  clearInterval(d?.tick);
  $('#drill').classList.add('hidden');
  const done = d?.results.filter(r => !r.skipped && r.q.answer) || [];
  const right = done.filter(r => r.correct).length;
  const missed = d?.results.filter(r => !r.correct && !r.skipped) || [];
  const pct = done.length ? Math.round(100 * right / done.length) : 0;

  const tagMiss = {};
  missed.forEach(r => (r.q.tags || []).forEach(t => tagMiss[t] = (tagMiss[t] || 0) + 1));
  const worstTags = Object.entries(tagMiss).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const tips = worstTags.flatMap(([t]) => Coach.tipsFor(missed[0]?.q.subject || '', [t]).slice(0, 1));

  $('#summary').classList.remove('hidden');
  $('#summary').innerHTML = `
    <h2>${right} of ${done.length} — ${pct}%</h2>
    <div class="stat-cards">
      <div class="card ${pct >= 75 ? 'good' : 'bad'}"><div class="k">Accuracy</div><div class="v">${pct}%</div></div>
      <div class="card"><div class="k">Missed</div><div class="v">${missed.length}</div></div>
      <div class="card"><div class="k">Estimated scale</div><div class="v">${done.length ? Score.accuracyToScale(missed[0]?.q.subject || d.queue[0].subject, right / done.length, formFor(missed[0]?.q.subject || d.queue[0].subject)) : '—'}</div><div class="d">rough, untimed</div></div>
    </div>
    ${worstTags.length ? `<p class="sub">Weak in this set: ${worstTags.map(([t, n]) => `<b>${esc(t)}</b> (${n} missed)`).join(', ')}</p>` : ''}
    ${tips.map(t => `<div class="explanation tip"><span class="lbl">Tip</span><strong>${esc(t.b)}</strong> — ${esc(t.x)}</div>`).join('')}
    ${missed.length ? `<h2 class="mt">What you missed</h2>` + missed.map(r => `
      <div class="li"><div class="li-title">${esc(r.q.stem.slice(0, 180))}</div>
      <div class="li-meta">you: ${r.chosen || '—'} · answer: ${r.q.answer} · ${esc(r.q.tags?.join(', ') || '')}</div></div>`).join('') : ''}
    <div class="actions" style="margin-top:18px">
      <button class="primary" id="againBtn">Another set</button>
      <button class="ghost" id="redoMissBtn">Redo just the misses</button>
      <button class="ghost" id="backBtn">Back to setup</button>
    </div>`;
  $('#againBtn').onclick = startDrill;
  $('#backBtn').onclick = renderStudySetup;
  $('#redoMissBtn').onclick = () => {
    if (!missed.length) return toast('Nothing missed. Go again.');
    S.drill = { queue: missed.map(r => r.q), i: -1, answered: false, chosen: null, started: 0,
                limit: parseInt($('#timerSel').value, 10), tick: null, results: [], endless: false };
    $('#summary').classList.add('hidden');
    $('#drill').classList.remove('hidden');
    next();
  };
  S.drill = null;
  reload();
}

// =============================================================== LIBRARY
function bindLibrary() {
  $('#libSearch').oninput = renderLibrary;
  $('#libSubject').onchange = renderLibrary;
  $('#libSource').onchange = renderLibrary;
  $('#exportBtn').onclick = exportBackup;
  $('#wipeBtn').onclick = async () => {
    if (!confirm('Delete every question, attempt, prompt and score in this app? This cannot be undone.')) return;
    if (!confirm('Really delete everything? Export a backup first if you are not sure.')) return;
    await DB.wipeAll();
    await reload();
    renderLibrary();
    toast('Library cleared.');
  };
}

function renderLibrary() {
  const q = $('#libSearch').value.toLowerCase();
  const subj = $('#libSubject'), src = $('#libSource');
  const subjects = [...new Set(S.questions.map(x => x.subject))].sort();
  const sources = [...new Set(S.questions.map(x => x.source))].sort();
  const fill = (sel, vals) => {
    const cur = sel.value;
    sel.innerHTML = '<option value="">All</option>' + vals.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
  };
  fill(subj, subjects); fill(src, sources);

  const rows = S.questions.filter(x =>
    (!subj.value || x.subject === subj.value) &&
    (!src.value || x.source === src.value) &&
    (!q || (x.stem + ' ' + x.choices.map(c => c.text).join(' ') + ' ' + (x.tags || []).join(' ')).toLowerCase().includes(q)))
    .slice(0, 300);

  $('#libList').innerHTML = rows.length ? rows.map(x => `
    <div class="li" data-id="${x.id}">
      <div class="li-head">
        <div class="li-title">${esc(x.stem.slice(0, 220))}</div>
        <div class="li-actions">
          <button class="ghost" data-act="edit">Edit</button>
          <button class="ghost danger" data-act="del">Delete</button>
        </div>
      </div>
      <div class="li-meta">
        <span>${esc(x.subject)}</span><span>${esc(x.source)}</span>
        <span>${x.answer ? 'answer ' + x.answer : '<span style="color:var(--warning)">no answer key</span>'}</span>
        <span>${x.srs.seen ? `${Math.round(100 * x.srs.correct / x.srs.seen)}% of ${x.srs.seen}` : 'unseen'}</span>
        ${x.flagged ? '<span class="tagdot">⚑ flagged</span>' : ''}
        ${(x.tags || []).map(t => `<span class="tagdot">${esc(t)}</span>`).join('')}
      </div>
    </div>`).join('') : '<p class="muted">Nothing here yet.</p>';

  $$('#libList .li').forEach(el => {
    const id = el.dataset.id;
    const item = S.questions.find(x => x.id === id);
    $('[data-act="del"]', el).onclick = async () => {
      if (!confirm('Delete this question?')) return;
      await DB.del('questions', id); await reload(); renderLibrary();
    };
    $('[data-act="edit"]', el).onclick = () => openEditor(el, item);
  });
}

function openEditor(el, item) {
  if ($('.li-edit', el)) return $('.li-edit', el).remove();
  const box = document.createElement('div');
  box.className = 'li-edit';
  box.innerHTML = `
    <label>Question</label><textarea rows="3">${esc(item.stem)}</textarea>
    ${item.choices.map(c => `<label>${c.letter}</label><input data-l="${c.letter}" value="${esc(c.text)}">`).join('')}
    <div class="row tight">
      <div class="field"><label>Answer</label>
        <select data-f="answer"><option value="">—</option>
        ${item.choices.map(c => `<option${item.answer === c.letter ? ' selected' : ''}>${c.letter}</option>`).join('')}</select></div>
      <div class="field grow"><label>Tags</label><input data-f="tags" value="${esc((item.tags || []).join(', '))}"></div>
      <div class="field"><label>Subject</label>
        <select data-f="subject">${['English','Math','Reading','Science','Writing'].map(s => `<option${item.subject === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <label>Explanation</label><textarea data-f="explanation" rows="3">${esc(item.explanation || '')}</textarea>
    <div class="actions"><button class="primary" data-f="save">Save</button></div>`;
  el.appendChild(box);
  $('[data-f="save"]', box).onclick = async () => {
    item.stem = $('textarea', box).value.trim();
    $$('input[data-l]', box).forEach(i => {
      const c = item.choices.find(c => c.letter === i.dataset.l);
      if (c) c.text = i.value;
    });
    item.answer = $('[data-f="answer"]', box).value || null;
    item.subject = $('[data-f="subject"]', box).value;
    item.tags = $('[data-f="tags"]', box).value.split(',').map(s => s.trim()).filter(Boolean);
    item.explanation = $('[data-f="explanation"]', box).value.trim();
    await DB.put('questions', item);
    await reload(); renderLibrary();
    toast('Saved.');
  };
}

async function exportBackup() {
  const data = {
    exportedAt: new Date().toISOString(),
    questions: S.questions, passages: S.passages, prompts: S.prompts,
    responses: S.responses, attempts: S.attempts, scores: S.scores, goal: S.goal,
    pages: await DB.all('pages'),
    forms: S.forms,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `ellect-backup-${today()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =============================================================== PROMPTS
function bindPrompts() {
  $('#randomPromptBtn').onclick = () => {
    if (!S.prompts.length) return toast('No prompts yet — add one, or import a Writing section.');
    stagePrompt(S.prompts[Math.floor(Math.random() * S.prompts.length)]);
  };
  $('#newPromptBtn').onclick = async () => {
    const title = prompt('Prompt title?'); if (!title) return;
    const text = prompt('Prompt text (paste the whole thing)'); if (!text) return;
    await DB.put('prompts', { id: DB.uid(), source: 'Manual', title, text, createdAt: Date.now() });
    await reload(); renderPrompts(); toast('Prompt added.');
  };
}

function renderPrompts() {
  $('#promptList').innerHTML = S.prompts.length ? S.prompts.map(p => `
    <div class="li" data-id="${p.id}">
      <div class="li-head"><div class="li-title"><strong>${esc(p.title)}</strong><br><span class="muted">${esc(p.text.slice(0, 160))}…</span></div>
      <div class="li-actions"><button class="ghost" data-act="use">Write</button><button class="ghost danger" data-act="del">Delete</button></div></div>
      <div class="li-meta"><span>${esc(p.source)}</span><span>${S.responses.filter(r => r.promptId === p.id).length} drafts</span></div>
    </div>`).join('') : '<p class="muted">No prompts yet.</p>';
  $$('#promptList .li').forEach(el => {
    const p = S.prompts.find(x => x.id === el.dataset.id);
    $('[data-act="use"]', el).onclick = () => stagePrompt(p);
    $('[data-act="del"]', el).onclick = async () => {
      if (!confirm('Delete this prompt?')) return;
      await DB.del('prompts', p.id); await reload(); renderPrompts();
    };
  });
}

function stagePrompt(p) {
  const prior = S.responses.filter(r => r.promptId === p.id).sort((a, b) => b.createdAt - a.createdAt);
  const stage = $('#promptStage');
  stage.innerHTML = `
    <div class="li" style="margin:14px 0">
      <div class="li-title"><strong>${esc(p.title)}</strong></div>
      <div class="explanation" style="border-left-color:var(--accent);margin-top:10px">${esc(p.text)}</div>
      <div class="row tight" style="margin-top:14px;align-items:center">
        <button class="primary" id="essayTimerBtn">Start 40:00</button>
        <span class="timer" id="essayTimer" style="font-size:18px"></span>
        <span class="muted" id="wordCount">0 words</span>
      </div>
      <textarea id="essayBox" rows="16" placeholder="Write here. Saves as you type." style="margin-top:12px;font-family:inherit;font-size:15px"></textarea>
      <div class="actions"><button class="primary" id="saveEssayBtn">Save draft</button></div>
      ${prior.length ? `<div class="li-meta" style="margin-top:12px">Past drafts: ${prior.map(r => `<span class="tagdot">${new Date(r.createdAt).toLocaleDateString()} · ${r.text.split(/\s+/).filter(Boolean).length}w</span>`).join('')}</div>` : ''}
    </div>`;
  const box = $('#essayBox');
  const draftKey = 'essay-draft-' + p.id;
  box.value = localStorage.getItem(draftKey) || '';
  const count = () => $('#wordCount').textContent = `${box.value.split(/\s+/).filter(Boolean).length} words`;
  count();
  box.oninput = () => { localStorage.setItem(draftKey, box.value); count(); };
  $('#saveEssayBtn').onclick = async () => {
    if (!box.value.trim()) return toast('Nothing written yet.');
    await DB.put('responses', { id: DB.uid(), promptId: p.id, text: box.value, createdAt: Date.now() });
    await reload(); toast('Draft saved.'); renderPrompts();
  };
  let left = 40 * 60, tick = null;
  $('#essayTimerBtn').onclick = () => {
    if (tick) { clearInterval(tick); tick = null; $('#essayTimerBtn').textContent = 'Resume'; return; }
    $('#essayTimerBtn').textContent = 'Pause';
    tick = setInterval(() => {
      left--;
      $('#essayTimer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      $('#essayTimer').classList.toggle('low', left < 300);
      if (left <= 0) { clearInterval(tick); tick = null; toast('Time.'); }
    }, 1000);
  };
  stage.scrollIntoView({ behavior: 'smooth' });
}

// =============================================================== COACH
function bindCoach() {
  $('#saveKeyBtn').onclick = () => {
    const v = $('#apiKey').value.trim();
    if (!v) return toast('Paste a key first.');
    Coach.setKey(v); $('#apiKey').value = ''; renderCoach(); toast('Key saved in this browser only.');
  };
  $('#clearKeyBtn').onclick = () => { Coach.clearKey(); renderCoach(); toast('Key removed.'); };
  $('#autoExplain').checked = localStorage.getItem('auto-explain') === '1';
  $('#autoExplain').onchange = (e) => localStorage.setItem('auto-explain', e.target.checked ? '1' : '0');
}

function renderCoach() {
  const dx = Coach.diagnose(S.attempts, S.questions);
  $('#diagnosis').innerHTML = dx.map(d => `
    <div class="dx sev-${d.sev}">
      <h3>${esc(d.title)}</h3><p>${esc(d.body)}</p>
      ${d.tag ? `<p style="margin-top:8px"><button class="ghost" data-tag="${esc(d.tag)}">Drill ${esc(d.tag)} now →</button></p>` : ''}
    </div>`).join('');
  $$('#diagnosis [data-tag]').forEach(b => b.onclick = () => {
    S.filters.subjects.clear(); S.filters.sources.clear();
    S.filters.tags.clear(); S.filters.tags.add(b.dataset.tag);
    show('study');
  });

  $('#keyState').textContent = Coach.getKey()
    ? '✓ Key saved. Misses can be explained by Claude on demand (the Explain button, or key E).'
    : 'No key set — you still get rule-based feedback and tips on every miss.';

  const subjects = ['All', 'English', 'Math', 'Reading', 'Science'];
  const cur = renderCoach._subj || 'All';
  $('#tipSubjChips').innerHTML = subjects.map(s =>
    `<button class="chip${s === cur ? ' on' : ''}" data-s="${s}">${s}</button>`).join('');
  $$('#tipSubjChips .chip').forEach(c => c.onclick = () => { renderCoach._subj = c.dataset.s; renderCoach(); });
  const list = Coach.TIPS.filter(t => cur === 'All' || t.s === cur || t.s === '');
  $('#tipList').innerHTML = list.map(t =>
    `<div class="tip"><b>${esc(t.b)}</b>${esc(t.x)}<div class="tg">${esc(t.s || 'any section')}${t.t ? ' · ' + esc(t.t) : ''}</div></div>`).join('');
}

// =============================================================== GOALS
function bindGoals() {
  $('#saveGoalBtn').onclick = async () => {
    const g = {
      composite: +$('#goalComposite').value || null,
      date: $('#goalDate').value || null,
      baseline: +$('#goalBaseline').value || null,
      English: +$('#goalEnglish').value || null,
      Math: +$('#goalMath').value || null,
      Reading: +$('#goalReading').value || null,
      Science: +$('#goalScience').value || null,
    };
    await DB.setMeta('goal', g);
    S.goal = g;
    renderGoals();
    toast('Goal saved.');
  };
  $('#addScoreBtn').onclick = async () => {
    const rec = {
      id: DB.uid(), date: $('#scDate').value || today(),
      label: $('#scLabel').value.trim() || 'Practice test',
      English: +$('#scE').value || null, Math: +$('#scM').value || null,
      Reading: +$('#scR').value || null, Science: +$('#scS').value || null,
    };
    if (!Score.composite(rec)) return toast('Enter at least one section score.');
    await DB.put('scores', rec);
    ['#scLabel', '#scE', '#scM', '#scR', '#scS'].forEach(s => $(s).value = '');
    await reload(); renderGoals(); toast('Score logged.');
  };
  $('#importScoresBtn').onclick = async () => {
    const rows = Score.parseScorePaste($('#scPaste').value);
    if (!rows.length) return toast('Could not read any scores from that.');
    await DB.putMany('scores', rows.map(r => ({ id: DB.uid(), ...r })));
    $('#scPaste').value = '';
    await reload(); renderGoals(); toast(`Imported ${rows.length} score${rows.length === 1 ? '' : 's'}.`);
  };
}

/** Estimated section score from drill accuracy (untimed, so optimistic). */
function estimates() {
  const out = {};
  for (const s of Score.SECTIONS) {
    const rows = S.attempts.filter(a => a.subject === s && !a.skipped && a.chosen);
    if (rows.length < 8) continue;
    const recent = rows.sort((a, b) => b.at - a.at).slice(0, 120);
    const acc = recent.filter(r => r.correct).length / recent.length;
    out[s] = { scale: Score.accuracyToScale(s, acc, formFor(s)), acc, n: recent.length };
  }
  return out;
}

function renderGoals() {
  const g = S.goal || {};
  $('#goalComposite').value = g.composite || '';
  $('#goalDate').value = g.date || '';
  $('#goalBaseline').value = g.baseline || '';
  for (const s of Score.SECTIONS) $('#goal' + s).value = g[s] || '';

  const hist = S.scores.slice().sort((a, b) => Score.localDate(a.date) - Score.localDate(b.date));
  const latest = hist.at(-1);
  const est = estimates();
  const estComposite = Score.composite(Object.fromEntries(Object.entries(est).map(([k, v]) => [k, v.scale])));
  const cur = latest ? Score.composite(latest) : estComposite;
  const start = g.baseline || (hist[0] ? Score.composite(hist[0]) : null);
  const proj = Score.project(hist, g.date);
  const daysLeft = g.date ? Math.ceil((Score.localDate(g.date) - Date.now()) / 864e5) : null;

  const pctToGoal = (start && g.composite && cur)
    ? Math.max(0, Math.min(100, Math.round(100 * (cur - start) / Math.max(1, g.composite - start)))) : null;

  $('#goalCards').innerHTML = `
    <div class="card"><div class="k">Target</div><div class="v">${g.composite || '—'}</div><div class="d">${g.date ? Score.localDate(g.date).toLocaleDateString() : "no date set"}</div></div>
    <div class="card ${cur && g.composite ? (cur >= g.composite ? 'good' : '') : ''}"><div class="k">Latest composite</div><div class="v">${cur || '—'}</div><div class="d">${latest ? esc(latest.label) : 'from drill estimate'}</div></div>
    <div class="card"><div class="k">Points to go</div><div class="v">${cur && g.composite ? Math.max(0, g.composite - cur) : '—'}</div><div class="d">${pctToGoal !== null ? pctToGoal + '% of the way there' : 'set a baseline'}</div></div>
    <div class="card"><div class="k">Days left</div><div class="v">${daysLeft ?? '—'}</div><div class="d">${daysLeft && daysLeft > 0 ? `${Math.max(1, Math.round(daysLeft / 7))} weeks` : ''}</div></div>
    ${proj ? `<div class="card ${g.composite && proj.at >= g.composite ? 'good' : 'bad'}"><div class="k">On pace for</div><div class="v">${proj.at.toFixed(1)}</div><div class="d">${proj.perWeek >= 0 ? '+' : ''}${proj.perWeek.toFixed(2)} pts/week</div></div>` : ''}`;

  const chart = Score.progressChart(hist, g);
  const gapRows = Score.SECTIONS.map(s => {
    const now = latest?.[s] || est[s]?.scale;
    const target = g[s] || g.composite;
    if (!now || !target) return `<div class="bar"><span class="nm">${s}</span><div class="track"></div><span class="val">—</span></div>`;
    const gp = Score.gap(s, now, target);
    const frac = Math.max(0, Math.min(1, now / 36));
    return `<div class="bar">
      <span class="nm">${s}</span>
      <div class="track"><div class="fill" style="width:${(frac * 100).toFixed(1)}%"></div>
        <div class="marker" style="left:${(target / 36 * 100).toFixed(1)}%"></div></div>
      <span class="val">${now} → ${target}<em>${gp.points > 0 ? `+${gp.questions} right` : 'at target'}</em></span>
    </div>`;
  }).join('');

  $('#progressChart').innerHTML = chart + `
    <h2 class="mt">Section gaps</h2>
    <p class="sub">Bar = where you are, marker = your target, count = roughly how many more questions per section you need to get right.</p>
    ${gapRows}
    ${Object.keys(est).length ? `<p class="hint" style="margin-top:12px">Estimates in gray come from your drill accuracy (${Object.entries(est).map(([k, v]) => `${k} ${Math.round(v.acc * 100)}% of ${v.n}`).join(' · ')}). Drills are untimed and repeat questions you've seen, so real test scores usually land a bit lower.</p>` : ''}`;

  $('#scoreList').innerHTML = hist.length ? hist.slice().reverse().map(r => `
    <div class="li" data-id="${r.id}">
      <div class="li-head"><div class="li-title"><strong>${Score.composite(r)}</strong> · ${esc(r.label)}</div>
      <div class="li-actions"><button class="ghost danger" data-act="del">Delete</button></div></div>
      <div class="li-meta"><span>${Score.localDate(r.date).toLocaleDateString()}</span>
      ${Score.SECTIONS.map(s => `<span class="tagdot">${s[0]}${s === 'Science' ? 'ci' : ''} ${r[s] ?? '—'}</span>`).join('')}</div>
    </div>`).join('') : '<p class="muted">No score history yet.</p>';
  $$('#scoreList .li').forEach(el => $('[data-act="del"]', el).onclick = async () => {
    await DB.del('scores', el.dataset.id); await reload(); renderGoals();
  });
}

// =============================================================== STATS
/**
 * One card per imported test. Scores the FIRST attempt at each question —
 * that is the honest "how did I do", re-tries are practice — and converts
 * with the form's own raw→scale table when the booklet supplied one.
 */
function renderTestReports() {
  const box = $('#testReports');
  const first = new Map();
  for (const a of [...S.attempts].sort((x, y) => x.at - y.at)) {
    if (a.skipped || !a.chosen || first.has(a.questionId)) continue;
    first.set(a.questionId, a);
  }
  const sources = [...new Set(S.questions.map(q => q.source))]
    .filter(src => S.questions.filter(q => q.source === src && q.answer).length >= 10);
  if (!sources.length) { box.innerHTML = '<p class="muted">Import a full test and drill it — a report per test appears here.</p>'; return; }

  box.innerHTML = sources.map(src => {
    const form = S.forms?.[src] || null;
    const rows = Score.SECTIONS.map(sec => {
      const qs = S.questions.filter(q => q.source === src && q.subject === sec && q.answer);
      if (!qs.length) return null;
      const done = qs.filter(q => first.has(q.id));
      const right = done.filter(q => first.get(q.id).correct).length;
      const scale = done.length ? Score.accuracyToScale(sec, right / done.length, form) : null;
      return { sec, n: qs.length, done: done.length, right, scale };
    }).filter(Boolean);
    const scales = rows.map(r => r.scale).filter(v => v != null);
    const composite = scales.length ? Math.round(scales.reduce((a, b) => a + b, 0) / scales.length) : null;
    const attempted = rows.reduce((a, r) => a + r.done, 0), total = rows.reduce((a, r) => a + r.n, 0);
    return `
      <div class="li">
        <div class="li-head">
          <div class="li-title"><strong>${esc(src)}</strong><br>
            <span class="muted">${attempted} of ${total} questions attempted${form ? ' · scored with this form\'s conversion table' : ' · generic conversion'}</span></div>
          <div class="card" style="padding:8px 14px;text-align:center"><div class="k">Composite</div><div class="v">${composite ?? '—'}</div></div>
        </div>
        ${rows.map(r => `
          <div class="bar">
            <span class="nm">${r.sec}</span>
            <div class="track"><div class="fill" style="width:${r.done ? (100 * r.right / r.done).toFixed(1) : 0}%"></div></div>
            <span class="val">${r.done ? `${r.right}/${r.done}` : '—'} of ${r.n}<em>${r.scale != null ? '≈ ' + r.scale : 'not started'}</em></span>
          </div>`).join('')}
        ${attempted < total ? `<p class="hint" style="margin-top:8px">Section scores are projected from the questions attempted so far; they settle once every question has been seen once.</p>` : ''}
      </div>`;
  }).join('');
}

function renderStats() {
  const graded = S.attempts.filter(a => !a.skipped && a.chosen);
  const acc = graded.length ? graded.filter(a => a.correct).length / graded.length : 0;
  const days = new Set(S.attempts.map(a => a.day));
  const totalMin = Math.round(S.attempts.reduce((s, a) => s + Math.min(a.ms || 0, 300000), 0) / 60000);
  const streak = (() => {
    let n = 0, d = new Date();
    while (days.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  })();

  $('#statCards').innerHTML = `
    <div class="card ${acc >= .75 ? 'good' : acc && acc < .6 ? 'bad' : ''}"><div class="k">Overall accuracy</div><div class="v">${Math.round(acc * 100)}%</div><div class="d">${graded.length} graded</div></div>
    <div class="card"><div class="k">Questions done</div><div class="v">${S.attempts.length}</div><div class="d">${S.questions.length} in library</div></div>
    <div class="card"><div class="k">Day streak</div><div class="v">${streak}</div><div class="d">${days.size} days total</div></div>
    <div class="card"><div class="k">Time drilling</div><div class="v">${totalMin}m</div><div class="d">${graded.length ? Math.round(totalMin * 60 / graded.length) + 's per question' : ''}</div></div>`;

  const g = S.goal || {};
  $('#bySubject').innerHTML = Score.SECTIONS.map(s => {
    const rows = graded.filter(a => a.subject === s);
    if (!rows.length) return `<div class="bar"><span class="nm">${s}</span><div class="track"></div><span class="val">no data</span></div>`;
    const a = rows.filter(r => r.correct).length / rows.length;
    const target = g[s] || g.composite;
    return `<div class="bar">
      <span class="nm">${s}</span>
      <div class="track"><div class="fill" style="width:${(a * 100).toFixed(1)}%"></div>
      ${target ? `<div class="marker" style="left:${(Score.scaleToRaw(s, target) / Score.ITEMS[s] * 100).toFixed(1)}%"></div>` : ''}</div>
      <span class="val">${Math.round(a * 100)}% · ~${Score.accuracyToScale(s, a, formFor(s))}<em>${rows.length} answered</em></span>
    </div>`;
  }).join('') + (g.composite ? '<p class="hint">Marker = the accuracy you need for your target score in that section.</p>' : '');

  renderTestReports();

  const byQ = new Map();
  for (const a of graded) {
    if (!byQ.has(a.questionId)) byQ.set(a.questionId, []);
    byQ.get(a.questionId).push(a);
  }
  const worst = [...byQ.entries()]
    .map(([id, rows]) => ({ q: S.questions.find(x => x.id === id), rows }))
    .filter(x => x.q && x.rows.length >= 1 && x.rows.some(r => !r.correct))
    .sort((a, b) => (a.rows.filter(r => r.correct).length / a.rows.length) - (b.rows.filter(r => r.correct).length / b.rows.length)
                 || b.rows.length - a.rows.length)
    .slice(0, 15);
  $('#worstList').innerHTML = worst.length ? worst.map(x => `
    <div class="li"><div class="li-title">${esc(x.q.stem.slice(0, 160))}</div>
    <div class="li-meta"><span>${esc(x.q.subject)}</span><span>${x.rows.filter(r => r.correct).length}/${x.rows.length} right</span>
    ${(x.q.tags || []).map(t => `<span class="tagdot">${esc(t)}</span>`).join('')}</div></div>`).join('')
    : '<p class="muted">Nothing missed yet.</p>';

  const cells = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const n = S.attempts.filter(a => a.day === key).length;
    const alpha = n ? Math.min(1, 0.25 + n / 30) : 0;
    cells.push(`<div class="heatcell" title="${key}: ${n} questions" style="${n ? `background:color-mix(in srgb,var(--accent) ${Math.round(alpha * 100)}%,var(--surface-2));color:var(--text)` : ''}">${n || ''}</div>`);
  }
  $('#heat').innerHTML = `<div class="heatrow">${cells.join('')}</div>`;
}

boot();
