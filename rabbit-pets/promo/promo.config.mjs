// Rabbit Pets' promo videos, made with promo-kit (../../promo-kit). Build the game first
// (`npm run build` at the repo root), then from promo/:
//   npm install
//   npx promo all        # record everything, cut the reel and the shorts, write safe-zone checks
//   npx promo record --shorts decorate && npx promo shorts   # redo one scene of the shorts
// Videos land in out/ (not committed); post text is in captions.txt.
export default {
  serve: { root: '..' },
  font: '../fonts/press-start-2p-latin.woff2',
  endcard: {
    title: 'Rabbit Pets',
    tagline: 'A cozy pet that lives<br>in real time',
    cta: 'Play at oddsrabbit.com/games',
    image: '../icon-512.png',
  },
  music: false, // silent: add sound on the platform. Was { bpm: 120, duration: 28 }
  reel: {
    file: 'rabbit-pets-reel.mp4',
    scenes: [['adopt', 3.0], ['feed', 3.0], ['play', 3.5], ['decorate', 6.0], ['garden', 2.5], ['visitor', 2.5], ['winter', 2.5], ['end', 3.8]],
  },
  shorts: {
    dir: 'shorts',
    clips: {
      'rabbit-pets-care': ['adopt', 'feed', 'play'],
      'rabbit-pets-decorate': ['decorate'],
      'rabbit-pets-garden-and-friends': ['garden', 'visitor', 'winter'],
    },
    // each short opens on its first caption, so those are written as hooks
    hooks: {
      'Adopt your own<br>tiny rabbit': 'POV: your new<br>pixel bunny',
      'Decorate her<br>cozy burrow': 'Decorating my<br>bunny\'s burrow',
      'Grow a garden<br>together': 'Her garden<br>grows in<br>real time',
    },
  },
};
