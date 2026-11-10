// The countryside scene used throughout the deck: terrain, road, grass, trees,
// sky, birds and a bicycle, all built from numbers and drawn with three.js.
// One renderer draws every view in the deck and copies it to the slide's canvas.
(function () {
  function buildWorld(THREE) {
    THREE.ColorManagement.legacyMode = false;
    const C = h => new THREE.Color(h);
    const V = (x, y, z) => new THREE.Vector3(x, y, z || 0);

    // ---- seeded random numbers and smooth noise
    function rng(seed) {
      let a = seed >>> 0;
      return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const lattice = new Float32Array(65536); { const r = rng(1234); for (let i = 0; i < 65536; i++) lattice[i] = r(); }
    const at = (x, y) => lattice[((x & 255) + (y & 255) * 256)];
    function noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
    }
    function fbm(x, y) { let s = 0, a = 0.5; for (let i = 0; i < 4; i++) { s += a * noise(x, y); x = x * 2.03 + 17; y = y * 2.03 + 31; a *= 0.5; } return s; }
    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    // ---- the land
    const roadZ = x => 7 * Math.sin(x * 0.045) + 3 * Math.sin(x * 0.11 + 1.3);
    const raw = (x, z) => 26 * fbm(x * 0.006 + 9, z * 0.006 + 4) + 5 * fbm(x * 0.02, z * 0.02) - 15;
    const roadY = x => raw(x, roadZ(x));
    function height(x, z) {
      const d = Math.abs(z - roadZ(x));
      return roadY(x) + (raw(x, z) - roadY(x)) * smooth(3.2, 11, d) + 34 * smooth(50, 240, d) * fbm(x * 0.005 + 3, z * 0.005);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.outputEncoding = THREE.LinearEncoding; renderer.toneMapping = THREE.NoToneMapping;   // the finishing pass does both
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xffffff, 0.0058);
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 900);
    const wind = { value: 0 };

    // terrain
    {
      const N = 280, geo = new THREE.PlaneGeometry(560, 560, N, N); geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
      const lush = C('#44822f'), deep = C('#2b612d'), dry = C('#7f8c3c'), wheat = C('#b3a052'), dirt = C('#8a7558'), c = new THREE.Color(), f = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), d = Math.abs(z - roadZ(x));
        pos.setY(i, height(x, z));
        c.copy(deep).lerp(lush, fbm(x * 0.05, z * 0.05)).lerp(dry, 0.5 * smooth(0.45, 0.75, fbm(x * 0.012 + 40, z * 0.012)));
        const fx = Math.floor((x + z * 0.3) / 34), fz = Math.floor((z - x * 0.2) / 26), k = at(fx * 7 + 3, fz * 13 + 5);
        f.copy(k < 0.35 ? wheat : k < 0.6 ? dry : k < 0.8 ? lush : deep);
        c.lerp(f, 0.75 * smooth(30, 70, d));
        c.lerp(dirt, 0.8 * (1 - smooth(1.4, 2.6, d)));
        col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.6 })); m.receiveShadow = true; scene.add(m);
    }

    // road
    const road = (() => {
      const cv = document.createElement('canvas'), bm = document.createElement('canvas'); cv.width = bm.width = 512; cv.height = bm.height = 1024;
      const g = cv.getContext('2d'), gb = bm.getContext('2d'), r = rng(77);
      g.fillStyle = '#7d786f'; g.fillRect(0, 0, 512, 1024); gb.fillStyle = '#808080'; gb.fillRect(0, 0, 512, 1024);
      for (let i = 0; i < 70000; i++) {   // gravel
        const x = r() * 512, y = r() * 1024, sz = 1 + r() * 2.6, lt = r() < 0.5;
        g.fillStyle = lt ? 'rgba(215,208,194,' + (0.1 + r() * 0.2) + ')' : 'rgba(40,38,34,' + (0.12 + r() * 0.2) + ')'; g.fillRect(x, y, sz, sz);
        gb.fillStyle = lt ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.4)'; gb.fillRect(x, y, sz, sz);
      }
      [0.3, 0.7].forEach(u => {   // wheel tracks, worn lighter
        const gr = g.createLinearGradient((u - 0.11) * 512, 0, (u + 0.11) * 512, 0); gr.addColorStop(0, 'rgba(170,165,155,0)'); gr.addColorStop(0.5, 'rgba(170,165,155,.4)'); gr.addColorStop(1, 'rgba(170,165,155,0)');
        g.fillStyle = gr; g.fillRect((u - 0.11) * 512, 0, 0.22 * 512, 1024);
      });
      for (let i = 0; i < 16; i++) {   // cracks
        let x = r() * 512, y = r() * 1024; g.strokeStyle = 'rgba(30,28,26,.55)'; gb.strokeStyle = 'rgba(0,0,0,.9)'; g.lineWidth = gb.lineWidth = 1 + r() * 1.6; g.beginPath(); gb.beginPath(); g.moveTo(x, y); gb.moveTo(x, y);
        for (let k = 0; k < 12; k++) { x += (r() - 0.5) * 40; y += (r() - 0.3) * 45; g.lineTo(x, y); gb.lineTo(x, y); }
        g.stroke(); gb.stroke();
      }
      const edge = g.createLinearGradient(0, 0, 512, 0); edge.addColorStop(0, 'rgba(112,96,66,.95)'); edge.addColorStop(0.12, 'rgba(112,96,66,0)'); edge.addColorStop(0.88, 'rgba(112,96,66,0)'); edge.addColorStop(1, 'rgba(112,96,66,.95)');
      g.fillStyle = edge; g.fillRect(0, 0, 512, 1024);
      const tex = new THREE.CanvasTexture(cv); tex.wrapT = THREE.RepeatWrapping; tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
      const bump = new THREE.CanvasTexture(bm); bump.wrapT = THREE.RepeatWrapping; bump.anisotropy = 8;
      const P = [], U = [], I = []; let v = 0, n = 0;
      for (let x = -200; x <= 200; x += 0.5, n++) {
        const dz = (roadZ(x + 0.1) - roadZ(x - 0.1)) / 0.2, l = Math.hypot(1, dz), nx = -dz / l, nz = 1 / l, y = roadY(x) + 0.1;
        P.push(x + nx * 1.7, y, roadZ(x) + nz * 1.7, x - nx * 1.7, y, roadZ(x) - nz * 1.7); U.push(0, v, 1, v); v += 0.5 * l / 6.8;
        if (n) { const a = 2 * n - 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); geo.setIndex(I); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, bumpMap: bump, bumpScale: 0.012, roughness: 0.92 })); m.receiveShadow = true; m.name = 'road'; scene.add(m); return m;
    })();

    // wind: bend anything tall, more at the top
    function sway(mat, amount, o) {
      o = o || {};
      mat.onBeforeCompile = sh => {
        sh.uniforms.uTime = wind;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader
          .replace('#include <color_vertex>', `#include <color_vertex>
            #ifdef USE_INSTANCING
              vec3 ip = (instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
            #else
              vec3 ip = (modelMatrix * vec4(0., 0., 0., 1.)).xyz;
            #endif
            float gust = sin(uTime * 1.6 + ip.x * 0.31 + ip.z * 0.23) * 0.6 + sin(uTime * 3.3 + ip.x * 1.1 + ip.z * 0.7) * 0.25 + 0.3;
            ${o.grass ? 'vColor.rgb *= mix(0.42, 1.2, position.y) * (1. + 0.22 * gust * position.y);' : ''}`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            float bend = gust * ${amount.toFixed(4)} * position.y * position.y;
            transformed.x += bend; transformed.z += bend * 0.45;
            ${o.leaf ? 'transformed += normal * sin(uTime * 4.2 + position.x * 3.1 + position.y * 2.3 + position.z * 2.7) * 0.03;' : ''}`);
        // leaf cards are lit as part of a rounded crown, so both faces use the same normal
        if (o.leaf) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', ''));
      };
      return mat;
    }

    // grass
    {
      const blade = new THREE.BufferGeometry(), w = 0.02;
      blade.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.8, 0.4, 0, w * 0.8, 0.4, 0, -w * 0.5, 0.75, 0, w * 0.5, 0.75, 0, 0, 1, 0], 3));
      blade.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(7).fill([0, 1, 0]).flat(), 3));
      blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6, 2, 1, 0, 3, 1, 2, 4, 3, 2, 5, 3, 4, 6, 5, 4]);
      const COUNT = 320000, mesh = new THREE.InstancedMesh(blade, sway(new THREE.MeshStandardMaterial({ roughness: 0.85, envMapIntensity: 0.55 }), 0.42, { grass: true }), COUNT);
      const r = rng(5), M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0), c = new THREE.Color(), a = C('#5a9a36'), b = C('#37752b'), gold = C('#93923f');
      for (let i = 0; i < COUNT; i++) {
        const x = -58 + r() * 116, off = (1.72 + 34 * Math.pow(r(), 1.8)) * (r() < 0.5 ? -1 : 1), z = roadZ(x) + off;
        const tall = (0.14 + 0.42 * r() * (0.4 + noise(x * 0.3, z * 0.3))) * (0.55 + 0.45 * smooth(1.7, 4, Math.abs(off)));
        q.setFromAxisAngle(up, r() * Math.PI); M.compose(V(x, height(x, z) - 0.02, z), q, V(1 + r() * 1.2, tall, 1)); mesh.setMatrixAt(i, M);
        c.copy(b).lerp(a, r()).lerp(gold, 0.6 * smooth(0.5, 0.8, noise(x * 0.08 + 5, z * 0.08))); mesh.setColorAt(i, c);
      }
      mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
      // wildflowers
      const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.055, 0), new THREE.MeshStandardMaterial({ roughness: 0.7 }), 3200), cols = [C('#fff6e8'), C('#ffd84a'), C('#e8452c'), C('#c7a6f2')];
      for (let i = 0; i < 3200; i++) {
        const x = -55 + r() * 110, off = (1.9 + 12 * r() * r()) * (r() < 0.5 ? -1 : 1), z = roadZ(x) + off;
        M.compose(V(x, height(x, z) + 0.16 + r() * 0.2, z), q, V(0.7, 0.45, 0.7)); fl.setMatrixAt(i, M); fl.setColorAt(i, cols[(noise(x * 0.15, z * 0.15) * 4 + r() * 1.2) & 3]);
      }
      fl.frustumCulled = false; scene.add(fl);
    }

    // ---- trees: a trunk that splits into limbs, and a crown of leaf cards
    function merge(parts) {
      let n = 0; parts.forEach(p => { n += p.geo.attributes.position.count; });
      const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), Cc = new Float32Array(n * 3); let o = 0;
      parts.forEach(p => {
        const g = p.geo, pa = g.attributes.position, na = g.attributes.normal;
        for (let i = 0; i < pa.count; i++, o++) {
          P[3 * o] = pa.getX(i); P[3 * o + 1] = pa.getY(i); P[3 * o + 2] = pa.getZ(i);
          Nn[3 * o] = na.getX(i); Nn[3 * o + 1] = na.getY(i); Nn[3 * o + 2] = na.getZ(i);
          const c = p.color(pa.getX(i), pa.getY(i), pa.getZ(i), na.getY(i)); Cc[3 * o] = c.r; Cc[3 * o + 1] = c.g; Cc[3 * o + 2] = c.b;
        }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); return g;
    }
    const leafTex = (() => {   // a cluster of pale leaves; each card's own color tints it
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'), r = rng(31);
      for (let i = 0; i < 26; i++) {
        const a = r() * 6.283, d = 20 + r() * 78, len = 30 + r() * 26, wid = len * (0.36 + r() * 0.16), l = 68 + r() * 24;
        g.save(); g.translate(128 + Math.cos(a) * d, 128 + Math.sin(a) * d); g.rotate(a + (r() - 0.5) * 1.2);
        g.fillStyle = 'hsl(' + (80 + r() * 30) + ',' + (22 + r() * 18) + '%,' + l + '%)';
        g.beginPath(); g.moveTo(-len / 2, 0); g.quadraticCurveTo(0, -wid, len / 2, 0); g.quadraticCurveTo(0, wid, -len / 2, 0); g.fill();
        g.strokeStyle = 'hsla(90,30%,' + (l - 22) + '%,.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke();
        g.restore();
      }
      const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
    })();
    const leafMat = sway(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true, roughness: 0.7 }), 0.0035, { leaf: true });
    const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.4 });
    const woodMat = sway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 0.0035);

    function makeTree(seed, cards) {
      const r = rng(seed), wood = [], tips = [], bark = C('#6a5440'), barkDark = C('#3f3126'), core = C('#24512a'), tmp = new THREE.Color(), big = cards < 1000 ? 2.1 : 1;
      const barkCol = (x, y, z) => tmp.copy(barkDark).lerp(bark, noise(y * 3 + x * 7, z * 7)).clone();
      function limb(a, b, r0, r1, depth) {
        const d = new THREE.Vector3().subVectors(b, a), len = d.length(), g = new THREE.CylinderGeometry(r1, r0, len, depth ? (depth > 1 ? 4 : 6) : 10, 1).toNonIndexed();
        g.translate(0, len / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize())); g.translate(a.x, a.y, a.z);
        wood.push({ geo: g, color: barkCol });
        if (depth >= 3) { tips.push(b); return; }
        const n = depth === 0 ? 3 + (r() * 2 | 0) : depth === 1 ? 2 + (r() * 2 | 0) : 2;
        for (let k = 0; k < n; k++) {
          const az = k / n * 6.283 + r() * 1.2, out = depth === 0 ? 0.75 + r() * 0.5 : 0.6 + r() * 0.7, l2 = len * (depth === 0 ? 0.62 : 0.72) * (0.8 + r() * 0.4);
          limb(b, b.clone().addScaledVector(V(Math.cos(az) * out, 0.85 + r() * 0.5, Math.sin(az) * out).normalize(), l2), r1, r1 * 0.55, depth + 1);
        }
        if (depth === 0) limb(b, b.clone().add(V((r() - 0.5) * 0.6, len * 0.55, (r() - 0.5) * 0.6)), r1, r1 * 0.5, 1);
      }
      const trunkH = 2.4 + r() * 1.0;
      limb(V(0, -0.2, 0), V((r() - 0.5) * 0.5, trunkH, (r() - 0.5) * 0.3), 0.3, 0.17, 0);
      const cc = new THREE.Vector3(); tips.forEach(t => cc.add(t)); cc.multiplyScalar(1 / tips.length);
      let maxR = 0; tips.forEach(t => { maxR = Math.max(maxR, t.distanceTo(cc)); }); maxR += 1.1;
      tips.forEach((t, i) => {   // a dark core, so the sky does not show through the crown
        if (i % 3) return; const g = new THREE.IcosahedronGeometry(0.55 + r() * 0.25, 1); g.translate(t.x * 0.7 + cc.x * 0.3, t.y * 0.75 + cc.y * 0.25, t.z * 0.7 + cc.z * 0.3); wood.push({ geo: g, color: () => core });
      });
      const P = [], N = [], U = [], Cc = [], I = [], lightA = C('#b4e06a'), lightB = C('#6fae3f'), dark = C('#2f6a2c'), col = new THREE.Color();
      const right = new THREE.Vector3(), up = new THREE.Vector3(), nrm = new THREE.Vector3(), pos = new THREE.Vector3(), dir = new THREE.Vector3();
      for (let i = 0; i < cards; i++) {
        const t = tips[(r() * tips.length) | 0];
        dir.set(r() - 0.5, r() - 0.35, r() - 0.5).normalize(); pos.copy(t); if (r() < 0.25) pos.lerp(cc, r() * 0.6); pos.addScaledVector(dir, 0.2 + r() * 1.15);
        const sz = (0.32 + r() * 0.3) * big;
        nrm.copy(pos).sub(cc).normalize().lerp(dir, 0.3); nrm.y += 0.35; nrm.normalize();
        right.set(r() - 0.5, r() - 0.5, r() - 0.5).cross(nrm).normalize(); up.crossVectors(nrm, right).normalize();
        if (r() < 0.5) up.lerp(nrm, 0.55).normalize();
        const k = P.length / 3;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(q => {
          P.push(pos.x + (right.x * q[0] + up.x * q[1]) * sz, pos.y + (right.y * q[0] + up.y * q[1]) * sz, pos.z + (right.z * q[0] + up.z * q[1]) * sz);
          N.push(nrm.x, nrm.y, nrm.z); U.push((q[0] + 1) / 2, (q[1] + 1) / 2);
        });
        const outer = Math.min(1, pos.distanceTo(cc) / maxR), top = smooth(-0.3, 0.9, nrm.y);
        col.copy(dark).lerp(lightB, outer * outer).lerp(lightA, top * outer * (0.35 + 0.65 * r()));
        for (let q = 0; q < 4; q++) Cc.push(col.r, col.g, col.b);
        I.push(k, k + 1, k + 2, k, k + 2, k + 3);
      }
      const leaves = new THREE.BufferGeometry();
      leaves.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); leaves.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      leaves.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); leaves.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); leaves.setIndex(I);
      return { wood: merge(wood), leaves };
    }
    const treeGeo = [makeTree(3, 4200), makeTree(11, 4200), makeTree(22, 4200)], farGeo = [makeTree(3, 850), makeTree(11, 850), makeTree(22, 850)];
    const SLOTS = [[-3.6, -4.8, 1.5, 0], [5.5, -9, 1.15, 1], [-11, -7.5, 1.2, 2], [13, -6.5, 1.3, 0], [-19, -12, 1.1, 1], [1, -15, 1.3, 2], [21, -10, 1.15, 0], [-7, -19, 1.2, 1], [-27, -8, 1.3, 2], [28, -14, 1.1, 0], [9, -22, 1.25, 1], [-15, -24, 1.2, 2], [34, -7, 1.0, 0], [-34, -13, 1.25, 1]];
    const trees = SLOTS.map((s, i) => {
      const g = new THREE.Group(), w = new THREE.Mesh(treeGeo[s[3]].wood, woodMat), l = new THREE.Mesh(treeGeo[s[3]].leaves, leafMat), x = s[0], z = roadZ(x) + s[1];
      w.castShadow = l.castShadow = w.receiveShadow = l.receiveShadow = true; l.customDepthMaterial = leafDepth; g.add(w, l);
      g.position.set(x, height(x, z) - 0.1, z); g.scale.setScalar(s[2]); g.rotation.y = i * 2.1; g.name = 'tree ' + (i + 1); scene.add(g); return g;
    });
    { // distant woods and hedgerows
      const r = rng(9), M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0);
      farGeo.forEach((g, k) => {
        const a = new THREE.InstancedMesh(g.wood, woodMat, 150), b = new THREE.InstancedMesh(g.leaves, leafMat, 150);
        for (let i = 0; i < 150; i++) {
          let x, z;
          if (i < 60) { const fx = Math.floor(r() * 10) - 5, fz = Math.floor(r() * 8) - 4; x = fx * 34 + r() * 34; z = fz * 26 + (r() - 0.5) * 3 + x * 0.2; }
          else { const cx = (noise(k * 3.3, i * 0.11) - 0.5) * 420, cz = (noise(i * 0.13, k * 5.1) - 0.5) * 420; x = cx + (r() - 0.5) * 30; z = cz + (r() - 0.5) * 30; }
          if (Math.abs(z - roadZ(x)) < 48) z += 80 * (z > roadZ(x) ? 1 : -1);
          q.setFromAxisAngle(up, r() * 6.28); const sc = 0.9 + r() * 0.8; M.compose(V(x, height(x, z) - 0.1, z), q, V(sc, sc, sc)); a.setMatrixAt(i, M); b.setMatrixAt(i, M);
        }
        a.frustumCulled = b.frustumCulled = false; scene.add(a, b);
      });
    }

    // fence along one side of the road
    {
      const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 1.05, 0.09), new THREE.MeshStandardMaterial({ color: '#6e5a45', roughness: 1 }), 70), M = new THREE.Matrix4(), q = new THREE.Quaternion(), wires = [[], []];
      for (let i = 0; i < 70; i++) {
        const x = -70 + i * 2 + 0.3 * noise(i, 3), z = roadZ(x) - 2.9, y = height(x, z);
        q.setFromEuler(new THREE.Euler((noise(i * 0.7, 1) - 0.5) * 0.2, 0, (noise(i * 0.9, 7) - 0.5) * 0.2)); M.compose(V(x, y + 0.45, z), q, V(1, 1, 1)); post.setMatrixAt(i, M);
        wires[0].push(V(x, y + 0.85, z)); wires[1].push(V(x, y + 0.5, z));
      }
      post.castShadow = true; post.frustumCulled = false; scene.add(post);
      wires.forEach(w => scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(w), new THREE.LineBasicMaterial({ color: '#2a2622' }))));
    }

    // ---- sky: gradient, sun, drifting clouds. A second copy lights the scene and shows in reflections.
    const envScene = new THREE.Scene(), pmrem = new THREE.PMREMGenerator(renderer); let envRT = null, envTod = -9;
    const skyU = { sunDir: { value: V(0, 1, 0) }, zenith: { value: C('#2f6fd0') }, horizon: { value: C('#bfe0ff') }, sunCol: { value: C('#ffffff') }, uTime: wind, cover: { value: 0.34 } };
    {
      const m = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 24), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: `varying vec3 vDir; uniform vec3 sunDir, zenith, horizon, sunCol; uniform float uTime, cover;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
          float fbm(vec2 p){ float s = 0., a = .5; for(int i = 0; i < 5; i++){ s += a*vn(p); p = p*2.02 + 11.; a *= .5; } return s; }
          void main(){
            vec3 d = normalize(vDir); float y = max(d.y, 0.);
            vec3 col = mix(horizon, zenith, pow(y, 0.42));
            float sd = max(dot(d, sunDir), 0.);
            col += sunCol * (pow(sd, 900.) * 14. + pow(sd, 40.) * 0.55 + pow(sd, 5.) * 0.2);
            vec2 uv = d.xz / (d.y + 0.16) * 1.1 + vec2(uTime * 0.01, uTime * 0.004);
            float c = fbm(uv * 1.3), c2 = fbm(uv * 1.3 + sunDir.xz * 0.22);
            float m = smoothstep(1. - cover * 0.62, 1.06 - cover * 0.34, c + 0.25) * smoothstep(0., 0.22, d.y);
            vec3 lit = mix(mix(zenith, horizon, 0.45) * 0.85, vec3(1.) * (0.6 + 0.5 * sunDir.y) + sunCol * 0.75, smoothstep(-0.1, 0.16, c - c2 + 0.05));
            lit += sunCol * pow(sd, 6.) * 0.9;
            col = mix(col, lit, m * 0.94);
            col = mix(col, vec3(0.07, 0.09, 0.05) * (0.5 + sunDir.y), smoothstep(0., -0.2, d.y));   // ground, seen only in reflections
            gl_FragColor = vec4(col, 1.);
            #include <tonemapping_fragment>
            #include <encodings_fragment>
          }`
      }));
      m.frustumCulled = false; m.name = 'sky'; scene.add(m);
      envScene.add(new THREE.Mesh(m.geometry, m.material));
    }
    const hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 0.6); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 220 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5); scene.add(fill);

    // ---- bicycle
    function tube(a, b, r, mat) {
      const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), mat);
      m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); m.castShadow = true; return m;
    }
    const paint = new THREE.MeshStandardMaterial({ color: '#2f6fde', roughness: 0.35, metalness: 0.25 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.85 }), steel = new THREE.MeshStandardMaterial({ color: '#c8ccd2', roughness: 0.3, metalness: 0.85 });
    const leather = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.6 }), wicker = new THREE.MeshStandardMaterial({ color: '#b08a55', roughness: 0.95, side: THREE.DoubleSide });
    const bike = new THREE.Group(); bike.name = 'bicycle'; const parts = {};
    function wheel(name) {
      const w = new THREE.Group(); w.name = name;
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.02, 12, 64), rubber), rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.009, 8, 64), steel); tire.castShadow = true; w.add(tire, rim);
      for (let s = 0; s < 24; s++) { const a = s / 24 * 6.283, side = s % 2 ? 0.022 : -0.022; w.add(tube(V(0.015 * Math.cos(a + 1), 0.015 * Math.sin(a + 1), side), V(0.3 * Math.cos(a), 0.3 * Math.sin(a), 0), 0.0016, steel)); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 10), steel); hub.rotation.x = Math.PI / 2; w.add(hub);
      const fender = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.011, 6, 30, Math.PI * 0.95), paint); fender.scale.z = 3.2; fender.rotation.z = name === 'front wheel' ? 0.2 : 0.45; fender.castShadow = true; w.userData.fender = fender;
      return w;
    }
    {
      const R = V(-0.5, 0.345), F = V(0.53, 0.345), BB = V(-0.08, 0.29), S = V(-0.2, 0.86), HT = V(0.36, 0.9), HB = V(0.395, 0.7);
      const zs = s => V(0, 0, s);
      bike.add(tube(BB, S, 0.016, paint), tube(S, HT, 0.015, paint), tube(BB, HB, 0.017, paint), tube(HB, HT, 0.02, paint));
      [-0.045, 0.045].forEach(z => bike.add(tube(R.clone().add(zs(z)), BB.clone().add(zs(z * 0.5)), 0.009, paint), tube(R.clone().add(zs(z)), S.clone().add(zs(z * 0.3)), 0.008, paint)));
      const rw = wheel('rear wheel'); rw.position.copy(R); const rf = rw.userData.fender; rf.position.copy(R); bike.add(rw, rf); parts['rear wheel'] = rw;
      bike.add(tube(S, V(-0.235, 1.0), 0.012, steel));
      const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), leather); saddle.scale.set(1.35, 0.3, 0.72); saddle.position.set(-0.25, 1.01, 0); saddle.castShadow = true; saddle.name = 'saddle'; bike.add(saddle); parts.saddle = saddle;
      // rack
      [[-0.74, 0.74], [-0.24, 0.74]].forEach(p => [-0.06, 0.06].forEach(z => bike.add(tube(V(p[0], p[1], z), V(-0.5, 0.345, z * 0.9), 0.005, steel))));
      [-0.06, 0, 0.06].forEach(z => bike.add(tube(V(-0.76, 0.74, z), V(-0.22, 0.74, z), 0.005, steel)));
      // drivetrain
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.006, 28), steel); ring.rotation.x = Math.PI / 2; ring.position.set(BB.x, BB.y, 0.05); ring.castShadow = true; bike.add(ring);
      bike.add(tube(V(BB.x, BB.y, 0.06), V(BB.x + 0.12, BB.y - 0.12, 0.06), 0.008, steel), tube(V(BB.x, BB.y, -0.06), V(BB.x - 0.12, BB.y + 0.12, -0.06), 0.008, steel));
      [[0.12, -0.12, 0.1], [-0.12, 0.12, -0.1]].forEach(p => { const pd = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.07), rubber); pd.position.set(BB.x + p[0], BB.y + p[1], p[2]); pd.castShadow = true; bike.add(pd); });
      bike.add(tube(V(BB.x, BB.y, 0.05), V(R.x, R.y + 0.03, 0.05), 0.004, rubber), tube(V(BB.x, BB.y - 0.08, 0.05), V(R.x, R.y - 0.03, 0.05), 0.004, rubber));
      bike.add(tube(V(-0.2, 0.3, 0.03), V(-0.29, 0.05, 0.19), 0.008, steel));
      // steering: fork, front wheel, bars, basket turn together
      const steer = new THREE.Group(); steer.position.copy(HB); const L = p => p.clone().sub(HB);
      [-0.05, 0.05].forEach(z => steer.add(tube(L(HB).add(zs(z * 0.4)), L(F).add(zs(z)), 0.009, paint)));
      const fw = wheel('front wheel'); fw.position.copy(L(F)); const ff = fw.userData.fender; ff.position.copy(L(F)); steer.add(fw, ff); parts['front wheel'] = fw;
      steer.add(tube(L(HT), L(V(0.35, 1.02)), 0.012, steel), tube(L(V(0.35, 1.02, -0.2)), L(V(0.35, 1.02, 0.2)), 0.011, steel));
      [-1, 1].forEach(s => { steer.add(tube(L(V(0.35, 1.02, 0.2 * s)), L(V(0.2, 1.04, 0.27 * s)), 0.011, steel), tube(L(V(0.2, 1.04, 0.27 * s)), L(V(0.1, 1.04, 0.28 * s)), 0.015, leather)); });
      const basket = new THREE.Group(); basket.name = 'basket';
      const weave = (() => {
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = '#3d2a17'; g.fillRect(0, 0, 256, 128);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) { const on = (x + y) % 2; g.fillStyle = on ? '#c9a468' : '#a37f48'; g.fillRect(x * 8 + (on ? 0 : 1), y * 8 + 1, on ? 8 : 6, 6); g.fillStyle = 'rgba(255,240,200,.25)'; g.fillRect(x * 8, y * 8 + 1, 8, 1.5); }
        const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
      })();
      const wickerMat = new THREE.MeshStandardMaterial({ map: weave, bumpMap: weave, bumpScale: 0.004, roughness: 0.9, side: THREE.DoubleSide });
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.22, 28, 1, true), wickerMat); shell.scale.z = 0.8; shell.castShadow = true;
      const floor = new THREE.Mesh(new THREE.CircleGeometry(0.15, 28), wickerMat); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.108; floor.scale.y = 0.8;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.009, 8, 40), wickerMat); rim.rotation.x = Math.PI / 2; rim.position.y = 0.11; rim.scale.y = 0.8; rim.castShadow = true;
      basket.add(shell, floor, rim); basket.position.copy(L(V(0.6, 0.9))); steer.add(basket); parts.basket = basket;
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10), steel); bell.position.copy(L(V(0.3, 1.055, 0.15))); steer.add(bell);
      const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.045, 0.07), new THREE.MeshStandardMaterial({ color: '#c01818', emissive: '#400606', roughness: 0.3 })); reflector.position.set(-0.775, 0.7, 0); bike.add(reflector);
      steer.add(tube(L(V(0.4, 0.9, -0.1)), L(V(0.52, 0.82, -0.1)), 0.005, steel), tube(L(V(0.4, 0.9, 0.1)), L(V(0.52, 0.82, 0.1)), 0.005, steel));
      steer.rotation.y = 0.42; bike.add(steer);
      bike.rotation.order = 'YXZ'; scene.add(bike);
    }

    // ---- birds
    const birdMat = new THREE.MeshStandardMaterial({ color: '#1e1c1b', roughness: 0.9, side: THREE.DoubleSide });
    const wingGeo = new THREE.BufferGeometry(); wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.1, 0, 0, -0.14, 0.62, 0, -0.02, 0.62, 0, -0.02, 0.3, 0, 0.14, 0, 0, 0.1], 3)); wingGeo.computeVertexNormals();
    const birds = Array.from({ length: 24 }, (_, i) => {
      const g = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), birdMat); body.scale.set(0.8, 0.8, 2.6); g.scale.setScalar(0.6);
      const l = new THREE.Mesh(wingGeo, birdMat), r = new THREE.Mesh(wingGeo, birdMat); r.scale.x = -1; g.add(body, l, r); g.userData = { l, r, rnd: rng(300 + i) };
      const q = g.userData.rnd; g.userData.p = [q() * 6.28, 1.6 + q() * 3.4, 2.5 + q() * 2.8, 0.35 + q() * 0.4, (q() - 0.5) * 9, -6 - q() * 6, q() * 6.28];
      g.name = 'bird ' + (i + 1); scene.add(g); return g;
    });

    // ---- putting a set of values into the scene
    const ray = new THREE.Raycaster(), down = V(0, -1, 0), groundCache = {};
    function groundAt(x, z) {
      const k = x.toFixed(3) + ',' + z.toFixed(3); if (k in groundCache) return groundCache[k];
      ray.set(V(x, 200, z), down); const hit = ray.intersectObject(road, false)[0];
      return (groundCache[k] = hit ? hit.point.y : height(x, z));
    }
    const DEF = { tod: 0.92, trees: 5, birds: 7, bike: '#2f6fde', bikeX: 0.5, t: 0, az: 0.62, el: 0.13, dist: 4.4, fov: 40 };
    const state = { p: DEF, sunDir: V(0, 1, 0) };
    const cA = new THREE.Color(), cB = new THREE.Color();
    function apply(p) {
      p = state.p = Object.assign({}, DEF, p); wind.value = p.t;
      const e = Math.sin(Math.PI * p.tod), warm = 1 - e, sd = state.sunDir.set(Math.cos(Math.PI * p.tod) * 0.9, 0.06 + 0.94 * e, -0.3).normalize();
      skyU.sunDir.value.copy(sd);
      skyU.sunCol.value.copy(cA.set('#fff3dc')).lerp(cB.set('#ff8a3c'), Math.pow(warm, 1.6));
      skyU.zenith.value.copy(cA.set('#1f5fd0')).lerp(cB.set('#3d62b0'), Math.pow(warm, 1.3));
      skyU.horizon.value.copy(cA.set('#b9dcff')).lerp(cB.set('#ffb070'), Math.pow(warm, 1.3));
      scene.fog.color.copy(skyU.horizon.value).lerp(skyU.zenith.value, 0.15);
      hemi.color.copy(skyU.zenith.value).lerp(cA.set('#ffffff'), 0.55); hemi.groundColor.set('#4b5a34'); hemi.intensity = 0.12; fill.color.copy(skyU.horizon.value); fill.intensity = 0.2; fill.position.copy(camera.position);
      if (Math.abs(p.tod - envTod) > 0.012) { envTod = p.tod; const old = envRT; envRT = pmrem.fromScene(envScene, 0, 1, 1000); scene.environment = envRT.texture; if (old) old.dispose(); }
      sun.color.copy(skyU.sunCol.value); sun.intensity = 1.25 + 0.75 * Math.sqrt(e);
      post.exposure = 0.9;

      // stand the bicycle on the road: measure the road surface under each wheel and tilt to match
      const bx = -20 + 40 * p.bikeX, bz = roadZ(bx) + 0.75, yaw = -Math.atan((roadZ(bx + 0.1) - roadZ(bx - 0.1)) / 0.2) + 0.12;
      const cw = Math.cos(yaw), sw = Math.sin(yaw);
      const gR = groundAt(bx - 0.5 * cw, bz + 0.5 * sw), gF = groundAt(bx + 0.52 * cw - 0.055 * sw, bz - 0.52 * sw - 0.055 * cw), by = gR + (gF - gR) * 0.5 / 1.02 + 0.02;
      bike.position.set(bx, by, bz); bike.rotation.set(0.13, yaw, Math.atan2(gF - gR, 1.02));
      paint.color.set(p.bike);
      sun.target.position.set(bx, by, bz); sun.position.copy(sun.target.position).addScaledVector(sd, 90);
      trees.forEach((t, i) => { t.visible = i < p.trees; });
      birds.forEach((b, i) => {
        b.visible = i < p.birds; if (!b.visible) return;
        const u = b.userData.p, a = u[0] + p.t * u[3] * (i % 2 ? 1 : -1), dir = i % 2 ? 1 : -1;
        b.position.set(bx + u[4] + Math.cos(a) * u[1], by + u[2] + Math.sin(p.t * 0.7 + u[6]) * 0.6, bz + u[5] + Math.sin(a) * u[1] * 0.7);
        b.rotation.set(0, -a + (dir > 0 ? 0 : Math.PI), 0);
        const flap = Math.sin(p.t * 9 + u[6]) * 0.75; b.userData.l.rotation.z = flap; b.userData.r.rotation.z = -flap;
      });
      const d = p.dist, tx = bx + 0.4, ty = by + 0.75, tz = bz;
      let cx = tx + Math.sin(p.az) * Math.cos(p.el) * d, cz = tz + Math.cos(p.az) * Math.cos(p.el) * d, cy = ty + Math.sin(p.el) * d;
      cy = Math.max(cy, height(cx, cz) + 0.5);
      camera.fov = p.fov; camera.position.set(cx, cy, cz); camera.lookAt(tx, ty + (p.lift === undefined ? 0.55 : p.lift), tz);
      return p;
    }

    // ---- finishing pass: glow around bright areas, a film-style tone curve, color grade, darker corners
    const post = (() => {
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), sc = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; sc.add(quad);
      const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
      const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
      const bright = mk(`varying vec2 vUv; uniform sampler2D t; uniform vec2 px;
        void main(){ vec3 c = (texture2D(t, vUv + px * vec2(-1., -1.)).rgb + texture2D(t, vUv + px * vec2(1., -1.)).rgb + texture2D(t, vUv + px * vec2(-1., 1.)).rgb + texture2D(t, vUv + px * vec2(1., 1.)).rgb) * 0.25;
          c = min(c, vec3(24.)); float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(0.95, 2.4, l), 1.); }`, { t: { value: null }, px: { value: new THREE.Vector2() } });
      const blur = mk(`varying vec2 vUv; uniform sampler2D t; uniform vec2 dir;
        void main(){ vec3 c = texture2D(t, vUv).rgb * 0.227; c += (texture2D(t, vUv + dir * 1.385).rgb + texture2D(t, vUv - dir * 1.385).rgb) * 0.316; c += (texture2D(t, vUv + dir * 3.231).rgb + texture2D(t, vUv - dir * 3.231).rgb) * 0.0703; gl_FragColor = vec4(c, 1.); }`, { t: { value: null }, dir: { value: new THREE.Vector2() } });
      const fin = mk(`varying vec2 vUv; uniform sampler2D t, b; uniform float exposure;
        vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0., 1.); }
        void main(){
          vec3 c = (texture2D(t, vUv).rgb + texture2D(b, vUv).rgb * 0.55) * exposure;
          c = aces(c);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, 1.1);                                                              // a little more color
          c = mix(c, c * c * (3. - 2. * c), 0.22);                                               // gentle contrast
          c *= mix(vec3(0.96, 0.99, 1.05), vec3(1.04, 1.0, 0.95), smoothstep(0.15, 0.8, l));     // cool shadows, warm highlights
          vec2 q = vUv - 0.5; c *= 1. - 0.4 * pow(dot(q, q) * 1.9, 1.4);                          // darker corners
          gl_FragColor = vec4(pow(max(c, 0.), vec3(1. / 2.2)), 1.);
        }`, { t: { value: null }, b: { value: null }, exposure: { value: 1 } });
      let rt, a, b2;
      function size(w, h) {
        if (rt && rt.width === w && rt.height === h) return;
        [rt, a, b2].forEach(x => x && x.dispose());
        rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
        a = new THREE.WebGLRenderTarget(w >> 2, h >> 2, { type: THREE.HalfFloatType }); b2 = a.clone();
      }
      const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(sc, cam); };
      return {
        exposure: 1,
        draw(w, h) {
          size(w, h); renderer.setRenderTarget(rt); renderer.render(scene, camera);
          bright.uniforms.t.value = rt.texture; bright.uniforms.px.value.set(1 / w, 1 / h); pass(bright, a);
          for (let i = 0; i < 3; i++) {
            const sp = 1 + i * 1.3;
            blur.uniforms.t.value = a.texture; blur.uniforms.dir.value.set(sp / a.width, 0); pass(blur, b2);
            blur.uniforms.t.value = b2.texture; blur.uniforms.dir.value.set(0, sp / a.height); pass(blur, a);
          }
          fin.uniforms.t.value = rt.texture; fin.uniforms.b.value = a.texture; fin.uniforms.exposure.value = this.exposure; pass(fin, null);
        }
      };
    })();

    function render(canvas, p) {
      const w = canvas.width, h = canvas.height;
      if (renderer.domElement.width !== w || renderer.domElement.height !== h) renderer.setSize(w, h, false);
      apply(p); camera.aspect = w / h; camera.updateProjectionMatrix();
      post.draw(w, h);
      canvas.getContext('2d').drawImage(renderer.domElement, 0, 0);
    }

    // ---- reading the scene back: named parts, where they are on screen, and counts
    const box = new THREE.Box3(), corner = new THREE.Vector3();
    function partList() {
      const list = [{ name: 'bicycle', obj: bike, color: '#' + paint.color.getHexString() }, { name: 'front wheel', obj: parts['front wheel'], parent: 'bicycle' }, { name: 'rear wheel', obj: parts['rear wheel'], parent: 'bicycle' },
        { name: 'saddle', obj: parts.saddle, parent: 'bicycle', color: '#5a3a22' }, { name: 'basket', obj: parts.basket, parent: 'bicycle', color: '#b08a55' }];
      trees.forEach(t => { if (t.visible) list.push({ name: t.name, obj: t }); });
      birds.forEach(b => { if (b.visible) list.push({ name: b.name, obj: b }); });
      list.push({ name: 'sun', point: camera.position.clone().addScaledVector(state.sunDir, 500), radius: 26, color: '#' + skyU.sunCol.value.getHexString() });
      return list;
    }
    function screenRect(part, w, h) {
      scene.updateMatrixWorld(); camera.updateMatrixWorld();
      if (part.point) box.setFromCenterAndSize(part.point, V(part.radius * 2, part.radius * 2, part.radius * 2)); else box.setFromObject(part.obj);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
        if (corner.z > 1) return null;
        const sx = (corner.x * 0.5 + 0.5) * w, sy = (0.5 - corner.y * 0.5) * h; x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
      }
      if (x1 < 0 || y1 < 0 || x0 > w || y0 > h) return null;
      const c = box.getCenter(new THREE.Vector3());
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, pos: [c.x, c.y, c.z] };
    }
    function counts() { return { trees: trees.filter(t => t.visible).length, birds: birds.filter(b => b.visible).length, bicycle: '#' + paint.color.getHexString() }; }

    // distance between the lowest point of each wheel and the road beneath it, for checking
    function wheelGaps() {
      scene.updateMatrixWorld();
      return ['rear wheel', 'front wheel'].map(n => { box.setFromObject(parts[n]); const c = box.getCenter(new THREE.Vector3()); return +(box.min.y - groundAt(c.x, c.z)).toFixed(3); });
    }
    return { render, partList, screenRect, counts, wheelGaps };
  }

  let world = null;
  window.World = {
    get: () => world || (world = buildWorld(window.THREE)),
    source: buildWorld.toString()
  };
})();
