"use strict";

var fs = require("fs");
var path = require("path");

var START = "<!-- p9qm4x -->";
var END = "<!-- /p9qm4x -->";
var LEGACY_START = "<!-- VR_SITE_LOCKCFG -->";
var LEGACY_END = "<!-- /VR_SITE_LOCKCFG -->";

function fnv1a32(lc) {
  var h = 2166136261 >>> 0;
  var i;
  for (i = 0; i < lc.length; i++) {
    h = h ^ lc.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fingerprintHexString(fingerprints) {
  return fingerprints
    .map(function (x) {
      var v = x >>> 0;
      var s = v.toString(16);
      while (s.length < 8) {
        s = "0" + s;
      }
      return s;
    })
    .join("");
}

function hexToJsConcat(hex) {
  var parts = [];
  var step = 4;
  var i;
  for (i = 0; i < hex.length; i += step) {
    parts.push(hex.slice(i, i + step));
  }
  return "\"" + parts.join("\"+\"") + "\"";
}

function buildBlock(opts) {
  var enable = opts.enable;
  var fingerprints = opts.fingerprints || [];
  var strictHostOnly = !!opts.strictHostOnly;
  var msg =
    '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f5f7;color:#111827;padding:32px 20px;line-height:1.4;text-align:center">' +
    '<p style="margin:0 0 20px;font-size:1.25rem;font-weight:700">Nice Try Skid.</p>' +
    '<img src="./deployment-block-photo.jpg" alt="" width="360" height="240" decoding="async" loading="lazy" style="display:block;margin:0 auto;width:min(360px,100%);height:auto;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,0.12)" />' +
    "</div>";

  var msgB64 = Buffer.from(msg, "latin1").toString("base64");

  if (!enable) {
    var offBody =
      "    (function(){try{window._vr_hk=1}catch(_e){}})();\n";

    return "  <!-- p9qm4x -->\n  <script>\n" + offBody + "  </script>\n  <!-- /p9qm4x -->\n";
  }

  var hex = fingerprintHexString(fingerprints);
  var hzJs = hexToJsConcat(hex);

  var localhostBypass =
    'if(_host===String.fromCharCode(108,111,99,97,108,104,111,115,116)||_host===[49,50,55,46,48,46,48,46,49].map(function(__){return String.fromCharCode(__)}).join("")){window._vr_hk=1;return;}';

  var body =
    "    (function(){try{window._vr_hk=0;var _hz=" +
    hzJs +
    ';function _d(_s){var _r=[],_q;for(_q=0;_q<_s.length;_q+=8){_r.push(parseInt(_s.slice(_q,_q+8),16)>>>0);}return _r;}function _fn(_a){var _b=(""+_a).toLowerCase(),_c=2166136261>>>0,_y,_z;for(_y=0;_y<_b.length;_y++){_z=_b.charCodeAt(_y);_c=(_c^_z)>>>0;_c=Math.imul(_c,16777619)>>>0;}return _c>>>0;}var _host=(""+((((typeof location!=="undefined"&&location)?location[String.fromCharCode(104,111,115,116,110,97,109,101)]:""))||"")).toLowerCase();' +
    (strictHostOnly ? "" : localhostBypass) +
    'var _want=_d(_hz),_g=_fn(_host),_ok=!1,_i;for(_i=0;_i<_want.length;_i++){if((_want[_i]>>>0)===(_g>>>0)){_ok=!0;break;}}if(_ok){window._vr_hk=1;return;}window.__BLOCK_VICROAD_BOOT=1;var _k=document[String.fromCharCode(103,101,116,69,108,101,109,101,110,116,66,121,73,100)](String.fromCharCode(114,111,111,116));if(_k)_k[String.fromCharCode(105,110,110,101,114,72,84,77,76)]=atob("' +
    msgB64 +
    '")}}catch(_j){}})();\n';

  return "  <!-- p9qm4x -->\n  <script>\n" + body + "  </script>\n  <!-- /p9qm4x -->\n";
}

function patchIndex(htmlPath, opts) {
  opts = opts || {};
  var raw = fs.readFileSync(htmlPath, "utf8");
  var s = raw.indexOf(START);
  var e = raw.indexOf(END);
  var endTag = END;
  if (s === -1 || e === -1 || e <= s) {
    s = raw.indexOf(LEGACY_START);
    e = raw.indexOf(LEGACY_END);
    endTag = LEGACY_END;
  }
  if (s === -1 || e === -1 || e <= s) {
    throw new Error("marker block missing: " + htmlPath);
  }
  var lineStart = raw.lastIndexOf("\n", s - 1) + 1;
  var before = raw.slice(lineStart, s);
  if (/^\s*$/.test(before)) {
    s = lineStart;
  }
  var next = raw.slice(0, s) + buildBlock(opts) + raw.slice(e + endTag.length);
  fs.writeFileSync(htmlPath, next, "utf8");
}

function normalizeHost(token) {
  return String(token || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\[|\]/g, "")
    .split("/")[0]
    .split(":")[0];
}

function main() {
  var argv = process.argv.slice(2);
  var repoRoot = path.join(__dirname, "..");
  var defaultIndex = path.join(repoRoot, "index.html");

  if (
    !argv.length ||
    argv[0] === "--help" ||
    argv[0] === "-h"
  ) {
    process.exit(1);
  }

  var strictHostOnly = argv.indexOf("--strict") !== -1;
  var argvNoStrict = argv.filter(function (a) {
    return a !== "--strict";
  });

  var htmlPath = defaultIndex;
  if (/\.html$/i.test(String(argvNoStrict[0] || ""))) {
    htmlPath = path.resolve(argvNoStrict[0]);
  }

  var offFlag = argvNoStrict.indexOf("--off") !== -1;
  if (
    offFlag ||
    argvNoStrict[0] === "--off" ||
    (argvNoStrict.length >= 2 &&
      argvNoStrict[1] === "--off" &&
      /\.html$/i.test(String(argvNoStrict[0] || "")))
  ) {
    patchIndex(htmlPath, { enable: false, fingerprints: [] });
    return;
  }

  var hostTokens =
    /\.html$/i.test(String(argvNoStrict[0] || ""))
      ? argvNoStrict.slice(1)
      : argvNoStrict.slice(0);

  var hosts = [];
  hostTokens.forEach(function (t) {
    var n = normalizeHost(t);
    if (!n || n === "--off") return;
    if (/\s/.test(n)) {
      console.error("invalid hostname");
      process.exit(1);
    }
    if (hosts.indexOf(n) === -1) {
      hosts.push(n);
    }
  });

  if (!hosts.length) {
    process.exit(1);
  }

  var fingerprints = hosts.map(function (h) {
    return fnv1a32(h);
  });

  patchIndex(htmlPath, {
    enable: true,
    fingerprints: fingerprints,
    strictHostOnly: strictHostOnly
  });
}

module.exports = {
  START: START,
  END: END,
  LEGACY_START: LEGACY_START,
  LEGACY_END: LEGACY_END,
  fingerprintHexString: fingerprintHexString,
  fnv1a32: fnv1a32,
  buildBlock: buildBlock,
  patchIndex: patchIndex,
  normalizeHost: normalizeHost
};

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }
}
