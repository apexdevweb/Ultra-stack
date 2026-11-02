/*! Nuée embed 1.0
 *  Affiche dans un <div> une scène exportée depuis Nuée.
 *
 *  <div data-nuee="nuee-scene.json" style="width:100%;height:480px"></div>
 *  <script src="nuee-embed.js"></script>
 *
 *  Attributs facultatifs sur le <div> :
 *    data-nuee-transparent="true"   fond transparent (la page se voit derrière)
 *    data-nuee-bg="#000000"         couleur de fond
 *    data-nuee-density="60000"      nombre de particules (remplace celui de la scène)
 *    data-nuee-drag="true"          rotation 3D au glisser (désactivée par défaut pour ne pas bloquer le défilement)
 *    data-nuee-interactive="false"  aucune réaction à la souris
 */
(function (root) {
  "use strict";

  var DEF = {
    fDrift: 0.5,
    fSplash: 0.35,
    fGather: 0.4,
    fDepth: 0.6,
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
    ai: false,
    density: 80000,
    size: 1,
    trackers: 150,
    line: 0.8,
    cut: true,
    cutT: 0.35,
    axA: -0.25,
    axB: 0.65,
    axL: 0.63,
    trkFl: 0.8,
    trkSz: 1,
    trkSpr: 1,
    mtrail: true,
    rep: 0.6,
    repR: 130,
    retSpd: 0.633,
    retDens: 1,
    trkCol: null,
    linkCol: null,
  };

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function pack(r, g, b) {
    return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  }
  function hexRGB(h) {
    var v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
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
  function maskedStretch(a, m) {
    var mn = 1e9,
      mx = -1e9,
      i;
    for (i = 0; i < a.length; i++) {
      if (m[i] > 0.5) {
        if (a[i] < mn) mn = a[i];
        if (a[i] > mx) mx = a[i];
      }
    }
    if (!(mx > mn)) return stretch(a);
    var out = new Float32Array(a.length),
      k = mx - mn;
    for (i = 0; i < a.length; i++) out[i] = clamp((a[i] - mn) / k, 0, 1);
    return out;
  }
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
    return a;
  }

  /* ---------- analyse de l'image ---------- */
  function analyse(img, S, depthImg) {
    var iw = img.naturalWidth || img.width,
      ih = img.naturalHeight || img.height;
    var sc = Math.min(1, 1000 / Math.max(iw, ih));
    var w = Math.max(2, Math.round(iw * sc)),
      h = Math.max(2, Math.round(ih * sc));
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h).data;
    var lum = new Float32Array(w * h),
      rgb = new Uint8Array(w * h * 3),
      al = new Uint8Array(w * h),
      ta = 0,
      i;
    for (i = 0; i < w * h; i++) {
      var r = d[i * 4],
        gg = d[i * 4 + 1],
        b = d[i * 4 + 2];
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = gg;
      rgb[i * 3 + 2] = b;
      al[i] = d[i * 4 + 3];
      if (al[i] < 250) ta++;
      lum[i] = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
    }
    var hist = new Uint32Array(256),
      k;
    for (k = 0; k < lum.length; k++) hist[Math.min(255, (lum[k] * 255) | 0)]++;
    var lo = 0,
      hi = 255,
      acc = 0,
      t2 = lum.length * 0.02,
      t98 = lum.length * 0.98;
    for (k = 0; k < 256; k++) {
      acc += hist[k];
      if (acc >= t2) {
        lo = k;
        break;
      }
    }
    acc = 0;
    for (k = 0; k < 256; k++) {
      acc += hist[k];
      if (acc >= t98) {
        hi = k;
        break;
      }
    }
    if (hi - lo > 12) {
      var sc2 = 1 / ((hi - lo) / 255),
        l0 = lo / 255;
      for (k = 0; k < lum.length; k++)
        lum[k] = clamp((lum[k] - l0) * sc2, 0, 1);
    }
    var im = {
      w: w,
      h: h,
      lum: lum,
      rgb: rgb,
      alpha: ta > w * h * 0.01 ? al : null,
      depRaw: softDepth(lum, w, h),
      dep: null,
      ai: null,
      aiRaw: null,
      mask: null,
    };
    if (depthImg) {
      var c2 = document.createElement("canvas");
      c2.width = w;
      c2.height = h;
      var g2 = c2.getContext("2d", { willReadFrequently: true });
      g2.drawImage(depthImg, 0, 0, w, h);
      var dd = g2.getImageData(0, 0, w, h).data,
        ar = new Float32Array(w * h);
      for (i = 0; i < w * h; i++) ar[i] = dd[i * 4] / 255;
      im.aiRaw = ar;
    }
    computeMask(im, S);
    return im;
  }

  /* découpe : retire le fond pour ne garder que la forme du sujet */
  function computeMask(im, S) {
    var w = im.w,
      h = im.h,
      n = w * h,
      m = new Float32Array(n),
      i,
      x,
      y;
    if (im.alpha) {
      for (i = 0; i < n; i++) m[i] = im.alpha[i] / 255;
    } else if (!S.cut) {
      m.fill(1);
    } else if (S.ai && im.aiRaw) {
      var dn = stretch(im.aiRaw),
        thr = 0.78 - S.cutT * 0.62,
        rw = new Float32Array(n);
      for (i = 0; i < n; i++) rw[i] = dn[i] > thr ? 1 : 0;
      for (y = 0; y < h; y++)
        for (x = 0; x < w; x++) {
          var sm = 0,
            ct = 0;
          for (var dy2 = -2; dy2 <= 2; dy2++)
            for (var dx2 = -2; dx2 <= 2; dx2++) {
              var x2 = x + dx2,
                y2 = y + dy2;
              if (x2 >= 0 && y2 >= 0 && x2 < w && y2 < h) {
                sm += rw[y2 * w + x2];
                ct++;
              }
            }
          m[y * w + x] = sm / ct;
        }
    } else {
      var rgb = im.rgb,
        sr = 0,
        sg = 0,
        sb = 0,
        c = 0;
      var add = function (j) {
        sr += rgb[j * 3];
        sg += rgb[j * 3 + 1];
        sb += rgb[j * 3 + 2];
        c++;
      };
      for (x = 0; x < w; x++) {
        add(x);
        add((h - 1) * w + x);
      }
      for (y = 1; y < h - 1; y++) {
        add(y * w);
        add(y * w + w - 1);
      }
      var mr = sr / c,
        mg = sg / c,
        mb = sb / c,
        tolG = 12 + S.cutT * 140,
        tolL = 16;
      var dG = function (j) {
        var a = rgb[j * 3] - mr,
          b = rgb[j * 3 + 1] - mg,
          d = rgb[j * 3 + 2] - mb;
        return Math.sqrt(a * a + b * b + d * d);
      };
      var dL = function (j, k) {
        var a = rgb[j * 3] - rgb[k * 3],
          b = rgb[j * 3 + 1] - rgb[k * 3 + 1],
          d = rgb[j * 3 + 2] - rgb[k * 3 + 2];
        return Math.sqrt(a * a + b * b + d * d);
      };
      var bgm = new Uint8Array(n),
        st = new Int32Array(n),
        sp = 0;
      var seed = function (j) {
        if (!bgm[j] && dG(j) < tolG) {
          bgm[j] = 1;
          st[sp++] = j;
        }
      };
      var tryN = function (j, k) {
        if (!bgm[k] && dG(k) < tolG && dL(j, k) < tolL) {
          bgm[k] = 1;
          st[sp++] = k;
        }
      };
      for (x = 0; x < w; x++) {
        seed(x);
        seed((h - 1) * w + x);
      }
      for (y = 0; y < h; y++) {
        seed(y * w);
        seed(y * w + w - 1);
      }
      while (sp) {
        i = st[--sp];
        x = i % w;
        y = (i / w) | 0;
        if (x > 0) tryN(i, i - 1);
        if (x < w - 1) tryN(i, i + 1);
        if (y > 0) tryN(i, i - w);
        if (y < h - 1) tryN(i, i + w);
      }
      var raw = new Float32Array(n),
        tot = 0;
      for (i = 0; i < n; i++) {
        raw[i] = bgm[i] ? 0 : 1;
        tot += raw[i];
      }
      if (tot < n * 0.002) {
        m.fill(1);
      } else {
        for (y = 0; y < h; y++)
          for (x = 0; x < w; x++) {
            var sum = 0,
              cnt = 0;
            for (var dy = -1; dy <= 1; dy++)
              for (var dx = -1; dx <= 1; dx++) {
                var xx = x + dx,
                  yy = y + dy;
                if (xx >= 0 && yy >= 0 && xx < w && yy < h) {
                  sum += raw[yy * w + xx];
                  cnt++;
                }
              }
            m[y * w + x] = sum / cnt;
          }
      }
    }
    im.mask = m;
    im.dep = maskedStretch(im.depRaw, m);
    if (im.aiRaw) im.ai = maskedStretch(im.aiRaw, m);
  }

  /* ---------- une instance ---------- */
  function create(el, scene, opts, img, depthImg) {
    opts = opts || {};
    var S = {},
      k0;
    for (k0 in DEF) S[k0] = DEF[k0];
    var ss = scene.settings || {};
    for (k0 in ss) S[k0] = ss[k0];
    if (opts.density) S.density = opts.density;
    else if (
      root.matchMedia &&
      (root.matchMedia("(pointer:coarse)").matches || el.clientWidth < 700)
    )
      S.density = Math.min(S.density, 60000);
    var interactive = opts.interactive !== false,
      transparent = !!opts.transparent;

    if (getComputedStyle(el).position === "static")
      el.style.position = "relative";
    el.style.overflow = "hidden";
    var cv = document.createElement("canvas");
    cv.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:" +
      (opts.drag ? "none" : "pan-y");
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", scene.name || "Nuée de particules");
    el.appendChild(cv);
    var ctx = cv.getContext("2d");

    var im = analyse(img, S, depthImg);
    if (!el.clientHeight || el.clientHeight < 20)
      el.style.aspectRatio = im.w + " / " + im.h;

    var W = 0,
      H = 0,
      DPR = 1,
      FB = { img: null, u32: null, data: null, w: 0, h: 0 };
    var P = { n: 0 },
      TK = { n: 0 };
    var mouse = {
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      px: 0,
      py: 0,
      ptx: 0,
      pty: 0,
      last: -9999,
      rx: 0,
      ry: 0,
      rin: false,
    };
    var trail = [],
      cam = { yaw: 0, pitch: 0, vy: 0, vp: 0, zoom: 1, drag: false };
    var CM = { cyw: 1, syw: 0, cp: 1, sp: 0, d: 1, k: 1, cx: 0, cy: 0 },
      PX = 0,
      PY = 0,
      PS = 1;
    var T = 0,
      last = performance.now(),
      nextSplash = 3,
      frameNo = 0,
      ftAvg = 16,
      tuneAfter = 150;
    var bucketCol = new Uint32Array(6),
      bucketA = new Float32Array(6);
    var bgRGB = opts.bg ? hexRGB(opts.bg) : null;

    function isLight() {
      return S.onWhite !== S.neg;
    }
    function bgc() {
      return bgRGB || (isLight() ? [243, 243, 241] : [5, 5, 6]);
    }
    function fgRGB() {
      return isLight() ? [12, 12, 14] : [236, 236, 240];
    }
    function inkRGB() {
      var f = fgRGB();
      if (!S.lightOn) return f;
      var t = S.tint;
      return isLight()
        ? [(t[0] * 0.4) | 0, (t[1] * 0.4) | 0, (t[2] * 0.4) | 0]
        : t;
    }
    function makeBuckets() {
      var f = inkRGB(),
        b = bgc();
      for (var i = 0; i < 6; i++) {
        var a = 0.25 + i * 0.15;
        if (transparent) {
          bucketCol[i] = pack(f[0], f[1], f[2]);
          bucketA[i] = a;
        } else {
          bucketCol[i] = pack(
            Math.round(f[0] * a + b[0] * (1 - a)),
            Math.round(f[1] * a + b[1] * (1 - a)),
            Math.round(f[2] * a + b[2] * (1 - a))
          );
          bucketA[i] = 1;
        }
      }
    }

    /* caméra 3D */
    function setCam(rc) {
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

    function stageRect() {
      var pad = 0.06,
        availW = W * (1 - 2 * pad),
        availH = H * (1 - 2 * pad);
      var s = Math.min(availW / im.w, availH / im.h);
      return { s: s, ox: (W - im.w * s) / 2, oy: (H - im.h * s) / 2 };
    }
    function resize() {
      var r = el.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      DPR = Math.min(root.devicePixelRatio || 1, 2, Math.sqrt(3.2e6 / (W * H)));
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      FB.w = cv.width;
      FB.h = cv.height;
      FB.img = ctx.createImageData(FB.w, FB.h);
      FB.u32 = new Uint32Array(FB.img.data.buffer);
      FB.data = FB.img.data;
    }

    /* ---------- particules ---------- */
    function build(scatter) {
      var N = S.density,
        dark = !isLight();
      P.hx = new Float32Array(N);
      P.hy = new Float32Array(N);
      P.hz = new Float32Array(N);
      P.x = new Float32Array(N);
      P.y = new Float32Array(N);
      P.vx = new Float32Array(N);
      P.vy = new Float32Array(N);
      P.ph = new Float32Array(N);
      P.cu = new Uint32Array(N);
      P.th = new Float32Array(N);
      P.rd = new Float32Array(N);
      P.rt = new Float32Array(N);
      P.rk = new Float32Array(N);
      P.hit = new Float32Array(N);
      var dep = S.ai && im.ai ? im.ai : im.dep,
        rc = stageRect(),
        i = 0,
        w = im.w,
        h = im.h,
        nPix = w * h,
        wA = new Float32Array(nPix),
        wsum = 0,
        k,
        l,
        wt;
      for (k = 0; k < nPix; k++) {
        l = im.lum[k];
        if (!S.trueCol) {
          wt = dark
            ? 0.04 + 0.96 * Math.pow(l, 1.35)
            : 0.04 + 0.96 * Math.pow(1 - l, 1.35);
        } else wt = 0.55 + 0.45 * (dark ? l : 1 - l * 0.5);
        wt *= im.mask[k];
        wA[k] = wt;
        wsum += wt;
      }
      var perW = wsum > 0 ? N / wsum : 0,
        cap = N,
        x,
        y,
        e,
        c,
        cnt,
        carry;
      for (y = 0; y < h && i < cap; y++) {
        carry = Math.random();
        for (x = 0; x < w && i < cap; x++) {
          k = y * w + x;
          e = wA[k] * perW + carry;
          cnt = e | 0;
          carry = e - cnt;
          for (c = 0; c < cnt && i < cap; c++) {
            P.hx[i] = x + Math.random();
            P.hy[i] = y + Math.random();
            P.hz[i] = dep[k];
            P.ph[i] = Math.random() * 6.2832;
            P.th[i] = Math.random();
            P.rd[i] = 0.35 + Math.random() * 0.85;
            P.rt[i] = 1 / (5 + Math.random() * 9);
            P.rk[i] = Math.random();
            var r = im.rgb[k * 3],
              g = im.rgb[k * 3 + 1],
              b = im.rgb[k * 3 + 2];
            if (S.neg) {
              r = 255 - r;
              g = 255 - g;
              b = 255 - b;
            }
            P.cu[i] = pack(r, g, b);
            if (scatter) {
              P.x[i] = W / 2 + (Math.random() - 0.5) * W * 1.5;
              P.y[i] = H / 2 + (Math.random() - 0.5) * H * 1.5;
            } else {
              P.x[i] = rc.ox + P.hx[i] * rc.s;
              P.y[i] = rc.oy + P.hy[i] * rc.s;
            }
            i++;
          }
        }
      }
      P.n = i;
      buildTrackers(rc, dep);
    }
    function buildTrackers(rc, dep) {
      var N = 2000,
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
      TK.w = new Float32Array(N);
      while (i < N && tries < N * 250) {
        tries++;
        var px = 1 + ((Math.random() * (im.w - 2)) | 0),
          py = 1 + ((Math.random() * (im.h - 2)) | 0),
          k = py * im.w + px;
        var e =
          Math.abs(im.lum[k] - im.lum[k + 1]) +
          Math.abs(im.lum[k] - im.lum[k + im.w]);
        var w =
          (0.1 +
            0.5 * (isLight() ? 1 - im.lum[k] : im.lum[k]) +
            Math.min(0.4, e * 6)) *
          im.mask[k];
        if (Math.random() > w) continue;
        TK.hx[i] = px;
        TK.hy[i] = py;
        TK.hz[i] = dep[k];
        TK.ph[i] = Math.random() * 6.2832;
        TK.k[i] = 0.035 + Math.random() * 0.07;
        TK.w[i] = 0.15 + Math.random() * 0.6;
        TK.x[i] = rc.ox + px * rc.s;
        TK.y[i] = rc.oy + py * rc.s;
        i++;
      }
      TK.n = i;
    }
    function updateTrackers(rc) {
      var L = Math.min(TK.n, S.trackers),
        s = rc.s,
        mcx = rc.ox + (im.w * s) / 2,
        mcy = rc.oy + (im.h * s) / 2;
      var cx = im.w / 2,
        cy = im.h / 2,
        amp = im.w * 0.014,
        ih = im.h,
        flow = S.flow;
      var zAmpT = im.w * S.fDepth * 1.5,
        R = Math.max(260, Math.min(W, H) * 0.55);
      var kmul = 3.4 - 2.95 * S.trkFl,
        damp = 0.6 + 0.34 * S.trkFl,
        spr = S.trkSpr;
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
          ty +=
            (0.5 - 0.5 * Math.cos(m * 6.2832)) * ih * 0.14 * (1.1 - hz * 0.6);
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
          (tx - cx) * spr,
          (ty - cy) * spr,
          (hz - 0.5) * zAmpT + Math.sin(T * 0.5 + ph) * amp * 0.6
        );
        var X = PX,
          Y = PY,
          wi = TK.w[i];
        TK.ps[i] = PS;
        X += (mouse.ptx - mcx) * wi * 0.55;
        Y += (mouse.pty - mcy) * wi * 0.55;
        var gx = mouse.ptx - X,
          gy = mouse.pty - Y,
          gd = Math.sqrt(gx * gx + gy * gy);
        if (gd < R) {
          var f = 1 - gd / R;
          f = f * f * (0.3 + 0.6 * wi);
          X += gx * f;
          Y += gy * f;
        }
        if (S.trkFl < 0.5) {
          var nj = (0.5 - S.trkFl) * 2 * 3;
          X += (Math.random() - 0.5) * nj;
          Y += (Math.random() - 0.5) * nj;
        }
        var kq = TK.k[i] * kmul;
        TK.vx[i] += (X - TK.x[i]) * kq;
        TK.vy[i] += (Y - TK.y[i]) * kq;
        TK.vx[i] *= damp;
        TK.vy[i] *= damp;
        TK.x[i] += TK.vx[i];
        TK.y[i] += TK.vy[i];
      }
    }
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

    /* ---------- tampon de pixels ---------- */
    function fbClear() {
      if (!FB.u32) return;
      var b = bgc();
      if (S.trails) {
        var d = FB.data,
          n = d.length,
          j;
        if (transparent) {
          for (j = 3; j < n; j += 4) d[j] = (d[j] * 222) >> 8;
        } else {
          for (j = 0; j < n; j += 4) {
            d[j] += ((b[0] - d[j]) * 34) >> 8;
            d[j + 1] += ((b[1] - d[j + 1]) * 34) >> 8;
            d[j + 2] += ((b[2] - d[j + 2]) * 34) >> 8;
          }
        }
      } else FB.u32.fill(transparent ? 0 : pack(b[0], b[1], b[2]));
    }
    function plot(x, y, sz, col, a) {
      var fw = FB.w,
        fh = FB.h,
        fu = FB.u32,
        sp;
      if (sz < 1) {
        a *= 0.55 + 0.45 * sz;
        sp = 1;
      } else sp = (sz + 0.5) | 0;
      if (a < 0.03) return;
      var x0 = Math.round(x - sp * 0.5),
        y0 = Math.round(y - sp * 0.5);
      if (x0 >= fw || y0 >= fh || x0 + sp <= 0 || y0 + sp <= 0) return;
      var xa = x0 < 0 ? 0 : x0,
        ya = y0 < 0 ? 0 : y0,
        xb = x0 + sp > fw ? fw : x0 + sp,
        yb = y0 + sp > fh ? fh : y0 + sp,
        xx,
        yy,
        idx;
      if (transparent) {
        var A = (a * 255) | 0,
          pk = ((col & 0x00ffffff) | (A << 24)) >>> 0;
        for (yy = ya; yy < yb; yy++) {
          idx = yy * fw + xa;
          for (xx = xa; xx < xb; xx++, idx++) {
            if (fu[idx] >>> 24 < A) fu[idx] = pk;
          }
        }
      } else if (a >= 0.97) {
        for (yy = ya; yy < yb; yy++) {
          idx = yy * fw + xa;
          for (xx = xa; xx < xb; xx++) fu[idx++] = col;
        }
      } else {
        var ia = (a * 256) | 0,
          ra = 256 - ia,
          sr = col & 255,
          sg = (col >>> 8) & 255,
          sb = (col >>> 16) & 255;
        for (yy = ya; yy < yb; yy++) {
          idx = yy * fw + xa;
          for (xx = xa; xx < xb; xx++) {
            var dd = fu[idx];
            fu[idx++] =
              (0xff000000 |
                (((((dd >>> 16) & 255) * ra + sb * ia) >> 8) << 16) |
                (((((dd >>> 8) & 255) * ra + sg * ia) >> 8) << 8) |
                (((dd & 255) * ra + sr * ia) >> 8)) >>>
              0;
          }
        }
      }
    }
    function streak(x0, y0, x1, y1, col) {
      var dx = x1 - x0,
        dy = y1 - y0,
        n = Math.min(36, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
      for (var k = 0; k <= n; k++) {
        var t = k / (n || 1);
        plot(x0 + dx * t, y0 + dy * t, 1, col, 0.1 + 0.4 * t);
      }
    }

    /* ---------- répulsion au survol ---------- */
    function repSources(now) {
      var out = [];
      while (trail.length && now - trail[0].t > 1100) trail.shift();
      if (!interactive || !S.mtrail || S.rep <= 0) return out;
      if (cam.drag) return out;
      if (mouse.rin && now - mouse.last < 4000) out.push(mouse.rx, mouse.ry, 1);
      for (var k = trail.length - 1, c = 0; k >= 0 && c < 7; k -= 5, c++) {
        var a = 1 - (now - trail[k].t) / 1100;
        if (a > 0.05) out.push(trail[k].x, trail[k].y, a * 0.8);
      }
      return out;
    }

    /* ---------- boucle ---------- */
    function frame(now) {
      var rawMs = now - last;
      var dt = Math.min(0.05, rawMs / 1000);
      last = now;
      T += dt;
      frameNo++;
      if (!cam.drag) {
        cam.yaw += cam.vy;
        cam.pitch = clamp(cam.pitch + cam.vp, -1.25, 1.25);
        cam.vy *= 0.94;
        cam.vp *= 0.94;
      }
      var idle = !interactive || now - mouse.last > 3000;
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
      fbClear();

      if (P.n) {
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
        var escF = Math.min(1, S.fDrift * 1.9),
          escR = im.w * (0.3 + S.fDrift * 0.9);
        var axx = Math.cos(S.axA),
          axy = Math.sin(S.axA),
          axb = S.axB;
        var hemi = axb > 0.05,
          invExt =
            1 /
            Math.max(
              1,
              (Math.abs(axx) * im.w) / 2 + (Math.abs(axy) * im.h) / 2
            );
        var sz0 = S.size * (s > 1 ? Math.min(1.4, s) : 1);
        var scanY = oy + ((T * 0.2) % 1.15) * im.h * s,
          band = Math.max(16, im.h * s * 0.05);
        var gR = Math.max(160, Math.min(W, H) * 0.3) * (0.5 + S.fGather),
          gK = interactive ? S.fGather * 1.6 : 0,
          trailsOn = S.trails;
        var hotU = isLight() ? 0xff000000 : 0xffffffff,
          dpr = DPR,
          bc = bucketCol,
          ba = bucketA;
        setCam(rc);
        var rs = repSources(now),
          nrs = rs.length / 3,
          rK = 5 * S.rep,
          rR = S.repR,
          retMul = 0.15 * Math.pow(20, S.retSpd),
          retDens = S.retDens;
        if (S.fSplash > 0 && T > nextSplash) {
          nextSplash = T + (8 - 5 * S.fSplash) + Math.random() * 3;
          if (idle)
            splash(
              ox + Math.random() * im.w * s,
              oy + Math.random() * im.h * s,
              0.5 + S.fSplash * 1.3
            );
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
          var ddx = X - P.x[i],
            ddy = Y - P.y[i],
            kq = 0.07;
          if (P.hit[i] > 0) {
            P.hit[i] -= dt * 0.125;
            if (ddx * ddx + ddy * ddy < 36 || P.hit[i] <= 0) P.hit[i] = 0;
            else kq = 0.07 * retMul * (P.rk[i] < retDens ? 1 : 0.1);
          }
          P.vx[i] += ddx * kq;
          P.vy[i] += ddy * kq;
          P.vx[i] *= 0.8;
          P.vy[i] *= 0.8;
          if (nrs) {
            for (var rj = 0; rj < nrs; rj++) {
              var qx = P.x[i] - rs[rj * 3],
                qy = P.y[i] - rs[rj * 3 + 1],
                q2 = qx * qx + qy * qy,
                rr = rR * rs[rj * 3 + 2];
              if (q2 < rr * rr && q2 > 0.01) {
                var qd = Math.sqrt(q2),
                  qf = 1 - qd / rr;
                qf *= qf * rK * rs[rj * 3 + 2] * (0.5 + P.hz[i] * 0.9);
                P.vx[i] += (qx / qd) * qf;
                P.vy[i] += (qy / qd) * qf;
                P.hit[i] = 1;
              }
            }
          }
          P.x[i] += P.vx[i];
          P.y[i] += P.vy[i];
          var px = P.x[i],
            py = P.y[i],
            al = 1,
            gate = 1;
          if (hemi) {
            gate = ((hx - cx) * axx + (hy - cy) * axy) * invExt;
            gate =
              gate < -0.04
                ? 0
                : Math.pow(Math.min(1, (gate + 0.04) / 1.04), 0.8);
          }
          if (P.th[i] < escF * gate) {
            var u = (T * P.rt[i] + ph * 0.15915) % 1;
            var dd =
              Math.pow(u, 1.7) *
              escR *
              P.rd[i] *
              s *
              pS *
              (1 + axb * 0.8) *
              (hemi ? 0.35 + 0.65 * gate : 1);
            var ex = hx - cx,
              ey = hy - cy,
              el = Math.sqrt(ex * ex + ey * ey) + 1;
            var rx = Math.cos(ph),
              ry = Math.sin(ph),
              dtp = rx * axx + ry * axy;
            var oxn = rx * 0.55 + (ex / el) * 0.7,
              oyn = ry * 0.55 + (ey / el) * 0.7;
            if (dtp < 0) {
              rx -= 2 * dtp * axx;
              ry -= 2 * dtp * axy;
            }
            var dxn = oxn * (1 - axb) + (axx * 0.9 + rx * 0.45) * axb,
              dyn = oyn * (1 - axb) + (axy * 0.9 + ry * 0.45) * axb;
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
          var pc,
            pa = al;
          if (hot) pc = hotU;
          else if (useCol) pc = P.cu[i];
          else {
            var bk = (hz * 5.99) | 0;
            pc = bc[bk];
            pa = al * ba[bk];
          }
          plot(px * dpr, py * dpr, sz * dpr, pc, pa);
          if (trailsOn && i < streakMax) {
            var vx0 = P.vx[i],
              vy0 = P.vy[i],
              sl = Math.sqrt(vx0 * vx0 + vy0 * vy0);
            if (sl > 0.35) {
              var sk = Math.min(7, 36 / sl);
              streak(
                (px - vx0 * sk) * dpr,
                (py - vy0 * sk) * dpr,
                px * dpr,
                py * dpr,
                pc
              );
            }
          }
        }
        ctx.putImageData(FB.img, 0, 0);
        if (S.scan) {
          var f = fgRGB();
          ctx.fillStyle = "rgba(" + f[0] + "," + f[1] + "," + f[2] + ",.35)";
          ctx.fillRect(ox, scanY, im.w * s, 1);
        }
        if (S.links || S.track || S.marks) {
          updateTrackers(rc);
          drawTrackers(rc);
        }
        if (rawMs < 250) ftAvg = ftAvg * 0.92 + rawMs * 0.08;
        if (
          frameNo > tuneAfter &&
          frameNo % 60 === 0 &&
          ftAvg > 48 &&
          S.density > 30000
        ) {
          S.density = Math.max(
            30000,
            Math.round((S.density * 0.7) / 1000) * 1000
          );
          ftAvg = 16;
          tuneAfter = frameNo + 150;
          build(false);
        }
      }
    }
    function drawTrackers(rc) {
      var L = Math.min(TK.n, S.trackers),
        f = fgRGB();
      var rgb = (S.trkCol ? hexRGB(S.trkCol) : f).join(","),
        lrgb = (S.linkCol ? hexRGB(S.linkCol) : f).join(",");
      var lw = Math.max(0.3, S.line),
        tz = S.trkSz;
      if (S.links) {
        var D =
            Math.sqrt((rc.s * rc.s * im.w * im.h) / Math.max(L, 1)) *
            1.9 *
            Math.max(0.6, S.trkSpr),
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
        ctx.strokeStyle =
          "rgba(" + lrgb + "," + (S.linkCol ? ".6" : ".32") + ")";
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
        ctx.font =
          Math.round(clamp(8 * tz, 6, 22)) + "px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.beginPath();
        for (var t = 0; t < L; t++) {
          var x = TK.x[t],
            y = TK.y[t],
            h = (4 + TK.hz[t] * 8) * TK.ps[t] * tz;
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
            ctx.moveTo(x - 1.5 * tz, y);
            ctx.lineTo(x + 1.5 * tz, y);
            ctx.moveTo(x, y - 1.5 * tz);
            ctx.lineTo(x, y + 1.5 * tz);
          }
          if (S.marks) {
            var mk = 2.5 * tz;
            ctx.moveTo(x - mk, y);
            ctx.lineTo(x + mk, y);
            ctx.moveTo(x, y - mk);
            ctx.lineTo(x, y + mk);
          }
        }
        ctx.stroke();
        if (S.track) {
          var step = Math.max(1, Math.round(L / 16));
          for (var u = 0; u < L; u += step) {
            var nx = (TK.hx[u] - im.w / 2) / (im.w / 2),
              ny = -(TK.hy[u] - im.h / 2) / (im.h / 2),
              nz = TK.hz[u] - 0.5;
            var sg = function (v) {
              return (v < 0 ? "-" : "+") + Math.abs(v).toFixed(2);
            };
            ctx.fillText(
              (u + 1 < 10 ? "0" : "") +
                (u + 1) +
                " " +
                sg(nx) +
                " " +
                sg(ny) +
                " " +
                sg(nz),
              TK.x[u] + (TK.hz[u] * 8 * TK.ps[u] + 7) * tz,
              TK.y[u] - TK.hz[u] * 8 * TK.ps[u] * tz + 3
            );
          }
        }
      }
    }

    /* ---------- cycle de vie ---------- */
    var raf = 0,
      running = false,
      visible = true,
      destroyed = false;
    function loop(now) {
      if (!running) return;
      frame(now);
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (running || destroyed) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }
    function sync() {
      if (visible && !document.hidden) start();
      else stop();
    }

    function rel(e) {
      var r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    var onMove = function (e) {
      if (!interactive) return;
      var p = rel(e),
        now = performance.now();
      mouse.tx = (p[0] / W - 0.5) * 2;
      mouse.ty = (p[1] / H - 0.5) * 2;
      mouse.ptx = p[0];
      mouse.pty = p[1];
      mouse.last = now;
      mouse.rx = p[0];
      mouse.ry = p[1];
      mouse.rin = true;
      trail.push({ x: p[0], y: p[1], t: now });
      if (trail.length > 60) trail.shift();
      if (opts.drag && cam.drag && drag0) {
        var dx = e.clientX - drag0.x,
          dy = e.clientY - drag0.y;
        drag0.x = e.clientX;
        drag0.y = e.clientY;
        cam.yaw += dx * 0.006;
        cam.pitch = clamp(cam.pitch - dy * 0.006, -1.25, 1.25);
        cam.vy = dx * 0.0016;
        cam.vp = -dy * 0.0016;
      }
    };
    var drag0 = null;
    var onLeave = function () {
      mouse.rin = false;
    };
    var onDown = function (e) {
      if (!interactive) return;
      var p = rel(e);
      if (opts.drag) {
        cam.drag = true;
        drag0 = { x: e.clientX, y: e.clientY };
        cam.vy = cam.vp = 0;
        try {
          el.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
      if (S.fSplash > 0) splash(p[0], p[1], 0.6 + S.fSplash * 1.4);
    };
    var onUp = function () {
      cam.drag = false;
      drag0 = null;
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    var onVis = function () {
      sync();
    };
    document.addEventListener("visibilitychange", onVis);
    var io = null,
      ro = null;
    if (root.IntersectionObserver) {
      io = new IntersectionObserver(
        function (en) {
          visible = en[0].isIntersecting;
          sync();
        },
        { threshold: 0 }
      );
      io.observe(el);
    }
    if (root.ResizeObserver) {
      var rt = 0;
      ro = new ResizeObserver(function () {
        clearTimeout(rt);
        rt = setTimeout(function () {
          resize();
          build(false);
        }, 120);
      });
      ro.observe(el);
    }

    resize();
    makeBuckets();
    build(true);
    sync();

    return {
      el: el,
      settings: S,
      destroy: function () {
        destroyed = true;
        stop();
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
        document.removeEventListener("visibilitychange", onVis);
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        if (cv.parentNode) cv.parentNode.removeChild(cv);
      },
    };
  }

  /* ---------- chargement ---------- */
  function loadImage(src, cors) {
    return new Promise(function (res, rej) {
      var i = new Image();
      if (cors && !/^data:/.test(src)) i.crossOrigin = "anonymous";
      i.onload = function () {
        res(i);
      };
      i.onerror = function () {
        rej(new Error("Image introuvable : " + src.slice(0, 80)));
      };
      i.src = src;
    });
  }
  function absolute(url, base) {
    try {
      return new URL(url, base).href;
    } catch (e) {
      return url;
    }
  }

  function mount(el, source, opts) {
    if (typeof el === "string") el = document.querySelector(el);
    if (!el) return Promise.reject(new Error("Nuée : élément introuvable"));
    opts = opts || {};
    var scenePromise;
    var base = root.location.href;
    if (typeof source === "string") {
      base = absolute(source, root.location.href);
      scenePromise = fetch(base).then(function (r) {
        if (!r.ok) throw new Error("Scène introuvable : " + source);
        return r.json();
      });
    } else scenePromise = Promise.resolve(source);
    return scenePromise.then(function (scene) {
      var imgP = loadImage(absolute(scene.image, base), true);
      var depP = scene.depth
        ? loadImage(absolute(scene.depth, base), true).catch(function () {
            return null;
          })
        : Promise.resolve(null);
      return Promise.all([imgP, depP]).then(function (r) {
        return create(el, scene, opts, r[0], r[1]);
      });
    });
  }

  function auto() {
    var list = document.querySelectorAll("[data-nuee]");
    Array.prototype.forEach.call(list, function (el) {
      if (el.__nuee) return;
      var o = {
        transparent: el.getAttribute("data-nuee-transparent") === "true",
        bg: el.getAttribute("data-nuee-bg") || null,
        density: parseInt(el.getAttribute("data-nuee-density") || "", 10) || 0,
        drag: el.getAttribute("data-nuee-drag") === "true",
        interactive: el.getAttribute("data-nuee-interactive") !== "false",
      };
      el.__nuee = true;
      mount(el, el.getAttribute("data-nuee"), o)
        .then(function (inst) {
          el.__nuee = inst;
        })
        .catch(function (e) {
          el.__nuee = false;
          if (root.console) console.warn(e.message || e);
        });
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", auto);
  else auto();

  root.Nuee = { mount: mount, auto: auto, version: "1.0" };
})(window);
