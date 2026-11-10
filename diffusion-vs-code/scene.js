// Shared helpers: a seeded random number generator, and the outline of a
// bicycle as a set of points for the diffusion-on-points slide.
(function () {
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function bikePoints() {
    const pts = [];
    [-48, 48].forEach(wx => {
      for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; pts.push([wx + 32 * Math.cos(a), -34 + 32 * Math.sin(a)]); }
    });
    const lines = [[-48, -34, -4, -34], [-4, -34, -18, -80], [-18, -80, 34, -78], [-4, -34, 34, -78], [-48, -34, -18, -80], [34, -78, 48, -34], [34, -78, 38, -93], [29, -95, 47, -91], [-28, -85, -8, -85]];
    lines.forEach(l => {
      const n = Math.max(4, Math.round(Math.hypot(l[2] - l[0], l[3] - l[1]) / 3));
      for (let i = 0; i <= n; i++) pts.push([l[0] + (l[2] - l[0]) * i / n, l[1] + (l[3] - l[1]) * i / n]);
    });
    return pts.map(q => [q[0] / 60, (q[1] + 48) / 60]);
  }

  window.bikePoints = bikePoints;
  window.sceneRng = rng;
})();
