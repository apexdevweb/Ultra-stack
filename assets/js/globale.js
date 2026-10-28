(function () {
  "use strict";
  var $ = function (s) {
    return document.querySelector(s);
  };
  var cv = $("#c"),
    ctx = cv.getContext("2d");
  var W = 0,
    H = 0,
    DPR = 1;
  var FORCES = {
    fDrift: "Dérive",
    fSplash: "Éclabousser",
    fGather: "Rassembler",
    fDepth: "Profondeur",
  };
  var S = {
    fDrift: 0.3,
    fSplash: 0.35,
    fGather: 0.4,
    fDepth: 0.6,
    last: "fDrift",
    flow: "",
    track: false,
    links: false,
    scan: false,
    trails: false,
    marks: false,
    onWhite: false,
    neg: false,
    trueCol: false,
    lightOn: true,
    tint: [255, 233, 200],
    hue: false,
    hud: true,
    ai: false,
    density: 50000,
    size: 1,
    trackers: 150,
    line: 0.8,
  };
  var images = [],
    cur = 0;
  var P = {
    n: 0,
    hx: null,
    hy: null,
    hz: null,
    x: null,
    y: null,
    vx: null,
    vy: null,
    ph: null,
    col: null,
    th: null,
    rd: null,
    rt: null,
  };
  var TK = {
    n: 0,
    hx: null,
    hy: null,
    hz: null,
    ph: null,
    x: null,
    y: null,
    vx: null,
    vy: null,
    k: null,
    ps: null,
  };
  var mouse = {
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    px: 0,
    py: 0,
    ptx: 0,
    pty: 0,
    last: 0,
  };
  var cam = { yaw: 0, pitch: 0, vy: 0, vp: 0, zoom: 1, drag: false };
  var CM = { cyw: 1, syw: 0, cp: 1, sp: 0, d: 1, k: 1, cx: 0, cy: 0 };
  var PX = 0,
    PY = 0,
    PS = 1;
  var T = 0,
    last = performance.now(),
    nextSplash = 3,
    frameNo = 0;

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function isLight() {
    return S.onWhite !== S.neg;
  }
  function bgCol() {
    return isLight() ? "#f3f3f1" : "#050506";
  }
  function fgRGB() {
    return isLight() ? [12, 12, 14] : [236, 236, 240];
  }

  /* ---------- caméra 3D ---------- */
  function setCam(im, rc) {
    var yaw = cam.yaw + mouse.x * 0.22,
      pit = cam.pitch + mouse.y * 0.14;
    CM.cyw = Math.cos(yaw);
    CM.syw = Math.sin(yaw);
    CM.cp = Math.cos(pit);
    CM.sp = Math.sin(pit);
    CM.d = im.w * 2.4;
    CM.k = rc.s * cam.zoom;
    CM.cx = rc.ox + (im.w * rc.s) / 2;
    CM.cy = rc.oy + (im.h * rc.s) / 2;
  }
  function project(X, Y, Z) {
    var x1 = X * CM.cyw + Z * CM.syw,
      z1 = -X * CM.syw + Z * CM.cyw;
    var y1 = Y * CM.cp - z1 * CM.sp,
      z2 = Y * CM.sp + z1 * CM.cp;
    var p = CM.d / Math.max(CM.d * 0.15, CM.d - z2);
    PX = CM.cx + x1 * p * CM.k;
    PY = CM.cy + y1 * p * CM.k;
    PS = p;
  }
  function resetCam() {
    cam.yaw = 0;
    cam.pitch = 0;
    cam.vy = 0;
    cam.vp = 0;
    cam.zoom = 1;
  }

  /* ---------- mise en page ---------- */
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = bgCol();
    ctx.fillRect(0, 0, W, H);
  }
  function stageRect() {
    var bh = $("#ui").classList.contains("off")
      ? 0
      : $("#bottom").getBoundingClientRect().height;
    var wide = W > 980;
    var top = wide ? 110 : 90,
      bottom = H - bh - (wide ? 64 : 44);
    var availH = Math.max(120, bottom - top),
      availW = W * (wide ? 0.62 : 0.86);
    var im = images[cur];
    if (!im) return { s: 1, ox: 0, oy: 0 };
    var s = Math.min(availW / im.w, availH / im.h);
    return { s: s, ox: (W - im.w * s) / 2, oy: top + (availH - im.h * s) / 2 };
  }
  function applyTheme() {
    var l = isLight(),
      r = document.documentElement.style;
    r.setProperty("--bg", l ? "#f3f3f1" : "#050506");
    r.setProperty("--fg", l ? "#0c0c0e" : "#ececf0");
    r.setProperty("--dim", l ? "rgba(12,12,14,.5)" : "rgba(236,236,240,.42)");
    r.setProperty("--line", l ? "rgba(12,12,14,.22)" : "rgba(236,236,240,.2)");
    r.setProperty("--panel", l ? "rgba(243,243,241,.88)" : "rgba(5,5,6,.86)");
    r.setProperty("color-scheme", l ? "light" : "dark");
    document.body.style.background = bgCol();
    makeBuckets();
  }

  /* ---------- images ---------- */
  function toImage(src, name) {
    return new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () {
        res({ img: i, name: name });
      };
      i.onerror = rej;
      i.src = src;
    });
  }
  function analyse(img, name) {
    var iw = img.naturalWidth || img.width,
      ih = img.naturalHeight || img.height;
    var sc = Math.min(1, 520 / Math.max(iw, ih));
    var w = Math.max(2, Math.round(iw * sc)),
      h = Math.max(2, Math.round(ih * sc));
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h).data;
    var lum = new Float32Array(w * h),
      rgb = new Uint8Array(w * h * 3);
    for (var i = 0; i < w * h; i++) {
      var r = d[i * 4],
        gg = d[i * 4 + 1],
        b = d[i * 4 + 2];
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = gg;
      rgb[i * 3 + 2] = b;
      lum[i] = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
    }
    return {
      name: name,
      w: w,
      h: h,
      lum: lum,
      rgb: rgb,
      dep: softDepth(lum, w, h),
      ai: null,
      src: c,
    };
  }
  /* profondeur de secours : luminosité lissée et étirée */
  function softDepth(lum, w, h) {
    var a = new Float32Array(lum),
      b = new Float32Array(lum.length);
    for (var pass = 0; pass < 3; pass++) {
      for (var y = 0; y < h; y++)
        for (var x = 0; x < w; x++) {
          var s = 0,
            n = 0;
          for (var dy = -2; dy <= 2; dy += 2)
            for (var dx = -2; dx <= 2; dx += 2) {
              var xx = x + dx,
                yy = y + dy;
              if (xx >= 0 && yy >= 0 && xx < w && yy < h) {
                s += a[yy * w + xx];
                n++;
              }
            }
          b[y * w + x] = s / n;
        }
      var t = a;
      a = b;
      b = t;
    }
    return stretch(a);
  }
  function stretch(a) {
    var mn = 1e9,
      mx = -1e9,
      i;
    for (i = 0; i < a.length; i++) {
      if (a[i] < mn) mn = a[i];
      if (a[i] > mx) mx = a[i];
    }
    var out = new Float32Array(a.length),
      k = mx - mn || 1;
    for (i = 0; i < a.length; i++) out[i] = (a[i] - mn) / k;
    return out;
  }
  /* image d'exemple : ondes concentriques croisées */
  function demoImage() {
    var c = document.createElement("canvas");
    c.width = 560;
    c.height = 380;
    var g = c.getContext("2d"),
      id = g.createImageData(560, 380),
      d = id.data;
    for (var y = 0; y < 380; y++)
      for (var x = 0; x < 560; x++) {
        var d1 = Math.hypot(x - 210, y - 190),
          d2 = Math.hypot(x - 350, y - 170);
        var v = (Math.sin(d1 * 0.17) + Math.sin(d2 * 0.17)) * 0.25 + 0.5;
        var m = Math.max(0, 1 - Math.hypot((x - 280) / 250, (y - 185) / 175));
        v = v * Math.min(1, m * 2.2);
        var k = (y * 560 + x) * 4;
        d[k] = v * 215 + 20 * v;
        d[k + 1] = v * 235;
        d[k + 2] = v * 255;
        d[k + 3] = 255;
      }
    g.putImageData(id, 0, 0);
    return c;
  }

  /* ---------- particules ---------- */
  function build(scatter) {
    var im = images[cur];
    if (!im) return;
    var N = S.density,
      dark = !isLight();
    P.n = 0;
    P.hx = new Float32Array(N);
    P.hy = new Float32Array(N);
    P.hz = new Float32Array(N);
    P.x = new Float32Array(N);
    P.y = new Float32Array(N);
    P.vx = new Float32Array(N);
    P.vy = new Float32Array(N);
    P.ph = new Float32Array(N);
    P.col = new Array(N);
    P.th = new Float32Array(N);
    P.rd = new Float32Array(N);
    P.rt = new Float32Array(N);
    var dep = S.ai && im.ai ? im.ai : im.dep,
      rc = stageRect(),
      i = 0,
      tries = 0;
    while (i < N && tries < N * 40) {
      tries++;
      var px = (Math.random() * im.w) | 0,
        py = (Math.random() * im.h) | 0,
        k = py * im.w + px;
      var l = im.lum[k],
        w;
      if (!S.trueCol) {
        w = dark ? 0.03 + 0.97 * l * l : 0.03 + 0.97 * (1 - l) * (1 - l);
      } else w = 0.55 + 0.45 * (dark ? l : 1 - l * 0.5);
      if (Math.random() > w) continue;
      P.hx[i] = px + Math.random();
      P.hy[i] = py + Math.random();
      P.hz[i] = dep[k];
      P.ph[i] = Math.random() * 6.2832;
      P.th[i] = Math.random();
      P.rd[i] = 0.35 + Math.random() * 0.85;
      P.rt[i] = 1 / (5 + Math.random() * 9);
      var r = im.rgb[k * 3],
        g = im.rgb[k * 3 + 1],
        b = im.rgb[k * 3 + 2];
      if (S.neg) {
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
      }
      P.col[i] = "rgb(" + r + "," + g + "," + b + ")";
      if (scatter) {
        P.x[i] = W / 2 + (Math.random() - 0.5) * W * 1.5;
        P.y[i] = H / 2 + (Math.random() - 0.5) * H * 1.5;
      } else {
        P.x[i] = rc.ox + P.hx[i] * rc.s;
        P.y[i] = rc.oy + P.hy[i] * rc.s;
      }
      i++;
    }
    P.n = i;
    buildTrackers(im, rc, dep);
    updateInfo();
  }
  /* traqueurs : points indépendants, placés de préférence sur les contours et les zones claires */
  function buildTrackers(im, rc, dep) {
    var N = 900,
      i = 0,
      tries = 0;
    TK.hx = new Float32Array(N);
    TK.hy = new Float32Array(N);
    TK.hz = new Float32Array(N);
    TK.ph = new Float32Array(N);
    TK.x = new Float32Array(N);
    TK.y = new Float32Array(N);
    TK.vx = new Float32Array(N);
    TK.vy = new Float32Array(N);
    TK.k = new Float32Array(N);
    TK.ps = new Float32Array(N).fill(1);
    while (i < N && tries < N * 60) {
      tries++;
      var px = 1 + ((Math.random() * (im.w - 2)) | 0),
        py = 1 + ((Math.random() * (im.h - 2)) | 0),
        k = py * im.w + px;
      var e =
        Math.abs(im.lum[k] - im.lum[k + 1]) +
        Math.abs(im.lum[k] - im.lum[k + im.w]);
      var w =
        0.1 +
        0.5 * (isLight() ? 1 - im.lum[k] : im.lum[k]) +
        Math.min(0.4, e * 6);
      if (Math.random() > w) continue;
      TK.hx[i] = px;
      TK.hy[i] = py;
      TK.hz[i] = dep[k];
      TK.ph[i] = Math.random() * 6.2832;
      TK.k[i] = 0.035 + Math.random() * 0.07;
      TK.x[i] = rc.ox + px * rc.s;
      TK.y[i] = rc.oy + py * rc.s;
      i++;
    }
    TK.n = i;
  }
  function updateTrackers(im, rc) {
    var L = Math.min(TK.n, S.trackers);
    var cx = im.w / 2,
      cy = im.h / 2,
      amp = im.w * 0.014,
      ih = im.h,
      flow = S.flow;
    var zAmpT = im.w * S.fDepth * 1.5,
      R = Math.max(200, Math.min(W, H) * 0.4);
    for (var i = 0; i < L; i++) {
      var hx = TK.hx[i],
        hy = TK.hy[i],
        hz = TK.hz[i],
        ph = TK.ph[i],
        tx = hx,
        ty = hy;
      if (flow === "swarm") {
        var r = amp * 2.4 * (1.15 - hz),
          a = T * (0.35 + hz * 0.9) + ph;
        tx += Math.cos(a) * r;
        ty += Math.sin(a) * r;
      } else if (flow === "melt") {
        var m = (T * 0.11 + ph / 6.2832) % 1;
        ty += (0.5 - 0.5 * Math.cos(m * 6.2832)) * ih * 0.14 * (1.1 - hz * 0.6);
      } else if (flow === "travel") {
        var kk = (T * 0.09 + hz * 0.6 + ph * 0.02) % 1,
          sc = 0.72 + kk * 0.7;
        tx = cx + (hx - cx) * sc;
        ty = cy + (hy - cy) * sc;
      } else {
        tx += Math.sin(T * 0.6 + ph) * amp * 0.5;
        ty += Math.cos(T * 0.5 + ph * 1.3) * amp * 0.5;
      }
      project(
        tx - cx,
        ty - cy,
        (hz - 0.5) * zAmpT + Math.sin(T * 0.5 + ph) * amp * 0.6
      );
      var X = PX,
        Y = PY;
      TK.ps[i] = PS;
      var gx = mouse.px - X,
        gy = mouse.py - Y,
        gd = Math.sqrt(gx * gx + gy * gy);
      if (gd < R) {
        var f = 1 - gd / R;
        f = f * f * (0.22 + 0.5 * hz);
        X += gx * f;
        Y += gy * f;
      }
      TK.vx[i] += (X - TK.x[i]) * TK.k[i];
      TK.vy[i] += (Y - TK.y[i]) * TK.k[i];
      TK.vx[i] *= 0.86;
      TK.vy[i] *= 0.86;
      TK.x[i] += TK.vx[i];
      TK.y[i] += TK.vy[i];
    }
  }
  /* éclabousser : onde de choc à partir d'un point de l'écran */
  function splash(x, y, k) {
    var R = Math.max(220, Math.min(W, H) * 0.45);
    for (var i = 0; i < P.n; i++) {
      var dx = P.x[i] - x,
        dy = P.y[i] - y,
        d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      if (d < R) {
        var f = 1 - d / R;
        f *= f;
        var q = f * (26 + P.hz[i] * 30) * k;
        P.vx[i] += (dx / d) * q;
        P.vy[i] += (dy / d) * q;
      }
    }
  }

  /* ---------- couleurs ---------- */
  var buckets = [];
  function inkRGB() {
    var f = fgRGB();
    if (!S.lightOn) return f;
    var t = S.tint;
    return isLight()
      ? [(t[0] * 0.4) | 0, (t[1] * 0.4) | 0, (t[2] * 0.4) | 0]
      : t;
  }
  function makeBuckets() {
    var f = inkRGB();
    buckets = [];
    for (var i = 0; i < 6; i++) {
      buckets.push(
        "rgba(" +
          f[0] +
          "," +
          f[1] +
          "," +
          f[2] +
          "," +
          (0.25 + i * 0.15).toFixed(2) +
          ")"
      );
    }
  }
  function hsl2rgb(h, s, l) {
    var a = s * Math.min(l, 1 - l);
    function f(n) {
      var k = (n + h / 30) % 12;
      return Math.round(
        255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
      );
    }
    return [f(0), f(8), f(4)];
  }

  /* ---------- boucle ---------- */
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    T += dt;
    frameNo++;
    var im = images[cur];
    if (!cam.drag) {
      cam.yaw += cam.vy;
      cam.pitch = clamp(cam.pitch + cam.vp, -1.25, 1.25);
      cam.vy *= 0.94;
      cam.vp *= 0.94;
    }
    var idle = now - mouse.last > 3000;
    if (idle) {
      mouse.tx = Math.sin(T * 0.35) * 0.7;
      mouse.ty = Math.cos(T * 0.27) * 0.5;
      mouse.ptx = W / 2 + Math.sin(T * 0.5) * W * 0.2;
      mouse.pty = H * 0.4 + Math.cos(T * 0.37) * H * 0.15;
    }
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    mouse.px += (mouse.ptx - mouse.px) * 0.12;
    mouse.py += (mouse.pty - mouse.py) * 0.12;
    if (S.hue && S.lightOn && frameNo % 6 === 0) {
      S.tint = hsl2rgb((T * 20) % 360, 0.7, 0.72);
      makeBuckets();
    }

    if (S.trails) {
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = bgCol();
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = bgCol();
      ctx.fillRect(0, 0, W, H);
    }

    if (im && P.n) {
      var rc = stageRect(),
        s = rc.s,
        ox = rc.ox,
        oy = rc.oy;
      var cx = im.w / 2,
        cy = im.h / 2,
        amp = im.w * 0.014,
        ih = im.h;
      var flow = S.flow,
        q = S.fDrift * 0.6,
        zAmp = im.w * S.fDepth * 1.5,
        useCol = S.trueCol;
      /* dérive : une part des particules s'échappe vers l'extérieur, puis s'efface et renaît à sa place */
      var escF = Math.min(0.9, S.fDrift * 0.55),
        escR = im.w * (0.3 + S.fDrift * 0.9);
      var sz0 = S.size * (s > 1 ? Math.min(1.4, s) : 1);
      var scanY = oy + ((T * 0.2) % 1.15) * im.h * s,
        band = Math.max(16, im.h * s * 0.05);
      var gR = Math.max(160, Math.min(W, H) * 0.3) * (0.5 + S.fGather),
        gK = S.fGather * 1.6,
        trailsOn = S.trails;
      var hotCol = isLight() ? "#000" : "#fff";
      setCam(im, rc);

      if (S.fSplash > 0 && T > nextSplash) {
        nextSplash = T + (8 - 5 * S.fSplash) + Math.random() * 3;
        if (idle)
          splash(
            ox + Math.random() * im.w * s,
            oy + Math.random() * im.h * s,
            0.5 + S.fSplash * 1.3
          );
      }
      if (trailsOn) {
        var f0 = inkRGB();
        ctx.strokeStyle = "rgba(" + f0[0] + "," + f0[1] + "," + f0[2] + ",.3)";
        ctx.lineWidth = 0.6;
        ctx.beginPath();
      }
      var streakMax = Math.min(P.n, 24000);

      for (var i = 0; i < P.n; i++) {
        var hx = P.hx[i],
          hy = P.hy[i],
          hz = P.hz[i],
          ph = P.ph[i],
          tx = hx,
          ty = hy;
        if (flow === "swarm") {
          var r = amp * 2.4 * (1.15 - hz),
            a = T * (0.35 + hz * 0.9) + ph;
          tx += Math.cos(a) * r;
          ty += Math.sin(a) * r;
        } else if (flow === "melt") {
          var m = (T * 0.11 + ph / 6.2832) % 1;
          ty +=
            (0.5 - 0.5 * Math.cos(m * 6.2832)) * ih * 0.14 * (1.1 - hz * 0.6);
          tx += Math.sin(T * 0.4 + ph) * amp * 0.4;
        } else if (flow === "travel") {
          var kk = (T * 0.09 + hz * 0.6 + ph * 0.02) % 1,
            sc = 0.72 + kk * 0.7;
          tx = cx + (hx - cx) * sc;
          ty = cy + (hy - cy) * sc;
        }
        tx += Math.sin(T * 0.6 + ph) * amp * (0.3 + hz) * q;
        ty += Math.cos(T * 0.5 + ph * 1.3) * amp * (0.3 + hz) * q;
        var tz = (hz - 0.5) * zAmp + Math.sin(T * 0.4 + ph) * amp * 0.8 * q;
        project(tx - cx, ty - cy, tz);
        var X = PX,
          Y = PY,
          pS = PS;
        if (gK > 0) {
          var gx = mouse.px - X,
            gy = mouse.py - Y,
            gd = Math.sqrt(gx * gx + gy * gy);
          if (gd < gR) {
            var gf = 1 - gd / gR;
            gf = Math.min(0.9, gf * gf * (0.2 + 0.7 * hz) * gK);
            X += gx * gf;
            Y += gy * gf;
          }
        }
        P.vx[i] += (X - P.x[i]) * 0.07;
        P.vy[i] += (Y - P.y[i]) * 0.07;
        P.vx[i] *= 0.8;
        P.vy[i] *= 0.8;
        P.x[i] += P.vx[i];
        P.y[i] += P.vy[i];
        var px = P.x[i],
          py = P.y[i],
          al = 1;
        if (P.th[i] < escF) {
          var u = (T * P.rt[i] + ph * 0.15915) % 1;
          var dd = Math.pow(u, 1.7) * escR * P.rd[i] * s * pS;
          var ex = hx - cx,
            ey = hy - cy,
            el = Math.sqrt(ex * ex + ey * ey) + 1;
          var dxn = Math.cos(ph) * 0.55 + (ex / el) * 0.7,
            dyn = Math.sin(ph) * 0.55 + (ey / el) * 0.7;
          var sw = Math.sin(T * 0.8 + ph * 3) * dd * 0.12;
          px += dxn * dd - dyn * sw;
          py += dyn * dd + dxn * sw;
          al = 1 - u;
          al *= al;
        }
        var sz =
            sz0 * (0.55 + hz * 0.95) * pS * (al < 1 ? 0.45 + 0.55 * al : 1),
          hot = false;
        if (S.scan && Math.abs(py - scanY) < band) {
          hot = true;
          sz *= 1.9;
        }
        ctx.fillStyle = hot
          ? hotCol
          : useCol
          ? P.col[i]
          : buckets[(hz * 5.99) | 0];
        if (al < 1) ctx.globalAlpha = al;
        ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        if (al < 1) ctx.globalAlpha = 1;
        if (trailsOn && i < streakMax) {
          var sl = Math.sqrt(P.vx[i] * P.vx[i] + P.vy[i] * P.vy[i]),
            sk = sl > 0 ? Math.min(7, 36 / sl) : 0;
          ctx.moveTo(px - P.vx[i] * sk, py - P.vy[i] * sk);
          ctx.lineTo(px, py);
        }
      }
      if (trailsOn) ctx.stroke();
      if (S.scan) {
        var f = fgRGB();
        ctx.fillStyle = "rgba(" + f[0] + "," + f[1] + "," + f[2] + ",.35)";
        ctx.fillRect(ox, scanY, im.w * s, 1);
      }
      if (S.links || S.track || S.marks) {
        updateTrackers(im, rc);
        drawTrackers(im, rc);
      }
      drawHUD(im, rc);
    }
    requestAnimationFrame(frame);
  }
  function sgn(v) {
    return (v < 0 ? "-" : "+") + Math.abs(v).toFixed(2);
  }
  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }
  function drawTrackers(im, rc) {
    var L = Math.min(TK.n, S.trackers),
      f = fgRGB(),
      rgb = f[0] + "," + f[1] + "," + f[2];
    var lw = Math.max(0.3, S.line);
    if (S.links) {
      var D = Math.sqrt((rc.s * rc.s * im.w * im.h) / Math.max(L, 1)) * 1.9,
        inv = 1 / D,
        cols = Math.ceil(W * inv) + 2,
        grid = new Map(),
        i;
      for (i = 0; i < L; i++) {
        var key = ((TK.y[i] * inv) | 0) * cols + ((TK.x[i] * inv) | 0);
        var arr = grid.get(key);
        if (arr) arr.push(i);
        else grid.set(key, [i]);
      }
      ctx.lineWidth = lw;
      ctx.strokeStyle = "rgba(" + rgb + ",.32)";
      ctx.beginPath();
      var count = 0;
      for (var j = 0; j < L && count < 5000; j++) {
        var cx = (TK.x[j] * inv) | 0,
          cy = (TK.y[j] * inv) | 0;
        for (var oy = -1; oy <= 1; oy++)
          for (var ox = -1; ox <= 1; ox++) {
            var a = grid.get((cy + oy) * cols + (cx + ox));
            if (!a) continue;
            for (var q = 0; q < a.length; q++) {
              var k = a[q];
              if (k <= j) continue;
              var dx = TK.x[k] - TK.x[j],
                dy = TK.y[k] - TK.y[j];
              if (dx * dx + dy * dy < D * D) {
                ctx.moveTo(TK.x[j], TK.y[j]);
                ctx.lineTo(TK.x[k], TK.y[k]);
                count++;
              }
            }
          }
      }
      ctx.stroke();
    }
    if (S.track || S.marks) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = "rgba(" + rgb + ",.8)";
      ctx.fillStyle = "rgba(" + rgb + ",.7)";
      ctx.font = "8px Manrope, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.beginPath();
      for (var t = 0; t < L; t++) {
        var x = TK.x[t],
          y = TK.y[t],
          h = (4 + TK.hz[t] * 8) * TK.ps[t];
        if (S.track) {
          var c = h * 0.6;
          ctx.moveTo(x - h, y - h + c);
          ctx.lineTo(x - h, y - h);
          ctx.lineTo(x - h + c, y - h);
          ctx.moveTo(x + h - c, y - h);
          ctx.lineTo(x + h, y - h);
          ctx.lineTo(x + h, y - h + c);
          ctx.moveTo(x + h, y + h - c);
          ctx.lineTo(x + h, y + h);
          ctx.lineTo(x + h - c, y + h);
          ctx.moveTo(x - h + c, y + h);
          ctx.lineTo(x - h, y + h);
          ctx.lineTo(x - h, y + h - c);
          ctx.moveTo(x - 1.5, y);
          ctx.lineTo(x + 1.5, y);
          ctx.moveTo(x, y - 1.5);
          ctx.lineTo(x, y + 1.5);
        }
        if (S.marks) {
          ctx.moveTo(x - 2.5, y);
          ctx.lineTo(x + 2.5, y);
          ctx.moveTo(x, y - 2.5);
          ctx.lineTo(x, y + 2.5);
        }
      }
      ctx.stroke();
      if (S.track) {
        var step = Math.max(1, Math.round(L / 16));
        try {
          ctx.letterSpacing = "1px";
        } catch (e) {}
        for (var u = 0; u < L; u += step) {
          var nx = (TK.hx[u] - im.w / 2) / (im.w / 2),
            ny = -(TK.hy[u] - im.h / 2) / (im.h / 2),
            nz = TK.hz[u] - 0.5;
          ctx.fillText(
            pad2(u + 1) + " " + sgn(nx) + " " + sgn(ny) + " " + sgn(nz),
            TK.x[u] + TK.hz[u] * 8 * TK.ps[u] + 7,
            TK.y[u] - TK.hz[u] * 8 * TK.ps[u] + 3
          );
        }
        try {
          ctx.letterSpacing = "0px";
        } catch (e) {}
      }
    }
  }
  /* cadre gradué autour de la scène */
  function drawHUD(im, rc) {
    if (!S.hud) return;
    var pad = 28,
      x0 = rc.ox - pad,
      y0 = rc.oy - pad,
      x1 = rc.ox + im.w * rc.s + pad,
      y1 = rc.oy + im.h * rc.s + pad;
    var f = fgRGB(),
      rgb = f[0] + "," + f[1] + "," + f[2];
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(" + rgb + ",.3)";
    ctx.fillStyle = "rgba(" + rgb + ",.42)";
    ctx.beginPath();
    [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ].forEach(function (c) {
      ctx.moveTo(c[0] - 10, c[1] + 0.5);
      ctx.lineTo(c[0] + 10, c[1] + 0.5);
      ctx.moveTo(c[0] + 0.5, c[1] - 10);
      ctx.lineTo(c[0] + 0.5, c[1] + 10);
    });
    var step = 9,
      i,
      x,
      y;
    for (x = x0 + step, i = 1; x < x1 - 4; x += step, i++) {
      var Lh = i % 5 === 0 ? 9 : 4;
      ctx.moveTo(x + 0.5, y0);
      ctx.lineTo(x + 0.5, y0 + Lh);
      ctx.moveTo(x + 0.5, y1);
      ctx.lineTo(x + 0.5, y1 - Lh);
    }
    for (y = y0 + step, i = 1; y < y1 - 4; y += step, i++) {
      var Lv = i % 5 === 0 ? 9 : 4;
      ctx.moveTo(x0, y + 0.5);
      ctx.lineTo(x0 + Lv, y + 0.5);
      ctx.moveTo(x1, y + 0.5);
      ctx.lineTo(x1 - Lv, y + 0.5);
    }
    ctx.stroke();
    ctx.font = "9px Manrope, sans-serif";
    ctx.textBaseline = "alphabetic";
    try {
      ctx.letterSpacing = "2px";
    } catch (e) {}
    ctx.textAlign = "left";
    ctx.fillText(
      pad2(cur + 1) +
        " / " +
        pad2(images.length) +
        "  " +
        images[cur].name.toUpperCase(),
      x0 + 14,
      y0 - 10
    );
    ctx.fillText(P.n.toLocaleString("fr-FR") + " PTS", x0 + 14, y1 + 20);
    ctx.textAlign = "right";
    ctx.fillText(
      FORCES[S.last].toUpperCase() + " " + Math.round(S[S.last] * 100),
      x1 - 14,
      y0 - 10
    );
    ctx.textAlign = "left";
    try {
      ctx.letterSpacing = "0px";
    } catch (e) {}
  }

  /* ---------- informations et miniatures ---------- */
  function updateInfo() {
    $("#title").textContent = FORCES[S.last];
    var im = images[cur];
    $("#l1").textContent =
      "Modèle de profondeur · " +
      (S.ai && im && im.ai ? "Depth Anything V2 Small" : "luminosité");
    $("#l2").textContent = P.n.toLocaleString("fr-FR") + " points";
  }
  function setStatus(t) {
    var e = $("#status");
    e.textContent = t;
    e.style.opacity = t ? 1 : 0;
    clearTimeout(setStatus.t);
    if (t)
      setStatus.t = setTimeout(function () {
        e.style.opacity = 0;
      }, 3200);
  }
  function buildThumbs() {
    var box = $("#thumbs");
    box.innerHTML = "";
    images.forEach(function (im, i) {
      var b = document.createElement("button");
      b.className = "th" + (i === cur ? " on" : "");
      b.setAttribute("aria-label", "Image " + (i + 1) + " : " + im.name);
      var c = document.createElement("canvas");
      c.width = 84;
      c.height = 84;
      var g = c.getContext("2d"),
        sc = Math.max(84 / im.w, 84 / im.h),
        w = im.w * sc,
        h = im.h * sc;
      g.drawImage(im.src, (84 - w) / 2, (84 - h) / 2, w, h);
      b.appendChild(c);
      var n = document.createElement("i");
      n.textContent = i + 1;
      b.appendChild(n);
      b.addEventListener("click", function () {
        show(i, true);
      });
      box.appendChild(b);
    });
    if (images.length < 4) {
      var a = document.createElement("button");
      a.className = "th add";
      a.textContent = "+";
      a.setAttribute("aria-label", "Ajouter des images");
      a.addEventListener("click", function () {
        $("#file").click();
      });
      box.appendChild(a);
    }
  }
  function show(i, scatter) {
    if (!images.length) return;
    cur = ((i % images.length) + images.length) % images.length;
    build(scatter);
    var ts = $("#thumbs").children;
    for (var k = 0; k < ts.length; k++) ts[k].classList.toggle("on", k === cur);
  }
  function loadFiles(files) {
    var list = Array.prototype.filter
      .call(files, function (f) {
        return /^image\//.test(f.type);
      })
      .slice(0, 4);
    if (!list.length) return;
    setStatus("Chargement…");
    Promise.all(
      list.map(function (f) {
        var url = URL.createObjectURL(f);
        return toImage(url, f.name.replace(/\.[^.]+$/, "")).then(function (r) {
          var a = analyse(r.img, r.name);
          URL.revokeObjectURL(url);
          return a;
        });
      })
    )
      .then(function (arr) {
        images = arr;
        cur = 0;
        $("#hint").classList.remove("on");
        buildThumbs();
        if (S.ai) runAI();
        show(0, true);
        setStatus("");
      })
      .catch(function () {
        setStatus("Image illisible, essaie un autre fichier");
      });
  }

  /* ---------- profondeur IA (optionnelle) ---------- */
  var depthPipe = null,
    aiBusy = false;
  async function runAI() {
    if (aiBusy) return;
    aiBusy = true;
    try {
      if (!depthPipe) {
        setStatus("Chargement du modèle de profondeur…");
        var mod = await import(
          "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2"
        );
        depthPipe = await mod.pipeline(
          "depth-estimation",
          "onnx-community/depth-anything-v2-small"
        );
      }
      for (var n = 0; n < images.length; n++) {
        var im = images[n];
        if (im.ai) continue;
        setStatus("Profondeur " + (n + 1) + " / " + images.length + "…");
        var out = await depthPipe(im.src.toDataURL("image/png"));
        var d = out.depth,
          dd = new Float32Array(im.w * im.h);
        for (var y = 0; y < im.h; y++)
          for (var x = 0; x < im.w; x++) {
            var sx = Math.min(d.width - 1, ((x / im.w) * d.width) | 0),
              sy = Math.min(d.height - 1, ((y / im.h) * d.height) | 0);
            dd[y * im.w + x] = d.data[(sy * d.width + sx) * (d.channels || 1)];
          }
        im.ai = stretch(dd);
      }
      build(false);
      setStatus("");
    } catch (e) {
      S.ai = false;
      $("#ai").setAttribute("aria-pressed", "false");
      setStatus("Modèle indisponible, la luminosité sert de profondeur");
      updateInfo();
    }
    aiBusy = false;
  }

  /* ---------- interface ---------- */
  function tog(id, key, fn) {
    $(id).addEventListener("click", function () {
      S[key] = !S[key];
      this.setAttribute("aria-pressed", S[key]);
      fn && fn();
    });
  }
  ["track", "links", "scan", "trails", "marks"].forEach(function (k) {
    tog("#" + k, k);
  });
  tog("#hud", "hud");
  tog("#white", "onWhite", function () {
    applyTheme();
    build(false);
  });
  tog("#neg", "neg", function () {
    applyTheme();
    build(false);
  });
  tog("#true", "trueCol", function () {
    build(false);
  });
  tog("#ai", "ai", function () {
    if (
      S.ai &&
      images.some(function (i) {
        return !i.ai;
      })
    )
      runAI();
    else {
      build(false);
    }
  });
  function setLight(on) {
    S.lightOn = on;
    $("#light").setAttribute("aria-pressed", on);
    makeBuckets();
  }
  $("#light").addEventListener("click", function () {
    setLight(!S.lightOn);
  });

  Object.keys(FORCES).forEach(function (id) {
    $("#" + id).addEventListener("input", function () {
      S[id] = this.value / 100;
      S.last = id;
      updateInfo();
    });
  });
  var flowRow = $("#g-flow");
  flowRow.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var off = b.classList.contains("on");
    Array.prototype.forEach.call(flowRow.children, function (c) {
      c.classList.remove("on");
    });
    if (!off) b.classList.add("on");
    S.flow = off ? "" : b.dataset.v;
  });
  /* palette de lumière */
  var COLORS = [
    [255, 233, 200],
    [205, 215, 255],
    [255, 170, 60],
    [255, 70, 60],
    [40, 220, 190],
    [150, 110, 255],
  ];
  (function () {
    var box = $("#dots");
    COLORS.forEach(function (c, i) {
      var b = document.createElement("button");
      b.className = "dot" + (i === 0 ? " on" : "");
      b.style.background = "rgb(" + c.join(",") + ")";
      b.setAttribute("aria-label", "Couleur de lumière " + (i + 1));
      b.addEventListener("click", function () {
        pickDot(b, c, false);
      });
      box.appendChild(b);
    });
    var a = document.createElement("button");
    a.className = "dot auto";
    a.setAttribute("aria-label", "Lumière changeante");
    a.title = "Couleur changeante";
    a.addEventListener("click", function () {
      pickDot(a, null, true);
    });
    box.appendChild(a);
  })();
  function pickDot(btn, c, hue) {
    Array.prototype.forEach.call($("#dots").children, function (d) {
      d.classList.remove("on");
    });
    btn.classList.add("on");
    S.hue = hue;
    if (c) S.tint = c;
    setLight(true);
  }
  $("#density").addEventListener("input", function () {
    S.density = +this.value;
    build(false);
  });
  $("#size").addEventListener("input", function () {
    S.size = this.value / 10;
  });
  function syncTrk() {
    var v = S.trackers;
    $("#sparse").classList.toggle("on", v <= 300);
    $("#dense").classList.toggle("on", v > 300);
  }
  function ensureTrk() {
    if (!S.track && !S.links && !S.marks) {
      S.track = true;
      $("#track").setAttribute("aria-pressed", "true");
    }
  }
  $("#trackers").addEventListener("input", function () {
    S.trackers = +this.value;
    ensureTrk();
    syncTrk();
  });
  $("#sparse").addEventListener("click", function () {
    S.trackers = 120;
    $("#trackers").value = 120;
    ensureTrk();
    syncTrk();
  });
  $("#dense").addEventListener("click", function () {
    S.trackers = 650;
    $("#trackers").value = 650;
    ensureTrk();
    syncTrk();
  });
  $("#line").addEventListener("input", function () {
    S.line = this.value / 10;
  });
  $("#next").addEventListener("click", function () {
    show(cur + 1, true);
  });
  $("#reset").addEventListener("click", resetCam);
  $("#file").addEventListener("change", function () {
    loadFiles(this.files);
    this.value = "";
  });
  $("#credBtn").addEventListener("click", function () {
    $("#credits").classList.toggle("on");
  });
  function toggleUI() {
    $("#ui").classList.toggle("off");
    setTimeout(function () {
      build(false);
    }, 0);
  }
  $("#hide").addEventListener("click", toggleUI);
  function fullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) {}
  }
  $("#fs").addEventListener("click", fullscreen);

  /* pointeur : rotation 3D, zoom, clic = éclaboussure */
  var ptrs = new Map(),
    pinch0 = 0;
  cv.style.touchAction = "none";
  cv.addEventListener("pointerdown", function (e) {
    try {
      cv.setPointerCapture(e.pointerId);
    } catch (_) {}
    ptrs.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      t: performance.now(),
      moved: 0,
    });
    cam.drag = true;
    cam.vy = 0;
    cam.vp = 0;
    mouse.ptx = e.clientX;
    mouse.pty = e.clientY;
    mouse.last = performance.now();
    if (ptrs.size === 2) {
      var a = Array.from(ptrs.values());
      pinch0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    }
  });
  addEventListener("pointermove", function (e) {
    var p = ptrs.get(e.pointerId);
    if (!p && e.target.closest && e.target.closest("#bottom,#thumbs,.tr"))
      return;
    mouse.ptx = e.clientX;
    mouse.pty = e.clientY;
    mouse.last = performance.now();
    if (p) {
      var dx = e.clientX - p.x,
        dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      p.moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size >= 2) {
        var a = Array.from(ptrs.values()),
          d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        if (pinch0 > 0) cam.zoom = clamp((cam.zoom * d) / pinch0, 0.45, 3.2);
        pinch0 = d;
      } else {
        cam.yaw += dx * 0.006;
        cam.pitch = clamp(cam.pitch - dy * 0.006, -1.25, 1.25);
        cam.vy = dx * 0.0016;
        cam.vp = -dy * 0.0016;
      }
    } else {
      mouse.tx = (e.clientX / W - 0.5) * 2;
      mouse.ty = (e.clientY / H - 0.5) * 2;
    }
  });
  function endPtr(e) {
    var p = ptrs.get(e.pointerId);
    if (
      p &&
      ptrs.size === 1 &&
      p.moved < 6 &&
      performance.now() - p.t < 350 &&
      S.fSplash > 0
    )
      splash(e.clientX, e.clientY, 0.6 + S.fSplash * 1.4);
    ptrs.delete(e.pointerId);
    if (!ptrs.size) cam.drag = false;
    pinch0 = 0;
  }
  cv.addEventListener("pointerup", endPtr);
  cv.addEventListener("pointercancel", endPtr);
  cv.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0012), 0.45, 3.2);
    },
    { passive: false }
  );
  cv.addEventListener("dblclick", resetCam);

  addEventListener("keydown", function (e) {
    if (/input|textarea/i.test(e.target.tagName)) return;
    if (e.code === "Space") {
      e.preventDefault();
      show(cur + 1, true);
    } else if (e.key === "s" || e.key === "S") setLight(!S.lightOn);
    else if (e.key === "p" || e.key === "P") savePNG();
    else if (e.key === "h" || e.key === "H") toggleUI();
    else if (e.key === "f" || e.key === "F") fullscreen();
  });
  addEventListener("dragover", function (e) {
    e.preventDefault();
    $("#drop").classList.add("on");
  });
  addEventListener("dragleave", function (e) {
    if (!e.relatedTarget) $("#drop").classList.remove("on");
  });
  addEventListener("drop", function (e) {
    e.preventDefault();
    $("#drop").classList.remove("on");
    loadFiles(e.dataTransfer.files);
  });
  addEventListener("paste", function (e) {
    if (e.clipboardData && e.clipboardData.files.length)
      loadFiles(e.clipboardData.files);
  });
  addEventListener("resize", function () {
    resize();
    build(false);
  });

  /* ---------- export ---------- */
  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 4000);
  }
  function savePNG() {
    cv.toBlob(function (b) {
      if (b) download(b, "nuee-" + Date.now() + ".png");
    }, "image/png");
  }
  $("#png").addEventListener("click", savePNG);
  var rec = null,
    chunks = [];
  $("#rec").addEventListener("click", function () {
    var btn = this;
    if (rec) {
      rec.stop();
      return;
    }
    try {
      var type = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ].filter(function (t) {
        return window.MediaRecorder && MediaRecorder.isTypeSupported(t);
      })[0];
      if (!type) {
        setStatus("Enregistrement non pris en charge par ce navigateur");
        return;
      }
      var stream = cv.captureStream(60);
      rec = new MediaRecorder(stream, {
        mimeType: type,
        videoBitsPerSecond: 16000000,
      });
      chunks = [];
      rec.ondataavailable = function (e) {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = function () {
        download(
          new Blob(chunks, { type: type }),
          "nuee-" + Date.now() + (type.indexOf("mp4") > -1 ? ".mp4" : ".webm")
        );
        rec = null;
        btn.textContent = "Enregistrer ●";
        btn.classList.remove("on");
        setStatus("");
      };
      rec.start();
      btn.textContent = "Arrêter ■";
      btn.classList.add("on");
      setStatus("Enregistrement en cours…");
    } catch (e) {
      setStatus("Enregistrement impossible ici");
      rec = null;
    }
  });

  /* ---------- démarrage ---------- */
  resize();
  applyTheme();
  images = [analyse(demoImage(), "Ripple")];
  buildThumbs();
  requestAnimationFrame(function () {
    show(0, true);
    $("#hint").classList.add("on");
    setTimeout(function () {
      $("#hint").classList.remove("on");
    }, 5200);
  });
  requestAnimationFrame(frame);
})();
