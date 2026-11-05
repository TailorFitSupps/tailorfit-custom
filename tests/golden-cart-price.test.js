// Golden-vector price/weight parity with UserPresets foxy-sign-cart.
// Fixtures: tests/golden-cart-price-vectors.json (MUST be byte-identical to UserPresets).
// Run: node tests/golden-cart-price.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const vectors = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'golden-cart-price-vectors.json'), 'utf8')
);

// Mirror of custom-supplement.js pricing / weight / money rounding.
// Keep in sync with the browser script (formula only; not a runtime import).
const SERVINGS = vectors.servings;
const GRAMS_PER_LB = vectors.gramsPerLb;
const PACKAGING_GRAMS = vectors.packagingGrams;
const pricing = vectors.pricing;

function rarityTier(costPerGram) {
  const c = Number(costPerGram) || 0;
  return c < 0.03 ? 'low' : c < 0.05 ? 'mid' : c < 0.10 ? 'high' : 'premium';
}

function volumeDiscount(ingredientValue) {
  const { max, base, steepness } = pricing.volume;
  const discount = Math.min(max, base + Math.log(ingredientValue + 1) * steepness);
  return 1 - discount;
}

function calcPrice(ingredients) {
  if (!ingredients || ingredients.length === 0) return pricing.base;
  let ingredientCost = 0;
  let totalIngredientValue = 0;
  ingredients.forEach((item) => {
    const costPerGram = parseFloat(item.costPerGram) || 0;
    const multiplier = pricing.rarity[rarityTier(costPerGram)];
    const totalWeight = item.dosage * SERVINGS;
    const cost = totalWeight * costPerGram * multiplier;
    ingredientCost += cost;
    totalIngredientValue += totalWeight * costPerGram * multiplier;
  });
  return pricing.base + ingredientCost * volumeDiscount(totalIngredientValue);
}

function flavorPrice(flavor) {
  if (!flavor) return 0;
  return (Number(flavor.price) || 0) * SERVINGS * 0.1;
}

function formatCartPrice(amount) {
  return (Math.round(Number(amount) * 100) / 100).toFixed(2);
}

function cartWeightLb(ingredientDosages, flavor) {
  const ingredientGrams = (ingredientDosages || []).reduce((a, d) => a + (Number(d) || 0), 0);
  const flavorGrams = flavor ? Number(flavor.weight) || 0 : 0;
  const powderGrams = (ingredientGrams + flavorGrams) * SERVINGS;
  const totalGrams = powderGrams + PACKAGING_GRAMS;
  return Math.round((totalGrams / GRAMS_PER_LB) * 1000) / 1000;
}

assert.strictEqual(PACKAGING_GRAMS, 21);
assert.strictEqual(vectors.packagingGrams, 21);

for (const tie of vectors.formatPriceHalfCentTies) {
  assert.strictEqual(
    formatCartPrice(tie.amount),
    tie.expected,
    `half-cent ${tie.amount}`
  );
}

for (const build of vectors.builds) {
  const priced = build.ingredients.map((i) => ({
    dosage: i.dosage,
    costPerGram: i.costPerGram,
  }));
  const price = formatCartPrice(calcPrice(priced) + flavorPrice(build.flavor));
  const weight = cartWeightLb(
    build.ingredients.map((i) => i.dosage),
    build.flavor
  );
  assert.strictEqual(price, build.expectedPrice, `${build.id} price`);
  assert.strictEqual(weight, build.expectedWeightLb, `${build.id} weight`);
}

console.log('All tailorfit-custom golden-cart-price tests passed.');
console.log('vectors:', path.relative(process.cwd(), path.join(__dirname, 'golden-cart-price-vectors.json')));
