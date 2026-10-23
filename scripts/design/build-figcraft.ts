#!/usr/bin/env bun
/**
 * Build the editable FigCraft design file from the layer trees written by extract-dom.ts.
 *
 *   bun run design:build [--in design/exports] [--out design/openthrone.figcraft] [--only home,overview]
 *
 * Every element becomes a real FigCraft layer: frames with their fills, gradients, borders,
 * radii and shadows; text layers with the page's fonts and styled runs; SVG icons as vectors;
 * artwork as image layers. Runs headlessly through `figcraft-cli run`. See design/README.md.
 */
import { spawnSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { homedir, tmpdir } from 'os';
import path from 'path';

import { loadCaptures } from './capture-manifest';
import { DESIGN_PAGES, REFERENCE_PAGE_TITLE } from './pages';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const CLI =
  process.env.FIGCRAFT_CLI ?? path.join(homedir(), '.local/bin/figcraft-cli');
const IN = path.resolve(arg('in') ?? 'design/exports');
const OUT = path.resolve(arg('out') ?? 'design/openthrone.figcraft');
const ONLY = arg('only') ? new Set(arg('only')!.split(',')) : null;
const DOC_NAME = 'OpenThrone — Public & Logged-In';
const BG = '#070A0F';
const GAP_X = 200;
const GAP_Y = 400;

type RGBA = [number, number, number, number];
type Paint = string | Record<string, any>;
type Cmd = { command: string; params: Record<string, any> };

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- colours

const lin2srgb = (c: number) => {
  c = clamp(c, 0, 1);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};

const oklab = (L: number, a: number, b: number) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => lin2srgb(v) * 255);
};

const num = (s: string, scale = 1) => {
  s = s.trim();
  if (s === 'none') return 0;
  return s.endsWith('%') ? (parseFloat(s) / 100) * scale : parseFloat(s);
};

const hslToRgb = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};

/** CSS colour -> [r, g, b, a] (0-255, alpha 0-1), or null. */
const parseColor = (s?: string | null): RGBA | null => {
  if (!s) return null;
  s = s.trim();
  if (['transparent', 'none', 'currentcolor'].includes(s)) return null;
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      a,
    ];
  }
  const m = s.match(/^(rgba?|oklch|oklab|color|lab|lch|hsla?)\((.*)\)$/);
  if (!m) return null;
  const fn = m[1];
  let body = m[2];
  let alpha = 1;
  if (body.includes('/')) {
    const at = body.lastIndexOf('/');
    alpha = num(body.slice(at + 1));
    body = body.slice(0, at);
  }
  const parts = body
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  let rgb: number[];
  if (fn === 'rgb' || fn === 'rgba') {
    if (parts.length === 4) alpha = num(parts[3]);
    rgb = parts.slice(0, 3).map((p) => num(p, 255));
  } else if (fn === 'oklch') {
    const [L, C, H] = [
      num(parts[0]),
      num(parts[1], 0.4),
      num(parts[2].replace('deg', '')),
    ];
    rgb = oklab(
      L,
      C * Math.cos((H * Math.PI) / 180),
      C * Math.sin((H * Math.PI) / 180),
    );
  } else if (fn === 'oklab') {
    rgb = oklab(num(parts[0]), num(parts[1], 0.4), num(parts[2], 0.4));
  } else if (
    fn === 'color' &&
    (parts[0] === 'srgb' || parts[0] === 'srgb-linear')
  ) {
    let vals = parts.slice(1, 4).map((p) => num(p));
    if (parts[0] === 'srgb-linear') vals = vals.map(lin2srgb);
    rgb = vals.map((v) => v * 255);
  } else if (fn === 'hsl' || fn === 'hsla') {
    if (parts.length === 4) alpha = num(parts[3]);
    rgb = hslToRgb(
      num(parts[0].replace('deg', '')),
      num(parts[1]),
      num(parts[2]),
    );
  } else {
    return null;
  }
  return [
    ...rgb.map((v) => clamp(Math.round(v), 0, 255)),
    clamp(alpha, 0, 1),
  ] as RGBA;
};

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
const hexc = ([r, g, b, a]: RGBA) =>
  `#${hex2(r)}${hex2(g)}${hex2(b)}${a >= 0.999 ? '' : hex2(Math.round(a * 255))}`;
const visible = (c: RGBA | null): c is RGBA => c !== null && c[3] > 0.01;

// ---------------------------------------------------------------- css helpers

