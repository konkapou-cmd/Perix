/* Local synthetic review assets; never builds/deploys the production SPA. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const crypto = require('node:crypto');
const output = process.argv[2];
if (!output || !fs.existsSync(output)) throw Error('Explicit pre-created review directory required');
const helper = fs.readFileSync(path.join(__dirname, '../lib/city/transitPublication.ts'), 'utf8');
fs.writeFileSync(path.join(output, 'transitPublication.js'), ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText, { flag: 'wx' });
fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="el"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>PERIX — απομονωμένη οπτική δοκιμή</title>
<style>body{font:16px system-ui;margin:0;background:#f4f7fb;color:#142d40}main{max-width:1180px;margin:auto;padding:20px}
h1{font-size:25px}aside{background:#fff1cb;padding:14px;border-radius:12px;line-height:1.6}button{padding:10px 14px;margin:5px;border:1px solid #718caa;border-radius:8px;background:white;cursor:pointer}
.maps{display:flex;gap:16px}.panel{flex:1;background:white;border-radius:14px;padding:14px;min-width:0}svg{width:100%;height:auto;background:#edf3f7;border-radius:12px}
.board{padding:12px;background:#e9f2fe;font-size:20px;border-radius:8px;margin-bottom:12px}.route{fill:none;stroke:#9b253c;stroke-width:9;stroke-linejoin:round}.stop{fill:white;stroke:#273f59;stroke-width:4}
.pin{fill:#145fa3;stroke:white;stroke-width:3}.note{font-size:13px;color:#4f6474}pre{white-space:pre-wrap;background:white;padding:12px;font-size:13px}
@media(max-width:700px){.maps{flex-direction:column}main{padding:10px}h1{font-size:21px}}</style>
<main><h1>PERIX · Απομονωμένη οπτική επιβεβαίωση</h1>
<aside><strong>Συνθετικό δρομολόγιο — όχι GPS, όχι πραγματική άφιξη.</strong><br>
Τοπικός σχηματικός χάρτης με το πραγματικό Mobility API και τον κοινό κώδικα animation. Δεν είναι οι πλήρεις οθόνες /app και /locator, ούτε εξωτερικός χάρτης.</aside>
<p id="status" role="status">Φόρτωση τοπικής δοκιμής…</p><nav>
<button data-action="play">▶ Εκκίνηση</button><button data-action="pause">Ⅱ Παύση</button>
<button data-action="delay">+30 s καθυστέρηση</button><button data-action="earlier">Νέα άφιξη σε 8 s</button>
<button data-action="approach">Προσέγγιση: 3 s</button><button data-action="hidden">Κενό γεωμετρίας</button>
<button data-action="cancel">Ακύρωση δρομολογίου</button><button data-action="reset">Επαναφορά</button></nav>
<div class="maps">${['/app', '/locator'].map((name, i) => `<section class="panel"><h2>${name} · κοινός πυρήνας</h2>
<div class="board" id="board${i}">—</div><svg id="map${i}" viewBox="0 0 800 440" aria-label="Συνθετική διαδρομή με στροφή και εκτιμώμενη πινέζα">
<path class="route" d="M80 320 L680 320 L680 80"/><circle class="stop" cx="80" cy="320" r="10"/><circle class="stop" cx="680" cy="80" r="10"/>
<text x="45" y="365">Στάση Α</text><text x="610" y="45">Στάση Β</text>
<g id="pin${i}" class="pin"><circle r="15"/><path d="M-7 12 L0 26 L7 12 Z"/></g></svg>
<p class="note">Η πινέζα δείχνει οπτική πρόοδο. Το 0 δεν αποδεικνύει παρατηρημένη άφιξη.</p></section>`).join('')}</div>
<details open><summary>Έλεγχος API / animation</summary><pre id="diagnostics">—</pre></details></main>
<script type="module" src="/review/review.js"></script></html>`, { flag: 'wx' });
fs.copyFileSync(path.join(__dirname, 'visual-review-client.js'), path.join(output, 'review.js'), fs.constants.COPYFILE_EXCL);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
fs.writeFileSync(path.join(output, 'build-manifest.json'), JSON.stringify({
  scope: 'Synthetic review shell, not a production build',
  production_helper_source_sha256: sha(helper),
  assets: Object.fromEntries(['index.html', 'review.js', 'transitPublication.js'].map(name =>
    [name, sha(fs.readFileSync(path.join(output, name)))])),
}, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ output, helper: 'actual transitPublication.ts', external_assets: false }));
