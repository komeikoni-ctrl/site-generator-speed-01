// Optimized drop-in for makefun-site 1.0.0: same answers, byte for byte, much less work.
// Semantics follow vendor/makefun-site (frontmatter.js, markdown.js, template.js, text.js, index.js).

// ---------------- text ----------------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESC_RE = /[&<>"']/g;
export function escapeHtml(text) {
  return text.replace(ESC_RE, (c) => ESC[c]);
}

const SLUG_MAX = 64;
export function slugifyRaw(text) {
  // Fast path: pure ASCII needs no NFKD and has no combining marks.
  let ascii = true;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) { ascii = false; break; }
  const plain = ascii ? text : text.normalize('NFKD').replace(/\p{M}/gu, '');
  let out = '';
  let gap = false;
  for (let i = 0; i < plain.length; i++) {
    const c = plain.charCodeAt(i);
    let keep = -1;
    if (c >= 65 && c <= 90) keep = c + 32;
    else if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) keep = c;
    if (keep === -1) { if (out.length > 0) gap = true; continue; }
    if (gap) { out += '-'; gap = false; }
    out += String.fromCharCode(keep);
  }
  if (out.length > SLUG_MAX) out = out.slice(0, SLUG_MAX);
  // drop trailing '-'
  let e = out.length;
  while (e > 0 && out.charCodeAt(e - 1) === 45) e--;
  if (e !== out.length) out = out.slice(0, e);
  return out === '' ? 'untitled' : out;
}
// Per-build memo, reset in build().
let slugCache = new Map();
function slugify(text) {
  let v = slugCache.get(text);
  if (v === undefined) { v = slugifyRaw(text); slugCache.set(text, v); }
  return v;
}
function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = slug + '-' + n;
  taken.add(out);
  return out;
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let dateCache = new Map();
function longDate(date) {
  let v = dateCache.get(date);
  if (v !== undefined) return v;
  const i1 = date.indexOf('-'), i2 = date.indexOf('-', i1 + 1);
  v = Number(date.slice(i2 + 1)) + ' ' + MONTHS[Number(date.slice(i1 + 1, i2)) - 1] + ' ' + date.slice(0, i1);
  dateCache.set(date, v);
  return v;
}

