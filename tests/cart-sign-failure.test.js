// Builder signer failure: show try-again near Add to Cart; never navigate unsigned.
// Mirrors helpers in custom-supplement.js (browser script is not a Node module).
// Run: node tests/cart-sign-failure.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SIGN_CART_FAIL_MSG = 'Something went wrong. Please try again.';
const src = fs.readFileSync(
  path.join(__dirname, '..', 'custom-supplement.js'),
  'utf8'
);

assert.ok(
  src.includes(`const SIGN_CART_FAIL_MSG = '${SIGN_CART_FAIL_MSG}';`),
  'SIGN_CART_FAIL_MSG must match shop callers'
);
assert.ok(src.includes("className='tf-sign-error'"));
assert.ok(src.includes("setAttribute('role','status')"));
assert.ok(src.includes('HMAC cart signing failed; no unsigned fallback'));
assert.ok(!/using unsigned cart link/.test(src), 'must not log unsigned-fallback path');
assert.ok(!/buildUnsignedCartUrl/.test(src), 'unsigned URL builder must be gone');

{
  const addStart = src.indexOf('async function addToCart');
  assert.ok(addStart !== -1, 'addToCart present');
  const addFn = src.slice(addStart, addStart + 800);
  assert.ok(addFn.includes('showSignError(btn)'), 'failure shows error near button');
  assert.ok(addFn.includes('restoreAddCartButton()'), 'failure re-enables button');
  assert.ok(
    /try\{[\s\S]*window\.location\.href=url;[\s\S]*\}catch/.test(addFn),
    'navigate only inside try (signed URL)'
  );
  assert.ok(
    !/catch\([\s\S]*window\.location\.href/.test(addFn),
    'addToCart catch must not navigate'
  );
}

// Minimal DOM stub for show/clear helpers (same behavior as custom-supplement.js).
function makeDom() {
  const children = [];
  const parent = {
    children,
    querySelector(sel) {
      if (sel !== '.tf-sign-error') return null;
      return children.find((c) => c.className === 'tf-sign-error') || null;
    },
    insertBefore(node, ref) {
      const i = ref ? children.indexOf(ref) : -1;
      if (i === -1) children.push(node);
      else children.splice(i, 0, node);
      node.parentNode = parent;
      return node;
    },
  };
  const btn = {
    parentNode: parent,
    nextSibling: null,
  };
  parent.children.push(btn);
  const document = {
    createElement(tag) {
      return {
        tagName: tag,
        className: '',
        style: { cssText: '' },
        textContent: '',
        parentNode: null,
        attrs: {},
        setAttribute(k, v) {
          this.attrs[k] = v;
        },
        getAttribute(k) {
          return this.attrs[k];
        },
        remove() {
          const i = parent.children.indexOf(this);
          if (i !== -1) parent.children.splice(i, 1);
          this.parentNode = null;
        },
      };
    },
  };
  return { document, btn, parent };
}

function clearSignError(nearEl) {
  if (!nearEl || !nearEl.parentNode) return;
  const prev = nearEl.parentNode.querySelector('.tf-sign-error');
  if (prev) prev.remove();
}

function showSignError(nearEl, document) {
  if (!nearEl || !nearEl.parentNode) return;
  clearSignError(nearEl);
  const el = document.createElement('p');
  el.className = 'tf-sign-error';
  el.setAttribute('role', 'status');
  el.style.cssText = 'margin:0.4em 0 0;font-size:0.875rem;opacity:0.85;';
  el.textContent = SIGN_CART_FAIL_MSG;
  nearEl.parentNode.insertBefore(el, nearEl.nextSibling);
}

{
  const { document, btn, parent } = makeDom();
  showSignError(btn, document);
  const err = parent.querySelector('.tf-sign-error');
  assert.ok(err, 'error node inserted');
  assert.strictEqual(err.textContent, SIGN_CART_FAIL_MSG);
  assert.strictEqual(err.getAttribute('role'), 'status');
  assert.strictEqual(err.className, 'tf-sign-error');
  showSignError(btn, document);
  assert.strictEqual(
    parent.children.filter((c) => c.className === 'tf-sign-error').length,
    1,
    'replaces prior error; no duplicates'
  );
  clearSignError(btn);
  assert.strictEqual(parent.querySelector('.tf-sign-error'), null);
}

async function addToCartPolicy({ fetchSignedCartUrl, showSignError, restoreAddCartButton, location }) {
  // Mirrors custom-supplement.js addToCart success/failure control flow.
  try {
    const url = await fetchSignedCartUrl();
    location.href = url;
  } catch (err) {
    showSignError();
    restoreAddCartButton();
  }
}

async function runAsyncCases() {
  {
    let navigated = null;
    let shown = 0;
    let restored = 0;
    await addToCartPolicy({
      fetchSignedCartUrl: async () => {
        throw new Error('sign-cart HTTP 503');
      },
      showSignError: () => {
        shown += 1;
      },
      restoreAddCartButton: () => {
        restored += 1;
      },
      location: {
        set href(v) {
          navigated = v;
        },
      },
    });
    assert.strictEqual(navigated, null, 'failure must not navigate');
    assert.strictEqual(shown, 1);
    assert.strictEqual(restored, 1);
  }

  {
    let navigated = null;
    await addToCartPolicy({
      fetchSignedCartUrl: async () => 'https://tailorfit.foxycart.com/cart?cart=add||signed',
      showSignError: () => {
        throw new Error('should not show error on success');
      },
      restoreAddCartButton: () => {
        throw new Error('should not restore on success');
      },
      location: {
        set href(v) {
          navigated = v;
        },
      },
    });
    assert.strictEqual(
      navigated,
      'https://tailorfit.foxycart.com/cart?cart=add||signed'
    );
  }

  {
    let navigated = null;
    await addToCartPolicy({
      fetchSignedCartUrl: async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      },
      showSignError: () => {},
      restoreAddCartButton: () => {},
      location: {
        set href(v) {
          navigated = v;
        },
      },
    });
    assert.strictEqual(navigated, null, 'timeout/abort must not navigate unsigned');
  }
}

runAsyncCases()
  .then(() => {
    console.log('cart-sign-failure.test.js: ok');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
