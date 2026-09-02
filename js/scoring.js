// Score estimation + goal tracking.
// Conversion tables are approximations of published ACT charts — the real curve
// shifts a point or two per test form, so treat estimates as a range, not a promise.

export const SECTIONS = ['English', 'Math', 'Reading', 'Science'];

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

/** Parse a date out of free text into YYYY-MM-DD, or null. */
export function toISO(str) {
  if (!str) return null;
  const s = String(str).trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  m = s.match(new RegExp(`(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?`, 'i'));
  if (m) {
    const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    const y = m[3] || new Date().getFullYear();
    return `${y}-${String(mo).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

/** ISO date -> Date at local midnight (plain `new Date('2026-03-14')` is UTC,
 *  which renders as the 13th west of Greenwich). */
export function localDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
}
export const ITEMS = { English: 75, Math: 60, Reading: 40, Science: 40 };

// [rawNeeded, scaledScore] descending
const TABLE = {
  English: [[75,36],[72,35],[71,34],[70,33],[68,32],[67,31],[66,30],[65,29],[63,28],[61,27],[60,26],[58,25],[56,24],[53,23],[51,22],[48,21],[45,20],[43,19],[41,18],[38,17],[36,16],[33,15],[30,14],[26,13],[23,12],[20,11],[17,10],[14,9],[12,8],[10,7],[8,6],[6,5],[4,4],[3,3],[2,2],[0,1]],
  Math:    [[60,36],[59,35],[57,34],[55,33],[54,32],[53,31],[51,30],[49,29],[47,28],[45,27],[43,26],[41,25],[38,24],[36,23],[34,22],[32,21],[30,20],[28,19],[26,18],[24,17],[19,16],[15,15],[12,14],[10,13],[8,12],[7,11],[5,10],[4,9],[3,8],[2,6],[1,4],[0,1]],
  Reading: [[40,36],[39,35],[38,34],[37,33],[36,32],[35,31],[34,30],[33,29],[32,28],[31,27],[30,26],[29,25],[28,24],[26,23],[25,22],[23,21],[22,20],[20,19],[19,18],[17,17],[16,16],[15,15],[13,14],[11,13],[9,12],[8,11],[6,10],[5,9],[4,8],[3,7],[2,5],[0,1]],
  Science: [[40,36],[39,35],[38,34],[37,33],[36,32],[35,31],[34,30],[33,29],[32,28],[31,27],[30,26],[29,25],[27,24],[26,23],[24,22],[22,21],[21,20],[19,19],[17,18],[16,17],[14,16],[13,15],[12,14],[11,13],[10,12],[9,11],[8,10],[7,9],[6,8],[5,7],[4,5],[0,1]],
};

export function rawToScale(section, raw) {
  const rows = TABLE[section] || TABLE.English;
  for (const [need, score] of rows) if (raw >= need) return score;
  return 1;
}

export function scaleToRaw(section, scale) {
  const rows = TABLE[section] || TABLE.English;
  for (const [need, score] of rows) if (score <= scale) return need;
  return 0;
}

/** `form` is an imported booklet's own conversion table ({English:[[raw,scale]…], items:{…}});
 *  when present it beats the generic approximation. */
export function accuracyToScale(section, accuracy, form = null) {
  const rows = form?.[section]?.length ? form[section] : null;
  if (rows) {
    const raw = Math.round(accuracy * (form.items?.[section] || ITEMS[section] || 40));
    for (const [need, score] of rows) if (raw >= need) return score;
    return 1;
  }
  return rawToScale(section, Math.round(accuracy * (ITEMS[section] || 40)));
}

export const composite = (obj) => {
  const vals = SECTIONS.map(s => obj[s]).filter(v => typeof v === 'number' && v > 0);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
};

/** How many more questions per section, to hit the target. */
export function gap(section, currentScale, targetScale) {
  if (!targetScale || !currentScale) return null;
  const need = scaleToRaw(section, targetScale);
  const have = scaleToRaw(section, currentScale);
  return { points: targetScale - currentScale, questions: Math.max(0, need - have) };
}

/** Least-squares projection of composite onto the test date. */
export function project(history, testDate) {
  const pts = history
    .map(h => ({ x: localDate(h.date).getTime(), y: composite(h) }))
    .filter(p => p.y && !isNaN(p.x))
    .sort((a, b) => a.x - b.x);
  if (pts.length < 2 || !testDate) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const den = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (!den) return null;
  const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / den;
  const target = localDate(testDate).getTime();
  const yhat = my + slope * (target - mx);
  const perWeek = slope * 7 * 864e5;
  return { at: Math.max(1, Math.min(36, yhat)), perWeek, from: pts.at(-1) };
}

// ------------------------------------------------------------- chart
/** Series colors come from the design tokens so the chart follows the theme. */
function series() {
  const css = getComputedStyle(document.documentElement);
  const tok = (n, fallback) => (css.getPropertyValue(n).trim() || fallback);
  return {
    English:   tok('--primary', '#6e9bff'),
    Math:      tok('--accent',  '#9b8cff'),
    Reading:   tok('--success', '#34d399'),
    Science:   tok('--warning', '#fbbf24'),
    Composite: tok('--text',    '#e9ecf2'),
  };
}

export function progressChart(history, goal) {
  const SERIES = series();
  const rows = history.filter(h => composite(h)).sort((a, b) => localDate(a.date) - localDate(b.date));
  if (rows.length === 0) return '<p class="muted">No scores logged yet. Add one above and the progress line shows up here.</p>';

  // Narrow viewBox on phones. Scaling a 720-wide box down to 360px with
  // preserveAspectRatio="none" would squash the labels; matching the box to the
  // screen keeps text at its natural proportions.
  const narrow = window.matchMedia('(max-width: 620px)').matches;
  const W = narrow ? 380 : 720, H = narrow ? 240 : 250;
  const P = { l: 26, r: 12, t: 14, b: 26 };
  const xs = rows.map(r => localDate(r.date).getTime());
  const goalTime = goal?.date ? localDate(goal.date).getTime() : null;
  const minX = Math.min(...xs), maxX = Math.max(Math.max(...xs), goalTime || 0);
  const spanX = Math.max(1, maxX - minX);
  const minY = Math.max(1, Math.min(...rows.flatMap(r => SECTIONS.map(s => r[s]).filter(Boolean)), goal?.composite || 36) - 2);
  const maxY = Math.min(36, Math.max(...rows.flatMap(r => SECTIONS.map(s => r[s]).filter(Boolean)), goal?.composite || 1) + 2);
  const X = (t) => P.l + ((t - minX) / spanX) * (W - P.l - P.r);
  const Y = (v) => H - P.b - ((v - minY) / Math.max(1, maxY - minY)) * (H - P.t - P.b);

  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Score progress">`;
  for (let v = Math.ceil(minY); v <= maxY; v += Math.max(1, Math.round((maxY - minY) / 5))) {
    svg += `<line class="grid" x1="${P.l}" y1="${Y(v)}" x2="${W - P.r}" y2="${Y(v)}"/>`;
    svg += `<text class="axis" x="4" y="${Y(v) + 3}">${v}</text>`;
  }
  if (goal?.composite) {
    svg += `<line class="goal" x1="${P.l}" y1="${Y(goal.composite)}" x2="${W - P.r}" y2="${Y(goal.composite)}"/>`;
    svg += `<text class="axis" x="${W - P.r - 54}" y="${Y(goal.composite) - 5}" fill="${SERIES.Science}">goal ${goal.composite}</text>`;
  }

  const line = (key, color, width = 2) => {
    const pts = rows.map(r => ({ x: X(localDate(r.date).getTime()), y: key === 'Composite' ? Y(composite(r)) : (r[key] ? Y(r[key]) : null) }))
                    .filter(p => p.y !== null);
    if (pts.length < 1) return '';
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const dots = pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${width > 2 ? 3.5 : 2.5}" fill="${color}"/>`).join('');
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>${dots}`;
  };
  for (const s of SECTIONS) svg += line(s, SERIES[s], 1.4);
  svg += line('Composite', SERIES.Composite, 2.6);

  const p = project(rows, goal?.date);
  if (p && goalTime) {
    svg += `<path class="proj" d="M${X(p.from.x).toFixed(1)},${Y(p.from.y).toFixed(1)} L${X(goalTime).toFixed(1)},${Y(p.at).toFixed(1)}"/>`;
    svg += `<circle cx="${X(goalTime).toFixed(1)}" cy="${Y(p.at).toFixed(1)}" r="4" fill="none" stroke="${SERIES.Math}" stroke-width="2"/>`;
  }
  // Thin the date labels so they never collide on a narrow screen.
  const maxLabels = narrow ? 4 : 8;
  const step = Math.ceil(rows.length / maxLabels);
  rows.forEach((r, i) => {
    if (i % step && i !== rows.length - 1) return;
    const d = localDate(r.date);
    const x = X(d.getTime());
    const anchor = x < P.l + 14 ? 'start' : x > W - P.r - 14 ? 'end' : 'middle';
    svg += `<text class="axis" x="${x.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${d.getMonth() + 1}/${d.getDate()}</text>`;
  });
  svg += '</svg>';

  const legend = ['Composite', ...SECTIONS].map(k => `<span><i style="background:${SERIES[k]}"></i>${k}</span>`).join('');
  return svg + `<div class="legend">${legend}<span><i style="background:${SERIES.Math};opacity:.6"></i>projection</span></div>`;
}