// ---------------- front matter ----------------
const FM_KEYS = new Set(['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary']);
const NAME_RE = /^[a-z0-9-]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG_RE = /^[^"[\]]+$/;
function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}
function stringOf(raw) {
  if (raw.charCodeAt(0) === 34) { // "
    if (raw.length < 2 || raw.charCodeAt(raw.length - 1) !== 34) return { error: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        out += n; i++;
      } else if (c === '"') return { error: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { value: out };
  }
  if (raw.charCodeAt(0) === 91) return { error: 'a bare string opens on [' };
  return { value: raw };
}
function valueOf(key, raw) {
  switch (key) {
    case 'title': case 'summary': {
      const s = stringOf(raw);
      return 'error' in s ? { error: 'key "' + key + '": ' + s.error } : s;
    }
    case 'date': {
      let ok = raw.length === 10 && raw.charCodeAt(4) === 45 && raw.charCodeAt(7) === 45;
      let y = 0, mo = 0, d = 0;
      if (ok) {
        for (let i = 0; i < 10; i++) {
          if (i === 4 || i === 7) continue;
          const c = raw.charCodeAt(i);
          if (c < 48 || c > 57) { ok = false; break; }
        }
      }
      if (ok) {
        y = Number(raw.slice(0, 4)); mo = Number(raw.slice(5, 7)); d = Number(raw.slice(8, 10));
        if (y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) ok = false;
      }
      if (!ok) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      return { value: raw };
    }
    case 'tags': {
      if (raw.charCodeAt(0) !== 91 || raw.charCodeAt(raw.length - 1) !== 93) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      const tags = inner.split(',').map((t) => t.trim());
      for (const t of tags) if (t === '' || !TAG_RE.test(t)) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout':
      return NAME_RE.test(raw) ? { value: raw } : { error: 'key "layout": not a template name' };
    case 'slug':
      return SLUG_RE.test(raw) && raw.length <= 64 ? { value: raw } : { error: 'key "slug": not a slug' };
    default:
      return { error: 'unknown key "' + key + '"' };
  }
}
function isBlankLine(line) {
  for (let i = 0; i < line.length; i++) { const c = line.charCodeAt(i); if (c !== 32 && c !== 9) return false; }
  return true;
}
function parseFrontMatter(text) {
  // Line-offset scan (no split of the whole text): lines[0] must be '---'.
  if (!text.startsWith('---')) return { error: 'no front matter' };
  const firstNl = text.indexOf('\n');
  const firstLine = firstNl === -1 ? text : text.slice(0, firstNl);
  if (firstLine !== '---') return { error: 'no front matter' };
  if (firstNl === -1) return { error: 'the front matter is not closed' };
  // Collect the front-matter lines (between the opening --- and the closing ---).
  const fmLines = [];
  let pos = firstNl + 1;
  let closeEnd = -1; // offset just past the closing line's '\n' (or text.length)
  while (pos <= text.length) {
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? text.length : nl;
    const line = text.slice(pos, lineEnd);
    if (line === '---') { closeEnd = nl === -1 ? text.length : nl + 1; break; }
    fmLines.push(line);
    if (nl === -1) break;
    pos = nl + 1;
  }
  if (closeEnd === -1) return { error: 'the front matter is not closed' };
  const data = {};
  for (let li = 0; li < fmLines.length; li++) {
    const i = li + 1; // 1-based line index as in the baseline (opening --- is line 1 => i+1 in messages below uses i)
    const line = fmLines[li];
    if (isBlankLine(line) || line.charCodeAt(0) === 35) continue;
    // LINE = /^([a-z_]+):(?: (.*))?$/
    let k = 0;
    while (k < line.length) { const c = line.charCodeAt(k); if ((c >= 97 && c <= 122) || c === 95) k++; else break; }
    let raw;
    if (k === 0 || line.charCodeAt(k) !== 58) return { error: 'line ' + (i + 1) + ' is not "key: value"' };
    if (k + 1 === line.length) raw = '';
    else if (line.charCodeAt(k + 1) === 32) raw = line.slice(k + 2);
    else return { error: 'line ' + (i + 1) + ' is not "key: value"' };
    const key = line.slice(0, k);
    // strip trailing spaces/tabs
    let e = raw.length;
    while (e > 0) { const c = raw.charCodeAt(e - 1); if (c === 32 || c === 9) e--; else break; }
    if (e !== raw.length) raw = raw.slice(0, e);
    if (!FM_KEYS.has(key)) return { error: 'unknown key "' + key + '"' };
    if (Object.hasOwn(data, key)) return { error: 'key "' + key + '" is given twice' };
    if (raw === '') return { error: 'key "' + key + '" has no value' };
    const v = valueOf(key, raw);
    if ('error' in v) return v;
    data[key] = v.value;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
  return { data, body: text.slice(closeEnd) };
}

// ---------------- markdown ----------------
const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);
const ESC_TABLE = new Uint8Array(128);
for (const ch of ESCAPABLE) ESC_TABLE[ch.charCodeAt(0)] = 1;
function findUnescaped(s, what, from, end) {
  const wl = what.length;
  const fc = what.charCodeAt(0);
  for (let j = from; j <= end - wl; j++) {
    const c = s.charCodeAt(j);
    if (c === 92 && j + 1 < end) { const n = s.charCodeAt(j + 1); if (n < 128 && ESC_TABLE[n] === 1) { j++; continue; } }
    if (c === fc && s.startsWith(what, j)) return j;
  }
  return -1;
}
function findSingleStar(s, from, end) {
  for (let j = from; j < end; j++) {
    const c = s.charCodeAt(j);
    if (c === 92 && j + 1 < end) { const n = s.charCodeAt(j + 1); if (n < 128 && ESC_TABLE[n] === 1) { j++; continue; } }
    if (c !== 42) continue;
    if (s.charCodeAt(j + 1) === 42) { j++; continue; }
    return j;
  }
  return -1;
}
const WS_RE = /\s/;
// Render s[start..end) inline, returning the HTML string.
function inlineRange(s, start, end, env) {
  let out = '';
  let i = start;
  let plainStart = i;
  let plainDirty = false; // plain run holds a char escapeHtml would change
  const flush = (upto) => { if (upto > plainStart) out += plainDirty ? escapeHtml(s.slice(plainStart, upto)) : s.slice(plainStart, upto); plainDirty = false; };
  while (i < end) {
    const c = s[i];
    if (c === '\\' && i + 1 < end) { const n = s.charCodeAt(i + 1); if (n < 128 && ESC_TABLE[n] === 1) { flush(i); out += escapeHtml(s[i + 1]); i += 2; plainStart = i; continue; } }
    if (c === '`') {
      const j = s.indexOf('`', i + 1);
      if (j !== -1 && j < end && j > i + 1) {
        flush(i); out += '<code>' + escapeHtml(s.slice(i + 1, j)) + '</code>'; i = j + 1; plainStart = i;
      } else i++;
      continue;
    }
    if (c === '*') {
      if (s[i + 1] === '*') {
        const j = findUnescaped(s, '**', i + 2, end);
        if (j > i + 2) {
          flush(i); out += '<strong>' + inlineRange(s, i + 2, j, env) + '</strong>'; i = j + 2; plainStart = i;
        } else i += 2;
        continue;
      }
      const j = findSingleStar(s, i + 1, end);
      if (j > i + 1) {
        flush(i); out += '<em>' + inlineRange(s, i + 1, j, env) + '</em>'; i = j + 1; plainStart = i;
      } else i++;
      continue;
    }
    if (c === '[') {
      const k = findUnescaped(s, ']', i + 1, end);
      const m = k !== -1 && s[k + 1] === '(' ? s.indexOf(')', k + 2) : -1;
      let done = false;
      if (m !== -1 && m < end) {
        const target = s.slice(k + 2, m);
        if (target !== '' && !WS_RE.test(target)) {
          flush(i); out += '<a href="' + escapeHtml(env.link(target)) + '">' + inlineRange(s, i + 1, k, env) + '</a>';
          i = m + 1; plainStart = i; done = true;
        }
      }
      if (!done) i++;
      continue;
    }
    if (c === '&' || c === '<' || c === '>' || c === '"' || c === "'") plainDirty = true;
    i++;
  }
  flush(end);
  return out;
}
const SPECIAL_RE = /[\\`*[]/;
function inlineStr(s, env) {
  if (s === '') return '';
  if (!SPECIAL_RE.test(s)) return escapeHtml(s);
  return inlineRange(s, 0, s.length, env);
}

function isBlank(line) { return isBlankLine(line); }
// fence open: returns lang string or null
function fenceOpen(line) {
  if (!line.startsWith('```')) return null;
  let i = 3;
  const st = i;
  while (i < line.length) { const c = line.charCodeAt(i); if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 43 || c === 45) i++; else break; }
  const lang = line.slice(st, i);
  while (i < line.length) { const c = line.charCodeAt(i); if (c === 32 || c === 9) i++; else return null; }
  return lang;
}
function isFenceClose(line) {
  if (!line.startsWith('```')) return false;
  for (let i = 3; i < line.length; i++) { const c = line.charCodeAt(i); if (c !== 32 && c !== 9) return false; }
  return true;
}
// heading: {depth, text} or null
function headingOf(line) {
  let n = 0;
  while (n < line.length && line.charCodeAt(n) === 35) n++;
  if (n === 0 || n > 6) return null;
  if (n >= line.length) return null;
  const c = line.charCodeAt(n);
  if (c !== 32 && c !== 9) return null;
  let s = n;
  while (s < line.length) { const cc = line.charCodeAt(s); if (cc === 32 || cc === 9) s++; else break; }
  let e = line.length;
  while (e > s) { const cc = line.charCodeAt(e - 1); if (cc === 32 || cc === 9) e--; else break; }
  if (e <= s) return null;
  return { depth: n, text: line.slice(s, e) };
}
function isHR(line) {
  let core;
  if (line.startsWith('---')) core = 3; else if (line.startsWith('***')) core = 3; else return false;
  for (let i = core; i < line.length; i++) { const c = line.charCodeAt(i); if (c !== 32 && c !== 9) return false; }
  return true;
}
function trimLine(line) {
  let s = 0, e = line.length;
  while (s < e) { const c = line.charCodeAt(s); if (c === 32 || c === 9) s++; else break; }
  while (e > s) { const c = line.charCodeAt(e - 1); if (c === 32 || c === 9) e--; else break; }
  return s === 0 && e === line.length ? line : line.slice(s, e);
}
function endsParagraph(line) {
  return isBlank(line) || fenceOpen(line) !== null || headingOf(line) !== null || isHR(line);
}
const CONT_RE = /^ {2,}\S/;
function renderMarkdown(src, env) {
  const inl = (text) => inlineStr(text, env);
  const lines = src.split('\n');
  const N = lines.length;
  // One-pass line classification (reused by block starts and paragraph ends).
  const kBlank = new Uint8Array(N);
  const kFence = new Array(N).fill(null); // lang string when a fence opens
  const kHead = new Array(N).fill(null);
  const kHr = new Uint8Array(N);
  for (let j = 0; j < N; j++) {
    const l = lines[j];
    if (isBlank(l)) { kBlank[j] = 1; continue; }
    const f = fenceOpen(l);
    if (f !== null) { kFence[j] = f; continue; }
    const h = headingOf(l);
    if (h !== null) { kHead[j] = h; continue; }
    if (isHR(l)) kHr[j] = 1;
  }
  const endsPara = (j) => kBlank[j] === 1 || kFence[j] !== null || kHead[j] !== null || kHr[j] === 1;
  const ids = new Set();
  let out = '';
  const toc = [];
  let excerpt = null;
  let i = 0;
  while (i < N) {
    const line = lines[i];
    if (kBlank[i] === 1) { i++; continue; }
    const lang = kFence[i];
    if (lang !== null) {
      i++;
      const bodyStart = i;
      while (i < N && !isFenceClose(lines[i])) i++;
      const bodyEnd = i;
      i++;
      let bodyHtml = '';
      if (bodyEnd > bodyStart) bodyHtml = escapeHtml(lines.slice(bodyStart, bodyEnd).join('\n')) + '\n';
      out += '<pre><code' + (lang === '' ? '' : ' class="language-' + escapeHtml(lang) + '"') + '>' + bodyHtml + '</code></pre>\n';
      continue;
    }
    const h = kHead[i];
    if (h !== null) {
      const id = uniqueSlug(slugify(h.text), ids);
      const html = inl(h.text);
      out += '<h' + h.depth + ' id="' + id + '">' + html + '</h' + h.depth + '>\n';
      if (h.depth === 2 || h.depth === 3) toc.push({ level: h.depth, id, html });
      i++;
      continue;
    }
    if (kHr[i] === 1) { out += '<hr>\n'; i++; continue; }
    if (line.charCodeAt(0) === 62) { // >
      const body = [];
      while (i < N && lines[i].charCodeAt(0) === 62) {
        let l = lines[i]; i++;
        // replace /^> ?/ : drop '>' and one following space
        l = l.length > 1 && l.charCodeAt(1) === 32 ? l.slice(2) : l.slice(1);
        const t = trimLine(l);
        if (t !== '') body.push(t);
      }
      if (body.length === 0) out += '<blockquote>\n</blockquote>\n';
      else out += '<blockquote>\n<p>' + inl(body.join('\n')) + '</p>\n</blockquote>\n';
      continue;
    }
    // list?
    let isBullet = false, isOrd = false, ordStart = 1, firstText = null;
    if ((line.charCodeAt(0) === 45 || line.charCodeAt(0) === 42) && line.charCodeAt(1) === 32) { isBullet = true; firstText = line.slice(2); }
    else {
      // ordered: ^(\d{1,9})\. (.*)$
      let d = 0;
      while (d < line.length && d < 10) { const c = line.charCodeAt(d); if (c >= 48 && c <= 57) d++; else break; }
      if (d >= 1 && d <= 9 && line.charCodeAt(d) === 46 && line.charCodeAt(d + 1) === 32) { isOrd = true; ordStart = Number(line.slice(0, d)); firstText = line.slice(d + 2); }
    }
    if (isBullet || isOrd) {
      const items = [];
      items.push([trimLine(firstText)]);
      i++;
      while (i < N) {
        const l = lines[i];
        let txt = null;
        if (isBullet) {
          if ((l.charCodeAt(0) === 45 || l.charCodeAt(0) === 42) && l.charCodeAt(1) === 32) txt = l.slice(2);
        } else {
          let d = 0;
          while (d < l.length && d < 10) { const c = l.charCodeAt(d); if (c >= 48 && c <= 57) d++; else break; }
          if (d >= 1 && d <= 9 && l.charCodeAt(d) === 46 && l.charCodeAt(d + 1) === 32) txt = l.slice(d + 2);
        }
        if (txt !== null) { items.push([trimLine(txt)]); i++; }
        else if (CONT_RE.test(l)) { items[items.length - 1].push(trimLine(l)); i++; }
        else break;
      }
      const tag = isOrd ? 'ol' : 'ul';
      const open = isOrd && ordStart !== 1 ? '<ol start="' + ordStart + '">' : '<' + tag + '>';
      out += open + '\n';
      for (const it of items) out += '<li>' + inl(it.join('\n')) + '</li>\n';
      out += '</' + tag + '>\n';
      continue;
    }
    // paragraph
    const body = [trimLine(line)];
    i++;
    while (i < N && !endsPara(i)) { body.push(trimLine(lines[i])); i++; }
    const html = inl(body.join('\n'));
    if (excerpt === null) excerpt = html;
    out += '<p>' + html + '</p>\n';
  }
  return { html: out, toc, excerpt: excerpt ?? '' };
}

// ---------------- templates: parse (baseline semantics) ----------------
export class TemplateError extends Error {}
const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR_RE = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF_RE = /^if (not )?(\S+)$/;
const INCLUDE_RE = /^include "([a-z0-9-]+)"$/;
const INCLUDE_DEPTH = 8;
function pathOf(name, text) {
  if (!PATH_RE.test(text)) throw new TemplateError('template "' + name + '": ' + JSON.stringify(text) + ' is not a path');
  return text.split('.');
}
function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) { text += src.slice(i); break; }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') { text += src.slice(i, open + 1); i = open + 1; continue; }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError('template "' + name + '": a ' + (raw ? '{{{' : '{{') + ' is not closed');
      if (text !== '') tokens.push({ t: 'text', text });
      text = '';
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError('template "' + name + '": a {% is not closed');
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = /^[ \t]*$/.test(src.slice(lineStart, open)) && /^[ \t]*$/.test(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') tokens.push({ t: 'text', text });
    text = '';
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}
function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') body.push({ kind: 'text', text: tok.text });
    else if (tok.t === 'var' || tok.t === 'raw') body.push({ kind: tok.t, path: tok.path });
    else {
      const tag = tok.tag;
      const top = stack[stack.length - 1];
      let m;
      if ((m = FOR_RE.exec(tag)) !== null) {
        const node = { kind: 'for', name: m[1], path: pathOf(name, m[2]), body: [] };
        body.push(node); stack.push(node); body = node.body;
      } else if ((m = IF_RE.exec(tag)) !== null) {
        const node = { kind: 'if', not: m[1] !== undefined, path: pathOf(name, m[2]), then: [], else: null };
        body.push(node); stack.push(node); body = node.then;
      } else if (tag === 'else') {
        if (top.kind !== 'if' || top.else !== null) throw new TemplateError('template "' + name + '": an else outside an if');
        top.else = []; body = top.else;
      } else if (tag === 'endfor' || tag === 'endif') {
        if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError('template "' + name + '": an ' + tag + ' with no open ' + tag.slice(3));
        stack.pop();
        const parent = stack[stack.length - 1];
        body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.body : parent.else ?? parent.then;
      } else if ((m = INCLUDE_RE.exec(tag)) !== null) body.push({ kind: 'include', name: m[1] });
      else throw new TemplateError('template "' + name + '": {% ' + tag + ' %} is not a tag');
    }
  }
  if (stack.length > 1) throw new TemplateError('template "' + name + '": a ' + stack[stack.length - 1].kind + ' is not closed');
  return root.body;
}
// ---------------- template helpers / interpreter fallback ----------------
function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}
function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}
function lookupArr(sc, path) {
  for (let s = sc.length - 1; s >= 0; s--) {
    const vars = sc[s];
    if (!Object.hasOwn(vars, path[0])) continue;
    let v = vars[path[0]];
    for (let k = 1; k < path.length; k++) {
      if (v === null || typeof v !== 'object' || !Object.hasOwn(v, path[k])) return undefined;
      v = v[path[k]];
    }
    return v;
  }
  return undefined;
}
function lookup1(sc, key) {
  for (let s = sc.length - 1; s >= 0; s--) {
    const vars = sc[s];
    if (Object.hasOwn(vars, key)) return vars[key];
  }
  return undefined;
}
function lookup2(sc, k0, k1) {
  for (let s = sc.length - 1; s >= 0; s--) {
    const vars = sc[s];
    if (!Object.hasOwn(vars, k0)) continue;
    const v = vars[k0];
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, k1)) return undefined;
    return v[k1];
  }
  return undefined;
}
const H = { esc: escapeHtml, tx: textOf, tr: truthy, lk: lookupArr, lk1: lookup1, lk2: lookup2, inc: null, memoCache: null,
  incM: (F, idx, name, sc, depth) => {
    if (depth >= INCLUDE_DEPTH) return '';
    const key = name + '|' + (depth + 1);
    const cache = H.memoCache;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const fn = F[idx];
    let out;
    if (fn !== undefined) out = fn(sc, depth + 1);
    else out = H.inc(sc, name, depth);
    cache.set(key, out);
    return out;
  },
};
// interpreter (fallback, baseline renderNodes semantics over scope array)
function renderNodesI(nodes, sc, templates, depth) {
  let out = '';
  for (const n of nodes) {
    switch (n.kind) {
      case 'text': out += n.text; break;
      case 'var': out += escapeHtml(textOf(lookupArr(sc, n.path))); break;
      case 'raw': out += textOf(lookupArr(sc, n.path)); break;
      case 'if': {
        const v = truthy(lookupArr(sc, n.path));
        const branch = v !== n.not ? n.then : n.else;
        if (branch !== null) out += renderNodesI(branch, sc, templates, depth);
        break;
      }
      case 'for': {
        const xs = lookupArr(sc, n.path);
        if (!Array.isArray(xs)) break;
        for (let k = 0; k < xs.length; k++) {
          sc.push({ [n.name]: xs[k], loop: { index: k + 1, first: k === 0, last: k === xs.length - 1, length: xs.length } });
          out += renderNodesI(n.body, sc, templates, depth);
          sc.pop();
        }
        break;
      }
      case 'include': {
        const t = templates.get(n.name);
        if (t !== undefined && depth < INCLUDE_DEPTH) out += renderNodesI(t, sc, templates, depth + 1);
        break;
      }
    }
  }
  return out;
}
// ---------------- template compiler ----------------
let uid = 0;
function lkExpr(ctx, path) {
  if (path.length === 1) return 'H.lk1(sc,' + JSON.stringify(path[0]) + ')';
  if (path.length === 2) return 'H.lk2(sc,' + JSON.stringify(path[0]) + ',' + JSON.stringify(path[1]) + ')';
  return 'H.lk(sc,' + ctx.pathConst(path) + ')';
}
function genNodes(nodes, code, ctx) {
  for (const n of nodes) {
    switch (n.kind) {
      case 'text': code.push('o+=' + JSON.stringify(n.text) + ';'); break;
      case 'var': code.push('o+=H.esc(H.tx(' + lkExpr(ctx, n.path) + '));'); break;
      case 'raw': code.push('o+=H.tx(' + lkExpr(ctx, n.path) + ');'); break;
      case 'if': {
        code.push('if(H.tr(' + lkExpr(ctx, n.path) + ')!==' + (n.not ? 'true' : 'false') + '){');
        genNodes(n.then, code, ctx);
        if (n.else !== null) { code.push('}else{'); genNodes(n.else, code, ctx); }
        code.push('}');
        break;
      }
      case 'for': {
        const id = ++uid;
        const xs = 'xs' + id, kk = 'k' + id;
        code.push('{const ' + xs + '=' + lkExpr(ctx, n.path) + ';if(Array.isArray(' + xs + ')){for(let ' + kk + '=0;' + kk + '<' + xs + '.length;' + kk + '++){sc.push({[' + JSON.stringify(n.name) + ']:' + xs + '[' + kk + '],loop:{index:' + kk + '+1,first:' + kk + '===0,last:' + kk + '===' + xs + '.length-1,length:' + xs + '.length}});');
        genNodes(n.body, code, ctx);
        code.push('sc.pop();}}}');
        break;
      }
      case 'include': {
        const idx = ctx.idxOf.get(n.name);
        if (idx === undefined) break; // missing template renders nothing
        if (ctx.memoizable.has(n.name)) code.push('o+=H.incM(F,' + idx + ',' + JSON.stringify(n.name) + ',sc,depth);');
        else code.push('if(depth<8&&F[' + idx + '])o+=F[' + idx + '](sc,depth+1);else if(depth<8)o+=H.inc(sc,' + JSON.stringify(n.name) + ',depth);');
        break;
      }
    }
  }
}
function compileTemplate(nodes, idxOf, fnsArr, memoizable) {
  uid = 0;
  const pathMap = new Map();
  const ctx = {
    idxOf,
    memoizable,
    pathConst: (p) => {
      const key = p.join('.');
      let c = pathMap.get(key);
      if (c === undefined) { c = 'P' + pathMap.size; pathMap.set(key, c); }
      return c;
    },
  };
  const body = [];
  genNodes(nodes, body, ctx);
  let preamble = '';
  for (const [key, c] of pathMap) preamble += 'const ' + c + '=' + JSON.stringify(key.split('.')) + ';';
  return new Function('H', 'F', 'return function(sc,depth){' + preamble + 'let o="";' + body.join('') + 'return o;}')(H, fnsArr);
}
// Free first-names a template's rendering can observe, per template: names not bound by a
// for-loop inside the template itself (includes contribute their targets' free names minus
// the names bound at the include point). A template whose free names are all case-constant
// root values (site, tags, recent) renders identically on every page of a build.
const ROOT_CONSTS = new Set(['site', 'tags', 'recent']);
function analyzeFree(templates) {
  const own = new Map(); // name -> Set of directly observed free names
  const sites = []; // { from, to, bound:Set }
  let bindsRootConst = false;
  const walk = (nodes, bound, from) => {
    for (const n of nodes) {
      if (n.kind === 'var' || n.kind === 'raw') { if (!bound.has(n.path[0])) own.get(from).add(n.path[0]); }
      else if (n.kind === 'if') {
        if (!bound.has(n.path[0])) own.get(from).add(n.path[0]);
        walk(n.then, bound, from);
        if (n.else !== null) walk(n.else, bound, from);
      } else if (n.kind === 'for') {
        if (!bound.has(n.path[0])) own.get(from).add(n.path[0]);
        if (ROOT_CONSTS.has(n.name)) bindsRootConst = true;
        const b2 = new Set(bound); b2.add(n.name); b2.add('loop');
        walk(n.body, b2, from);
      } else if (n.kind === 'include') sites.push({ from, to: n.name, bound: new Set(bound) });
    }
  };
  for (const [name, nodes] of templates) { own.set(name, new Set()); walk(nodes, new Set(), name); }
  const ext = new Map([...own].map(([k, v]) => [k, new Set(v)]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of sites) {
      const target = ext.get(s.to);
      if (target === undefined) continue;
      const into = ext.get(s.from);
      for (const r of target) if (!s.bound.has(r) && !into.has(r)) { into.add(r); changed = true; }
    }
  }
  const memoizable = new Set();
  if (!bindsRootConst) {
    for (const [name, refs] of ext) {
      let ok = true;
      for (const r of refs) if (!ROOT_CONSTS.has(r)) { ok = false; break; }
      if (ok) memoizable.add(name);
    }
  }
  return memoizable;
}
function compileAll(templates) {
  const memoizable = analyzeFree(templates);
  const names = [...templates.keys()];
  const idxOf = new Map(names.map((n, i) => [n, i]));
  const fnsArr = new Array(names.length).fill(undefined);
  const compiled = new Map();
  names.forEach((name, i) => {
    try {
      const fn = compileTemplate(templates.get(name), idxOf, fnsArr, memoizable);
      fnsArr[i] = fn;
      compiled.set(name, fn);
    } catch { /* interpreter fallback for this template */ }
  });
  return compiled;
}

