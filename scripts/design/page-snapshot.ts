/* eslint-disable */
// Runs inside the browser (passed to page.evaluate): walks the rendered page into a layer
// tree with computed visuals, text runs, images and SVG paths. Must stay self-contained:
// it is serialised, so it cannot use imports or anything outside its own body.

export function snapshotPage(): any {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'TEMPLATE', 'NEXTJS-PORTAL', 'IFRAME', 'BR', 'WBR', 'HEAD']);
  const sx = window.scrollX;
  const sy = window.scrollY;
  const R = (r: DOMRect) => ({ x: r.left + sx, y: r.top + sy, w: r.width, h: r.height });

  const nameOf = (el: Element) => {
    const cls = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '';
    const m = cls.match(/mantine-([A-Za-z]+)-root/);
    if (m) return m[1];
    const tour = el.getAttribute('data-tour-id');
    if (tour) return tour;
    const aria = el.getAttribute('aria-label');
    if (aria) return `${el.tagName.toLowerCase()} "${aria.slice(0, 30)}"`;
    const first = cls.split(/\s+/).find((c) => c && !c.startsWith('mantine-') && !/^(m|mb|mt|ml|mr|p|px|py|pt|pb|w|h|flex|grid|gap|text|bg|items|justify|relative|absolute|block|inline|hidden|z)-/.test(c));
    const tag = el.tagName.toLowerCase();
    return first ? `${tag}.${first.replace(/__[A-Za-z0-9_-]{4,}$/, '')}` : tag;
  };

  const textStyle = (cs: any) => ({
    font: cs.fontFamily, weight: cs.fontWeight, italic: cs.fontStyle === 'italic',
    size: parseFloat(cs.fontSize), lh: cs.lineHeight, ls: cs.letterSpacing, color: cs.color,
    align: cs.textAlign, transform: cs.textTransform, deco: cs.textDecorationLine,
    shadow: cs.textShadow, ws: cs.whiteSpace, fill: cs.webkitTextFillColor,
  });

  const visuals = (cs: any) => ({
    bg: cs.backgroundColor, bgImage: cs.backgroundImage, bgSize: cs.backgroundSize, bgRepeat: cs.backgroundRepeat,
    bgPos: cs.backgroundPosition, bgClip: cs.webkitBackgroundClip || cs.backgroundClip,
    bw: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(parseFloat),
    bc: [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor],
    bs: [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle],
    radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(parseFloat),
    shadow: cs.boxShadow, opacity: parseFloat(cs.opacity), pos: cs.position, z: cs.zIndex,
  });

  // Decorative ::before/::after boxes (backdrops, overlays, ornate corners).
  const pseudoBox = (el: Element, which: string, cs: any, er: DOMRect) => {
    const ps = getComputedStyle(el, which) as any;
    if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') return null;
    if (parseFloat(ps.opacity) === 0 || ps.visibility === 'hidden') return null;
    const v = visuals(ps);
    const has = (v.bg && !/rgba\(.*,\s*0\)$/.test(v.bg) && v.bg !== 'transparent') || v.bgImage !== 'none'
      || v.bw.some((w: number, i: number) => w > 0 && v.bs[i] !== 'none') || v.shadow !== 'none';
    if (!has) return null;
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;
    const cb = { x: er.left + bl, y: er.top + bt, w: el.clientWidth || er.width, h: el.clientHeight || er.height };
    const num = (s: string) => (s === 'auto' || s === '' ? null : parseFloat(s));
    let w = num(ps.width);
    let h = num(ps.height);
    const L = num(ps.left), Rt = num(ps.right), T = num(ps.top), B = num(ps.bottom);
    let x: number, y: number;
    if (ps.position === 'absolute' || ps.position === 'fixed') {
      if (w == null) w = L != null && Rt != null ? cb.w - L - Rt : 0;
      if (h == null) h = T != null && B != null ? cb.h - T - B : 0;
      x = L != null ? cb.x + L : Rt != null ? cb.x + cb.w - Rt - w : cb.x;
      y = T != null ? cb.y + T : B != null ? cb.y + cb.h - B - h : cb.y;
    } else {
      x = cb.x; y = cb.y; w = w ?? cb.w; h = h ?? 0;
    }
    if (!(w > 0 && h > 0)) return null;
    return { tag: which, name: which.replace('::', ''), r: { x: x + sx, y: y + sy, w, h }, hidden: false, ...v, clip: false, kids: [], zBack: parseInt(ps.zIndex, 10) < 0 };
  };

  const svgPaths = (svg: Element) => {
    const out: any[] = [];
    svg.querySelectorAll('path,circle,ellipse,rect,polygon,polyline,line').forEach((p) => {
      if (p.closest('defs,clipPath,mask,pattern,symbol,marker')) return;
      const cs = getComputedStyle(p) as any;
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = p.getBoundingClientRect();
      if (r.width < 0.5 && r.height < 0.5) return;
      let d: string | null = null;
      const tag = p.tagName.toLowerCase();
      if (tag === 'path') d = p.getAttribute('d');
      else if (tag === 'polygon' || tag === 'polyline') {
        const pts = (p.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
        if (pts.length >= 4) {
          d = 'M' + pts.slice(0, 2).join(' ');
          for (let i = 2; i + 1 < pts.length; i += 2) d += ' L' + pts[i] + ' ' + pts[i + 1];
          if (tag === 'polygon') d += ' Z';
        }
      } else if (tag === 'line') {
        d = `M${p.getAttribute('x1') || 0} ${p.getAttribute('y1') || 0} L${p.getAttribute('x2') || 0} ${p.getAttribute('y2') || 0}`;
      }
      let fill = cs.fill;
      if (fill && fill.startsWith('url(')) {
        const g = document.querySelector(fill.slice(4, -1).replace(/["']/g, ''));
        const stop = g && g.querySelector('stop');
        fill = stop ? (getComputedStyle(stop) as any).stopColor : 'rgb(128,128,128)';
      }
      out.push({ tag, d, r: R(r), fill, fillOpacity: cs.fillOpacity, stroke: cs.stroke, strokeWidth: parseFloat(cs.strokeWidth), opacity: cs.opacity });
    });
    return out;
  };

  const pseudoText = (el: Element, which: string) => {
    const ps = getComputedStyle(el, which);
    const c = ps.content;
    if (!c || c === 'none' || c === 'normal' || c === '""' || !c.startsWith('"')) return null;
    if (ps.display === 'none') return null;
    const t = c.slice(1, -1).replace(/\\"/g, '"');
    if (!t.trim()) return null;
    return { text: t, style: textStyle(ps) };
  };

  // Count visual lines: rects whose tops sit within half a line of each other share a line.
  const countLines = (rects: DOMRect[]) => {
    const qs = [...rects].sort((a, b) => a.top - b.top);
    let lines = 0;
    let lastTop = -Infinity;
    for (const q of qs) {
      if (q.top > lastTop + q.height * 0.5) { lines++; lastTop = q.top; }
    }
    return lines;
  };

  const unionOf = (rects: DOMRect[]) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of rects) {
      x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom);
    }
    return { x: x0 + sx, y: y0 + sy, w: x1 - x0, h: y1 - y0 };
  };

  // The list marker for text that opens an <li> (Mantine nests it as li > div > span).
  const listOf = (el: Element, text: string) => {
    const li = el.closest('li');
    if (!li) return null;
    const lcs = getComputedStyle(li);
    if (lcs.display !== 'list-item' || lcs.listStyleType === 'none') return null;
    const head = text.trim().slice(0, 12);
    return head && (li.textContent || '').replace(/\s+/g, ' ').trim().startsWith(head) ? lcs.listStyleType : null;
  };

  // A block whose children are text plus plain inline elements (strong, em, a, span…)
  // becomes one text layer with styled runs, so mixed paragraphs don't overlap.
  const plainInline = (n: Node): boolean => {
    if (n.nodeType !== 1) return true;
    const e = n as Element;
    if (e.tagName === 'BR') return true;
    const c = getComputedStyle(e);
    if (c.display === 'none') return true;
    if (c.display !== 'inline' || ['IMG', 'svg', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(e.tagName)) return false;
    if (!(c.backgroundColor === 'transparent' || /,\s*0\)$/.test(c.backgroundColor)) || c.backgroundImage !== 'none') return false;
    if ([c.borderTopWidth, c.borderBottomWidth, c.borderLeftWidth].some((w) => parseFloat(w) > 0)) return false;
    for (const w of ['::before', '::after']) {
      const pc = getComputedStyle(e, w).content;
      if (pc && pc !== 'none' && pc !== 'normal') return false;
    }
    return [...e.childNodes].every(plainInline);
  };

  const mergedText = (el: Element, cs: any) => {
    const kids = [...el.childNodes];
    const hasText = kids.some((n) => n.nodeType === 3 && (n.textContent || '').trim());
    const hasInline = kids.some((n) => n.nodeType === 1 && (n.textContent || '').trim());
    if (!hasText || !hasInline || !kids.every(plainInline)) return null;
    if (/^pre/.test(cs.whiteSpace)) return null;
    const raw: any[] = [];
    const collect = (n: Node, ncs: any) => {
      if (n.nodeType === 3) raw.push({ text: n.textContent, style: textStyle(ncs) });
      else if (n.nodeType === 1) {
        if ((n as Element).tagName === 'BR') { raw.push({ text: '\n', style: textStyle(ncs), br: true }); return; }
        const c = getComputedStyle(n as Element);
        if (c.display === 'none') return;
        for (const m of n.childNodes) collect(m, c);
      }
    };
    for (const n of kids) collect(n, cs);
    let text = '';
    const runs: any[] = [];
    for (const rr of raw) {
      let t = rr.br ? '\n' : rr.text.replace(/\s+/g, ' ');
      if (!rr.br && (text === '' || text.endsWith(' ') || text.endsWith('\n')) && t.startsWith(' ')) t = t.slice(1);
      if (!t) continue;
      runs.push({ start: text.length, end: text.length + t.length, style: rr.style });
      text += t;
    }
    const trimmed = text.replace(/\s+$/, '');
    for (const rn of runs) rn.end = Math.min(rn.end, trimmed.length);
    if (!trimmed.trim()) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
    if (!rects.length) return null;
    const er = el.getBoundingClientRect();
    const cl = er.left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0);
    const cw = el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    return {
      t: 'text', text: trimmed, runs: runs.filter((rn) => rn.end > rn.start), style: textStyle(cs),
      r: unionOf(rects), lines: countLines(rects), list: listOf(el, trimmed),
      firstH: rects[0].height, block: { x: cl + sx, w: cw },
    };
  };

  const walk = (el: Element): any => {
    if (SKIP.has(el.tagName)) return null;
    const cs = getComputedStyle(el) as any;
    if (cs.display === 'none') return null;
    if (parseFloat(cs.opacity) === 0) return null;
    const tag = el.tagName.toLowerCase();
    const r = el.getBoundingClientRect();
    const hidden = cs.visibility === 'hidden';
    const box: any = {
      tag, name: nameOf(el), r: R(r), hidden, ...visuals(cs),
      clip: cs.overflowX !== 'visible' || cs.overflowY !== 'visible',
      kids: [],
    };
    if (tag === 'svg') { box.paths = svgPaths(el); return box; }
    if (tag === 'img') {
      const img = el as HTMLImageElement;
      box.src = img.currentSrc || img.src;
      box.fit = cs.objectFit;
      return box;
    }
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      const input = el as HTMLInputElement;
      let v = tag === 'select' ? ((el as HTMLSelectElement).selectedOptions[0]?.text ?? '') : input.value;
      let st = textStyle(cs);
      if (!v && input.placeholder) { v = input.placeholder; st = { ...st, color: getComputedStyle(el, '::placeholder').color }; }
      if (input.type === 'password' && input.value) v = '•'.repeat(input.value.length);
      if (input.type === 'checkbox' || input.type === 'radio' || input.type === 'hidden') v = '';
      if (v) {
        const pl = parseFloat(cs.paddingLeft) + box.bw[3];
        const lh = parseFloat(cs.lineHeight) || st.size * 1.25;
        box.kids.push({ t: 'text', text: v, style: st, r: { x: box.r.x + pl, y: box.r.y + (box.r.h - lh) / 2, w: box.r.w - pl * 2, h: lh }, lines: 1, firstH: lh });
      }
      return box;
    }
    const beforeBox = pseudoBox(el, '::before', cs, r);
    if (beforeBox) box.kids.push(beforeBox);
    const before = pseudoText(el, '::before');
    if (before) box.kids.push({ t: 'text', text: before.text, style: before.style, r: box.r, lines: 1, firstH: box.r.h, pseudo: true });
    const merged = hidden ? null : mergedText(el, cs);
    if (merged) box.kids.push(merged);
    for (const n of merged ? [] : [...el.childNodes]) {
      if (n.nodeType === 3) {
        if (hidden || !(n.textContent || '').trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rects = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
        if (!rects.length) continue;
        const pre = /^pre/.test(cs.whiteSpace);
        const raw = n.textContent || '';
        const text = pre ? raw.replace(/^\n+|\n+$/g, '') : raw.replace(/\s+/g, ' ').trim();
        box.kids.push({ t: 'text', text, style: textStyle(cs), r: unionOf(rects), lines: countLines(rects), firstH: rects[0].height, list: listOf(el, text) });
      } else if (n.nodeType === 1) {
        const k = walk(n as Element);
        if (k) box.kids.push(k);
      }
    }
    const afterBox = pseudoBox(el, '::after', cs, r);
    if (afterBox) {
      // z-index:-1 pseudos paint behind the element's content.
      if (afterBox.zBack) box.kids.unshift(afterBox);
      else box.kids.push(afterBox);
    }
    const after = pseudoText(el, '::after');
    if (after) box.kids.push({ t: 'text', text: after.text, style: after.style, r: box.r, lines: 1, firstH: box.r.h, pseudo: true });
    return box;
  };

  const root = walk(document.body);
  const hcs = getComputedStyle(document.documentElement);
  return {
    root,
    htmlBg: hcs.backgroundColor,
    htmlBgImage: hcs.backgroundImage,
    width: document.documentElement.scrollWidth,
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
  };
}