/** Split on commas that are not inside parentheses. */
const splitTop = (s: string) => {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

const COLOR_SRC =
  '((?:rgba?|oklch|oklab|color|hsla?|lab|lch)\\([^)]*\\)|#[0-9a-fA-F]{3,8}|transparent)';
const COLOR_AT_START = new RegExp(`^${COLOR_SRC}`);
const COLOR_ANYWHERE = new RegExp(COLOR_SRC);
const DIRS: Record<string, number> = {
  'to top': 0,
  'to right': 90,
  'to bottom': 180,
  'to left': 270,
  'to top right': 45,
  'to right top': 45,
  'to bottom right': 135,
  'to right bottom': 135,
  'to bottom left': 225,
  'to left bottom': 225,
  'to top left': 315,
  'to left top': 315,
};

const parseGradient = (layer: string): Record<string, any> | null => {
  const m = layer
    .trim()
    .match(/^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/);
  if (!m) return null;
  const kind = m[2];
  const args = splitTop(m[3]);
  let angle = 180;
  if (args.length && !COLOR_AT_START.test(args[0])) {
    const first = args.shift()!;
    if (kind === 'linear') {
      if (first in DIRS) angle = DIRS[first];
      else if (first.endsWith('deg')) angle = parseFloat(first);
      else if (first.endsWith('turn')) angle = parseFloat(first) * 360;
      else if (first.endsWith('rad'))
        angle = (parseFloat(first) * 180) / Math.PI;
    }
  }
  const stops: [RGBA, number | null][] = [];
  for (const a of args) {
    const cm = a.match(COLOR_AT_START);
    if (!cm) continue;
    const pos = a.slice(cm[0].length).match(/(-?[\d.]+)%/);
    stops.push([
      parseColor(cm[1]) ?? [0, 0, 0, 0],
      pos ? parseFloat(pos[1]) / 100 : null,
    ]);
  }
  if (stops.length < 2) return null;
  // Fill in missing stop positions evenly, as CSS does.
  if (stops[0][1] === null) stops[0][1] = 0;
  if (stops[stops.length - 1][1] === null) stops[stops.length - 1][1] = 1;
  for (let i = 0; i < stops.length; i++) {
    if (stops[i][1] !== null) continue;
    let j = i;
    while (stops[j][1] === null) j++;
    const a0 = stops[i - 1][1]!;
    const a1 = stops[j][1]!;
    for (let k = i; k < j; k++)
      stops[k][1] = a0 + ((a1 - a0) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  if (stops.every(([c]) => c[3] < 0.01)) return null;
  const paint: Record<string, any> = {
    type:
      kind === 'radial'
        ? 'radialGradient'
        : kind === 'conic'
          ? 'angularGradient'
          : 'linearGradient',
    stops: stops.map(([c, p]) => ({
      color: hexc(c),
      position: clamp(p!, 0, 1),
    })),
  };
  if (kind === 'linear') {
    const dx = Math.sin((angle * Math.PI) / 180);
    const dy = -Math.cos((angle * Math.PI) / 180);
    paint.from = [0.5 - dx / 2, 0.5 - dy / 2];
    paint.to = [0.5 + dx / 2, 0.5 + dy / 2];
  }
  return paint;
};

const parseShadows = (s?: string, text = false) => {
  if (!s || s === 'none') return [];
  const effects: Record<string, any>[] = [];
  for (const part of splitTop(s)) {
    const cm = part.match(COLOR_ANYWHERE);
    const c = cm ? parseColor(cm[1]) : ([0, 0, 0, 1] as RGBA);
    const rest = cm
      ? part.slice(0, cm.index) + part.slice(cm.index! + cm[0].length)
      : part;
    const nums = [...rest.matchAll(/(-?[\d.]+)px/g)].map((x) =>
      parseFloat(x[1]),
    );
    while (nums.length < 4) nums.push(0);
    if (!visible(c)) continue;
    effects.push({
      type: rest.includes('inset') ? 'innerShadow' : 'dropShadow',
      color: hexc(c),
      offset: [nums[0], nums[1]],
      radius: nums[2],
      spread: text ? 0 : nums[3],
    });
  }
  return effects;
};

// ---------------------------------------------------------------- fonts

const WEIGHTS: [number, string][] = [
  [100, 'Thin'],
  [200, 'ExtraLight'],
  [300, 'Light'],
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'SemiBold'],
  [700, 'Bold'],
  [800, 'ExtraBold'],
  [900, 'Black'],
];
const SINGLE_STYLE = new Set([
  'MedievalSharp',
  'Chomsky',
  'rpgawesome-webfont',
  'Noto Color Emoji',
]);
const FONTS_SEEN = new Set<string>();

/** Map a CSS font stack to a FigCraft family; null for FontAwesome (drawn as SVG paths). */
const fontFamily = (css?: string) => {
  const fam = css
    ? splitTop(css)[0]
        .trim()
        .replace(/^["']|["']$/g, '')
    : 'Inter';
  FONTS_SEEN.add(fam);
  const low = fam.toLowerCase();
  if (low.includes('chomsky')) return 'Chomsky';
  if (low.includes('medieval')) return 'MedievalSharp';
  if (low.includes('rpg')) return 'rpgawesome-webfont';
  if (low.includes('awesome')) return null;
  if (['mono', 'courier', 'consolas', 'menlo'].some((k) => low.includes(k)))
    return 'DejaVu Sans Mono';
  return 'Inter';
};

const fontStyle = (fam: string, weight: string, italic: boolean) => {
  if (fam === 'DejaVu Sans Mono')
    return parseInt(weight, 10) >= 600 ? 'Bold' : 'Book';
  if (SINGLE_STYLE.has(fam)) return 'Regular';
  const w = parseFloat(weight);
  const name = WEIGHTS.reduce((best, cur) =>
    Math.abs(cur[0] - w) < Math.abs(best[0] - w) ? cur : best,
  )[1];
  if (!italic) return name;
  return name === 'Regular' ? 'Italic' : `${name} Italic`;
};

const isEmojiText = (t: string) => {
  const cps = [...t].map((ch) => ch.codePointAt(0)!);
  return (
    cps.some((c) => c >= 0x1f000) &&
    cps.every((c) => c >= 0x1f000 || c === 0x200d || c === 0xfe0f || c === 0x20)
  );
};

// ---------------------------------------------------------------- builder

/** Collects commands; node ids are sequential in a FigCraft session, one per created layer. */
class Builder {
  cmds: Cmd[] = [];

  next: number;

  constructor(firstId: number) {
    this.next = firstId;
  }

  create(command: string, params: Record<string, any>) {
    this.cmds.push({ command, params });
    return this.next++;
  }

  raw(command: string, params: Record<string, any>) {
    this.cmds.push({ command, params });
  }
}

const SEMANTIC = new Set([
  'header',
  'nav',
  'main',
  'aside',
  'footer',
  'section',
  'form',
  'table',
  'ul',
  'ol',
  'tr',
  'button',
  'thead',
  'tbody',
]);

const kidCount = (b: any) =>
  (b.kids ?? []).filter(
    (k: any) => k.t === 'text' || k.r.w > 0 || k.kids?.length,
  ).length;

/** Rect [x, y, w, h] of one background layer inside the padding box, or null for full size. */
const layerRect = (b: any, size: string, pos: string): number[] | null => {
  const W = b.r.w - b.bw[1] - b.bw[3];
  const H = b.r.h - b.bw[0] - b.bw[2];
  const toks = size.split(/\s+/).filter(Boolean);
  if (
    !toks.length ||
    (['auto', 'cover', 'contain'].includes(toks[0]) &&
      (toks.length === 1 || toks[1] === 'auto'))
  )
    return null;
  const dim = (t: string, full: number) =>
    t === 'auto'
      ? full
      : t.endsWith('%')
        ? (parseFloat(t) / 100) * full
        : parseFloat(t);
  const w = dim(toks[0], W);
  const h = dim(toks[1] ?? 'auto', H);
  if (w >= W - 0.5 && h >= H - 0.5) return null;
  const pt = pos.split(/\s+/).filter(Boolean);
  while (pt.length < 2) pt.push('50%');
  const place = (t: string, full: number, sz: number) =>
    t.endsWith('%') ? (parseFloat(t) / 100) * (full - sz) : parseFloat(t);
  return [b.bw[3] + place(pt[0], W, w), b.bw[0] + place(pt[1], H, h), w, h];
};

type Layer = {
  kind: 'image' | 'gradient';
  val: any;
  rect: number[] | null;
  size: string;
  rep: string;
};

/** Frame props from a box's computed style (null when it adds nothing), plus background layers. */
const boxVisuals = (b: any): [Record<string, any> | null, Layer[]] => {
  if (b.hidden) return [null, []];
  const props: Record<string, any> = {};
  const fills: Paint[] = [];
  const bg = parseColor(b.bg);
  if (visible(bg)) fills.push(hexc(bg));
  const layers: Layer[] = [];
  if (b.bgImage && b.bgImage !== 'none') {
    const imgs = splitTop(b.bgImage);
    const sizes = splitTop(b.bgSize || 'auto');
    const poss = splitTop(b.bgPos || '0% 0%');
    const reps = splitTop(b.bgRepeat || 'repeat');
    for (let i = imgs.length - 1; i >= 0; i--) {
      // Bottom layer first.
      const size = sizes[i % sizes.length];
      const rect = layerRect(b, size, poss[i % poss.length]);
      const rep = reps[i % reps.length];
      if (imgs[i].startsWith('url(')) {
        layers.push({
          kind: 'image',
          val: imgs[i].match(/url\("?([^")]+)"?\)/)![1],
          rect,
          size,
          rep,
        });
      } else {
        const g = parseGradient(imgs[i]);
        if (g) layers.push({ kind: 'gradient', val: g, rect, size, rep });
      }
    }
  }
  const sides = b.bw.map((w: number, i: number) => {
    const col = parseColor(b.bc[i]);
    const ok = w > 0 && !['none', 'hidden'].includes(b.bs[i]) && visible(col);
    return [ok ? w : 0, ok ? col : null] as [number, RGBA | null];
  });
  const hasStroke = sides.some(([w]: [number]) => w > 0);
  if (hasStroke) {
    props.strokes = [hexc(sides.find(([w]: [number]) => w > 0)![1]!)];
    props.strokeAlign = 'inside';
    const ws = sides.map(([w]: [number]) => w);
    const [first] = ws;
    if (new Set(ws).size === 1) props.strokeWeight = first;
    else
      [
        'strokeTopWeight',
        'strokeRightWeight',
        'strokeBottomWeight',
        'strokeLeftWeight',
      ].forEach((k, i) => (props[k] = ws[i]));
  }
  const effects = parseShadows(b.shadow);
  if (effects.length) props.effects = effects;
  const rad = b.radius.map((r: number) =>
    Math.min(r, Math.min(b.r.w, b.r.h) / 2),
  );
  if (rad.some((r: number) => r > 0))
    props.cornerRadius = new Set(rad).size === 1 ? rad[0] : rad;
  const opacity = b.opacity ?? 1;
  if (opacity < 1) props.opacity = opacity;
  props.fills = fills;
  const isVisual =
    fills.length > 0 ||
    layers.length > 0 ||
    hasStroke ||
    effects.length > 0 ||
    opacity < 1 ||
    (b.clip && b.kids?.length > 0) ||
    (SEMANTIC.has(b.tag) && kidCount(b) >= 2) ||
    (!b.name.includes('.') && b.name !== b.tag && kidCount(b) >= 2);
  return [isVisual ? props : null, layers];
};

/** CSS paint order among siblings: z<0, in-flow, positioned z auto/0, then z>0. */
const stackOrder = (kids: any[]) => {
  const key = (k: any, i: number): number[] => {
    if (k.t === 'text') return [1, 0, i];
    const z = k.z ?? 'auto';
    const zi = z === 'auto' ? 0 : parseInt(z, 10);
    const positioned = (k.pos ?? 'static') !== 'static' || z !== 'auto';
    if (zi < 0) return [0, zi, i];
    if (!positioned) return [1, 0, i];
    return [2, zi, i];
  };
  return kids
    .map((k, i) => ({ k, key: key(k, i) }))
    .sort(
      (a, b) =>
        a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2],
    )
    .map((x) => x.k);
};

const textProps = (
  k: any,
  textPaint: Paint | null,
): Record<string, any> | null => {
  const st = k.style;
  let fam = fontFamily(st.font);
  if (fam === null) return null;
  let c = st.fill ? parseColor(st.fill) : null;
  if (!visible(c)) c = textPaint && st.fill ? null : parseColor(st.color);
  const size = st.size || 16;
  if (k.text && isEmojiText(k.text)) fam = 'Noto Color Emoji';
  const props: Record<string, any> = {
    fontFamily: fam,
    fontStyle: fontStyle(fam, st.weight, st.italic),
    fontSize: r2(size),
  };
  if (textPaint && !visible(c)) props.fills = [textPaint];
  else if (visible(c)) props.fill = hexc(c);
  else return null;
  if (st.lh?.endsWith('px')) props.lineHeight = r2(parseFloat(st.lh));
  if (st.ls?.endsWith('px') && parseFloat(st.ls) !== 0)
    props.letterSpacing = r2(parseFloat(st.ls));
  props.textAlign =
    (
      {
        center: 'center',
        right: 'right',
        end: 'right',
        justify: 'justified',
      } as Record<string, string>
    )[st.align] ?? 'left';
  const textCase = (
    { uppercase: 'upper', lowercase: 'lower', capitalize: 'title' } as Record<
      string,
      string
    >
  )[st.transform];
  if (textCase) props.textCase = textCase;
  if ((st.deco || '').includes('underline')) props.textDecoration = 'underline';
  else if ((st.deco || '').includes('line-through'))
    props.textDecoration = 'strikethrough';
  if (
    (fam === 'Chomsky' || fam === 'MedievalSharp') &&
    parseFloat(st.weight) >= 600
  ) {
    // Browsers synthesise bold for single-weight fonts; a thin same-colour stroke matches it.
    let paint: any = props.fill ?? props.fills[0];
    if (typeof paint !== 'string')
      paint = paint.stops[Math.floor(paint.stops.length / 2)].color;
    props.strokes = [paint];
    props.strokeWeight = r2(size / 32);
    props.strokeAlign = 'center';
  }
  const fx = parseShadows(st.shadow, true);
  if (fx.length) props.effects = fx;
  return props;
};

const sizes = new Map<string, [number, number] | null>();

const naturalSize = (file: string) => {
  if (!sizes.has(file)) {
    const out = spawnSync('magick', ['identify', '-format', '%w %h\n', file], {
      encoding: 'utf8',
    }).stdout.split(/\s+/);
    sizes.set(
      file,
      out.length >= 2 && out[0]
        ? [parseInt(out[0], 10), parseInt(out[1], 10)]
        : null,
    );
  }
  return sizes.get(file)!;
};

/** CSS object-fit: fill stretches; FigCraft's fill crops. Pre-stretch when the aspect differs. */
const stretched = (file: string, w: number, h: number) => {
  const nat = naturalSize(file);
  if (!nat || Math.abs(nat[0] / nat[1] - w / h) < 0.02 * (w / h)) return file;
  const W = Math.max(1, Math.round(w * 2));
  const H = Math.max(1, Math.round(h * 2));
  const out = path.join(
    path.dirname(file),
    'stretched',
    `${path.parse(file).name}-${W}x${H}.png`,
  );
  if (!existsSync(out)) {
    mkdirSync(path.dirname(out), { recursive: true });
    spawnSync('magick', [file, '-resize', `${W}x${H}!`, out]);
  }
  return out;
};

const emitImage = (
  B: Builder,
  file: string | undefined,
  parent: number | null,
  x: number,
  y: number,
  w: number,
  h: number,
  mode = 'fill',
  name?: string,
) => {
  if (!file || w < 1 || h < 1) return null;
  const id = B.create('image.place', {
    path: file,
    x: r2(x),
    y: r2(y),
    width: r2(w),
    height: r2(h),
    parent,
    mode,
  });
  if (name) B.raw('node.set', { ids: [id], name });
  return id;
};

const emitText = (
  B: Builder,
  k: any,
  parent: number,
  ox: number,
  oy: number,
  textPaint: Paint | null,
) => {
  const { r } = k;
  if (k.img) {
    emitImage(B, k.img, parent, r.x - ox, r.y - oy, r.w, r.h, 'fit', k.text);
    return;
  }
  const props = textProps(k, textPaint);
  if (!props || !k.text.trim()) return;
  let x = r.x - ox;
  let y = r.y - oy;
  const name = k.text.slice(0, 40);
  if (props.lineHeight && k.firstH) y -= (props.lineHeight - k.firstH) / 2;
  if (k.pseudo) {
    // Icon glyphs and decorative ::before/::after text: centred in the element box.
    Object.assign(props, {
      textAlign: 'center',
      textAlignVertical: 'middle',
      textAutoResize: 'none',
      lineHeight: 'auto',
      width: Math.max(r.w, 1),
      height: Math.max(r.h, 1),
    });
    B.create('node.create', {
      type: 'text',
      name,
      text: k.text,
      x: r2(r.x - ox),
      y: r2(r.y - oy),
      parent,
      select: false,
      props,
    });
    return;
  }
  let size: Record<string, number> = {};
  if (k.lines > 1 || k.text.includes('\n')) {
    props.textAutoResize = 'height';
    let width = r.w + 2;
    if (k.block?.w > 0) {
      // Wrapped paragraph: wrap at the element's content box, like the browser.
      x = k.block.x - ox;
      width = k.block.w;
    }
    size = { width: r2(width) };
  } else {
    // One line: size the layer to its text so a slightly wider font never wraps.
    props.textAutoResize = 'widthAndHeight';
    props.textAlign = 'left';
  }
  if (k.list && k.list !== 'none') {
    // The browser hangs the list marker outside the content box; FigCraft does the same.
    props.listStyle = ['decimal', 'decimal-leading-zero'].includes(k.list)
      ? 'numbered'
      : 'bulleted';
    props.hangingList = true;
  }
  const id = B.create('node.create', {
    type: 'text',
    name,
    text: k.text,
    x: r2(x),
    y: r2(y),
    parent,
    select: false,
    props: { ...props, ...size },
  });
  for (const run of k.runs ?? []) {
    const rp = textProps(
      { style: run.style, text: k.text.slice(run.start, run.end) },
      textPaint,
    );
    if (!rp) continue;
    const diff: Record<string, any> = {};
    for (const key of [
      'fontFamily',
      'fontStyle',
      'fontSize',
      'textDecoration',
      'textCase',
    ]) {
      if (rp[key] !== undefined && rp[key] !== props[key]) diff[key] = rp[key];
    }
    if (rp.fill && rp.fill !== props.fill) diff.textFills = [rp.fill];
    if (Object.keys(diff).length)
      B.raw('text.style', { id, start: run.start, end: run.end, ...diff });
  }
};

const emitSvg = (
  B: Builder,
  b: any,
  parent: number,
  ox: number,
  oy: number,
) => {
  const paths = (b.paths ?? []).filter((p: any) => p.r.w > 0 || p.r.h > 0);
  if (!paths.length) return;
  let target = parent;
  let px = ox;
  let py = oy;
  if (paths.length > 1) {
    target = B.create('node.create', {
      type: 'frame',
      name: 'icon',
      x: r2(b.r.x - ox),
      y: r2(b.r.y - oy),
      width: Math.max(b.r.w, 1),
      height: Math.max(b.r.h, 1),
      parent,
      select: false,
      props: { fills: [], clip: false },
    });
    px = b.r.x;
    py = b.r.y;
  }
  for (const p of paths) {
    const props: Record<string, any> = {
      width: Math.max(p.r.w, 0.5),
      height: Math.max(p.r.h, 0.5),
    };
    const fill = parseColor(p.fill);
    const fo = parseFloat(p.fillOpacity ?? '1');
    props.fills =
      visible(fill) && fo > 0
        ? [hexc([fill[0], fill[1], fill[2], fill[3] * fo])]
        : [];
    const stroke = parseColor(p.stroke);
    if (visible(stroke) && p.strokeWidth) {
      props.strokes = [hexc(stroke)];
      props.strokeWeight = p.strokeWidth;
    }
    if (!props.fills.length && !props.strokes) continue;
    if (parseFloat(p.opacity ?? '1') < 1) props.opacity = parseFloat(p.opacity);
    const base = {
      x: r2(p.r.x - px),
      y: r2(p.r.y - py),
      parent: target,
      select: false,
      name: 'icon',
    };
    if (p.tag === 'circle' || p.tag === 'ellipse')
      B.create('node.create', { type: 'ellipse', ...base, props });
    else if (p.tag === 'rect')
      B.create('node.create', { type: 'rectangle', ...base, props });
    else if (p.d) {
      const id = B.create('node.create', {
        type: 'vector',
        path: p.d,
        ...base,
        props,
      });
      // Vectors are created at their path's own bbox origin: move them to the measured spot.
      B.raw('node.set', { ids: [id], x: base.x, y: base.y });
    }
  }
};

type Root = {
  w: number;
  h: number;
  place?: { name: string; x: number; y: number };
};

const emitBox = (
  B: Builder,
  b: any,
  parent: number | null,
  ox: number,
  oy: number,
  assets: Record<string, string>,
  root: Root,
  isRoot = false,
  textPaint: Paint | null = null,
): void => {
  if (b.t === 'text') {
    emitText(B, b, parent!, ox, oy, textPaint);
    return;
  }
  if (b.bgClip === 'text') {
    // A gradient or colour clipped to the glyphs becomes the text fill, not a box fill.
    let paint: Paint | null = null;
    for (const layer of splitTop(b.bgImage || '')) {
      paint = parseGradient(layer);
      if (paint) break;
    }
    const bg = parseColor(b.bg);
    if (!paint && visible(bg)) paint = hexc(bg);
    if (paint) textPaint = paint;
    b = { ...b, bg: 'transparent', bgImage: 'none' };
  }
  const { r } = b;
  if (!isRoot && (r.x + r.w < 0 || r.x > root.w || r.y > root.h)) return; // off-page: skip links, parked menus
  if (b.tag === 'svg') {
    if (!b.hidden) emitSvg(B, b, parent!, ox, oy);
    return;
  }
  if (b.tag === 'img') {
    let file = assets[b.src];
    const rad = b.radius.map((v: number) =>
      Math.min(v, Math.min(r.w, r.h) / 2),
    );
    const mode = b.fit === 'contain' || b.fit === 'scale-down' ? 'fit' : 'fill';
    if (file && (!b.fit || b.fit === 'fill') && r.w >= 1 && r.h >= 1)
      file = stretched(file, r.w, r.h);
    const name =
      path.basename((b.src || 'image').split('?')[0]).slice(0, 40) || 'image';
    if (rad.some((v: number) => v > 0) || (b.opacity ?? 1) < 1) {
      const fr = B.create('node.create', {
        type: 'frame',
        name,
        x: r2(r.x - ox),
        y: r2(r.y - oy),
        width: Math.max(r.w, 1),
        height: Math.max(r.h, 1),
        parent,
        select: false,
        props: {
          fills: [],
          clip: true,
          cornerRadius: new Set(rad).size === 1 ? rad[0] : rad,
          ...((b.opacity ?? 1) < 1 ? { opacity: b.opacity } : {}),
        },
      });
      emitImage(B, file, fr, 0, 0, r.w, r.h, mode, name);
    } else {
      emitImage(B, file, parent, r.x - ox, r.y - oy, r.w, r.h, mode, name);
    }
    return;
  }
  let [props, layers] = boxVisuals(b);
  if (isRoot) props = props ?? { fills: [] };
  if (props && r.w >= 1 && r.h >= 1) {
    props.clip = Boolean(b.clip) || isRoot;
    const params: Record<string, any> = {
      type: 'frame',
      name: b.name,
      width: r2(r.w),
      height: r2(r.h),
      select: false,
      props,
    };
    if (isRoot)
      Object.assign(params, {
        name: root.place!.name,
        x: root.place!.x,
        y: root.place!.y,
        width: root.w,
        height: root.h,
      });
    else Object.assign(params, { x: r2(r.x - ox), y: r2(r.y - oy), parent });
    const fid = B.create('node.create', params);
    const [fw, fh] = isRoot ? [root.w, root.h] : [r.w, r.h];
    for (const l of layers) {
      const [lx, ly, lw, lh] = l.rect ?? [0, 0, fw, fh];
      if (l.kind === 'image') {
        const mode = l.size.includes('contain')
          ? 'fit'
          : l.rect || l.size.includes('cover') || l.rep.includes('no-repeat')
            ? 'fill'
            : 'tile';
        emitImage(B, assets[l.val], fid, lx, ly, lw, lh, mode, 'background');
      } else {
        const gp: Record<string, any> = { fills: [l.val] };
        if (props.cornerRadius && !l.rect) gp.cornerRadius = props.cornerRadius;
        B.create('node.create', {
          type: 'rectangle',
          name: 'background gradient',
          x: r2(lx),
          y: r2(ly),
          width: r2(Math.max(lw, 0.5)),
          height: r2(Math.max(lh, 0.5)),
          parent: fid,
          select: false,
          props: gp,
        });
      }
    }
    for (const k of stackOrder(b.kids ?? []))
      emitBox(B, k, fid, r.x, r.y, assets, root, false, textPaint);
  } else {
    for (const k of stackOrder(b.kids ?? []))
      emitBox(B, k, parent, ox, oy, assets, root, false, textPaint);
  }
};

// ---------------------------------------------------------------- figcraft-cli

const run = (cmds: Cmd[], src: string | null, dst: string) => {
  const script = path.join(
    tmpdir(),
    `figcraft-${process.pid}-${Date.now()}.json`,
  );
  writeFileSync(script, JSON.stringify(cmds));
  const res = spawnSync(
    CLI,
    ['run', script, '--out', dst, ...(src ? ['--in', src] : [])],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  const lines = (res.stdout ?? '')
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l));
  const bad = lines.filter((l) => !l.ok);
  if (res.status !== 0 || bad.length) {
    console.error(
      'figcraft-cli failed:',
      res.status,
      JSON.stringify(bad[0] ?? null),
      (res.stderr ?? '').slice(-400),
    );
    if (bad[0])
      console.error(
        '  command:',
        JSON.stringify(cmds[bad[0].step]).slice(0, 600),
      );
    process.exit(1);
  }
  unlinkSync(script);
  return lines;
};

const firstId = (lines: any[]) =>
  lines.find((l) => Number.isInteger(l.result?.id))?.result.id;

const pngHeight = (file: string) => readFileSync(file).readUInt32BE(20);

const main = () => {
  const captures = loadCaptures(IN, ONLY);
  if (!existsSync(CLI)) {
    console.error(
      `figcraft-cli not found at ${CLI} (set FIGCRAFT_CLI). See design/README.md.`,
    );
    process.exit(1);
  }
  const work = `${OUT.replace(/\.figcraft$/, '')}.tmp.figcraft`;
  const setup: Cmd[] = [
    { command: 'file.rename', params: { name: DOC_NAME } },
    { command: 'page.rename', params: { name: DESIGN_PAGES[0].title } },
    { command: 'page.setBackground', params: { color: BG } },
    { command: 'page.add', params: { name: DESIGN_PAGES[1].title } },
    { command: 'page.setBackground', params: { color: BG } },
    { command: 'page.add', params: { name: REFERENCE_PAGE_TITLE } },
    { command: 'page.setBackground', params: { color: BG } },
  ];
  let nextId =
    Math.max(
      ...run(setup, null, work).map((l) =>
        Number.isInteger(l.result?.id) ? l.result.id : 0,
      ),
    ) + 1;
  const ref: {
    key: string;
    name: string;
    place: { name: string; x: number; y: number };
  }[] = [];

  DESIGN_PAGES.forEach(({ key, cols }, pageIndex) => {
    const trees = captures
      .filter((capture) => capture.key === key)
      .map((capture) => capture.tree);
    let y = 0;
    for (let row = 0; row < trees.length; row += cols) {
      const chunk = trees.slice(row, row + cols);
      for (let i = 0; i < chunk.length; i++) {
        const t = chunk[i];
        const title = t.name
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
        const place = { name: `${title}  ${t.url}`, x: i * (1440 + GAP_X), y };
        const B = new Builder(nextId);
        B.raw('page.select', { index: pageIndex });
        const rootBox = t.root;
        if (!visible(parseColor(rootBox.bg)) && visible(parseColor(t.htmlBg)))
          rootBox.bg = t.htmlBg;
        if (
          (!rootBox.bgImage || rootBox.bgImage === 'none') &&
          t.htmlBgImage &&
          t.htmlBgImage !== 'none'
        )
          rootBox.bgImage = t.htmlBgImage;
        emitBox(
          B,
          rootBox,
          null,
          rootBox.r.x,
          rootBox.r.y,
          t.assets,
          { w: t.width, h: t.height, place },
          true,
        );
        const got = firstId(run(B.cmds, work, work));
        if (got !== nextId) {
          console.error(
            `Layer id drift on ${key}/${t.name}: expected ${nextId}, got ${got}`,
          );
          process.exit(1);
        }
        nextId = B.next;
        console.log(`${key}/${t.name}: ${B.cmds.length} commands`);
        ref.push({ key, name: t.name, place });
      }
      y += Math.max(...chunk.map((t) => t.height || 1)) + GAP_Y;
    }
  });

  // Reference page: the full-page screenshots, laid out like pages 01 and 02 side by side.
  const B = new Builder(nextId);
  B.raw('page.select', { index: 2 });
  for (const { key, name, place } of ref) {
    const shot = path.join(IN, 'screens', key, `${name}.png`);
    if (!existsSync(shot)) continue;
    const h = pngHeight(shot);
    const dx = key === 'public' ? 0 : 4 * (1440 + GAP_X) + 1200;
    const fid = B.create('node.create', {
      type: 'frame',
      name: place.name,
      x: place.x + dx,
      y: place.y,
      width: 1440,
      height: h,
      select: false,
      props: { fills: [BG], clip: true },
    });
    emitImage(B, shot, fid, 0, 0, 1440, h, 'fill');
  }
  if (B.cmds.length > 1) run(B.cmds, work, work);
  renameSync(work, OUT);
  console.log(`wrote ${OUT}`);
  console.log(`fonts seen: ${[...FONTS_SEEN].sort().join(', ')}`);
};

try {
  main();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
