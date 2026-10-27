// Decorative, recipe-aware SVG food illustrations. Not a photograph or portion guide.
// All strings come from the fixed recipe catalogue; no user HTML is interpolated.
const FoodArt = (() => {
  function plate(meal) {
    const ids = (meal.recipe || []).map(x => x.id);
    const has = (...keys) => keys.some(k => ids.includes(k));
    const name = String(meal.name || '').toLowerCase();
    const noodle = /noodle|bihun|mee |kway|maggi|laksa/.test(name);
    const bread = /roti|chapati|toast|sandwich|bread/.test(name);
    const fruit = !!meal.snack || /banana|orange|apple|guava|papaya/.test(name) && !has('rice','oats','bread');
    const oats = /oat/.test(name);
    const greens = '<g fill="#487647" stroke="#315e36" stroke-width="2"><path d="M198 175c-40-36-20-74 7-58 24-32 57-5 24 32 26 0 28 30-1 36z"/><path d="M194 168c8-36 39-46 51-26 28-2 37 24-1 33 13 21-16 36-36 13z"/><path d="m206 184 28-39m-24 28 31-10" fill="none" stroke="#a7bf65" stroke-width="3"/></g>';
    const egg = '<g transform="rotate(-18 139 222)"><ellipse cx="139" cy="222" rx="30" ry="26" fill="#fffdf0" stroke="#e1d7ae" stroke-width="2"/><circle cx="141" cy="221" r="14" fill="#f4b33c"/><path d="M134 215q8-7 14 1" fill="none" stroke="#ffd978" stroke-width="3" stroke-linecap="round"/></g>';
    const rice = '<ellipse cx="129" cy="151" rx="53" ry="46" fill="#f7efd6" stroke="#ded3ae" stroke-width="2"/><g stroke="#dfd0a6" stroke-width="3" stroke-linecap="round"><path d="m106 133 5 3m15-13 3 6m18 2 6 2m-57 13 5 2m17-2 5 3m17-5 6 1m-37 15 4 4m15-3 6 1m16-6 5 3m-40 12 5 1m17 1 3 4"/></g>';
    const pasta = '<ellipse cx="130" cy="153" rx="59" ry="48" fill="#b65d28"/><g stroke="#efbd61" stroke-width="6" fill="none" stroke-linecap="round"><path d="M85 135q65-36 87 9T90 158t75 19M90 125q-8 36 66 22t-47 41M107 113q-37 38 46 43t-6 34M145 115q-43 25 8 48t-45 16"/></g>';
    const toast = '<g transform="rotate(-12 125 150)"><path d="M77 122q-13-26 18-29h57q32 2 22 29l-4 69H82z" fill="#bd7d3c"/><path d="M87 125q-12-20 12-22h49q25 2 16 22l-3 56H92z" fill="#e6bb72"/><path d="m101 132 43 30m-45-12 42-21m-37 43 42-25" stroke="#d69b52" stroke-width="3"/></g>';
    let base = noodle ? pasta : bread ? toast : oats ? '<ellipse cx="130" cy="151" rx="58" ry="48" fill="#c6a47a"/><ellipse cx="130" cy="147" rx="52" ry="41" fill="#e4d1a4"/><g fill="#b79768"><ellipse cx="102" cy="139" rx="5" ry="2"/><ellipse cx="137" cy="128" rx="4" ry="2"/><ellipse cx="151" cy="152" rx="5" ry="2"/></g>' : rice;
    let protein = has('tofu','beans') ? '<g fill="#d4a65c" stroke="#ae7d3e" stroke-width="2"><rect x="83" y="192" width="31" height="26" rx="5" transform="rotate(-12 99 205)"/><rect x="101" y="216" width="30" height="25" rx="5" transform="rotate(9 116 229)"/><rect x="67" y="217" width="30" height="24" rx="5"/></g>' : '<g fill="#b96a39" stroke="#8e4b2b" stroke-width="2"><path d="M79 205q0-29 28-23l24 19q13 25-13 35l-25-9z"/><path d="m86 201 30 13m-27-3 21 12" stroke="#de9761" stroke-width="3"/></g>';
    if (!has('tofu','beans','chicken','beef','fish','tuna','sardines','prawns','pork','lamb')) protein = '';
    if (fruit) { base='<g><path d="M86 135q55 86 126 6-34 106-99 65-33-21-27-71" fill="#edbf47" stroke="#d7a736" stroke-width="3"/><circle cx="145" cy="129" r="30" fill="#e68b48"/><path d="M145 99q5-20 23-14-1 20-23 14" fill="#547a42"/><path d="M109 142q-36-21-39 11l25 30z" fill="#e8a494"/><path d="m105 147-25 9 16 19z" fill="#d87767"/></g>';protein=''; }
    return `<svg class="food-art" viewBox="0 0 340 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><ellipse cx="173" cy="274" rx="123" ry="17" fill="#20382a" opacity=".12"/><circle cx="170" cy="160" r="136" fill="#f8f4de" stroke="#d6d7b4" stroke-width="2"/><circle cx="170" cy="160" r="122" stroke="#e2ddbd" stroke-width="2"/><circle cx="170" cy="160" r="108" fill="#f2ecd3"/>${fruit ? '' : '<path d="M71 113 241 76l34 137-161 37z" fill="#55794a" opacity=".92"/><path d="m91 130 156-33m-149 58 155-32m-149 58 155-32m-149 58 155-32m-149 58 155-32" stroke="#75935b" stroke-width="2"/>'}${base}${!fruit && has('greens','veg','tomato','rootveg') ? greens : ''}${!fruit ? protein : ''}${!fruit && has('eggs') ? egg : ''}${!fruit ? '<ellipse cx="233" cy="217" rx="25" ry="23" fill="#eee5cf"/><ellipse cx="233" cy="214" rx="20" ry="17" fill="#a9402c"/><path d="m224 210 7-3m5 10 4-3" stroke="#d96d3d" stroke-width="2" stroke-linecap="round"/>' : ''}</svg>`;
  }
  return { plate };
})();