// ---------------- build (index.js pipeline) ----------------
const RESERVED = ['posts', 'tags', 'page'];
const byCU = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function isWsCode(c) {
  return c <= 32 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
}
function wordsOf(text) {
  let n = 0, inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // whitespace: c <= 32 (ASCII \s), or a Unicode space (all > 127)
    if (c <= 32 || (c > 127 && isWsCode(c))) inWord = false;
    else if (!inWord) { inWord = true; n++; }
  }
  return n;
}
function resolvePath(dir, rel) {
  const parts = dir === '' ? [] : dir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { if (parts.length === 0) return null; parts.pop(); }
    else parts.push(seg);
  }
  return parts.join('/');
}
const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;

export function run(input) { return build(input); }
export function build(input) {
  slugCache = new Map();
  dateCache = new Map();
  const templates = new Map(); // name -> nodes
  const report = [];
  for (const name of Object.keys(input.templates).sort(byCU)) {
    try {
      templates.set(name, parseTemplate(name, input.templates[name]));
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      report.push(err.message);
    }
  }
  const compiled = compileAll(templates); // name -> fn
  H.memoCache = new Map();
  H.inc = (sc, name, depth) => {
    if (depth >= INCLUDE_DEPTH) return '';
    const fn = compiled.get(name);
    if (fn !== undefined) return fn(sc, depth + 1);
    const nodes = templates.get(name);
    if (nodes !== undefined) return renderNodesI(nodes, sc, templates, depth + 1);
    return '';
  };
  const base = input.site.base_url.replace(/\/+$/, '');
  // sources
  const files = [...input.files].sort((x, y) => byCU(x.path, y.path));
  let sources = [];
  const statics = [];
  for (const f of files) {
    if (f.path.endsWith('.md')) sources.push({ path: f.path, text: f.content.includes('\r') ? f.content.replace(/\r\n?/g, '\n') : f.content });
    else statics.push({ path: f.path, content: f.content });
  }
  // front matter
  const kept = [];
  for (const s of sources) {
    const fm = parseFrontMatter(s.text);
    if ('error' in fm) { report.push('refused ' + s.path + ': ' + fm.error); continue; }
    s.data = fm.data; s.body = fm.body;
    s.post = s.path.startsWith('posts/');
    let own;
    for (const d of RESERVED) { if (d !== 'posts' && s.path.startsWith(d + '/')) { own = d; break; } }
    if (own !== undefined) { report.push('refused ' + s.path + ': ' + own + '/ is the generator\'s own'); continue; }
    if (s.post && !Object.hasOwn(s.data, 'date')) { report.push('refused ' + s.path + ': a post needs a date'); continue; }
    const layout = s.data.layout ?? (s.post ? 'post' : 'page');
    if (!templates.has(layout)) { report.push('refused ' + s.path + ': layout "' + layout + '" is no template that parses'); continue; }
    s.layout = layout;
    if (s.data.draft === true) { report.push('draft ' + s.path); continue; }
    kept.push(s);
  }
  sources = kept;
  // permalinks
  const taken = new Map();
  const bySource = new Map();
  for (const s of sources) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    let set = taken.get(dir);
    if (set === undefined) { set = new Set(dir === '' ? RESERVED : []); taken.set(dir, set); }
    const slug = uniqueSlug(s.data.slug ?? slugify(s.data.title), set);
    s.slug = slug;
    s.outDir = dir === '' ? slug : dir + '/' + slug;
    s.url = base + '/' + s.outDir + '/';
    bySource.set(s.path, s);
  }
  // markdown
  const staticPaths = new Set(statics.map((f) => f.path));
  const broken = new Set();
  const linkCache = new Map(); // (dir + '\n' + target) -> resolved href, successes only
  for (const s of sources) {
    const dir = dirOf(s.path);
    const env = {
      link: (target) => {
        if (SCHEME_RE.test(target) || target.startsWith('/') || target.startsWith('#')) return target;
        const ckey = dir + '\n' + target;
        const cached = linkCache.get(ckey);
        if (cached !== undefined) return cached;
        const hash = target.indexOf('#');
        const rel = hash === -1 ? target : target.slice(0, hash);
        const frag = hash === -1 ? '' : target.slice(hash);
        const path = rel === '' ? null : resolvePath(dir, rel);
        if (path !== null) {
          const pg = bySource.get(path);
          if (pg !== undefined) { const v = pg.url + frag; linkCache.set(ckey, v); return v; }
          if (staticPaths.has(path)) { const v = base + '/' + path + frag; linkCache.set(ckey, v); return v; }
        }
        broken.add('broken-link ' + s.path + ' -> ' + target);
        return target;
      },
    };
    const md = renderMarkdown(s.body, env);
    s.html = md.html; s.toc = md.toc; s.excerpt = md.excerpt;
  }
  // collections
  const posts = sources.filter((s) => s.post);
  posts.sort((x, y) => byCU(y.data.date, x.data.date) || byCU(x.slug, y.slug));
  posts.forEach((p, k) => { p.newer = k === 0 ? null : posts[k - 1]; p.older = k === posts.length - 1 ? null : posts[k + 1]; });
  // tags
  const bySlug = new Map();
  const ownTags = (s) => {
    const seen = new Set(); const out = [];
    for (const name of s.data.tags ?? []) { const sl = slugify(name); if (!seen.has(sl)) { seen.add(sl); out.push(name); } }
    return out;
  };
  for (const p of posts) {
    p.tagRefs = [];
    for (const name of ownTags(p)) {
      const slug = slugify(name);
      let tag = bySlug.get(slug);
      if (tag === undefined) { tag = { name, slug, url: base + '/tags/' + slug + '/', posts: [] }; bySlug.set(slug, tag); }
      tag.posts.push(p);
      p.tagRefs.push(tag);
    }
  }
  for (const s of sources) if (!s.post) s.tagRefs = ownTags(s).map((name) => bySlug.get(slugify(name)) ?? { name, slug: slugify(name), url: '', posts: [] });
  const tagsArr = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || byCU(x.slug, y.slug));
  // layouts
  const linkOf = (s) => (s === null ? null : { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date) });
  const cardOf = (s) => s._card ??= {
    title: s.data.title, url: s.url, date: s.data.date ?? '',
    date_long: s.data.date === undefined ? '' : longDate(s.data.date),
    summary: s.data.summary ?? '', excerpt: s.excerpt,
    reading_minutes: Math.max(1, Math.ceil((s._words ??= wordsOf(s.body)) / 200)),
    tags: s.tagRefs.map((t) => ({ name: t.name, slug: t.slug, url: t.url })),
  };
  const cards = new Map(posts.map((p) => [p, cardOf(p)]));
  const pageOf = (s) => ({
    ...cardOf(s), slug: s.slug, content: s.html,
    toc: s.toc.map((h) => ({ level: h.level, id: h.id, html: h.html })),
    newer: linkOf(s.newer ?? null), older: linkOf(s.older ?? null), is_post: s.post,
  });
  const site = { title: input.site.title, base_url: base };
  const allTags = tagsArr.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = posts.slice(0, input.site.recent).map((p) => cards.get(p));
  const output = {};
  const render = (name, vars) => {
    const fn = compiled.get(name);
    const sc = [{ site, tags: allTags, recent, ...vars }];
    if (fn !== undefined) return fn(sc, 0);
    const nodes = templates.get(name);
    return nodes === undefined ? null : renderNodesI(nodes, sc, templates, 0);
  };
  for (const s of sources) output[s.outDir + '/index.html'] = render(s.layout, { page: pageOf(s) });
  const per = input.site.per_page;
  const pages = Math.max(1, Math.ceil(posts.length / per));
  const indexUrl = (k) => (k === 1 ? base + '/' : base + '/page/' + k + '/');
  for (let k = 1; k <= pages; k++) {
    const html = render('index', {
      posts: posts.slice((k - 1) * per, k * per).map((p) => cards.get(p)),
      pager: { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) },
    });
    if (html !== null) output[k === 1 ? 'index.html' : 'page/' + k + '/index.html'] = html;
  }
  for (const t of tagsArr) {
    const html = render('tag', { tag: { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => cards.get(p)) } });
    if (html !== null) output['tags/' + t.slug + '/index.html'] = html;
  }
  const tagsHtml = render('tags', {});
  if (tagsHtml !== null) output['tags/index.html'] = tagsHtml;
  for (const f of statics) {
    if (Object.hasOwn(output, f.path)) report.push('shadowed ' + f.path + ': a built page has its path');
    else output[f.path] = f.content;
  }
  // report
  const lines = [...report, ...broken].sort(byCU);
  const pageCount = sources.filter((s) => !s.post).length;
  lines.push('built ' + pageCount + ' pages, ' + posts.length + ' posts, ' + tagsArr.length + ' tags and ' + statics.length + ' static files');
  output['build-report.txt'] = lines.join('\n') + '\n';
  return output;
}
