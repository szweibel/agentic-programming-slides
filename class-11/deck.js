// Live drawings for each slide. Each entry in VIS starts a slide's drawing and
// returns a function that stops it, so only the visible slide is running.
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const IMG = window.IMGDATA || {};
  const VIS = {};

  function raf(fn) {
    let on = true, t0 = performance.now();
    (function f(now) { if (!on) return; fn((now - t0) / 1000); requestAnimationFrame(f); })(t0);
    return () => { on = false; };
  }
  function every(ms, fn) { fn(); const id = setInterval(fn, ms); return () => clearInterval(id); }
  function all(...stops) { return () => stops.forEach(s => s && s()); }
  const imgCache = {};
  function loadImg(src) {
    return imgCache[src] || (imgCache[src] = new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; }));
  }
  function pixelsOf(img, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
    return x.getImageData(0, 0, w, h);
  }
  const rng = window.sceneRng;
  function gaussTable(n, seed) {
    const r = rng(seed), g = new Float32Array(n);
    for (let i = 0; i < n; i += 2) {
      const u = Math.sqrt(-2 * Math.log(r() + 1e-9)), v = 2 * Math.PI * r();
      g[i] = u * Math.cos(v); g[i + 1] = u * Math.sin(v);
    }
    return g;
  }
  const G = gaussTable(1 << 17, 11);
  const stepSrc = i => 'img/step-' + String(i).padStart(2, '0') + '.jpg';

  const W = () => window.World.get();

  // ---------- title
  VIS.title = () => {
    const cv = $('#title-scene');
    return raf(t => W().render(cv, { t, az: 0.62 + 0.28 * Math.sin(t * 0.11), dist: 4.3 + 0.4 * Math.sin(t * 0.07) }));
  };

  // ---------- pixel grid
  VIS.pixels = () => {
    const main = $('#px-main').getContext('2d'), zoom = $('#px-zoom').getContext('2d'), read = $('#px-read');
    let stop = () => {};
    loadImg(IMG.blue).then(img => {
      const data = pixelsOf(img, 576, 448);
      const r = rng(5);
      let x = 288, y = 300, tx = x, ty = y, last = -9;
      stop = raf(t => {
        if (t - last > 2.6) { last = t; tx = 40 + r() * 496; ty = 40 + r() * 368; }
        x += (tx - x) * 0.06; y += (ty - y) * 0.06;
        const px = Math.round(x), py = Math.round(y);
        main.drawImage(img, 0, 0, 576, 448);
        main.strokeStyle = '#fff'; main.lineWidth = 2; main.strokeRect(px - 8.5, py - 6.5, 17, 13);
        main.strokeStyle = 'rgba(255,255,255,.55)'; main.beginPath(); main.arc(px, py, 30, 0, 7); main.stroke();
        for (let j = 0; j < 12; j++) for (let i = 0; i < 16; i++) {
          const k = ((py - 6 + j) * 576 + (px - 8 + i)) * 4;
          zoom.fillStyle = 'rgb(' + data.data[k] + ',' + data.data[k + 1] + ',' + data.data[k + 2] + ')';
          zoom.fillRect(i * 24, j * 24, 24, 24);
        }
        zoom.strokeStyle = 'rgba(0,0,0,.35)'; zoom.lineWidth = 1; zoom.beginPath();
        for (let i = 1; i < 16; i++) { zoom.moveTo(i * 24 + .5, 0); zoom.lineTo(i * 24 + .5, 288); }
        for (let j = 1; j < 12; j++) { zoom.moveTo(0, j * 24 + .5); zoom.lineTo(384, j * 24 + .5); }
        zoom.stroke();
        zoom.strokeStyle = '#fff'; zoom.lineWidth = 3; zoom.strokeRect(8 * 24, 6 * 24, 24, 24);
        const k = (py * 576 + px) * 4;
        read.innerHTML = 'one square: <b>red ' + data.data[k] + ' · green ' + data.data[k + 1] + ' · blue ' + data.data[k + 2] + '</b>';
      });
    });
    return () => stop();
  };

  // ---------- training: a photograph with rising noise
  VIS.training = () => {
    const strip = $('#noise-strip'), W = 216, H = 162;
    const levels = [[1, 'original'], [0.8, 'a little noise'], [0.45, 'more'], [0.15, 'mostly noise'], [0, 'noise only']];
    if (!strip.firstChild) levels.forEach(l => {
      const p = document.createElement('div'); p.className = 'panel';
      p.innerHTML = '<canvas width="' + W + '" height="' + H + '"></canvas><span class="cap">' + l[1] + '</span>';
      strip.appendChild(p);
    });
    let stop = () => {};
    loadImg(IMG.photo).then(img => {
      const src = pixelsOf(img, W, H).data, ctxs = [...strip.querySelectorAll('canvas')].map(c => c.getContext('2d'));
      const out = ctxs[0].createImageData(W, H);
      stop = every(140, () => {
        levels.forEach((l, n) => {
          const a = Math.sqrt(l[0]), s = Math.sqrt(1 - l[0]);
          let g = (Math.random() * 60000) | 0;
          for (let i = 0; i < src.length; i += 4) {
            for (let c = 0; c < 3; c++) {
              const v = a * (src[i + c] / 127.5 - 1) + s * G[g++ & 131071];
              out.data[i + c] = (v + 1) * 127.5;
            }
            out.data[i + 3] = 255;
          }
          ctxs[n].putImageData(out, 0, 0);
        });
      });
    });
    return () => stop();
  };

  // ---------- generating: real intermediate steps
  VIS.generating = () => {
    const img = $('#step-img'), bar = $('#step-bar'), cap = $('#step-cap');
    let i = 0, hold = 0, stop = () => {};
    Promise.all(Array.from({ length: 31 }, (_, k) => loadImg(stepSrc(k)))).then(() => {
      stop = every(170, () => {
        img.src = stepSrc(i); bar.style.width = (i / 30 * 100) + '%'; cap.textContent = 'step ' + i + ' of 30';
        if (i < 30) i++; else if (++hold > 14) { hold = 0; i = 0; }
      });
    });
    return () => stop();
  };

  // ---------- diffusion on points (exact denoiser for a known set of points)
  VIS.points = () => {
    const cv = $('#pt-canvas'), ctx = cv.getContext('2d'), cap = $('#pt-cap');
    const data = bikePoints(), M = 700, T = 90, S = 250;
    let X, k, hold, run = 0;
    const sched = j => { const s = Math.max(0.012, 1 - j / T), a = Math.cos(Math.PI / 2 * s); return [a, Math.sqrt(1 - a * a)]; };
    function reset() {
      X = new Float32Array(M * 2); k = 0; hold = 0; run++;
      for (let i = 0; i < M * 2; i++) { const u = Math.sqrt(-2 * Math.log(Math.random() + 1e-9)); X[i] = u * Math.cos(2 * Math.PI * Math.random()); }
    }
    function step() {
      const [a, s] = sched(k), [a2, s2] = sched(k + 1), inv = 1 / (2 * s * s);
      for (let i = 0; i < M; i++) {
        const x = X[2 * i], y = X[2 * i + 1];
        let best = 1e9; const d2 = new Float32Array(data.length);
        for (let j = 0; j < data.length; j++) {
          const dx = x - a * data[j][0], dy = y - a * data[j][1]; d2[j] = dx * dx + dy * dy; if (d2[j] < best) best = d2[j];
        }
        let w = 0, mx = 0, my = 0;
        for (let j = 0; j < data.length; j++) { const e = Math.exp(-(d2[j] - best) * inv); w += e; mx += e * data[j][0]; my += e * data[j][1]; }
        mx /= w; my /= w;
        X[2 * i] = a2 * mx + s2 * (x - a * mx) / s; X[2 * i + 1] = a2 * my + s2 * (y - a * my) / s;
      }
      k++;
    }
    function draw() {
      ctx.fillStyle = '#0a0d12'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#ff8a5c';
      for (let i = 0; i < M; i++) { ctx.beginPath(); ctx.arc(560 + X[2 * i] * S, 400 + X[2 * i + 1] * S, 3.4, 0, 7); ctx.fill(); }
      cap.textContent = 'run ' + run + ' · step ' + k + ' of ' + T;
    }
    reset();
    return every(55, () => { draw(); if (k < T) step(); else if (++hold > 45) reset(); });
  };

  // ---------- difference between two pictures
  function drawDiff(ctx, A, B, w, h, color) {
    const out = ctx.createImageData(w, h); let changed = 0;
    for (let i = 0; i < A.data.length; i += 4) {
      const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
      const on = d > 26; if (on) changed++;
      const m = on ? Math.min(1, 0.35 + d / 160) : 0;
      out.data[i] = 15 + (color[0] - 15) * m; out.data[i + 1] = 18 + (color[1] - 18) * m; out.data[i + 2] = 24 + (color[2] - 24) * m; out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return 100 * changed / (w * h);
  }
  const pct = v => (v < 10 ? v.toFixed(1) : Math.round(v)) + '%';

  VIS['one-change-diffusion'] = () => {
    Promise.all([loadImg(IMG.blue), loadImg(IMG.red)]).then(([a, b]) => {
      const p = drawDiff($('#diff-d').getContext('2d'), pixelsOf(a, 576, 448), pixelsOf(b, 576, 448), 576, 448, [255, 138, 92]);
      $('#diff-d-cap').innerHTML = 'changed pixels are lit: <b>' + pct(p) + ' of the picture</b>';
    });
  };

  function svgToPixels(svg, w, h) {
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    return new Promise(res => { const i = new Image(); i.onload = () => res(pixelsOf(i, w, h)); i.src = url; });
  }

  VIS['one-change-code'] = () => {
    const A = $('#chg-a'), B = $('#chg-b'), ctx = $('#diff-c').getContext('2d'), w = A.width, h = A.height;
    const base = { tod: 0.72, trees: 4, birds: 3, bike: '#2f6fde', t: 2, az: 0.5, el: 0.2, dist: 8.5 };
    const changes = [[{ bike: '#d8382e' }, 'blue bicycle', 'red bicycle'], [{ birds: 7 }, '3 birds', '7 birds'], [{ trees: 5 }, '4 trees', '5 trees']];
    let n = 0;
    return every(4200, () => {
      const c = changes[n++ % changes.length];
      W().render(A, base); W().render(B, Object.assign({}, base, c[0]));
      $('#chg-a-cap').innerHTML = 'before: <b>' + c[1] + '</b>'; $('#chg-b-cap').innerHTML = 'after: <b>' + c[2] + '</b>';
      const p = drawDiff(ctx, A.getContext('2d').getImageData(0, 0, w, h), B.getContext('2d').getImageData(0, 0, w, h), w, h, [88, 224, 184]);
      $('#diff-c-cap').innerHTML = 'changed pixels are lit: <b>' + pct(p) + ' of the picture</b>';
    });
  };

  // ---------- program
  VIS.program = () => {
    const pre = $('#codewall'), cv = $('#prog-scene');
    if (!pre.textContent) pre.textContent = window.World.source;
    const H = pre.scrollHeight - 300;
    return raf(t => {
      pre.style.transform = 'translateY(' + (-(t * 16) % H) + 'px)';
      W().render(cv, { tod: 0.75, t, az: 0.5 + 0.2 * Math.sin(t * 0.2), el: 0.16, dist: 6 });
    });
  };

  // ---------- parts
  VIS.parts = () => {
    const cv = $('#parts-scene'), ctx = cv.getContext('2d'), read = $('#parts-read');
    const order = ['bicycle', 'front wheel', 'basket', 'tree 5', 'bird 3', 'saddle', 'tree 3', 'rear wheel', 'bird 6'];
    let n = -1, since = -9, last = '';
    return raf(t => {
      W().render(cv, { tod: 0.78, t: 4 + t, az: 0.5, el: 0.2, dist: 8, trees: 5, birds: 7 });
      if (t - since > 1.7) { since = t; n++; }
      const list = W().partList(), part = list.find(p => p.name === order[n % order.length]);
      const r = part && W().screenRect(part, cv.width, cv.height);
      if (!r || r.inside < 0.6) { since = -9; return; } // skip parts that are mostly outside the frame
      const pad = 10, x = Math.max(3, r.x - pad), y = Math.max(3, r.y - pad), w = Math.min(cv.width - 3 - x, r.w + 2 * pad), h = Math.min(cv.height - 3 - y, r.h + 2 * pad);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.setLineDash([14, 9]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
      let html = '<b>' + (part.parent ? part.parent + ' › ' : '') + part.name + '</b><br><span class="dim">position</span> ' + r.pos.map(v => v.toFixed(1)).join(', ') + '<br>';
      if (part.color) html += '<span class="dim">color</span> <span class="swatch" style="background:' + part.color + '"></span>' + part.color + '<br>';
      html += '<span class="dim">' + list.length + ' named parts in this scene</span>';
      if (html !== last) read.innerHTML = last = html;
    });
  };

  // ---------- parameters and seeds
  function valueNoise(seed) {
    const r = rng(seed), g = new Float32Array(4096); for (let i = 0; i < 4096; i++) g[i] = r();
    const at = (x, y) => g[((x & 63) + (y & 63) * 64)];
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
    };
  }
  const PALETTES = [['#58e0b8', '#ff8a5c', '#f5e6a8'], ['#7aa7ff', '#f06db0', '#ffe08a'], ['#ffd166', '#ef476f', '#8ce99a'], ['#e0aaff', '#72efdd', '#ff9f6b'], ['#f4f1de', '#e07a5f', '#81b29a']];
  function drawFlow(cv, seed) {
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, r = rng(seed * 977 + 3), noise = valueNoise(seed * 31 + 1);
    const pal = PALETTES[seed % PALETTES.length], scale = 0.0025 + r() * 0.004, twist = 2 + r() * 5;
    ctx.fillStyle = '#0a0d12'; ctx.fillRect(0, 0, W, H); ctx.lineWidth = 1.6; ctx.globalAlpha = 0.5;
    for (let i = 0; i < 1100; i++) {
      let x = r() * W, y = r() * H; ctx.strokeStyle = pal[(r() * pal.length) | 0]; ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 70; s++) { const a = noise(x * scale, y * scale) * Math.PI * twist; x += Math.cos(a) * 5; y += Math.sin(a) * 5; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  let parTouched = false, seed = 1, seedTouched = false;
  VIS.parameters = () => {
    const cv0 = $('#par-scene'), ids = ['par-tod', 'par-trees', 'par-birds', 'par-hue'], inp = ids.map(i => $('#' + i));
    inp.forEach(el => { el.oninput = () => { parTouched = true; }; el.onchange = () => el.blur(); });
    const cv = $('#seed-canvas'), label = $('#seed-n');
    const show = () => { label.textContent = seed; drawFlow(cv, seed); };
    $('#seed-prev').onclick = e => { seedTouched = true; seed = Math.max(1, seed - 1); show(); e.target.blur(); };
    $('#seed-next').onclick = e => { seedTouched = true; seed++; show(); e.target.blur(); };
    show();
    let first = true;
    return all(
      raf(t => {
        if (!parTouched) {
          inp[0].value = 0.5 + 0.44 * Math.sin(t * 0.4); inp[1].value = Math.round(7 + 6 * Math.sin(t * 0.31 + 1));
          inp[2].value = Math.round(10 + 9 * Math.sin(t * 0.23 + 2)); inp[3].value = (218 + t * 22) % 360;
        }
        W().render(cv0, { tod: +inp[0].value, trees: +inp[1].value, birds: +inp[2].value, bike: 'hsl(' + inp[3].value + ',72%,50%)', t, az: 0.5, el: 0.2, dist: 8.5 });
      }),
      every(4000, () => { if (!seedTouched && !first) { seed = seed % 12 + 1; show(); } first = false; })
    );
  };

  VIS.animation = () => {
    const cv = $('#anim-scene');
    return raf(t => W().render(cv, { tod: 0.5 + 0.46 * Math.sin(t * 0.13 + 0.9), t, az: 0.6 + t * 0.09, el: 0.15 + 0.06 * Math.sin(t * 0.21), dist: 6.2 + 1.6 * Math.sin(t * 0.17), birds: 12, trees: 9 }));
  };

  // ---------- chart
  const DATA = {
    types: ['Illegal parking', 'Noise, residential', 'Blocked driveway', 'Unsanitary condition', 'Noise, street or sidewalk', 'Damaged tree'],
    shares: { 'Bronx': [14.7, 14.8, 4.7, 7.9, 4.5, 1.0], 'Brooklyn': [20.8, 10.4, 6.4, 4.4, 2.5, 2.5], 'Manhattan': [11.3, 10.2, 1.0, 4.4, 6.3, 0.8], 'Queens': [21.5, 8.2, 9.9, 2.5, 2.0, 4.1], 'Staten Island': [12.8, 5.8, 3.6, 2.6, 0.5, 9.3] }
  };
  let chartTouched = false, chartN = 0;
  VIS.data = () => {
    const svg = $('#chart'), tabs = $('#chart-tabs'), NS = 'http://www.w3.org/2000/svg', names = Object.keys(DATA.shares);
    if (!svg.firstChild) {
      svg.setAttribute('viewBox', '0 0 680 380');
      DATA.types.forEach((ty, i) => {
        const y = 34 + i * 54;
        const mk = (tag, a, txt) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (txt) e.textContent = txt; svg.appendChild(e); return e; };
        mk('text', { x: 236, y: y + 24, 'text-anchor': 'end', fill: '#eef0f3', 'font-size': 18, 'font-family': 'IBM Plex Sans' }, ty);
        mk('rect', { x: 252, y: y, height: 36, rx: 3, fill: '#58e0b8', class: 'bar-r' }).style.transition = 'width .7s ease';
        mk('text', { y: y + 24, fill: '#9aa4b2', 'font-size': 17, 'font-family': 'IBM Plex Mono', class: 'bar-t' }).style.transition = 'transform .7s ease';
      });
      names.forEach((n, i) => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => { chartTouched = true; chartN = i; show(); b.blur(); }; tabs.appendChild(b); });
    }
    function show() {
      const v = DATA.shares[names[chartN]];
      [...tabs.children].forEach((b, i) => b.classList.toggle('on', i === chartN));
      svg.querySelectorAll('.bar-r').forEach((r, i) => { r.style.width = (v[i] * 15) + 'px'; });
      svg.querySelectorAll('.bar-t').forEach((t, i) => { t.textContent = v[i].toFixed(1) + '%'; t.setAttribute('x', 262); t.style.transform = 'translateX(' + (v[i] * 15) + 'px)'; });
    }
    let first = true;
    return every(3000, () => { if (!chartTouched && !first) chartN = (chartN + 1) % names.length; first = false; show(); });
  };

  // ---------- gallery tiles
  let shaderFn = null;
  function shaderTile(cv) {
    if (shaderFn) return shaderFn;
    const gl = cv.getContext('webgl');
    const fs = `precision highp float; uniform float t; uniform vec2 r;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float sea(vec2 p){float h=0.,a=.55,f=.33;vec2 d=vec2(.8,.6);
        for(int i=0;i<6;i++){float ph=dot(p,d)*f+t*(.9+.25*float(i))+3.*vn(p*f*.6+float(i)*7.);float c=1.-abs(sin(ph));h+=a*c*c;d=mat2(.6,-.8,.8,.6)*d;f*=1.75;a*=.5;p+=d*.7;}return h;}
      const vec3 sunD=vec3(.2334,.1307,.9636);
      vec3 sky(vec3 d){float y=max(d.y,0.);vec3 c=mix(vec3(1.,.5,.26),vec3(.13,.2,.44),pow(y,.42));float s=max(dot(d,sunD),0.);
        return c+vec3(1.,.8,.5)*pow(s,700.)*9.+vec3(1.,.45,.15)*pow(s,10.)*.4;}
      void main(){vec2 uv=(gl_FragCoord.xy*2.-r)/r.y;vec3 ro=vec3(0.,2.3,t*.6),rd=normalize(vec3(uv.x,uv.y-.1,1.5));vec3 col=sky(rd);
        if(rd.y<0.){float d=(ro.y-1.1)/(-rd.y);vec3 p=ro+rd*d;
          for(int i=0;i<44;i++){p=ro+rd*d;float dh=p.y-sea(p.xz);if(dh<.012)break;d+=dh*.55;}
          float e=.02+d*.004;float h=sea(p.xz);
          vec3 n=normalize(vec3(sea(p.xz-vec2(e,0.))-sea(p.xz+vec2(e,0.)),2.*e,sea(p.xz-vec2(0.,e))-sea(p.xz+vec2(0.,e))));
          float fr=.04+.96*pow(1.-max(dot(n,-rd),0.),4.5);vec3 base=vec3(.015,.07,.1)+vec3(.04,.22,.2)*h*.55;
          vec3 w=mix(base,sky(reflect(rd,n)),fr);col=mix(w,sky(vec3(rd.x,.0,rd.z)),smoothstep(12.,90.,d));}
        gl_FragColor=vec4(pow(col,vec3(.85)),1.);}`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}')); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const ut = gl.getUniformLocation(pr, 't'); gl.uniform2f(gl.getUniformLocation(pr, 'r'), cv.width, cv.height);
    shaderFn = t => { gl.uniform1f(ut, t); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    return shaderFn;
  }
  function mathTile(ctx, t) {
    const W2 = 560, H = 400, cy = 200, x0 = 300, a = t * 1.1, K = [1, 3, 5, 7, 9], A = 62 * 4 / Math.PI;
    ctx.fillStyle = '#0a0d12'; ctx.fillRect(0, 0, W2, H);
    ctx.strokeStyle = '#2b3342'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(20, cy); ctx.lineTo(W2 - 16, cy); ctx.moveTo(x0, 50); ctx.lineTo(x0, 350); ctx.stroke();
    let x = 140, y = cy;
    K.forEach(k => {
      const rr = A / k, nx = x + rr * Math.cos(k * a), ny = y - rr * Math.sin(k * a);
      ctx.strokeStyle = 'rgba(238,240,243,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#ff8a5c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke(); x = nx; y = ny;
    });
    ctx.strokeStyle = '#58e0b8'; ctx.lineWidth = 4; ctx.beginPath();
    for (let px = x0; px <= W2 - 20; px += 2) { const b = a - (px - x0) / 46; let v = 0; K.forEach(k => { v += Math.sin(k * b) / k; }); const py = cy - A * v; px === x0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();
    ctx.strokeStyle = '#ff8a5c'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x0, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ff8a5c'; [[x, y], [x0, y]].forEach(q => { ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 7); ctx.fill(); });
  }
  function flowTile(cv) {
    const ctx = cv.getContext('2d'), noise = valueNoise(9), r = rng(4), P = Array.from({ length: 420 }, () => [r() * 560, r() * 400, (r() * 3) | 0]);
    ctx.fillStyle = '#0a0d12'; ctx.fillRect(0, 0, 560, 400);
    return t => {
      ctx.fillStyle = 'rgba(10,13,18,.045)'; ctx.fillRect(0, 0, 560, 400); ctx.lineWidth = 1.6;
      P.forEach(p => {
        const a = noise(p[0] * 0.006, p[1] * 0.006 + t * 0.05) * Math.PI * 4, nx = p[0] + Math.cos(a) * 2.2, ny = p[1] + Math.sin(a) * 2.2;
        ctx.strokeStyle = PALETTES[0][p[2]]; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(nx, ny); ctx.stroke(); p[0] = nx; p[1] = ny;
        if (nx < 0 || nx > 560 || ny < 0 || ny > 400 || r() < 0.004) { p[0] = r() * 560; p[1] = r() * 400; }
      });
    };
  }
  VIS.work = () => {
    const sh = shaderTile($('#tile-shader')), te = $('#tile-terrain'), m = $('#tile-math').getContext('2d'), fl = flowTile($('#tile-flow'));
    return raf(t => { sh(t); W().render(te, { tod: 0.8, t, az: t * 0.12, el: 0.42, dist: 30, fov: 46, lift: -2, trees: 14, birds: 14 }); mathTile(m, t); fl(t); });
  };

  // ---------- checking
  VIS.checking = () => {
    const cv = $('#chk-scene'), read = $('#chk-read'), colors = [['blue', '#2f6fde'], ['red', '#d8382e'], ['yellow', '#e8b22a'], ['white', '#f1f1ee']];
    let prev = null, p = {}, name = '';
    return all(
      every(3600, () => {
        const c = colors[(Math.random() * colors.length) | 0]; name = c[0];
        p = { tod: 0.7, birds: 2 + (Math.random() * 11 | 0), trees: 2 + (Math.random() * 9 | 0), bike: c[1], az: 0.5, el: 0.2, dist: 8.5 };
        W().render(cv, p);
        const k = W().counts(), now = { birds: k.birds, trees: k.trees, 'bicycle color': name };
        let h = '<span class="dim">read from the program</span><br>birds <b>' + k.birds + '</b><br>trees <b>' + k.trees + '</b><br>bicycle <span class="swatch" style="background:' + k.bicycle + '"></span><b>' + name + '</b><br><br><span class="dim">changed since the last version</span><br>';
        if (prev) { const d = Object.keys(now).filter(q => now[q] !== prev[q]).map(q => q + ' <b>' + prev[q] + ' → ' + now[q] + '</b>'); h += d.length ? d.join('<br>') : 'nothing'; } else h += 'first version';
        read.innerHTML = h; prev = now;
      }),
      raf(t => W().render(cv, Object.assign({ t }, p)))
    );
  };

  VIS.limits = () => { const cv = $('#lim-scene'); return raf(t => W().render(cv, { t, az: 0.62, dist: 5.6 })); };

  // ---------- families
  VIS.families = () => {
    const d = $('#fam-diff'), ctx = $('#fam-ar').getContext('2d');
    let i = 0, hold = 0, n = 0, pic = null;
    loadImg(IMG.blue).then(im => { pic = im; });
    Array.from({ length: 31 }, (_, k) => loadImg(stepSrc(k)));
    return every(150, () => {
      d.src = stepSrc(i); if (i < 30) i++; else if (++hold > 16) { hold = 0; i = 0; }
      if (!pic) return;
      const cols = 16, rows = 12, tw = 400 / cols, th = 312 / rows;
      if (n === 0) { ctx.fillStyle = '#0a0d12'; ctx.fillRect(0, 0, 400, 312); }
      for (let k = 0; k < 6 && n < cols * rows; k++, n++) {
        const cx = n % cols, cy = (n / cols) | 0;
        ctx.drawImage(pic, cx * 576 / cols, cy * 448 / rows, 576 / cols, 448 / rows, cx * tw, cy * th, tw + 0.5, th + 0.5);
      }
      if (n >= cols * rows && ++n > cols * rows + 16) n = 0;
    });
  };

  // ---------- both
  VIS.both = () => {
    const img = $('#poster-img'), svg = $('#poster-birds'), NS = 'http://www.w3.org/2000/svg';
    if (!svg.firstChild) for (let i = 0; i < 7; i++) { const p = document.createElementNS(NS, 'path'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#fff'); p.setAttribute('stroke-width', 2.6); p.setAttribute('stroke-linecap', 'round'); svg.appendChild(p); }
    const r = rng(8), B = [...svg.children].map(() => [r() * 760, 40 + r() * 150, 0.9 + r() * 0.9, r() * 6]);
    return raf(t => {
      img.style.transform = 'translate(' + (Math.sin(t * 0.12) * 12) + 'px,' + (Math.cos(t * 0.1) * 6) + 'px)';
      [...svg.children].forEach((p, i) => {
        const b = B[i], x = ((b[0] + t * 22) % 800) - 40, y = b[1] + 6 * Math.sin(t * 0.8 + b[3]), h = (-3 - 9 * (0.5 + 0.5 * Math.sin(t * 7 + b[3]))).toFixed(1);
        p.setAttribute('d', 'M-13,0 Q-6,' + h + ' 0,0 Q6,' + h + ' 13,0'); p.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + b[2] + ')');
      });
    });
  };

  // ---------- lifecycle
  let stop = null;
  function activate(sec) {
    if (stop) { try { stop(); } catch (e) {} stop = null; }
    const v = sec && VIS[sec.id];
    if (v) stop = v(sec) || null;
  }
  Reveal.initialize({ width: 1280, height: 720, margin: 0, controls: true, progress: true, slideNumber: 'c/t', hash: true, transition: 'fade', center: false })
    .then(() => activate(Reveal.getCurrentSlide()));
  Reveal.on('slidechanged', e => activate(e.currentSlide));
  window.__deck = { VIS, activate };
})();
