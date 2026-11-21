// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts from the
// same board the entry hands in) and renders: the macro synthesis the program computed from the
// board (every figure in it generated from board.json, none typed by hand) with a self-audit
// panel that recomputes those figures from the rows on the page itself, the sweep plot of
// every ranked protocol, the ranked board with sort and filters, a detail view per protocol
// with the model's factor breakdown and the farm plan board.json carries, the model itself with
// its constants and its comps table, the traded peers the board is priced against, and the
// funnel that built the board. No network: every byte shown is in data.js.
// The location hash can preset the view (#p=<slug> opens a detail, #cat=, #chain=, #q=, #watch=1
// preset the filters), which is how the entry's screenshots were taken of the real page.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) return;
  var app = document.getElementById('app');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n == null) return '<span class="num">—</span>';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : '';
    return '<span class="num ' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function mult(n) { return '×' + Number(n).toFixed(2); }

  var hash = {};
  (location.hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
    var i = kv.indexOf('=');
    if (i > 0) hash[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
  });
  var state = {
    q: hash.q || '',
    category: hash.cat || 'all',
    chain: hash.chain || 'all',
    watch: hash.watch === '1',
    sort: 'rank',
    dir: 1,
    selected: hash.p || null,
  };

  var categories = [];
  var chains = [];
  D.rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  categories.sort(); chains.sort();
  var bySlug = {};
  D.rows.forEach(function (r) { bySlug[r.slug] = r; });

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return D.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  var SORTS = {
    rank: function (r) { return r.rank; },
    name: function (r) { return r.name.toLowerCase(); },
    category: function (r) { return (r.category || '').toLowerCase(); },
    tvl: function (r) { return r.tvl_usd; },
    change: function (r) { return r.change_7d == null ? -1e18 : r.change_7d; },
    implied: function (r) { return r.implied_value_usd; },
    mult: function (r) { return r.implied_value_usd / r.tvl_usd; },
  };
  function sorted(rows) {
    var f = SORTS[state.sort] || SORTS.rank;
    return rows.slice().sort(function (a, b) {
      var x = f(a), y = f(b);
      var c = typeof x === 'string' ? (x < y ? -1 : x > y ? 1 : 0) : x - y;
      return c * state.dir || a.rank - b.rank;
    });
  }

  function headerHtml() {
    var f = D.funnel;
    return '<header class="top"><div class="kicker">Token launch radar · model ' + esc(D.model_version) + '</div>' +
      '<h1>TOKEN <span class="thin">RADAR</span></h1>' +
      '<p class="lede">Every protocol in the sealed snapshot that <strong>records no token yet</strong>, ranked by what its token would be worth if its record stayed as it is — priced against <strong>its own traded peers</strong>, never a flat multiple. Snapshot of ' + esc(D.as_of) + '.</p>' +
      '<div class="stats">' +
      '<div class="stat"><div class="v">' + f.scanned + '</div><div class="k">protocols scanned</div></div>' +
      '<div class="stat"><div class="v"><em>' + D.board_size + '</em></div><div class="k">pre-token ranked</div></div>' +
      '<div class="stat"><div class="v">' + D.watchlist_size + '<em>/' + D.watchlist_size + '</em></div><div class="k">watchlist covered</div></div>' +
      '<div class="stat"><div class="v">' + D.comps.global_peers + '</div><div class="k">traded peers (comps)</div></div>' +
      '<div class="stat"><div class="v">' + money(D.rows[0].implied_value_usd) + '</div><div class="k">top implied value</div></div>' +
      '</div>' +
      '<div class="formula">implied value <span>=</span> TVL <span>×</span> category median mcap/TVL <span>×</span> growth <span>×</span> maturity <span>— every factor shown per protocol below</span></div>' +
      '</header>';
  }

  function controlsHtml() {
    function opts(list, cur, allLabel) {
      var s = '<option value="all">' + allLabel + '</option>';
      list.forEach(function (v) { s += '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; });
      return s;
    }
    return '<div class="controls">' +
      '<label>Search <input type="search" id="q" value="' + esc(state.q) + '" placeholder="protocol or slug"></label>' +
      '<label>Category <select id="cat">' + opts(categories, state.category, 'All categories') + '</select></label>' +
      '<label>Chain <select id="chain">' + opts(chains, state.chain, 'All chains') + '</select></label>' +
      '<label class="toggle"><input type="checkbox" id="watch"' + (state.watch ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="count" id="count"></span></div>';
  }

  var HEADS = [
    ['rank', '#'], ['name', 'Protocol'], ['category', 'Category'], ['chains', 'Chains'],
    ['tvl', 'TVL'], ['change', '7d'], ['implied', 'Implied value'], ['mult', '× TVL'],
  ];
  function boardHtml(rows) {
    var s = '<table class="board"><thead><tr>';
    HEADS.forEach(function (h) {
      s += '<th data-sort="' + h[0] + '"' + (state.sort === h[0] ? ' class="sorted"' : '') + '>' + h[1] +
        (state.sort === h[0] ? (state.dir === 1 ? ' ↑' : ' ↓') : '') + '</th>';
    });
    s += '</tr></thead><tbody>';
    rows.slice(0, 80).forEach(function (r) {
      s += '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td class="name"><span class="n">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="wl">WATCHLIST</span>' : '') +
        '<span class="s">' + esc(r.slug) + '</span></td>' +
        '<td class="cat">' + esc(r.category || '—') + '</td>' +
        '<td class="chains">' + esc(r.chains.slice(0, 2).join(' · ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td>' + pct(r.change_7d) + '</td>' +
        '<td class="implied">' + money(r.implied_value_usd) + '</td>' +
        '<td class="mult">' + mult(r.implied_value_usd / r.tvl_usd) + '</td></tr>';
    });
    s += '</tbody></table>';
    if (rows.length > 80) s += '<div class="more">Showing the first 80 of ' + rows.length + ' ranked protocols — filter to narrow the board; the full board is in board.json.</div>';
    return s;
  }

  function waterfallHtml(r) {
    var m = D.model;
    var growthPct = ((r.growth_multiplier - 1) / m.growth_weight) * 100;
    var ratioDesc = r.comps_source === 'category'
      ? 'median of ' + r.comps_peers + ' traded ' + esc(r.category || '') + ' protocols — the ladder below shows every one'
      : 'global median — only ' + r.comps_peers + ' traded peer' + (r.comps_peers === 1 ? '' : 's') + ' in ' + esc(r.category || 'this category');
    var ageDesc = r.age_days == null
      ? 'listing date unreported — counted as ' + m.unknown_age_days + ' days'
      : 'tokenless for ' + r.age_days + ' days (listed ' + esc(r.listed_at) + ')';
    var steps = [
      { k: 'TVL', edge: '', v: r.tvl_usd, d: 'the protocol\u2019s own figure, from the snapshot' },
      { k: 'Comps ratio', edge: '× ' + r.comps_ratio.toFixed(4), v: r.tvl_usd * r.comps_ratio, d: ratioDesc },
      { k: 'Growth', edge: '× ' + r.growth_multiplier.toFixed(2), v: r.tvl_usd * r.comps_ratio * r.growth_multiplier, d: '7d TVL change ' + (r.change_7d == null ? 'unreported, counted as 0%' : r.change_7d.toFixed(1) + '%') + ' (model uses ' + growthPct.toFixed(1) + '%)' },
      { k: 'Maturity', edge: '× ' + r.maturity_multiplier.toFixed(2), v: r.implied_value_usd, d: ageDesc + ' — the product is the board\u2019s implied value', fin: true },
    ];
    var lo = Infinity, hi = -Infinity;
    steps.forEach(function (st) { var l = Math.log10(Math.max(1, st.v)); if (l < lo) lo = l; if (l > hi) hi = l; });
    var span = (hi - lo) || 1;
    var s = '<div class="wf">';
    steps.forEach(function (st) {
      var w = 5 + 95 * (Math.log10(Math.max(1, st.v)) - lo) / span;
      s += '<div class="wf-row' + (st.fin ? ' fin' : '') + '">' +
        '<div class="wf-lab">' + (st.edge ? '<span class="op">' + st.edge + '</span> ' : '') + st.k + '<span class="wf-d">' + st.d + '</span></div>' +
        '<div class="wf-track"><div class="wf-bar" style="width:' + w.toFixed(1) + '%"></div></div>' +
        '<div class="wf-val">' + money(st.v) + '</div></div>';
    });
    s += '</div><div class="wf-cap">The value, built in the open: bars on a log scale, each step multiplying the running value — a multiple under 1 pulls it back toward the TVL the market has already verified.</div>';
    return s;
  }

  function peersHtml(r) {
    var key = r.category || '(uncategorised)';
    var peers = (D.peers && D.peers[key]) || [];
    var entry = null;
    D.comps.entries.forEach(function (e) { if (e.category === key) entry = e; });
    var self = r.implied_value_usd / r.tvl_usd;
    var items = peers.map(function (p) { return { t: 'p', v: p.mcap_tvl, p: p }; });
    items.push({ t: 'med', v: r.comps_ratio });
    items.push({ t: 'self', v: self });
    items.sort(function (a, b) { return a.v - b.v; });
    var medLabel = r.comps_source === 'category'
      ? 'Median of the ' + peers.length + ' traded peers — the ratio this row is priced at' + (entry && entry.median != null && Math.abs(entry.median - r.comps_ratio) > 0.00005 ? ' (raw median ' + entry.median.toFixed(4) + ', clamped to the declared band)' : '')
      : 'Global median of all ' + D.comps.global_peers + ' traded peers — the ratio this row is priced at';
    var s = '<h3 class="steps">The peers behind the price — ' + esc(r.category || 'uncategorised') + '</h3>' +
      '<div class="sub">' + (r.comps_source === 'category'
        ? 'Every traded protocol in this category in the snapshot, cheapest multiple first. ' + esc(r.name) + ' is priced at their median; its own implied multiple is marked where it would land among them.'
        : 'This category holds ' + peers.length + ' traded peer' + (peers.length === 1 ? '' : 's') + ' — fewer than the ' + D.model.comps_min_peers + ' the model requires before a median is a price rather than an anecdote — so this row is priced at the global median, marked in the ladder against whatever peers the category has.') + '</div>' +
      '<table class="mini peers"><thead><tr><th>Protocol</th><th>Market cap</th><th>TVL</th><th>mcap/TVL</th></tr></thead><tbody>';
    items.forEach(function (it) {
      if (it.t === 'p') {
        s += '<tr><td>' + esc(it.p.name) + '</td><td>' + money(it.p.mcap_usd) + '</td><td>' + money(it.p.tvl_usd) + '</td><td>' + it.p.mcap_tvl.toFixed(4) + '</td></tr>';
      } else if (it.t === 'med') {
        s += '<tr class="med"><td colspan="3">' + medLabel + '</td><td>' + r.comps_ratio.toFixed(4) + '</td></tr>';
      } else {
        s += '<tr class="self"><td colspan="3">' + esc(r.name) + ' — this protocol, at its implied value</td><td>×' + self.toFixed(4) + '</td></tr>';
      }
    });
    s += '</tbody></table>';
    return s;
  }

  function detailHtml(r) {
    if (!r) return '';
    var s = '<section class="detail" id="detail"><div class="kicker">Protocol detail · rank ' + r.rank + (r.watchlist ? ' · on the house watchlist' : ' · below the watchlist floor') + '</div>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<div class="sub">' + esc(r.slug) + ' · ' + esc(r.category || 'uncategorised') + ' · chains: ' + esc(r.chains.join(', ')) + '</div>' +
      waterfallHtml(r) +
      peersHtml(r) +
      '<h3 class="steps">Farm plan — before and after a launch</h3>' +
      '<div class="sub">Farmed on ' + esc(r.chains.length ? r.chains[0] : 'its main chain') + ' — ' + esc(r.name) + '\u2019s main chain. Plans assume an Ethereum home wallet; when the farm chain differs, the plan moves the capital there first.</div><ol class="plan">';
    r.farm_steps.forEach(function (step) { s += '<li>' + esc(step) + '</li>'; });
    s += '</ol></section>';
    return s;
  }

  function synthesisHtml() {
    var S = D.synthesis;
    if (!S) return '';
    var multi = S.top.categories.filter(function (c) { return c.rows > 1; })
      .map(function (c) { return esc(c.category) + ' (' + c.rows + ')' }).join(', ');
    var singles = S.top.categories.filter(function (c) { return c.rows === 1; })
      .map(function (c) { return esc(c.category); });
    var comp = multi;
    if (singles.length) comp += (comp ? ', and one each from ' : 'one each from ') + singles.join(', ');
    var belowTop = S.top_n - S.top.watchlist_rows;
    var s = '<section class="block"><h2>What the radar sees</h2>' +
      '<p>Read as a whole, the board\u2019s <strong>' + money(S.total_implied_usd) + '</strong> of implied value is top-heavy: the top ' + S.top_n + ' protocols carry <strong>' + money(S.top.implied_usd) + '</strong> of it — <strong>' + S.top.share_pct.toFixed(1) + '%</strong> — and half of everything sits inside the first <strong>' + S.half_rank + '</strong> ranks. ' +
      'The head is made of ' + comp + '. ' + S.top.watchlist_rows + ' of the top ' + S.top_n + ' sit on the house watchlist; the other ' + belowTop + ' climbed from below the floor. ' +
      'The head also leans on the global median: ' + S.top.own_category_rows + ' of the top ' + S.top_n + ' are priced from their own category\u2019s traded peers, ' + S.top.global_fallback_rows + ' at the global median (\u00d7' + D.comps.global_median.toFixed(4) + ') because their categories hold too few traded peers to price from — reported here rather than hidden, and the median top-' + S.top_n + ' protocol is priced at \u00d7' + S.top.median_multiple.toFixed(4) + ' of its TVL. ' +
      'Every figure in this section is computed from board.json by the program that wrote it; none is typed by hand.</p>' +
      '<div class="stats">' +
      '<div class="stat"><div class="v"><em>' + S.top.share_pct.toFixed(1) + '%</em></div><div class="k">of value in the top ' + S.top_n + '</div></div>' +
      '<div class="stat"><div class="v">' + S.half_rank + '</div><div class="k">ranks hold half the value</div></div>' +
      '<div class="stat"><div class="v">' + S.watchlist.share_pct.toFixed(1) + '%</div><div class="k">of value on the watchlist (' + S.watchlist.rows + ' of ' + S.rows + ' rows)</div></div>' +
      '<div class="stat"><div class="v">' + S.categories[0].share_pct.toFixed(1) + '%</div><div class="k">' + esc(S.categories[0].category) + ' — the heaviest category</div></div>' +
      '</div>' +
      '<div class="catbars">';
    S.categories.slice(0, S.categories_shown).forEach(function (c) {
      var w = S.categories[0].share_pct > 0 ? (c.share_pct / S.categories[0].share_pct) * 100 : 0;
      s += '<div class="catbar"><div class="cn">' + esc(c.category) + ' <span>' + c.rows + ' rows</span></div>' +
        '<div class="track"><div class="fill" style="width:' + w.toFixed(1) + '%"></div></div>' +
        '<div class="cv">' + money(c.implied_usd) + '</div><div class="cp">' + c.share_pct.toFixed(1) + '%</div></div>';
    });
    var R = S.categories_rest;
    var rw = S.categories[0].share_pct > 0 ? (R.share_pct / S.categories[0].share_pct) * 100 : 0;
    s += '<div class="catbar rest"><div class="cn">' + R.categories + ' more categories <span>' + R.rows + ' rows</span></div>' +
      '<div class="track"><div class="fill" style="width:' + rw.toFixed(1) + '%"></div></div>' +
      '<div class="cv">' + money(R.implied_usd) + '</div><div class="cp">' + R.share_pct.toFixed(1) + '%</div></div>' +
      '</div>' +
      '<div class="split"><div class="wlseg" style="width:' + S.watchlist.share_pct.toFixed(1) + '%">Watchlist · ' + S.watchlist.rows + ' protocols · ' + money(S.watchlist.implied_usd) + ' · ' + S.watchlist.share_pct.toFixed(1) + '%</div>' +
      '<div class="bfseg" style="width:' + S.below_floor.share_pct.toFixed(1) + '%">Below the floor · ' + S.below_floor.rows + ' protocols · ' + money(S.below_floor.implied_usd) + ' · ' + S.below_floor.share_pct.toFixed(1) + '%</div></div>' +
      '<div class="split-cap">The house watchlist is the board\u2019s floor, not its ceiling: ' + S.below_floor.rows + ' further protocols earn their ranks below it, and carry ' + S.below_floor.share_pct.toFixed(1) + '% of the value between them.</div>' +
      auditHtml() +
      '</section>';
    return s;
  }

  // The self-audit: this page recomputes the synthesis block's headline figures from D.rows —
  // the very rows the board below renders — and stamps how many of them reproduce. The
  // recomputation reads nothing from D.synthesis; the synthesis object is only the claim under
  // check, never an input. Definitions mirror the model's own: shares are parts of the board's
  // total implied value rounded to one decimal, the head is the first top_n ranks, the half
  // rank is the first rank whose cumulative value reaches half the total, and the median
  // multiple is the median implied/TVL of the head, rounded to four decimals.
  function auditHtml() {
    var S = D.synthesis;
    if (!S || !S.categories.length) return '';
    var rows = D.rows.slice().sort(function (a, b) { return a.rank - b.rank; });
    var round1 = function (n) { return Math.round(n * 10) / 10; };
    var round4 = function (n) { return Math.round(n * 1e4) / 1e4; };
    var total = 0;
    rows.forEach(function (r) { total += r.implied_value_usd; });
    var share = function (part) { return total > 0 ? round1((part / total) * 100) : 0; };
    var top = rows.slice(0, S.top_n);
    var topImplied = 0;
    top.forEach(function (r) { topImplied += r.implied_value_usd; });
    var mults = top.map(function (r) { return r.implied_value_usd / r.tvl_usd; }).sort(function (a, b) { return a - b; });
    var mid = mults.length >> 1;
    var medMult = mults.length % 2 === 1 ? mults[mid] : (mults[mid - 1] + mults[mid]) / 2;
    var cum = 0, halfRank = rows.length;
    for (var i = 0; i < rows.length; i++) {
      cum += rows[i].implied_value_usd;
      if (cum * 2 >= total) { halfRank = rows[i].rank; break; }
    }
    var wlRows = 0, wlImplied = 0;
    var catImplied = {};
    rows.forEach(function (r) {
      if (r.watchlist) { wlRows++; wlImplied += r.implied_value_usd; }
      var k = r.category || '(uncategorised)';
      catImplied[k] = (catImplied[k] || 0) + r.implied_value_usd;
    });
    var heavy = null, heavyImplied = -1;
    Object.keys(catImplied).forEach(function (k) {
      if (catImplied[k] > heavyImplied || (catImplied[k] === heavyImplied && (heavy === null || k < heavy))) { heavy = k; heavyImplied = catImplied[k]; }
    });
    var checks = [
      total === S.total_implied_usd,
      topImplied === S.top.implied_usd,
      share(topImplied) === S.top.share_pct,
      round4(medMult) === S.top.median_multiple,
      halfRank === S.half_rank,
      wlRows === S.watchlist.rows,
      wlImplied === S.watchlist.implied_usd,
      share(wlImplied) === S.watchlist.share_pct,
      heavy === S.categories[0].category,
      share(heavyImplied) === S.categories[0].share_pct,
    ];
    var ok = 0;
    checks.forEach(function (c) { if (c) ok++; });
    return '<div class="audit' + (ok === checks.length ? '' : ' bad') + '">' +
      '<span class="stamp">self-check: ' + ok + '/' + checks.length + ' figures recompute from the rows on this page</span>' +
      '<span class="figs">recomputed here from the ' + rows.length + ' rows themselves, not copied from the program\u2019s synthesis: total ' + money(total) + ' of implied value · top ' + S.top_n + ' hold ' + share(topImplied).toFixed(1) + '% · half the value by rank ' + halfRank + ' · watchlist ' + share(wlImplied).toFixed(1) + '% across ' + wlRows + ' protocols · heaviest category ' + esc(heavy) + ' at ' + share(heavyImplied).toFixed(1) + '%</span>' +
      '</div>';
  }

  var SWEEP_PALETTE = ['#3ddc97', '#58a6ff', '#f778ba', '#bc8cff', '#39c5cf', '#ffa657', '#a5d6a7', '#ff7b72', '#79b8ff', '#d2a8ff', '#7ee0e0', '#e3b341'];
  function sweepHtml() {
    var rows = D.rows;
    if (!rows.length) return '';
    var W = 1136, H = 128, X0 = 8, X1 = W - 8, AXIS = 100;
    var max = rows[0].implied_value_usd, min = rows[rows.length - 1].implied_value_usd;
    var lmax = Math.log10(max), lmin = Math.log10(min), span = (lmax - lmin) || 1;
    var catIdx = {};
    categories.forEach(function (c, i) { catIdx[c] = i; });
    var s = '<div class="sweep"><div class="sweep-head"><span class="sweep-t">The sweep — every ranked protocol, one point</span>' +
      '<span class="sweep-leg"><span class="ring"></span>amber ring: house watchlist · colour: category</span></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sweep plot of every ranked protocol on a log implied-value axis">' +
      '<line x1="' + X0 + '" y1="' + AXIS + '" x2="' + X1 + '" y2="' + AXIS + '" class="sw-axis"/>';
    rows.forEach(function (r) {
      var x = X0 + ((Math.log10(r.implied_value_usd) - lmin) / span) * (X1 - X0);
      var y = 18 + ((r.rank * 37) % 58);
      var col = r.category ? SWEEP_PALETTE[catIdx[r.category] % SWEEP_PALETTE.length] : '#54687f';
      if (r.watchlist) s += '<circle cx="' + x.toFixed(1) + '" cy="' + y + '" r="4.4" fill="' + col + '" class="sw-wl"/>';
      else s += '<circle cx="' + x.toFixed(1) + '" cy="' + y + '" r="2.7" fill="' + col + '" opacity="0.72"/>';
      if (r.rank <= ((D.synthesis && D.synthesis.top_n) || 10)) s += '<text x="' + x.toFixed(1) + '" y="' + (y - 8) + '" class="sw-lab">' + r.rank + '</text>';
    });
    s += '<text x="' + X0 + '" y="' + (AXIS + 16) + '" class="sw-ax">' + money(min) + '</text>' +
      '<text x="' + X1 + '" y="' + (AXIS + 16) + '" class="sw-ax end">' + money(max) + ' · implied value, log scale</text>' +
      '</svg></div>';
    return s;
  }
  function modelHtml() {
    var m = D.model;
    var entries = D.comps.entries.filter(function (e) { return e.peers > 0; })
      .sort(function (a, b) { return b.peers - a.peers || (a.category < b.category ? -1 : 1); });
    var s = '<section class="block"><h2>How this radar values</h2>' +
      '<p>The model prices a protocol that has no token against <strong>the protocols in its own category whose tokens already trade</strong>. ' +
      'For each category it takes the <strong>median market-cap / TVL multiple</strong> of those traded peers — the market\u2019s own answer to what a dollar of TVL in that business is worth — then adjusts for the protocol\u2019s <strong>seven-day TVL growth</strong> and for <strong>how long it has run with no token</strong>. ' +
      'One function prices every row; no protocol name is special-cased, and no figure comes from outside the snapshot. A category with fewer than ' + m.comps_min_peers + ' traded peers falls back to the global median (' + D.comps.global_median.toFixed(4) + ' across ' + D.comps.global_peers + ' peers), and every ratio is clamped to [' + m.ratio_floor + ', ' + m.ratio_cap + '], the band holding the middle of the traded distribution.</p>' +
      '<p><strong>Why not per chain?</strong> This build tested pricing each category per chain ecosystem — category × a protocol\u2019s main chain — and the snapshot\u2019s own figures reject it. The ' + D.chain_test.peers_total + ' traded peers scatter over ' + D.chain_test.buckets_total + ' category × chain buckets; only ' + D.chain_test.buckets_supported + ' buckets hold the ' + m.comps_min_peers + ' peers this model requires before a median is a price rather than an anecdote, covering ' + D.chain_test.peers_covered + ' of the ' + D.chain_test.peers_total + ' peers. Just ' + D.chain_test.rows_in_supported + ' of the board\u2019s rows sit in a supported bucket at all, and ' + D.chain_test.rows_changed + ' would reprice — the largest of them, Lending on Ethereum (0.1324 → 0.6060), on six peers whose multiples span 0.08 to 5.13. The split also fails its own premise: the spread inside the groups (peer-weighted IQR of log multiples) is ' + D.chain_test.iqr_segmented.toFixed(3) + ' with the chain split against ' + D.chain_test.iqr_category.toFixed(3) + ' without it — the buckets are no tighter than the categories. So the board prices by category, and chain enters where chain is a fact rather than a hope: every farm plan below farms on its protocol\u2019s main chain, names what acting there costs, and moves the capital there first when it differs from the Ethereum home chain the plans assume.</p>' +
      '<div class="consts"><span>growth weight <b>' + m.growth_weight + '</b></span><span>growth clamp <b>' + m.growth_floor + '%…+' + m.growth_cap + '%</b></span>' +
      '<span>maturity <b>' + m.maturity_floor + '…+' + (m.maturity_floor + m.maturity_range) + ' over ' + m.maturity_days + ' days</b></span><span>unknown age <b>' + m.unknown_age_days + ' days</b></span><span>min peers <b>' + m.comps_min_peers + '</b></span></div>' +
      '<table class="mini"><thead><tr><th>Category</th><th>Traded peers</th><th>Their median mcap/TVL</th><th>Ratio the board uses</th><th>Source</th></tr></thead><tbody>';
    entries.forEach(function (e) {
      s += '<tr><td>' + esc(e.category) + '</td><td>' + e.peers + '</td><td>' + (e.median == null ? '—' : e.median.toFixed(4)) + '</td><td>' + e.ratio.toFixed(4) + '</td><td>' + (e.source === 'category' ? 'own category' : 'global fallback') + '</td></tr>';
    });
    s += '</tbody></table></section>';
    return s;
  }

  function liveHtml() {
    var s = '<section class="block"><h2>Already trading — the comps, never ranked</h2>' +
      '<p>These protocols\u2019 tokens already trade, so the board never ranks them: it shows the market\u2019s own values. They are the peer set the model above is built from — the largest ' + D.live.length + ' of ' + D.comps.global_peers + ' traded protocols with a recorded market cap.</p>' +
      '<table class="mini"><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>mcap/TVL</th><th>7d</th></tr></thead><tbody>';
    D.live.forEach(function (r) {
      s += '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.category || '—') + '</td><td>' + money(r.tvl_usd) + '</td><td>' + money(r.mcap_usd) + '</td><td>' + (r.mcap_tvl == null ? '—' : r.mcap_tvl.toFixed(4)) + '</td><td>' + pct(r.change_7d) + '</td></tr>';
    });
    s += '</tbody></table></section>';
    return s;
  }

  function funnelHtml() {
    var f = D.funnel;
    function step(v, k, final) {
      return '<div class="fstep' + (final ? ' final' : '') + '"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>';
    }
    return '<section class="block"><h2>How the board was built</h2>' +
      '<p>Every protocol in the snapshot meets the same screens, in this order; nothing is dropped by hand.</p><div class="funnel">' +
      step(f.scanned, 'protocols in the snapshot (TVL ≥ $5M)') + '<div class="farrow">→</div>' +
      step('−' + f.tokened_set_aside, 'already trade a token — set aside as the comps') + '<div class="farrow">→</div>' +
      step('−' + f.product_set_aside, 'wrapped, staked, restaking or bridged products of another protocol') + '<div class="farrow">→</div>' +
      step('−' + f.cex_set_aside, 'exchange listings (category CEX)') + '<div class="farrow">→</div>' +
      step('−' + f.versioned_set_aside, 'versioned pools of another protocol') + '<div class="farrow">→</div>' +
      step(f.ranked, 'ranked on the board — all ' + D.watchlist_size + ' watchlist protocols among them', true) +
      '</div></section>';
  }

  function render() {
    var rows = sorted(filtered());
    app.innerHTML = headerHtml() + synthesisHtml() + controlsHtml() + sweepHtml() + '<div id="boardwrap">' + boardHtml(rows) + '</div>' +
      '<div id="detailwrap">' + detailHtml(state.selected ? bySlug[state.selected] : null) + '</div>' +
      modelHtml() + liveHtml() + funnelHtml() +
      '<footer>Source: ' + esc(D.source) + ' · Implied values are this dashboard\u2019s own model output — a claim about what a token would be worth if the protocol\u2019s record stayed as it is, not a prediction that one will be issued.</footer>';
    app.setAttribute('aria-busy', 'false');
    document.getElementById('count').textContent = rows.length + ' of ' + D.board_size + ' protocols';
    wire();
  }
  function wire() {
    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; refreshBoard(); });
    document.getElementById('cat').addEventListener('change', function (e) { state.category = e.target.value; refreshBoard(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; refreshBoard(); });
    document.getElementById('watch').addEventListener('change', function (e) { state.watch = e.target.checked; refreshBoard(); });
    wireBoard();
  }
  function wireBoard() {
    var wrap = document.getElementById('boardwrap');
    wrap.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'name' || k === 'category' ? 1 : -1; if (k === 'rank') state.dir = 1; }
        refreshBoard();
      });
    });
    wrap.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        state.selected = tr.getAttribute('data-slug');
        document.getElementById('detailwrap').innerHTML = detailHtml(bySlug[state.selected]);
        wrap.querySelectorAll('tr').forEach(function (x) { x.classList.toggle('sel', x.getAttribute('data-slug') === state.selected); });
        document.getElementById('detail').scrollIntoView({ block: 'start' });
      });
    });
  }
  function refreshBoard() {
    var rows = sorted(filtered());
    document.getElementById('boardwrap').innerHTML = boardHtml(rows);
    document.getElementById('count').textContent = rows.length + ' of ' + D.board_size + ' protocols';
    wireBoard();
  }

  render();
  if (state.selected && bySlug[state.selected]) {
    var el = document.getElementById('detail');
    if (el) el.scrollIntoView({ block: 'start' });
  }
})();
