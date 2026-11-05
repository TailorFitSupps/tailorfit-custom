# PACKAGING_GRAMS sync (21 g placeholder)

There is **no shared package** between `tailorfit-custom` and `UserPresets`. Packaging tare lives in two places and **must stay equal**:

| Repo | Constant |
|------|----------|
| tailorfit-custom | `custom-supplement.js` → `PACKAGING_GRAMS` |
| UserPresets | `netlify/functions/foxy-sign-cart.js` → `PACKAGING_GRAMS` |

Also mirrored in `tests/golden-cart-price-vectors.json` → `packagingGrams` (both repos; files must be byte-identical).

When Bret confirms the real empty-container weight:

1. Update **both** constants in the same change set.
2. Update `packagingGrams` + recompute `expectedWeightLb` in the golden vectors (both repos).
3. Ship a new jsDelivr tag for the client **and** redeploy the Netlify signer — otherwise signed weight and unsigned/display weight diverge.
