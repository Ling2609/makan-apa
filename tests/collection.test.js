const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/collection');
const F = require('../js/foods');
const S = require('../js/storage');
test('collection enforces every allergen and kitchen combination', () => {
  for (const kitchen of ['hostel','shared','home']) for (const allergy of F.ALLERGEN_IDS) {
    const p = S.defaultProfile(); p.kitchen = kitchen; p.diet.allergies = [allergy];
    for (const {meal} of C.search(p)) {
      assert.equal(F.allergenHits(meal, [allergy]).length, 0);
      assert.ok(F.fitsKitchen(meal, kitchen)); assert.ok(F.fitsDiet(meal, p.diet));
    }
  }
});
test('saved IDs are validated, deduplicated and searched under current rules', () => {
  const p = S.defaultProfile(); const rows = C.search(p);
  const id = rows[0].meal.id;
  assert.deepEqual(C.cleanSaved([id,id,null,'unknown']), [id]);
  assert.deepEqual(C.cleanSaved({}), []);
  assert.equal(C.search(p,{saved:[id],onlySaved:true}).length,1);
  p.diet.allergies = F.ALLERGEN_IDS;
  assert.ok(C.search(p,{saved:[id],onlySaved:true}).every(x => F.fitsDiet(x.meal,p.diet)));
});
test('search, quick filter and ordering work together', () => {
  const p = S.defaultProfile();
  const rows = C.search(p,{query:'rice',quick:true,sort:'time'});
  assert.ok(rows.length);
  assert.ok(rows.every(x => /rice/i.test(x.meal.name) && x.meal.min <= 15));
  assert.ok(rows.every((x,i) => !i || x.meal.min >= rows[i-1].meal.min));
  const prices = C.search(p);
  assert.ok(prices.every(x => x.meal.id !== "skip" && !x.meal.slots.includes("X") && !x.meal.occasion));
  assert.ok(prices.every((x,i) => !i || x.cost >= prices[i-1].cost));
  assert.equal(C.search(p,{query:'zzzzzz'}).length,0);
});
