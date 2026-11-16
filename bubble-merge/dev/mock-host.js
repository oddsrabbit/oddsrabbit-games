// A stand-in host for trying the leaderboard locally: open the game with
// ?mockhost (http://localhost:8765/bubble-merge/?mockhost). index.html loads
// this after the real SDK, which 404s when the game is served from the repo.
//
// It answers the verbs js/scores.js uses: a signed-in player ("You"), storage
// in localStorage under "mockhost:", and two boards filled with made-up
// players that your own submitted scores join. Nothing leaves the browser.
(function () {
  const KEY = (k) => 'mockhost:' + k;
  const NAMES = ['bunbun', 'clover_k', 'mochi_lop', 'hopscotch', 'thumper22', 'velvet.rex', 'dandelion', 'pipsqueak',
    'binky_queen', 'flopsy', 'nibbles', 'cottontail', 'snowpea', 'marigold', 'juniper', 'radish', 'biscuit', 'pudding'];
  const fake = (seed, max) => NAMES.map((name, i) => ({
    uuid: 'p' + i, username: name, avatar: null, metadata: null,
    score: Math.round(max * Math.pow(0.86, i) * (0.9 + ((i * seed) % 7) / 35)),
    createdAt: new Date(Date.now() - i * 3600e3).toISOString(),
  }));
  function board(roundKey) {
    const list = roundKey === 'highscore' ? fake(3, 4200) : fake(5, 2400);
    const mine = parseInt(localStorage.getItem(KEY('score:' + roundKey)), 10);
    if (mine > 0) list.push({ uuid: 'me', username: 'You', avatar: null, metadata: null, score: mine, createdAt: new Date().toISOString() });
    return list.sort((a, b) => b.score - a.score);
  }
  const later = (v) => new Promise((r) => setTimeout(() => r(v), 250));

  window.OddsRabbit = {
    whenReady: () => Promise.resolve(),
    user: { uuid: 'me', username: 'You' },
    capabilities: { has: () => true },
    storage: {
      get: (k) => Promise.resolve(localStorage.getItem(KEY(k))),
      set: (k, v) => { localStorage.setItem(KEY(k), v); return Promise.resolve(); },
      delete: (k) => { localStorage.removeItem(KEY(k)); return Promise.resolve(); },
    },
    scores: {
      submit({ roundKey, score, keepBest }) {
        const prev = parseInt(localStorage.getItem(KEY('score:' + roundKey)), 10) || 0;
        if (!keepBest || score > prev) localStorage.setItem(KEY('score:' + roundKey), String(score));
        console.info('mock host: submitted', roundKey, score);
        return later({});
      },
      top: ({ roundKey, limit }) => later(board(roundKey).slice(0, limit || 100)),
      rank({ roundKey }) {
        const list = board(roundKey);
        const i = list.findIndex((r) => r.uuid === 'me');
        return later(i < 0 ? null : { rank: i + 1, total: list.length, entry: list[i] });
      },
    },
    actions: { haptic: () => Promise.resolve(), share: () => Promise.resolve() },
  };
})();