/** "2025-09-14, Practice 1, 26, 24, 28, 25" — also tolerates tabs and score-report text. */
export function parseScorePaste(text) {
  const out = [];
  for (const line of (text || '').split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split(/[,\t]/).map(s => s.trim());
    const nums = parts.filter(p => /^\d{1,2}$/.test(p)).map(Number).filter(n => n >= 1 && n <= 36);
    if (nums.length >= 4) {
      const dateStr = parts.map(toISO).find(Boolean) || toISO(line);
      const label = parts.find(p => /[a-z]{3}/i.test(p) && !toISO(p)) || 'Practice test';
      out.push({
        date: dateStr || new Date().toISOString().slice(0, 10),
        label,
        English: nums[0], Math: nums[1], Reading: nums[2], Science: nums[3],
      });
      continue;
    }
    // "English 26  Math 24  Reading 28  Science 25" style
    const rec = {};
    for (const s of SECTIONS) {
      const m = line.match(new RegExp(`${s}\\D{0,6}(\\d{1,2})`, 'i'));
      if (m && +m[1] <= 36) rec[s] = +m[1];
    }
    if (Object.keys(rec).length >= 2) {
      const label = (line.split(/[:,]/)[0] || '').replace(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/, '').trim();
      out.push({ date: toISO(line) || new Date().toISOString().slice(0, 10),
                 label: label && label.length < 40 ? label : 'Score report', ...rec });
    }
  }
  return out;
}
