// Ingredient search must follow #tf-builder #search even when Foxy's
// iron-iconset has already put <g id="search"> earlier in the document.
// The blend edit control's hit area comes from injectBlendCSS.
// Run from the repo root after npm install:
//   node tests/search-and-edit-target.test.js

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'custom-supplement.js'), 'utf8');

assert.ok(src.includes('const PACKAGING_GRAMS = 21;'), 'packaging grams unchanged');
assert.ok(
  src.includes('base: 15,\n  rarity: { low: 2.5, mid: 2.0, high: 1.75, premium: 1.5 },\n  volume: { max: 0.38, base: 0.15, steepness: 0.08 }'),
  'pricing table unchanged'
);
assert.ok(src.includes('const SERVINGS = 30;'), 'servings unchanged');
assert.ok(src.includes('const GRAMS_PER_LB = 453.59237;'), 'grams per lb unchanged');
assert.ok(!src.includes("$id('search')"), 'search must not use document.getElementById');
assert.ok(
  src.includes("#tf-builder .bl-actions{display:flex;align-items:center;gap:8px}"),
  'blend actions gap is 8px'
);
assert.ok(
  src.includes('padding:0 6px;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;'),
  'edit control hit area is in the injected CSS'
);
assert.ok(!/#tf-builder \.bl-item \.rm\{/.test(src), 'remove button size stays in Webflow CSS');

const NO_MATCH = 'No ingredients match “zzz”.';

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <iron-iconset-svg>
    <svg><defs><g id="search"></g></defs></svg>
  </iron-iconset-svg>
</head>
<body>
  <div class="ingredient-list" hidden>
    <div class="ingredient-item" data-name="Creatine Monohydrate" data-description="Strength" data-category="Creatine" data-supplement-type="daily" data-min="1" data-max="10" data-steps="10" data-suggested-dosage="5" data-price="0.02" data-cost-per-gram="0.02" data-calories="0"></div>
    <div class="ingredient-item" data-name="Caffeine" data-description="Alertness" data-category="Energy &amp; Focus" data-supplement-type="pre" data-min="0.05" data-max="0.4" data-steps="8" data-suggested-dosage="0.2" data-price="0.02" data-cost-per-gram="0.02" data-calories="0"></div>
  </div>
  <div id="tf-builder">
    <input id="search" type="search">
    <div id="chips"></div>
    <div id="catalog"></div>
    <div id="flavors"></div>
    <ul id="blendList"></ul>
  </div>
  <script src="/custom-supplement.js" defer></script>
</body>
</html>`;

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function main() {
  const { chromium } = require('playwright');
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/custom-supplement.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(src);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await listen(server);
  const port = server.address().port;
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    assert.deepStrictEqual(pageErrors, [], 'builder script threw during init');

    const collision = await page.evaluate(() => {
      const byId = document.getElementById('search');
      const input = document.querySelector('#tf-builder #search');
      return {
        byIdTag: byId && byId.tagName,
        byIdIsInput: byId === input,
        placeholder: input && input.placeholder,
        enterkeyhint: input && input.getAttribute('enterkeyhint'),
        autocomplete: input && input.getAttribute('autocomplete'),
      };
    });
    assert.strictEqual(collision.byIdTag, 'g', 'getElementById("search") must be the Foxy icon <g>');
    assert.strictEqual(collision.byIdIsInput, false);
    assert.strictEqual(
      collision.placeholder,
      'Search 2 ingredients — caffeine, creatine, magnesium…'
    );
    assert.strictEqual(collision.enterkeyhint, 'search');
    assert.strictEqual(collision.autocomplete, 'off');

    const search = page.locator('#tf-builder #search');
    await search.fill('creatine');
    const creatineCards = await page.$$eval('#catalog .icard', (els) => els.map((el) => el.dataset.name));
    assert.deepStrictEqual(creatineCards, ['Creatine Monohydrate']);

    await search.fill('zzz');
    const zzzCards = await page.$$eval('#catalog .icard', (els) => els.map((el) => el.dataset.name));
    const zzzText = await page.$eval('#catalog', (el) => el.textContent.trim());
    assert.deepStrictEqual(zzzCards, []);
    assert.strictEqual(zzzText, NO_MATCH);

    await search.fill('');
    await page.locator('#catalog .icard[data-name="Creatine Monohydrate"] .add').click();
    await page.locator('#catalog .icard[data-name="Creatine Monohydrate"] .confirm').click();
    const edit = page.locator('#tf-builder .bl-item .edit');
    await edit.waitFor();
    const box = await edit.boundingBox();
    assert.ok(box, 'edit button has a layout box');
    const gap = await page.locator('#tf-builder .bl-actions').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { gap: cs.gap, rowGap: cs.rowGap, columnGap: cs.columnGap };
    });
    const viewport = page.viewportSize();
    assert.deepStrictEqual(viewport, { width: 390, height: 844 });
    assert.ok(box.width >= 44, `edit width ${box.width}px`);
    assert.ok(box.height >= 44, `edit height ${box.height}px`);
    assert.strictEqual(gap.rowGap, '8px');
    assert.strictEqual(gap.columnGap, '8px');

    console.log('search-and-edit-target.test.js: ok');
    console.log(
      `viewport ${viewport.width}x${viewport.height}; edit ${box.width}x${box.height}px; bl-actions gap ${gap.gap}`
    );
    console.log('creatine cards:', creatineCards.join(', '));
    console.log('zzz catalog:', zzzText);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
