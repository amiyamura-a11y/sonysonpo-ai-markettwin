/**
 * ペルソナ写真を単一HTMLに焼き込む。
 *
 *   src/photos/<cellId>.(jpg|jpeg|png|webp)  を置いて
 *   node src/embed-photos.mjs
 *
 * 顔の位置を中心に正方形へトリミングし、360px・JPEG に落として
 * index.html の PHOTOS-START / PHOTOS-END の間へ
 * データURIとして書き込む。デモHTMLの自己完結性は保たれる。
 *
 *   --size 360   出力の一辺（px）
 *   --quality 78 JPEG品質
 *   --clear      写真をすべて外して絵文字アバターに戻す
 */
import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, '..', 'index.html');
const photoDir = join(here, 'photos');

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const SIZE = +arg('size', 360);
const QUALITY = +arg('quality', 78);
const CLEAR = process.argv.includes('--clear');

/**
 * 顔の位置（画像内の相対座標）と、切り出す正方形の大きさ（短辺に対する比）。
 * 引きの絵ほど zoom を小さくすると、小さいアバターでも人物が読める。
 * 新しい写真を足したら、ここに1行足すだけでよい。
 */
const FOCUS = {
  // アイドル好き
  'idol-new':      { fx: 0.70, fy: 0.40, zoom: 0.36 },  // 高橋 ゆい（自室・グッズ）
  'idol-major':     { fx: 0.45, fy: 0.30, zoom: 0.36 },  // 中村 あかり（リビング）
  'idol-comp':      { fx: 0.60, fy: 0.32, zoom: 0.34 },  // 小林 えみ（ライブ会場）
  // 日向坂46好き
  'hinata-new':     { fx: 0.48, fy: 0.33, zoom: 0.34 },  // 佐々木 みなみ（自室・ペンライト）
  'hinata-major':   { fx: 0.42, fy: 0.28, zoom: 0.36 },  // 山本 かおり（自宅・スマホ）
  'hinata-comp':    { fx: 0.52, fy: 0.32, zoom: 0.34 },  // 佐藤 みなみ（ライブ会場）
  // 麻雀好き
  'mahjong-new':    { fx: 0.72, fy: 0.36, zoom: 0.34 },  // 田村 亮太（雀荘）
  'mahjong-major':  { fx: 0.52, fy: 0.40, zoom: 0.34 },  // 岡田 誠（麻雀卓）
  'mahjong-comp':   { fx: 0.70, fy: 0.36, zoom: 0.34 },  // 木村 拓也（デスク）
  // キャンプ好き
  'camp-new':       { fx: 0.55, fy: 0.31, zoom: 0.36 },  // 藤井 拓（焚き火調理）
  'camp-major':     { fx: 0.63, fy: 0.29, zoom: 0.34 },  // 渡辺 健一（ランタン）
  'camp-comp':      { fx: 0.62, fy: 0.36, zoom: 0.32 },  // 石井 直樹（稜線・テント設営）
  // ゲーム好き
  'game-new':       { fx: 0.72, fy: 0.33, zoom: 0.34 },  // 井上 蓮（ゲーミングデスク）
  'game-major':     { fx: 0.50, fy: 0.33, zoom: 0.36 },  // 松本 涼（自室デスク）
  'game-comp':      { fx: 0.62, fy: 0.36, zoom: 0.34 },  // 三浦 悠（ソファ・携帯機）
};
const DEFAULT_FOCUS = { fx: 0.5, fy: 0.4, zoom: 0.7 };

/** 施策案のキービジュアル（src/photos/ideas/<案ID>.jpg）。横位置の切り出し中心（0〜1）。 */
const IDEA_FOCUS = {
  '1': { fy: 0.42 },  // 日向坂46 継続感謝キャンペーン
  '2': { fy: 0.46 },  // Mリーグ コラボ番組
  '3': { fy: 0.44 },  // GOOD DRIVE 体験会
  '4': { fy: 0.48 },  // e-Sports 大会協賛
  '5': { fy: 0.52 },  // 走った分だけ
  '6': { fy: 0.40 },  // Sony FG 生損保パッケージ
};
const IDEA_W = 260, IDEA_H = 188;

