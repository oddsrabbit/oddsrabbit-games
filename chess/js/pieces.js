// The piece set, drawn for this game: plain shapes with one outline weight,
// so they stay readable at the 36 px a phone square gives them, and a rabbit
// for the knight. Each piece is a list of shapes in a 100×100 box; `d` shapes
// are filled bodies, `l` shapes are detail lines (an eye, a slit) drawn in
// the outline colour on white pieces and the fill colour on black ones.
//
// Colours come from CSS custom properties (styles.css: --piece-*), so the
// same markup follows the theme. The icon and the list art use these too.

(function (root) {
  var BASE = ["d", "M22 88h56a4 4 0 0 0 4-4v-3a5 5 0 0 0-5-5H23a5 5 0 0 0-5 5v3a4 4 0 0 0 4 4z"];

  var SHAPES = {
    p: [
      ["d", "M37 76c1-12 4-20 7-24h12c3 4 6 12 7 24z"],
      ["d", "M40.5 48h19a3.5 3.5 0 0 1 0 7h-19a3.5 3.5 0 0 1 0-7z"],
      ["c", 50, 36, 13],
      BASE
    ],
    r: [
      ["d", "M31 76l3-32h32l3 32z"],
      ["d", "M27 44V22h10v7h8v-7h10v7h8v-7h10v22z"],
      ["l", "M34 52h32"],
      BASE
    ],
    b: [
      ["d", "M36 76c3-10 6-16 7-20h14c1 4 4 10 7 20z"],
      ["c", 50, 12, 5.5],
      ["d", "M50 16c-12 10-17 22-11 34h22c6-12 1-24-11-34z"],
      ["d", "M40.5 49h19a3.5 3.5 0 0 1 0 7h-19a3.5 3.5 0 0 1 0-7z"],
      ["l", "M56 27L46 40"],
      BASE
    ],
    q: [
      ["d", "M33 76c3-10 6-16 7-20h20c1 4 4 10 7 20z"],
      ["d", "M36 51L23 27l14 11 1-20 9 17 3-22 3 22 9-17 1 20 14-11-13 24z"],
      ["c", 23, 25, 4.5], ["c", 38, 16, 4.5], ["c", 50, 11, 4.5], ["c", 62, 16, 4.5], ["c", 77, 25, 4.5],
      ["d", "M38.5 49h23a3.5 3.5 0 0 1 0 7h-23a3.5 3.5 0 0 1 0-7z"],
      BASE
    ],
    k: [
      ["d", "M33 76c3-10 6-16 7-20h20c1 4 4 10 7 20z"],
      ["d", "M47 7h6v8h8v6h-8v20h-6V21h-8v-6h8z"],
      ["d", "M37 51c-11-6-12-22 1-22 6 0 10 5 12 11 2-6 6-11 12-11 13 0 12 16 1 22z"],
      ["d", "M38.5 49h23a3.5 3.5 0 0 1 0 7h-23a3.5 3.5 0 0 1 0-7z"],
      BASE
    ],
    // The knight is a rabbit: two long ears, facing left like a knight.
    n: [
      ["d", "M66 76c2-11 0-21-6-27 4-6 6-13 4-21 3-9 5-18 1-23-6-3-10 7-10 17-2-8-5-15-10-14-6 2-3 13 2 21-7 2-13 8-16 16-2 6 2 10 7 10 4 4-2 11-4 21z"],
      ["l", "M61 9c-2 5-3 10-3 15"],
      ["l", "M45 12c1 4 3 8 6 12"],
      ["e", 47, 39, 3],
      ["e", 32, 49, 2.2],
      BASE
    ]
  };

  var STROKE = 4;

  // SVG markup for `piece` ("P", "n", …). `cls` is added to the <svg>.
  function svg(piece, cls) {
    var kind = piece.toLowerCase();
    var white = piece !== kind;
    var shapes = SHAPES[kind];
    if (!shapes) return "";
    var fill = white ? "var(--piece-w, #fbf6ea)" : "var(--piece-b, #2b2724)";
    var edge = white ? "var(--piece-w-edge, #2b2724)" : "var(--piece-b-edge, #1b1816)";
    var detail = white ? "var(--piece-w-edge, #2b2724)" : "var(--piece-b-line, #efe6d2)";
    var body = "fill:" + fill + ";stroke:" + edge + ";stroke-width:" + STROKE + ";stroke-linejoin:round;stroke-linecap:round";
    var line = "fill:none;stroke:" + detail + ";stroke-width:" + (STROKE - 0.5) + ";stroke-linecap:round";
    var dot = "fill:" + detail;
    var out = "";
    // Bodies are listed top-down for reading; drawn base first so each piece
    // part sits on the one below it.
    for (var i = shapes.length - 1; i >= 0; i--) {
      var s = shapes[i];
      if (s[0] === "d") out += '<path d="' + s[1] + '" style="' + body + '"/>';
      else if (s[0] === "c") out += '<circle cx="' + s[1] + '" cy="' + s[2] + '" r="' + s[3] + '" style="' + body + '"/>';
    }
    for (var j = 0; j < shapes.length; j++) {
      var t = shapes[j];
      if (t[0] === "l") out += '<path d="' + t[1] + '" style="' + line + '"/>';
      else if (t[0] === "e") out += '<circle cx="' + t[1] + '" cy="' + t[2] + '" r="' + t[3] + '" style="' + dot + '"/>';
    }
    return '<svg class="' + (cls || "piece") + '" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' + out + "</svg>";
  }

  root.ChessPieces = { svg: svg };
})(typeof window !== "undefined" ? window : this);
