// Sprites for the shop's newer things: tier 2 decor, the fireplace, toys, yard
// buildings, seasonal items and seasonal finds. Drawn as fill only; the
// outline is added around every shape (outline() in pixels.ts), which keeps
// the grids easy to edit. Colours share items.ts's palette letters, plus a few
// below.

export const SHOP_PALETTE: Record<string, string> = {
  a: '9AA3AD', A: '6B737C', x: '2E2233', z: 'FFB347', q: 'A0C8E8', Q: '6E9BC8', u: 'C7A06A', U: '9C7443',
  i: 'E8F4FA', j: '7B4A8E', l: 'F7C6D0',
};

export const SHOP_ART = {
  // ---------------------------------------------------------------- tier 2
  flowerbox: [
    '.p...y...r..', 'pyp.yry.rwr.', '.p...y...r..', '.g..gG..g.g.', '.Gg.G..gG.G.',
    'nnnnnnnnnnnn', 'nNnnnnnnnnNn', 'NNNNNNNNNNNN',
  ],
  herbs: [
    '....n....', '...nnn...', '...UuU...', '..gGgGg..', '.gGgGgGg.', 'gGg.G.gGg', 'Gg..G..gG', '.G..g..G.',
  ],
  kettle: [
    '....aaaa....', '...a....a...', '.....rr.....', '..rrrrrrrr..', '.rwwrrrrrrr.', 'rrwrrrrrrrrrr',
    'rrrrrrrrrrRR.', '.rrrrrrrrRR..', '..RRRRRRRR...',
  ],
  patchcushion: [
    '..pppyyybbb...', '.ppppyyyybbbb.', 'ppplpyywybbqbb', 'ppppyyyybbbbbb', 'rrrrgggGeeeeee', 'rrwrggGgeeEeee',
    '.rrrgggGeeeee.', '..RRGGGGEEEE..',
  ],
  bunting: [
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnn', '.rrrr..yyyy..bbbb..pppp..gggg.', '..rr....yy....bb....pp....gg..', '..r......y....b......p....g...',
  ],
  lamp: [
    '...yyyyy...', '..yyyyyyy..', '.YYYYYYYYY.', '.....n.....', '.....n.....', '.....n.....', '.....n.....',
    '.....n.....', '.....n.....', '.....n.....', '....nnn....', '..NNNNNNN..',
  ],
  bookshelf: [
    'nnnnnnnnnnnnnnnn', 'nrrbygvrbbyvgrrn', 'nrrbygvrbbyvgrrn', 'nrRbYGVrBbyVGrRn', 'nnnnnnnnnnnnnnnn',
    'nvgrrybyvgrrbgyn', 'nvgrrybyvgrrbgyn', 'nVGrRYbYVgRrBGyn', 'nnnnnnnnnnnnnnnn', 'nyybgrr..pbvvrgn',
    'nyybgrr..pbvvrgn', 'nYybGRr.PpBVvRGn', 'nnnnnnnnnnnnnnnn', 'NN............NN',
  ],
  hayloft: [
    '.u.u..u...u.u..u..u.', 'uUuyuuUuyuuuUuuyuUuu', 'uuuuUuuuuuUuuuuuuUuu', 'nnnnnnnnnnnnnnnnnnnn',
    'nNNNNNNNNNNNNNNNNNNn', 'nn................nn', 'NN................NN',
  ],
  rocker: [
    '.nnnnnn......', '.nppppn......', '.nppppn......', '.nppppn......', '.nppppn......', '.nppppnnnnnn.',
    '.nppppppppppn', '.nnnnnnnnnnnn', '..n.......n..', '..n.......n..', 'NNNNNNNNNNNNN', '.NN.......NN.',
  ],
  windowseat: [
    'bbbbbbbbbbbbbbbbbbbbbb', 'bqbbqbbqbbqbbqbbqbbqbb', 'BBBBBBBBBBBBBBBBBBBBBB', 'nnnnnnnnnnnnnnnnnnnnnn',
    'nNnnnnnnnNnnnnnnnnNnnn', 'nnnnnnnnnnnnnnnnnnnnnn', 'NN..................NN',
  ],
  teatable: [
    '....w..yY.w.....', '...wwa.YY.ww....', 'cccccccccccccccc', 'cpcccpcccpcccpcc', 'nnnnnnnnnnnnnnnn', '.n............n.',
    '.n............n.', '.n............n.', '.N............N.',
  ],

  // the welcome line (tuning.ts WELCOME): pieces for the meadow; the tea corner is the tea table
  welcomemat: ['RRRRRRRRRRRRRR', 'RpRpRyyyyRpRpR', 'RRRRRRRRRRRRRR'],
  guestchairs: ['.n....n..n....n.', '.nppppn..nppppn.', '.nppppn..nppppn.', '.nnnnnn..nnnnnn.', '.n....n..n....n.', '.N....N..N....N.'],
  lanternpath: ['.y.........y.........y..', 'yyy.......yyy.......yyy.', '.n.........n.........n..', '.n.........n.........n..', '.n.........n.........n..', 'NNN.......NNN.......NNN.'],
  friendtree: [
    '......gggg........', '....ggGggggg......', '...gggggrggGgg....', '..gGggggggggggg...',
    '.ggggrgggGgggrgg..', '.ggGgggggggggggg..', 'gggggggGggrgggggg.', 'grgggggggggggGggg.',
    '.gggGgggrggggggg..', '..gggggggggGggg...', '...gggrgnggggg....', '.....ggnngg.......',
    '.......nn.........', '.......nN.........', '.......nN.........', '.......nN.........',
    '......nnNN........', '.....nN..Nn.......',
  ],
  // ---------------------------------------------------------------- showpieces: long-term goals
  // the four-seasons tree, one grid per season (render.ts picks by the season)
  tree_spring: [
    '......llll........', '....llplllll......', '...lllllwllpll....', '..lplllllllllll...',
    '.llllwlllplllwll..', '.llpllllllllllll..', 'lllllllpllwllllll.', 'lwlllllllllllplll.',
    '.lllplllwlllllll..', '..lllllllllplll...', '...lllwlnlllll....', '.....llnnll.......',
    '.......nn.........', '.......nN.........', '.......nN.........', '.....OOOOOOO......',
    '.....OoOOOOO......', '......OOOOO.......', '......ooooo.......',
  ],
  tree_summer: [
    '......gggg........', '....ggGggggg......', '...gggggrggGgg....', '..gGggggggggggg...',
    '.ggggrgggGgggrgg..', '.ggGgggggggggggg..', 'gggggggGggrgggggg.', 'grgggggggggggGggg.',
    '.gggGgggrggggggg..', '..gggggggggGggg...', '...gggrgnggggg....', '.....ggnngg.......',
    '.......nn.........', '.......nN.........', '.......nN.........', '.....OOOOOOO......',
    '.....OoOOOOO......', '......OOOOO.......', '......ooooo.......',
  ],
  tree_autumn: [
    '......OOOO........', '....OOoOOOOO......', '...OOOOOyOOoOO....', '..OoOOOOOOOOOOO...',
    '.OOOOyOOOoOOOyOO..', '.OOoOOOOOOOOOOOO..', 'OOOOOOOoOOyOOOOOO.', 'OyOOOOOOOOOOOoOOO.',
    '.OOOoOOOyOOOOOOO..', '..OOOOOOOOOoOOO...', '...OOOyOnOOOOO....', '.....OOnnOO.......',
    '.......nn.........', '.......nN.........', '.......nN.........', '.....OOOOOOO......',
    '.....OoOOOOO......', '......OOOOO.......', '......ooooo.......',
  ],
  tree_winter: [
    '......wwww........', '....wwiwwwww......', '...wwwwwywwiww....', '..wiwwwwwwwwwww...',
    '.wwwwywwwiwwwyww..', '.wwiwwwwwwwwwwww..', 'wwwwwwwiwwywwwwww.', 'wywwwwwwwwwwwiwww.',
    '.wwwiwwwywwwwwww..', '..wwwwwwwwwiwww...', '...wwwywnwwwww....', '.....wwnnww.......',
    '.......nn.........', '.......nN.........', '.......nN.........', '.....OOOOOOO......',
    '.....OoOOOOO......', '......OOOOO.......', '......ooooo.......',
  ],
  fireflies: [
    '...nnn...', '..n...n..', '.NNNNNNN.', '.bbbbbbb.', '.bybbbyb.', '.bbbybbb.', '.bbbbbyb.', '.bybbbbb.', '.bbbbbbb.', '.NNNNNNN.',
  ],
  wishingwell: [
    '..........rr..........', '........rrrrrr........', '......rrrrRrrrrr......', '....rrrrrrrrrRrrrr....',
    '..rrrrRrrrrrrrrrrRrr..', 'rrrrrrrrrrrrrrrrrrrrrr', '..n.......N.......n...', '..n.......N.......n...',
    '..n......uUu......n...', '..n......uuu......n...', '..n...............n...', 'aaaaaaaaaaaaaaaaaaaaaa',
    'aAaaAaaaAaaaAaaaAaaAaa', 'aaAaaaAaaaaAaaaAaaaAaa', 'aaaaAaaaaAaaaaaAaaaaaa', 'AAAAAAAAAAAAAAAAAAAAAA',
  ],
  // ---------------------------------------------------------------- tier 3 and long-term goals
  fireplace: [
    '..AAAAAAAAAAAAAAAAAAAA..',
    'AAaAAAaAAAAaAAAAaAAAaAAA',
    'aaaaaaaaaaaaaaaaaaaaaaaa',
    '.aAaaAaaAaaaaAaaAaaAaaA.',
    '.aaAaxxxxxxxxxxxxxxaAaa.',
    '.aaaxxxxxxxxxxxxxxxxaaa.',
    '.aAaxxxxxxxxxxxxxxxxaAa.',
    '.aaaxxxxxxxxxxxxxxxxaaa.',
    '.aAaxxxxxxxxxxxxxxxxaAa.',
    '.aaaxxxxxxxxxxxxxxxxaaa.',
    '.aAaxxxxxxxxxxxxxxxxaAa.',
    '.aaaxxxxxxxxxxxxxxxxaaa.',
    '.aAaxxxxxxxxxxxxxxxxaAa.',
    '.aaaxxxxxxxxxxxxxxxxaaa.',
    '.aAaxxxxxnNnNnnxxxxxaAa.',
    'AAAAAAAAAAAAAAAAAAAAAAAA',
  ],
  flame1: ['...y....', '..yzy...', '..yzy.y.', '.yzOzyzy', '.zOOOzOz', 'zOOoOOOz', '.OoooOO.'],
  flame2: ['.....y..', '..y.yzy.', '.yzyyzy.', '.yzOzOzy', 'yzOOOOOz', 'zOOooOOz', '.OoooOO.'],
  clock: [
    '..nnnnnnn..', '.nnwwwwwnn.', 'nnwwwkwwwnn', 'nnwwwkwwwnn', 'nnwwwkkkwnn', 'nnwwwwwwwnn', '.nnwwwwwnn.',
    '..nnnnnnn..', '..nxxxxxn..', '..nxxxxxn..', '..nxxxxxn..', '..nxxxxxn..', '..nxxxxxn..', '..nxxxxxn..',
    '..nxxxxxn..', '..nxxxxxn..', '.nnnnnnnnn.', '.nNnnnnnNn.', '.NNNNNNNNN.',
  ],

  // ---------------------------------------------------------------- toys
  ball: ['..rrr..', '.rwrrr.', 'rwrrryr', 'rrrryyr', 'rrryyrr', '.RRrrR.', '..RRR..'],
  yarn: ['..ppp...', '.pPpPp..', 'pPpPpPp.', 'ppPpPpp.', 'pPpPpPp.', '.pPpPp.p', '..ppp..p'],
  box: ['u.......u', 'uu.....uu', 'uuuuuuuuu', 'uUUUUUUUu', 'uUuuuuuUu', 'uUuuuuuUu', 'uUuuuuuUu', 'UUUUUUUUU'],
  tunnel: ['...eeeeeee...', '..eEeeeeeEe..', '.eEe.....eEe.', 'eEe.......eEe', 'eEe.......eEe', 'EEE.......EEE'],
  swing: ['n.......n', 'n.......n', 'n.......n', 'n.......n', 'n.......n', 'uuuuuuuuu', 'UUUUUUUUU'],
  ballpit: ['.r.y.b.p.g.', 'ryrbyrpbgyr', 'bbbbbbbbbbb', 'bqbbqbbqbbb', 'bbbbbbbbbbb', 'BBBBBBBBBBB'],
  maze: ['yuyuyuyuyuyuy', 'uYuYuYuYuYuYu', 'yu.........uy', 'uY.........Yu', 'yuyuyu..yuyuy', 'UUUUUU..UUUUU'],
  kite: ['....r....', '...rrr...', '..rrwrr..', '.rrrwrrr.', 'rrrrwrrrr', '.bbbwbbb.', '..bbwbb..', '...bbb...', '....b....', '....n....', '...n.....', '....n....'],

  // ---------------------------------------------------------------- yard buildings
  patch: ['.g.gG.g..g.', 'gGgGgGgGgGg', '.GgGgGgGgG.', 'nnnnnnnnnnn', 'NnNnNnNnNnN'],
  hive: ['...yy...', '..yYyY..', '.yYYYYy.', 'yyyyyyyy', 'YYYYYYYY', 'yyyxyyyy', 'YYYYYYYY', '.yyyyyy.', '..nnnn..'],
  log: ['.r.w.r......', 'rrrwrrr.w...', '.w.nnnnnnrrr', '..nNnNnNnNw.', 'nnnnnnnnnnnn', 'nNnNnNnNnNnf', 'nnnnnnnnnnnf', '.NNNNNNNNNN.'],
  shed: ['....nnnn....', '...nNNNNn...', '..nNNNNNNn..', '.nNNNNNNNNn.', 'nNNNNNNNNNNn', '.uuuuuuuuuu.', '.uuuxxxxuuu.', '.uUuxxxxuUu.', '.uuuxxxxuuu.', '.UUUUUUUUUU.'],

  // ---------------------------------------------------------------- seasonal: snow day
  sled: ['r..........', 'rr.........', '.rrrrrrrrrr', '.rRRRRRRRRr', '..n......n.', 'aaaaaaaaaaa'],
  snowman: ['...xxx...', '..xxxxx..', '..wwwww..', '.wxwwxww.', '.wwwOwww.', '..wwwww..', '..rrrrr..', '.wwwwwww.', 'wwwxwwwww',
    'wwwwwwwww', 'wwwxwwwww', '.wwwwwww.'],
  icicles: ['iiiiiiiiiiiiiiiiiii', 'iqiiqiiiqiiqiiiqiiq', '.q..q...q..q...q..q', '.q..q...q..q......q', '....q...q..........'],
  // ---------------------------------------------------------------- spring bloom
  tulips: ['.r..p..y.', 'rrr.p.yyy', 'rRr.pPy.Y', '.G..g..G.', '.G.gG..G.', 'ooooooooo', '.ooooooo.', '..ooooo..'],
  birdhouse: ['....n....', '...rrr...', '..rrrrr..', '.rrrrrrr.', 'rrrrrrrrr', '.bbbbbbb.', '.bbbxbbb.', '.bbbbbbb.', '.bbbnbbb.', '.BBBBBBB.'],
  blossom: ['.p...l...p..', 'plp.lpl.plp.', '.p.n.l.n.p..', 'nnnnnnnnnnnn', '...l.p..l...', '..lpl...plp.', '...l.....p..'],
  // ---------------------------------------------------------------- summer fair
  fan: ['r.y.b.r', 'ryybbrr', '.ryybr.', '..rbr..', '...n...', '...n...'],
  fairlights: ['nnnnnnnnnnnnnnnnnnnnnnnnnn', '.n...n....n....n....n...n.', '.y...r....b....z....p...y.', '.Y...R....B....y....P...Y.'],
  lemonade: ['.yyyyyyyyyyyyyy.', 'ywwywwywwywwywwy', 'yyyyyyyyyyyyyyyy', '.n............n.', '.n..y..y..y...n.', '.nuuuuuuuuuuuun.', '.nuUUUUUUUUUUun.', '.nuuuuuuuuuuuun.', '.nuUUUUUUUUUUun.', '.NNNNNNNNNNNNNN.'],
  pool: ['...bbbbbbbbbbbbbbbbb...', '.bbqqqqqqqqqqqqqqqqqbb.', 'bbqqiqqqqqqqiqqqqqqqqbb', 'bqqqqqqqiqqqqqqqqqiqqqb', 'bbqqqqqqqqqqqqqqqqqqqbb', '.bbbbbbbbbbbbbbbbbbbbb.'],
  // ---------------------------------------------------------------- harvest moon
  applecrate: ['.r.rr.R.rr.', 'rRrrRrrRrRr', 'uuuuuuuuuuu', 'uUUUUUUUUUu', 'uuuuuuuuuuu', 'uUUUUUUUUUu', 'UUUUUUUUUUU'],
  scarecrow: ['....uUu....', '...yYyYy...', '..yyyyyyy..', '....fff....', '....fxf....', '....fff....', 'rrrrrrrrrrr', 'u.rrrRrrr.u', '...rrrrr...', '...bbbbb...', '....n.n....', '....n.n....', '.....n.....', '.....n.....', '.....n.....'],
  // ---------------------------------------------------------------- the meadow
  fencelights: ['NNNNNNNNNNNNNNNNNNNNNNNNNNNN', '.y...r...b...y...g...r...b..', '.Y...R...B...Y...G...R...B..'],
  bench: [
    '.N..............N.', 'nnnnnnnnnnnnnnnnnn', 'NNNNNNNNNNNNNNNNNN', '.N..............N.',
    'nnnnnnnnnnnnnnnnnn', 'nnnnnnnnnnnnnnnnnn', 'NNNNNNNNNNNNNNNNNN', '.N..............N.', '.N..............N.',
  ],
  stones: [
    '..aaa.......aaa...', '.aiaaA.....aiaaA..', '..AAA...aaa.AAA...', '.......aiaaA......', '........AAA.......',
  ],
  birdbath: [
    '.aaaaaaaaa.', 'aqQqqiqqQqa', '.aaaaaaaaa.', '..AaaaaaA..', '....aaa....', '....aAa....', '....aAa....',
    '....aAa....', '...aaaaa...', '..AAAAAAA..',
  ],
  sunflowers: [
    '..yyy.......', '.yYnYy..yyy.', '.ynNny.yYnYy', '.yYnYy.ynNny', '..yyy..yYnYy', '...G....yyy.', '..gG.....G..',
    '...G....gG..', '...Gg....G..', '...G....gGg.', '..gG.....G..', '...G.....G..', '.GgGgGgGgGg.', 'GgGgGgGgGgGg',
  ],
  trellis: [
    '....nnnnnnnn....', '..nnpnnnnnnrnn..', '.nnp.g....g.pnn.', '.np..........rn.', 'nng..........gnn', 'nr............pn',
    'nn............nn', 'np............gn', 'ng............nn', 'nn............rn', 'nr............nn', 'nn............pn',
    'np............nn', 'nn............nn', 'NN............NN',
  ],
  wheelbarrow: [
    '...NnnN.........', '.rrrrrrrrrrr..nn', '.rwrrrrrrrrRnn..', '..rrrrrrrrRR....', '...RRRRRRRR.....', '....aa..N..N....',
    '...aAAa.N..N....', '....aa..........',
  ],
  gnome: [
    '....r....', '...rr....', '...rrr...', '..rrrrr..', '..rrrRr..', '.rrrrrrr.', '..fffff..', '..fkfkf..', '.wwwOwww.',
    '.wwwwwww.', '.bwwwwwb.', '.bBwwwBb.', '.bbbybbb.', '.BbbbbbB.', '..nn.nn..',
  ],
  // ---------------------------------------------------------------- spooky week
  candybasket: ['..n....n..', '...nnnn...', 'r.y.p.O.v.', 'ryrpyOvvry', 'uuuuuuuuuu', 'uUuUuUuUuU', '.uuuuuuuu.'],
  ghost: ['....n....', '...www...', '..wwwww..', '.wxwwxww.', '.wwwwwww.', '.wwwxwww.', '.wwwwwww.', 'wwwwwwwww', 'w.ww.ww.w'],
  // ---------------------------------------------------------------- winterfest
  tinytree: ['....y....', '...gGg...', '..gGrGg..', '...gGg...', '..gGgGg..', '.gGbGgyg.', '..gGgGg..', '.gGgrGgG.', 'gGgGgGgGg', '....n....', '...rrr...', '...RRR...'],
  stockings: ['nnnnnnnnnnnnnnnn', '.ww...ww...ww...', '.rr...gg...rr...', '.rr...gg...rr...', '.rrr..ggg..rrr..', '.rrrr.gggg.rrrr.', '..rr...gg...rr..'],

  // ---------------------------------------------------------------- seasonal finds (4 per event)
  snowflake: ['...i...', '.i.i.i.', '..iii..', 'iiiqiii', '..iii..', '.i.i.i.', '...i...'],
  mitten: ['.rrr...', 'rrrrr.r', 'rrrrrrr', 'rrrrrr.', 'rrrrr..', 'wwwww..'],
  icicle: ['iiiii', 'iqiqi', '.iqi.', '.iq..', '..q..'],
  snowball: ['.iii.', 'iwiii', 'iiiiq', 'iiiqq', '.qqq.'],
  petal: ['..ll...', '.lpll..', 'lppll..', '.lppl..', '..lpp..', '...pP..'],
  bee: ['.i.i..', '..i...', 'yxyxy.', 'yxyxyx', '.yxyx.'],
  robinegg: ['..qq..', '.qqqq.', 'qqQqqq', 'qqqqQq', '.qqqq.'],
  ladybug: ['..x..', '.rxr.', 'rxrxr', 'rrxrr', '.rrr.'],
  firefly: ['..i..', '.iyi.', '..x..', '.yzy.', '..y..'],
  cherry: ['...G..', '..g.g.', '.g...g', 'rr..rr', 'rR..rR'],
  butterfly: ['pp.pp', 'plxlp', '.pxp.', 'pp.pp', 'p...p'],
  daisy: ['.w.w.', 'wwyww', '.wyw.', 'ww.ww', '..g..', '..g..'],
  maple: ['..O..', 'O.O.O', 'OOOOO', '.OoO.', 'OOoOO', '..o..'],
  conker: ['..n..', '.NnN.', 'NnwnN', 'NnnnN', '.NNN.'],
  chestnut: ['..G..', '.gGg.', 'gGnGg', '.GnG.', '..G..'],
  wheat: ['.y.y.', 'yyYyy', '.yYy.', 'yyYyy', '..Y..', '..Y..'],
  candy: ['r.....r', 'rrwrwrr', 'rwrwrwr', 'rrwrwrr', 'r.....r'],
  bat: ['x.....x', 'xx.x.xx', 'xxxxxxx', '.xxwxx.', '..x.x..'],
  cobweb: ['i.i.i', '.iii.', 'iiiii', '.iii.', 'i.i.i'],
  owlfeather: ['...u.', '..uU.', '.uUu.', 'uUu..', 'Uu...', 'n....'],
  jingle: ['..n..', '.yyy.', 'yyYyy', 'yYxYy', '.YYY.'],
  candycane: ['.rwr.', 'w...w', '....r', '....w', '....r', '....w'],
  gingerbread: ['.uuu.', 'uwuwu', '.uuu.', 'uuwuu', '.uwu.', '.u.u.'],
  holly: ['g...g', 'gg.gg', '.grg.', 'gGrGg', '.g.g.'],
} satisfies Record<string, string[]>;