const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const entries = [];
if (!CLEAR) {
  if (!existsSync(photoDir)) {
    console.error(`写真フォルダがありません: ${photoDir}`);
    process.exit(1);
  }
  const files = readdirSync(photoDir).filter(f => EXTS.has(extname(f).toLowerCase())).sort();
  if (!files.length) {
    console.error(`${photoDir} に画像がありません。<cellId>.jpg の名前で置いてください（例: camp-comp.jpg）。`);
    process.exit(1);
  }
  for (const file of files) {
    const cellId = basename(file, extname(file));
    const src = readFileSync(join(photoDir, file));
    const meta = await sharp(src).metadata();
    const f = FOCUS[cellId] || DEFAULT_FOCUS;
    const side = Math.round(Math.min(meta.width, meta.height) * f.zoom);
    const left = Math.round(clamp(f.fx * meta.width - side / 2, 0, meta.width - side));
    const top = Math.round(clamp(f.fy * meta.height - side / 2, 0, meta.height - side));
    const out = await sharp(src)
      .extract({ left, top, width: side, height: side })
      .resize(SIZE, SIZE, { fit: 'cover' })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
    entries.push({ cellId, kb: out.length / 1024, uri: 'data:image/jpeg;base64,' + out.toString('base64') });
    console.log(`${cellId.padEnd(14)} ${String(meta.width)}×${meta.height} → ${SIZE}px  ${(out.length / 1024).toFixed(1)}KB`
      + (FOCUS[cellId] ? '' : '  ※ FOCUS 未設定のため中央寄りで切り出し'));
  }
}

/* ── 施策案のキービジュアル（横長） ── */
const ideaDir = join(photoDir, 'ideas');
const ideaEntries = [];
if (!CLEAR && existsSync(ideaDir)) {
  for (const file of readdirSync(ideaDir).filter(f => EXTS.has(extname(f).toLowerCase())).sort()) {
    const id = basename(file, extname(file));
    const src = readFileSync(join(ideaDir, file));
    const meta = await sharp(src).metadata();
    const f = IDEA_FOCUS[id] || { fy: 0.45 };
    const cw = Math.min(meta.width, Math.round(meta.height * IDEA_W / IDEA_H));
    const ch = Math.round(cw * IDEA_H / IDEA_W);
    const left = Math.round((meta.width - cw) / 2);
    const top = Math.round(clamp(f.fy * meta.height - ch / 2, 0, meta.height - ch));
    const out = await sharp(src)
      .extract({ left, top, width: cw, height: ch })
      .resize(IDEA_W, IDEA_H, { fit: 'cover' })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
    ideaEntries.push({ id, kb: out.length / 1024, uri: 'data:image/jpeg;base64,' + out.toString('base64') });
    console.log(`案${id.padEnd(12)} ${meta.width}×${meta.height} → ${IDEA_W}×${IDEA_H}  ${(out.length / 1024).toFixed(1)}KB`);
  }
}

const html = readFileSync(htmlPath, 'utf8');
const write = (src, startTag, endTag, body) => {
  const re = new RegExp(`(\\/\\*${startTag}\\*\\/\\n)[\\s\\S]*?(\\/\\*${endTag}\\*\\/)`);
  if (!re.test(src)) { console.error(`${startTag} / ${endTag} のマーカーが見つかりません。`); process.exit(1); }
  return src.replace(re, (_m, a, b) => a + (body ? body + '\n' : '') + b);
};
let out = write(html, 'PHOTOS-START', 'PHOTOS-END',
  entries.map(e => ` '${e.cellId}':'${e.uri}'`).join(',\n'));
out = write(out, 'IDEAPHOTOS-START', 'IDEAPHOTOS-END',
  ideaEntries.map(e => ` '${e.id}':'${e.uri}'`).join(',\n'));
writeFileSync(htmlPath, out);

const total = [...entries, ...ideaEntries].reduce((s, e) => s + e.kb, 0);
console.log(CLEAR
  ? '写真をすべて外しました（絵文字アバター／SVGに戻ります）。'
  : `ペルソナ ${entries.length}枚・施策案 ${ideaEntries.length}枚を埋め込みました（合計 ${total.toFixed(0)}KB）。`);
