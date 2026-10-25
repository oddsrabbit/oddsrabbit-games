// The worker js/engine.js starts: it loads Stockfish.js, unmodified, into
// itself, after making sure the engine's .wasm loads whatever Content-Type
// the server sends it.
//
// Stockfish compiles its .wasm with WebAssembly.instantiateStreaming, which
// browsers refuse unless the response is `application/wasm`, and it has no
// fallback. apps.oddsrabbit.com sends `application/octet-stream`, so the
// engine never started there. Here a response with any other type is read
// whole and compiled with WebAssembly.instantiate instead.
//
// Stockfish finds its .wasm from the worker's URL: the hash if there is one,
// else the script's own name with .js swapped for .wasm. This script is not
// called that, so engine.js passes the .wasm's URL in the hash.

(function () {
  var streaming = WebAssembly.instantiateStreaming;
  WebAssembly.instantiateStreaming = function (source, imports) {
    return Promise.resolve(source).then(function (res) {
      if (streaming && /^application\/wasm\b/i.test(res.headers.get("Content-Type") || "")) {
        return streaming.call(WebAssembly, res, imports);
      }
      return res.arrayBuffer().then(function (buf) { return WebAssembly.instantiate(buf, imports); });
    });
  };
})();

importScripts("stockfish-18-lite-single.js");
