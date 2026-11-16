// Scores, leaderboards and sharing, done the way the other arcade games do them
// (flappy-rabbits and match3: storage_manager.js, application.js submitBests(),
// leaderboard.js):
//
//   • Two public boards: This Month (round "month-YYYY-MM", UTC) and All Time
//     ("highscore"). Both submit with keepBest, so the server keeps the max
//     under a key written more than once.
//   • Submissions are confirmed and retried: storage records what the platform
//     ACCEPTED, and any gap between that and the real best is retried on load,
//     on game over, and when the page is hidden or shown again.
//   • Guests never submit (the endpoint needs a signed-in user).
//   • The Leaderboard buttons stay hidden unless the host says it can serve a
//     global board (capabilities "scores.top"), checked after whenReady.
//   • The board itself is the shared component (window.OddsRabbitUI from
//     ../leaderboard-v1.js), so rows, medals, avatars and the pinned "you" row
//     match every other game.
//
// Unlike those games this one also runs on its own (no host, no SDK): the
// bests are kept in localStorage too, and everything platform-side quietly
// switches off.
(function () {
  const RM = (window.RM = window.RM || {});
  const OR = () => window.OddsRabbit || null;
  const UI = () => window.OddsRabbitUI || null;

  const HIGHSCORE = 'highscore';
  const LANDING_URL = 'https://www.oddsrabbit.com/games/bubble-merge/';
  const LOCAL_KEY = 'bubble-merge:scores:v1';
  // Bridge storage keys, the same names as flappy-rabbits and match3.
  const K = { best: 'bestScore', month: 'monthBest', sentBest: 'submittedBest', sentMonth: 'submittedMonthBest' };

  /** `YYYY-MM` in UTC, the same rule as the shared UI's currentPeriod. */
  function currentPeriod(date) {
    const d = date || new Date();
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }
  const monthRoundKey = (period) => 'month-' + (period || currentPeriod());
  function parseStamped(raw) {
    if (raw == null) return null;
    const m = /^(\d{4}-(?:0[1-9]|1[0-2])):(\d+)$/.exec(String(raw));
    return m ? { period: m[1], score: parseInt(m[2], 10) } : null;
  }
  const stamp = (p) => p.period + ':' + p.score;

  // ---------- state ----------
  const st = { best: 0, month: null, sentBest: 0, sentMonth: null };
  try {
    // Bests from before the rename (Rabbit Merge) carry over.
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || localStorage.getItem('rabbit-merge:scores:v1') || '{}');
    st.best = saved.best | 0;
    st.month = parseStamped(saved.month);
  } catch (e) { /* private mode */ }
  function persistLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ best: st.best, month: st.month ? stamp(st.month) : null })); } catch (e) { /* fine */ }
  }
  let bridge = null;
  const bridgeSet = (key, value) => { if (bridge) bridge.set(key, String(value)).catch(() => {}); };

  const monthBest = (p) => (st.month && st.month.period === (p || currentPeriod()) ? st.month.score : 0);
  const sentMonthBest = (p) => (st.sentMonth && st.sentMonth.period === (p || currentPeriod()) ? st.sentMonth.score : 0);

  // ---------- platform ----------
  let ready = false;
  const listeners = [];
  function has(cap) {
    const or = OR();
    try { return !!(or && or.capabilities && or.capabilities.has(cap)); } catch (e) { return false; }
  }
  function canSubmit() {
    const or = OR();
    return !!(ready && or && or.user && or.scores && typeof or.scores.submit === 'function' && has('scores.submit'));
  }
  const leaderboardSupported = () => !!(ready && UI() && has('scores.top'));

  // One key at a time, so a failed read of a marker can't take the best down with it.
  const readKey = (key) => bridge.get(key).catch(() => null);

  function hydrate() {
    const or = OR();
    if (!or || !or.whenReady) return;
    or.whenReady().then(() => {
      if (!or.storage) return null;
      bridge = or.storage;
      return Promise.all([readKey(K.best), readKey(K.month), readKey(K.sentBest), readKey(K.sentMonth)]).then((v) => {
        // The bridge is the player's own store; this browser may know a
        // better score from before they signed in, so keep the higher.
        const best = parseInt(v[0], 10);
        if (!isNaN(best) && best > st.best) st.best = best;
        else if (st.best > 0) bridgeSet(K.best, st.best);
        const month = parseStamped(v[1]);
        if (month && month.period === currentPeriod() && month.score > monthBest()) st.month = month;
        else if (monthBest() > 0) bridgeSet(K.month, stamp(st.month));
        const sent = parseInt(v[2], 10);
        if (!isNaN(sent)) st.sentBest = sent;
        st.sentMonth = parseStamped(v[3]);
        persistLocal();
      });
    }).catch((e) => console.warn('bubble-merge: storage hydrate failed', e)).then(() => {
      ready = true;
      submitBests();
      for (const fn of listeners) fn();
    });
  }

  // Submit whatever the platform hasn't confirmed yet, for both rounds. Only a
  // success recurses (to pick up a best beaten while it was in flight); a
  // failure waits for the next trigger, so a host that always rejects can't spin.
  let bestInFlight = false, monthInFlight = false;
  function submitBests() {
    if (!canSubmit()) return;
    const scores = OR().scores;
    const best = st.best;
    if (best > 0 && best > st.sentBest && !bestInFlight) {
      bestInFlight = true;
      Promise.resolve().then(() => scores.submit({ roundKey: HIGHSCORE, score: best, keepBest: true, metadata: { best: true } }))
        .then(() => { bestInFlight = false; st.sentBest = best; bridgeSet(K.sentBest, best); submitBests(); })
        .catch((e) => { bestInFlight = false; console.warn('bubble-merge: score submit failed for ' + HIGHSCORE, e); });
    }
    const period = currentPeriod();
    const mb = monthBest(period);
    if (mb > 0 && mb > sentMonthBest(period) && !monthInFlight) {
      monthInFlight = true;
      Promise.resolve().then(() => scores.submit({ roundKey: monthRoundKey(period), score: mb, keepBest: true, metadata: { period } }))
        .then(() => { monthInFlight = false; st.sentMonth = { period, score: mb }; bridgeSet(K.sentMonth, stamp(st.sentMonth)); submitBests(); })
        .catch((e) => { monthInFlight = false; console.warn('bubble-merge: score submit failed for ' + monthRoundKey(period), e); });
    }
  }
  document.addEventListener('visibilitychange', submitBests);

  /** Records a finished game. Returns { isNewBest, best }. */
  function recordScore(score) {
    const isNewBest = score > st.best;
    if (isNewBest) { st.best = score; bridgeSet(K.best, score); }
    const period = currentPeriod();
    if (score > monthBest(period)) { st.month = { period, score }; bridgeSet(K.month, stamp(st.month)); }
    persistLocal();
    submitBests();
    return { isNewBest, best: st.best };
  }

  // ---------- leaderboard ----------
  function openLeaderboard() {
    const or = OR(), ui = UI();
    if (!or || !ui) return;
    const period = currentPeriod();
    const loadBoard = (roundKey) => or.scores.top({ roundKey, order: 'top', limit: 100 }).then((rows) => {
      if (!has('scores.top')) {
        for (const fn of listeners) fn();
        const err = new Error('scores.top is unsupported on this host');
        err.unsupported = true;
        throw err;
      }
      return rows;
    });
    const pinned = (roundKey) => (has('scores.rank') && typeof ui.pinnedFromRank === 'function'
      ? () => or.scores.rank({ roundKey, order: 'top' }).then(ui.pinnedFromRank)
      : undefined);
    const errorText = (e) => (e && e.unsupported
      ? "Leaderboards aren't available in this version of the app."
      : "Couldn't load the leaderboard. Try again.");
    const formatValue = (row) => Number(row.score).toLocaleString();
    ui.openLeaderboardModal({
      title: 'Leaderboard',
      viewerUuid: or.user && or.user.uuid ? or.user.uuid : null,
      tabs: [
        {
          id: 'month', label: 'This Month',
          emptyText: 'No scores this month yet — play a game to get on the board.',
          load: () => loadBoard(monthRoundKey(period)),
          loadPinned: pinned(monthRoundKey(period)),
          errorText, formatValue,
          renderHeader: () => {
            const note = document.createElement('p');
            note.className = 'lb-note';
            note.textContent = 'Best score in ' + (typeof ui.formatPeriod === 'function' ? ui.formatPeriod(period) : period) + '. Resets on the 1st.';
            return note;
          },
        },
        {
          id: 'alltime', label: 'All Time',
          emptyText: 'No scores yet — play a game to get on the board.',
          load: () => loadBoard(HIGHSCORE),
          loadPinned: pinned(HIGHSCORE),
          errorText, formatValue,
        },
      ],
    });
  }

  // ---------- share ----------
  // The same modal as flappy-rabbits and match3: a preview, Copy, native share
  // on touch, then social links.
  const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  function shareTitle(r) {
    return r.isNewBest ? 'Bubble Merge — new high score: ' + r.score : 'Bubble Merge — score: ' + r.score;
  }
  function openShare(result, toast) {
    const title = shareTitle(result);
    const text = title + '\n\nPlay at ' + LANDING_URL;
    const back = document.createElement('div');
    back.className = 'share-backdrop';
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    back.setAttribute('aria-labelledby', 'share-title');
    const card = document.createElement('div');
    card.className = 'card share-card';
    const h = document.createElement('h2'); h.id = 'share-title'; h.className = 'title'; h.textContent = 'Share your result';
    const pre = document.createElement('div'); pre.className = 'share-preview'; pre.textContent = text;
    const btn = (label, action, cls) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = label; b.dataset.action = action;
      return b;
    };
    const social = document.createElement('div'); social.className = 'share-social';
    for (const [label, action] of [['X', 'twitter'], ['Threads', 'threads'], ['Bluesky', 'bluesky'], ['Reddit', 'reddit'], ['WhatsApp', 'whatsapp'], ['Facebook', 'facebook']]) {
      const b = btn(label, action, 'small'); b.setAttribute('aria-label', 'Share to ' + label); social.append(b);
    }
    const label = document.createElement('p'); label.className = 'label share-label'; label.textContent = 'Share to social';
    card.append(h, pre, btn('Copy result', 'copy', 'primary'));
    const or = OR();
    if (IS_TOUCH && or && or.actions && typeof or.actions.share === 'function') card.append(btn('Share via apps…', 'native'));
    card.append(label, social, btn('Close', 'close'));
    back.append(card);
    document.body.append(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const open = (url) => window.open(url, '_blank', 'noopener,noreferrer');
    back.addEventListener('click', (e) => {
      if (e.target === back) return close();
      const a = e.target && e.target.dataset ? e.target.dataset.action : null;
      if (a === 'close') close();
      else if (a === 'copy') {
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
          .then(() => toast('Copied to clipboard'), () => toast('Could not copy'));
      } else if (a === 'native') {
        try { or.actions.share({ title: 'Bubble Merge', text }).catch(() => toast('Could not share')); } catch (err) { toast('Could not share'); }
      } else if (a === 'twitter') open('https://x.com/intent/post?text=' + encodeURIComponent(text));
      else if (a === 'threads') open('https://www.threads.net/intent/post?text=' + encodeURIComponent(text));
      else if (a === 'bluesky') open('https://bsky.app/intent/compose?text=' + encodeURIComponent(text));
      else if (a === 'reddit') open('https://www.reddit.com/submit?url=' + encodeURIComponent(LANDING_URL) + '&title=' + encodeURIComponent(title));
      else if (a === 'whatsapp') open('https://wa.me/?text=' + encodeURIComponent(text));
      else if (a === 'facebook') open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(LANDING_URL));
    });
    card.querySelector('button').focus({ preventScroll: true });
  }

  RM.Scores = {
    getBest: () => st.best,
    recordScore,
    submitBests,
    leaderboardSupported,
    openLeaderboard,
    openShare,
    /** Called once the host has answered (or never, without one), and if support changes. */
    onChange(fn) { listeners.push(fn); if (ready) fn(); },
  };
  hydrate();
})();
