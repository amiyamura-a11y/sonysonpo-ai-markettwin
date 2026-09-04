/**
 * デモHTMLのレンダリング検証。
 * 7ページすべてを開き、JSエラー・横スクロール・主要な計算値を確認する。
 *   node src/check.mjs [--shots <dir>]
 * Playwright が必要（npm install 済みであること）。
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + resolve(here, '..', 'index.html');
const shotDir = process.argv.includes('--shots')
  ? process.argv[process.argv.indexOf('--shots') + 1] : null;

// この環境では Playwright 同梱のブラウザを使えないことがあるため、あればそちらを使う
const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe }).catch(() => chromium.launch());

const problems = [];
for (const width of [1280, 1500, 1680]) {
  const page = await browser.newPage({ viewport: { width, height: 950 } });
  page.on('pageerror', e => problems.push(`[${width}] JSエラー: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`[${width}] console: ${m.text()}`); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']) {
    await page.evaluate(i => showPage(i), id);
    await page.waitForTimeout(350);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) problems.push(`[${width}] ${id} に横スクロール ${overflow}px`);
    const len = await page.evaluate(i => document.getElementById(i).innerText.length, id);
    if (len < 300) problems.push(`[${width}] ${id} の描画が空に近い（${len}文字）`);
    if (shotDir && width === 1500) await page.screenshot({ path: `${shotDir}/${id}.png`, fullPage: true });
  }

  if (width === 1500) {
    // 資料p.19 準拠ケースの再現を確認する
    const roi = await page.evaluate(() => roiCalc(ASSUMP));
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    if (!near(roi.curP, 14_600_000, 1000)) problems.push(`当期増分利益が資料と不一致: ${roi.curP}`);
    if (!near(roi.futP, 4_088_000, 1000)) problems.push(`将来増分利益が資料と不一致: ${roi.futP}`);
    if (!near(roi.roi, 123.3, 0.2)) problems.push(`ROIが資料と不一致: ${roi.roi}`);
    // 資料p.35 の例示ケース（日向坂コンテンツ × 日向坂46好き×比較検討層）
    const j = await page.evaluate(() => simulate(VERIFIED[0], 'hinata-comp'));
    if (!near(j.lift, 7.0, 0.05)) problems.push(`好意率Liftが資料と不一致: ${j.lift}`);
    if (!near(j.dVisit, 35_150, 200)) problems.push(`サイト来訪増が資料と不一致: ${j.dVisit}`);
    if (!near(j.dQuote, 5_600, 60)) problems.push(`見積増が資料と不一致: ${j.dQuote}`);
    if (!near(j.dContract, 560, 10)) problems.push(`契約増が資料と不一致: ${j.dContract}`);
    console.log(`ご提案資料 ROI ${roi.roi.toFixed(1)}% / 例示ケース 好意率Lift +${j.lift}pt`
      + ` / 見積 +${Math.round(j.dQuote)}件 / 契約 +${Math.round(j.dContract)}件`);
  }
  await page.close();
}
await browser.close();

if (problems.length) { console.error('\n' + problems.join('\n')); process.exit(1); }
console.log('7ページ × 3幅：JSエラーなし、横スクロールなし、資料値の再現OK');
