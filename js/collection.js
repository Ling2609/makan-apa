// Shared meal collection logic; all discovery paths retain dietary and kitchen rules.
const MealCollection = (() => {
  const foods = typeof MEALS !== 'undefined' ? { MEALS, fitsDiet, fitsKitchen, mealStats } : require('./foods.js');
  function cleanSaved(value) {
    return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && foods.MEALS.some(m => m.id === id)))].slice(0, 100) : [];
  }
  function search(profile, options = {}) {
    const saved = cleanSaved(options.saved);
    const query = String(options.query || '').trim().toLowerCase();
    return foods.MEALS.filter(m => m.id !== "skip" && !m.occasion && !m.slots.includes("X"))
      .filter(m => foods.fitsDiet(m, profile.diet) && foods.fitsKitchen(m, profile.kitchen))
      .filter(m => !m.rahmah || profile.rahmah)
      .filter(m => !options.onlySaved || saved.includes(m.id))
      .filter(m => !options.quick || m.min <= 15)
      .filter(m => !query || m.name.toLowerCase().includes(query))
      .map(meal => ({ meal, cost: foods.mealStats(meal).rm }))
      .sort((a, b) => options.sort === 'time' ? a.meal.min - b.meal.min || a.cost - b.cost : options.sort === 'name' ? a.meal.name.localeCompare(b.meal.name) : a.cost - b.cost || a.meal.name.localeCompare(b.meal.name));
  }
  return { cleanSaved, search };
})();
if (typeof module !== 'undefined') module.exports = MealCollection;
