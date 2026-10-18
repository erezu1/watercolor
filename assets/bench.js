// THE PHONE TEST, as a file of its own: loaded by index.html only when the address has ?bench (normal visits never fetch
// it), and inlined into the private phone test page (an Artifact, which saves results to its shared table). On the
// public site there is no table: the page shows the results with a button to copy them.
(()=>{
const st = document.createElement('style'); st.textContent = ":root{ --b-bg:rgba(250,247,240,.95); --b-fg:#2b2a27; --b-mute:#6b665c; --b-acc:#2f5d8a; --b-line:rgba(43,42,39,.15); --b-good:#2f6b3a; --b-warn:#8a5a12 }\n@media (prefers-color-scheme: dark){ :root:not([data-theme=\"light\"]){ --b-bg:rgba(32,31,29,.95); --b-fg:#f1ede4; --b-mute:#b5ae9f; --b-acc:#8fb6dd; --b-line:rgba(241,237,228,.18); --b-good:#8fcf9a; --b-warn:#e6b86a } }\n:root[data-theme=\"dark\"]{ --b-bg:rgba(32,31,29,.95); --b-fg:#f1ede4; --b-mute:#b5ae9f; --b-acc:#8fb6dd; --b-line:rgba(241,237,228,.18); --b-good:#8fcf9a; --b-warn:#e6b86a }\n#bench{ position:fixed; left:max(16px, env(safe-area-inset-left,0px)); right:max(16px, env(safe-area-inset-right,0px)); bottom:calc(16px + env(safe-area-inset-bottom,0px)); z-index:50; max-width:440px; margin:0 auto;\n  background:var(--b-bg); color:var(--b-fg); border:1px solid var(--b-line); border-radius:12px; padding:12px 14px; font:14px/1.4 system-ui,sans-serif; display:grid; gap:8px }\n#bench b{ font-weight:600 }\n#bench .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }\n#bench .mute{ color:var(--b-mute); font-size:12.5px }\n#bench .bar{ height:4px; border-radius:2px; background:var(--b-line); overflow:hidden }\n#bench .bar i{ display:block; height:100%; width:0; background:var(--b-acc); transition:width .4s ease }\n#bench table{ border-collapse:collapse; font-size:12.5px; font-variant-numeric:tabular-nums; width:100% }\n#bench th,#bench td{ text-align:right; padding:2px 6px; border-bottom:1px solid var(--b-line) }\n#bench th:first-child,#bench td:first-child{ text-align:left }\n#bench th{ font-weight:600; color:var(--b-mute) }\n#bench .ok{ color:var(--b-good) } #bench .slow{ color:var(--b-warn) }\n#bench button{ font:inherit; color:var(--b-acc); background:transparent; border:1px solid var(--b-acc); border-radius:8px; padding:5px 12px; cursor:pointer }\n#bench button:focus-visible{ outline:2px solid var(--b-acc); outline-offset:2px }\n@media (prefers-reduced-motion: reduce){ #bench .bar i{ transition:none } }\n"; document.head.appendChild(st);
const box = document.createElement('div'); box.innerHTML = "<div id=\"bench\" role=\"status\" aria-live=\"polite\">\n  <div><b id=\"bState\">Getting ready\u2026</b></div>\n  <div class=\"bar\" aria-hidden=\"true\"><i id=\"bBar\"></i></div>\n  <div class=\"mute\" id=\"bInfo\">Leave the phone still with the screen on. The test turns four paintings by itself in two modes and reloads the page once, about two minutes in all.</div>\n  <div id=\"bTable\" hidden></div>\n  <div class=\"row\"><button id=\"bAgain\" type=\"button\" hidden>Run again</button><button id=\"bCopy\" type=\"button\" hidden>Copy results</button></div>\n</div>"; document.body.appendChild(box.firstElementChild);
// THE PHONE TEST (v2). Run 1: the mode this phone picks by itself (normal or lite). Run 2, after one reload: the other
// mode, forced through localStorage 'wc-lite' ('1' lite, '0' normal) — the page's own storage, put back afterwards.
// Each run, per painting: frame times while turning and while settling, the time of each stage of a turning frame,
// and the graphics memory in use. Saved to the shared 'runs' collection for Claude.
const SCENES = ['lighthouse','cats','medieval','castle'];
const NAMES = { lighthouse:'Lighthouse', cats:'Cat Trio', medieval:'Hill Castle', castle:'Floating Castle' };
const DATA = { lighthouse:'lighthouse', cats:'cats', medieval:'medieval', castle:'floating_castle' };
const $ = id => document.getElementById(id), sleep = ms => new Promise(r=>setTimeout(r, ms));
const frame = () => new Promise(r=>requestAnimationFrame(r));
const dbP = (async()=>{ try{ return window.claude ? await window.claude.use('db') : null; }catch(e){ return null; } })();
const store = (S, k, v) => { try{ if(v === undefined) return S.getItem(k); if(v === null) S.removeItem(k); else S.setItem(k, v); }catch(e){ return null; } return true; };
const local = (k, v) => store(window.localStorage, k, v), session = (k, v) => store(window.sessionStorage, k, v);
const q = (A,f) => { if(!A.length) return 0; const B = A.slice().sort((a,b)=>a-b); return B[Math.min(B.length-1, Math.floor(f*B.length))]; };
const mean = A => A.length ? A.reduce((x,y)=>x+y,0)/A.length : 0;
let progress = 0, steps = 1;
const tick = (msg) => { progress++; $('bBar').style.width = Math.min(100, 100*progress/steps).toFixed(0) + '%'; if(msg) $('bState').textContent = msg; };
async function phase(P, ms, turn){
  // (times between DRAWN frames: the painter may skip a browser tick while the GPU is still busy)
  const dt = [], kind = []; let t = await frame(); const t0 = t; let lastDraw = t0, n0 = P.perfInfo().drawn;
  while(true){ const now = await frame(); const d = now - t; t = now;
    if(turn){ P.view.yaw += 0.55*d/1000; P.render(); }
    const I = P.perfInfo(); if(I.drawn !== n0){ n0 = I.drawn; dt.push(Math.round((now - lastDraw)*10)/10); kind.push(I.kind); lastDraw = now; }
    if(now - t0 > ms) break; }
  return { dt, kind };
}
function summary(r){
  const d = r.dt.slice(1);
  return { frames:d.length, mean:+mean(d).toFixed(1), median:q(d,0.5), p90:q(d,0.9), max:d.length ? Math.max(...d) : 0, over50:d.filter(x=>x>50).length };
}
async function measure(P, label){
  const c = $('c'), runs = [];
  for(let k=0;k<SCENES.length;k++){
    const id = SCENES[k];
    tick(`${label}: ${NAMES[id]} (${k+1} of ${SCENES.length}), loading`);
    if(window.__needData) await window.__needData(DATA[id]).catch(()=>{});   // (the download first: the build alone is timed)
    const tl = performance.now(); await P.setScene(id); const buildMs = Math.round(performance.now() - tl);   // (building this painting on this phone: what a switch costs)
    if(c){ c.classList.remove('faded'); c.style.opacity = '1'; }
    P.view.pitch = 0.38; P.view.zoom = 1; P.render();
    await sleep(2500);
    $('bState').textContent = `${label}: ${NAMES[id]} (${k+1} of ${SCENES.length}), turning`;
    await phase(P, 700, true); const turn = await phase(P, 4500, true);
    $('bState').textContent = `${label}: ${NAMES[id]} (${k+1} of ${SCENES.length}), settling`;
    const rest = await phase(P, 1800, false);
    // (each stage of a turning frame, best of three; every number includes ~0.4 ms of the read that times it)
    let stages = null; try{ window.__passTurn = 0.004; for(let b=0;b<3;b++){ const a = P.passes(4); stages = stages || {}; for(const s in a) stages[s] = Math.min(stages[s] ?? 1e9, +(a[s]/4).toFixed(2)); } }catch(e){} window.__passTurn = 0;
    let mem = null; try{ mem = P.gpuMB ? P.gpuMB().total : null; }catch(e){}
    runs.push({ scene:id, buildMs, info:P.perfInfo(), turn:{ ...summary(turn), dt:turn.dt.join(' '), kind:turn.kind.join('') }, settle:{ ...summary(rest), dt:rest.dt.join(' ') }, stages, gpuMB:mem });
    tick();
  }
  return runs;
}
function device(P){
  const I = P.perfInfo(); let maxTex = 0, par = false;
  try{ const g = $('c').getContext('webgl2'); maxTex = g.getParameter(g.MAX_TEXTURE_SIZE); par = !!g.getExtension('KHR_parallel_shader_compile'); }catch(e){}
  return { ua:navigator.userAgent, gpu:I.gpu, dpr:devicePixelRatio, screen:[screen.width, screen.height], inner:[innerWidth, innerHeight],
    deviceMemory:navigator.deviceMemory || null, cores:navigator.hardwareConcurrency || null, maxTex, parallelCompile:par, phone:I.phone };
}
function table(out){
  const rows = SCENES.map(id=>{
    const a = (out.run1 || []).find(r=>r.scene===id), b = (out.run2 || []).find(r=>r.scene===id);
    const cell = r => r ? `<td class="${r.turn.mean <= 40 ? 'ok' : 'slow'}">${r.turn.mean.toFixed(0)}</td>` : '<td>–</td>';
    return `<tr><td>${NAMES[id]}</td>${cell(a)}${cell(b)}<td>${a ? (a.buildMs/1000).toFixed(1) + ' s' : '–'}</td></tr>`; }).join('');
  const m = l => l ? 'lite' : 'normal';
  return `<table><thead><tr><th>Turning, ms per frame</th><th>${m(out.autoLite)} (chosen)</th><th>${out.run2 ? m(!out.autoLite) : '–'}</th><th>Build</th></tr></thead><tbody>${rows}</tbody></table>`;
}
async function save(out){
  const db = await dbP; if(!db) return false;
  try{ await db.collection('runs').doc(out.id).set(out); return true; }catch(e){ return false; }
}
async function run(fresh){
  $('bAgain').hidden = true; $('bCopy').hidden = true;
  let P; for(let i=0;i<300 && !(P = window.__pavilion); i++) await sleep(100);
  if(!P){ $('bState').textContent = 'The painting did not start on this phone.'; $('bInfo').textContent = 'Tell Claude what the page shows instead.'; return; }
  P.stop(); const O = window.__OPT || {}; O.noAdapt = 1;   // (no automatic resolution drop during the test: runs stay comparable)
  let state = null; if(!fresh){ try{ state = JSON.parse(session('wc-bench') || 'null'); }catch(e){ state = null; } }
  steps = 2*SCENES.length*2;
  if(!state){
    // (a test left half-way — the page closed between the runs — still has the other mode forced: put this phone's own
    // setting back and start over, so run 1 really is the mode it chooses)
    const left = local('wc-bench-orig');
    if(left !== null && left !== true){ let o = null; try{ o = JSON.parse(left).orig; }catch(e){} if(o === null || o === undefined) local('wc-lite', null); else local('wc-lite', o);
      local('wc-bench-orig', null); location.reload(); return; }
    // run 1: as this phone chooses by itself
    const orig = local('wc-lite');
    const out = { id:new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14), v:2, at:new Date().toISOString(), device:device(P), autoLite:!!P.perfInfo().lite, run1:null, run2:null };
    out.run1 = await measure(P, `Run 1 (${out.autoLite ? 'lite' : 'normal'}, as chosen)`);
    await save(out);
    // run 2: the other mode, after one reload
    const can = session('wc-bench', JSON.stringify({ out, orig })) && local('wc-bench-orig', JSON.stringify({ orig })) && local('wc-lite', out.autoLite ? '0' : '1');
    if(can){ $('bState').textContent = 'Run 1 done. Reloading for run 2…'; await sleep(800); location.reload(); return; }
    return finish(out, false);
  }
  const { out, orig } = state; progress = 2*SCENES.length; tick();
  out.run2 = await measure(P, `Run 2 (${out.autoLite ? 'normal' : 'lite'}, forced)`);
  if(orig === null || orig === undefined) local('wc-lite', null); else local('wc-lite', orig);   // (this phone's own choice back)
  local('wc-bench-orig', null);
  session('wc-bench', null);
  return finish(out, true);
}
async function finish(out, both){
  $('bBar').style.width = '100%';
  $('bTable').innerHTML = table(out); $('bTable').hidden = false;
  const saved = await save(out);
  $('bState').textContent = saved ? 'Done. Results saved for Claude.' : 'Done.';
  $('bInfo').textContent = saved ? (both ? 'You can close this page now.' : 'Only one run: this page could not reload itself here.') : 'Copy the results and send them to whoever asked you to run this.';
  $('bCopy').hidden = saved; $('bAgain').hidden = false;
  $('bCopy').onclick = async () => { const t = JSON.stringify(out); try{ await navigator.clipboard.writeText(t); $('bCopy').textContent = 'Copied'; }catch(e){ const s = getSelection(), r = document.createRange(); r.selectNodeContents($('bTable')); s.removeAllRanges(); s.addRange(r); } };
}
// THE DIAGNOSTIC (?bench=diag, and the private test page): what limits a turning frame on this phone. The same painting
// is turned with one thing changed at a time; for each: the time between frames, the JavaScript time of a frame, and how
// long each frame took to finish on the GPU (a fence per frame, seen at the next screen refresh: in steps of ~17 ms).
const VARIANTS = [
  ['base', 'as now', () => {}],
  ['noStrokes', 'without the strokes', () => { window.__noStrokes = true; }],
  ['noPix', 'strokes, no pixel work', (O, P) => { P.noPix(1); }],
  ['noWash', 'without the wash layer', () => { window.__skipGlaze = 1; }],
  ['noColour', 'without the colour layer', () => { window.__skipGlaze = 2; }],
  ['noShade', 'without the shade layer', () => { window.__skipGlaze = 4; }],
  ['plan4', 're-plan every 4th frame', O => { O.halfPlan = 3; }],
  ['planRare', 'no re-planning while turning', O => { O.halfPlan = 1000; }],
]
const DIAG_SCENES = ['lighthouse', 'cats', 'medieval'];
function stats(A){ const B = A.slice().sort((a,b)=>a-b); return { mean:+mean(A).toFixed(1), median:+q(A,0.5).toFixed(1), p90:+q(A,0.9).toFixed(1) }; }
async function diag(){
  $('bAgain').hidden = true; $('bCopy').hidden = true; $('bTable').hidden = true;
  $('bInfo').textContent = 'Leave the phone still with the screen on. The test turns three paintings, changing one thing at a time, about two minutes.';
  let P; for(let i=0;i<300 && !(P = window.__pavilion); i++) await sleep(100);
  if(!P){ $('bState').textContent = 'The painting did not start on this phone.'; return; }
  P.stop(); const O = window.__OPT || {}; O.noAdapt = 1;
  const base = { halfPlan:O.halfPlan, fence:O.fence, intScale:P.perfInfo().intScale };
  const reset = () => { O.halfPlan = base.halfPlan; O.fence = base.fence; window.__noStrokes = false; window.__skipGlaze = 0; if(P.noPix) P.noPix(0); };
  const out = { id:new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14), v:3, kind:'diag', at:new Date().toISOString(), device:device(P), base, lite:!!P.perfInfo().lite, scenes:[] };
  steps = DIAG_SCENES.length*VARIANTS.length; progress = 0; const c = $('c'), gl = c.getContext('webgl2');
  for(const id of DIAG_SCENES){
    if(window.__needData) await window.__needData(DATA[id]).catch(()=>{});
    await P.setScene(id); if(c){ c.classList.remove('faded'); c.style.opacity = '1'; }
    P.view.pitch = 0.38; P.view.zoom = 1; P.render(); await sleep(2500);
    const rows = [];
    for(let v=0; v<VARIANTS.length; v++){
      const [key, label, apply] = VARIANTS[v];
      tick(`${NAMES[id]}: ${label} (${v+1} of ${VARIANTS.length})`);
      reset(); apply(O, P); P.render(); await sleep(1200);
      await phase(P, 600, true);
      const FS = window.__fs = { cpu:[], gpu:[], fences:[], waits:0 };
      const r = await phase(P, 3000, true);
      window.__fs = null; FS.fences.forEach(([f]) => { try{ gl.deleteSync(f); }catch(e){} });
      rows.push({ key, label, ...summary(r), cpu:stats(FS.cpu), gpu:stats(FS.gpu), waits:FS.waits, info:P.perfInfo(), dt:r.dt.join(' '), kind:r.kind.join('') });
    }
    reset(); out.scenes.push({ scene:id, rows });
  }
  $('bBar').style.width = '100%';
  const head = `<tr><th>Turning, ms per frame</th>${out.scenes.map(sc=>`<th>${NAMES[sc.scene]}</th>`).join('')}<th>GPU</th></tr>`;
  const body = VARIANTS.map(([key, label]) => `<tr><td>${label}</td>${out.scenes.map(sc=>{ const r = sc.rows.find(x=>x.key===key); return `<td class="${r.mean <= 34 ? 'ok' : 'slow'}">${r.mean.toFixed(0)}</td>`; }).join('')}<td>${out.scenes[0].rows.find(x=>x.key===key).gpu.median.toFixed(0)}</td></tr>`).join('');
  $('bTable').innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`; $('bTable').hidden = false;
  const saved = await save(out);
  $('bState').textContent = saved ? 'Done. Results saved for Claude.' : 'Done.';
  $('bInfo').textContent = saved ? 'You can close this page now.' : (window.claude ? 'Saving is not available here. Copy the results and paste them in the chat.' : 'Copy the results and send them to whoever asked you to run this.');
  $('bCopy').hidden = saved; $('bAgain').hidden = false;
  $('bCopy').onclick = async () => { const t = JSON.stringify(out); try{ await navigator.clipboard.writeText(t); $('bCopy').textContent = 'Copied'; }catch(e){ const s = getSelection(), r = document.createRange(); r.selectNodeContents($('bTable')); s.removeAllRanges(); s.addRange(r); } };
}
const MODE = window.__BENCH_MODE || (/[?&]bench=diag\b/.test(location.search) ? 'diag' : 'modes');
$('bAgain').onclick = () => { session('wc-bench', null); progress = 0; MODE === 'diag' ? diag() : run(true); };
setTimeout(() => MODE === 'diag' ? diag() : run(false), 1500);
})();
