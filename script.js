/* Investicioni klub studenata FON-a — interakcije */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Godina u futeru ---- */
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  /* ---- Mobilni meni ---- */
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Zatvori meni' : 'Otvori meni');
    });
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        links.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---- Reveal na skrol ---- */
  var reveals = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-visible');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---- Count-up brojevi ---- */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    var plain = el.getAttribute('data-plain'); // ne animiraj (npr. godina)
    if (reduce || plain) { el.textContent = target + suffix; return; }
    var dur = 1400, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target + suffix;
    }
    requestAnimationFrame(step);
  }

  var counters = document.querySelectorAll('[data-count]');
  if (!('IntersectionObserver' in window)) {
    counters.forEach(animateCount);
  } else {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { animateCount(en.target); cio.unobserve(en.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---- Hero slideshow ---- */
  var slides = Array.prototype.slice.call(document.querySelectorAll('.hero__bg .slide'));
  var dots = Array.prototype.slice.call(document.querySelectorAll('.hero__dots button'));

  function ensureLoaded(slide) {
    if (!slide) return;
    var img = slide.querySelector('img[data-src]');
    if (img) { img.src = img.getAttribute('data-src'); img.removeAttribute('data-src'); }
  }

  if (slides.length > 1) {
    // preostale slike učitaj tek nakon prvog prikaza (brži LCP na mobilnom)
    function loadRest() { slides.forEach(ensureLoaded); }
    if ('requestIdleCallback' in window) requestIdleCallback(loadRest, { timeout: 2500 });
    else window.addEventListener('load', function () { setTimeout(loadRest, 400); });

    // nasumičan redosled rotacije; prvi slajd uvek prvi (preload/LCP)
    var order = [];
    for (var i = 1; i < slides.length; i++) order.push(i);
    for (var j = order.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = order[j]; order[j] = order[k]; order[k] = t;
    }
    order.unshift(0);

    var pos = 0, slideTimer = null;
    function showAt(p) {
      var prev = order[pos];
      slides[prev].classList.remove('is-active');
      if (dots[prev]) dots[prev].classList.remove('is-active');
      pos = (p + order.length) % order.length;
      var idx = order[pos];
      ensureLoaded(slides[idx]);
      slides[idx].classList.add('is-active');
      if (dots[idx]) dots[idx].classList.add('is-active');
    }
    function startAuto() {
      if (reduce) return;
      if (slideTimer) clearInterval(slideTimer);
      slideTimer = setInterval(function () { showAt(pos + 1); }, 6000);
    }
    dots.forEach(function (dot, di) {
      dot.addEventListener('click', function () {
        var op = order.indexOf(di);
        if (op !== -1) { showAt(op); startAuto(); }
      });
    });
    startAuto();
  }

  /* ---- Live odbrojavanje (napravi jednom, menjaj samo brojeve) ---- */
  var cdHosts = document.querySelectorAll('.cd[data-deadline]');
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function setNum(span, v) {
    if (span && span.firstChild && span.firstChild.nodeValue !== v) span.firstChild.nodeValue = v;
  }
  cdHosts.forEach(function (el) {
    el.innerHTML = '<span>0<i>dana</i></span><span>00<i>sati</i></span><span>00<i>min</i></span><span>00<i>sek</i></span>';
  });
  function tickCd() {
    var now = Date.now();
    cdHosts.forEach(function (el) {
      if (el.dataset.done) return;
      var t = new Date(el.getAttribute('data-deadline')).getTime() - now;
      if (isNaN(t)) return;
      if (t <= 0) { el.dataset.done = '1'; el.innerHTML = '<span class="cd--live">U toku</span>'; return; }
      var c = el.children;
      setNum(c[0], String(Math.floor(t / 864e5)));
      setNum(c[1], pad(Math.floor(t % 864e5 / 36e5)));
      setNum(c[2], pad(Math.floor(t % 36e5 / 6e4)));
      setNum(c[3], pad(Math.floor(t % 6e4 / 1e3)));
    });
  }
  if (cdHosts.length) { tickCd(); setInterval(tickCd, 1000); }

  /* ---- Prijava (demo, bez slanja) ---- */
  var form = document.getElementById('joinForm');
  var ok = document.getElementById('formOk');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (ok) ok.hidden = false;
      form.querySelectorAll('input, textarea, select').forEach(function (f) { f.value = ''; });
    });
  }
})();

/* ---- Interaktivni grafikon takmičenja ---- */
(function () {
  'use strict';
  var svg = document.getElementById('takSvg');
  var legend = document.getElementById('chartLegend');
  var tip = document.getElementById('chartTip');
  if (!svg || !legend || !tip) return;

  var W = 800, H = 320, pad = { l: 40, r: 16, t: 16, b: 30 };
  var plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b, maxY = 115;
  var NS = 'http://www.w3.org/2000/svg';

  var SERIES = [
    { key: 'BE',   name: 'Bloom Energy',  color: '#43c58c', data: [0, 5, 3, 12, 18, 15, 28, 40, 52, 61, 74, 90, 104.5] },
    { key: 'LRCX', name: 'Lam Research',  color: '#5fa8e0', data: [0, 2, 5, 8, 6, 14, 20, 26, 33, 40, 47, 53, 58.3] },
    { key: 'UNH',  name: 'UnitedHealth',  color: '#c2d4e6', data: [0, 4, 7, 10, 15, 20, 24, 30, 36, 41, 47, 51, 54.3] },
    { key: 'QCOM', name: 'Qualcomm',      color: '#8fd3b6', data: [0, 3, 2, 6, 10, 9, 15, 19, 24, 28, 32, 36, 38.5] },
    { key: 'SPX',  name: 'S&P 500',       color: '#7a8ea0', dash: true, data: [0, 1, 0.5, 2, 1.5, 3, 2.5, 4, 3.5, 5, 6, 7, 8] }
  ];
  var XL = ['1. mart', 'sred. marta', 'kraj marta', '1. april', 'sred. aprila', 'kraj aprila', '1. maj', 'sred. maja', 'kraj maja', '1. jun', 'sred. juna', 'kraj juna', '2. jul'];
  var N = SERIES[0].data.length;
  var hidden = {};

  function xAt(i) { return pad.l + (i / (N - 1)) * plotW; }
  function yAt(v) { return pad.t + (1 - v / maxY) * plotH; }
  function fmt(v) { return (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%'; }
  function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

  var cursorG;
  function render() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    [0, 25, 50, 75, 100].forEach(function (v) {
      var y = yAt(v);
      svg.appendChild(el('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: 'rgba(169,196,220,.13)', 'stroke-width': 1 }));
      var t = el('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', fill: '#a9c4dc', 'font-size': 11, 'font-family': 'Manrope, sans-serif', opacity: .65 });
      t.textContent = v + '%'; svg.appendChild(t);
    });
    [[0, 'mart'], [3, 'apr'], [6, 'maj'], [9, 'jun'], [12, 'jul']].forEach(function (p) {
      var t = el('text', { x: xAt(p[0]), y: H - 8, 'text-anchor': 'middle', fill: '#a9c4dc', 'font-size': 11, 'font-family': 'Manrope, sans-serif', opacity: .65 });
      t.textContent = p[1]; svg.appendChild(t);
    });
    SERIES.forEach(function (s) {
      if (hidden[s.key]) return;
      var d = '';
      s.data.forEach(function (v, i) { d += (i ? ' L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(v).toFixed(1); });
      var path = el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      if (s.dash) { path.setAttribute('stroke-dasharray', '5 6'); path.setAttribute('stroke-width', 2); }
      svg.appendChild(path);
      svg.appendChild(el('circle', { cx: xAt(N - 1), cy: yAt(s.data[N - 1]), r: 3.5, fill: s.color }));
    });
    cursorG = el('g', {}); cursorG.style.display = 'none'; svg.appendChild(cursorG);
  }

  function moveCursor(clientX) {
    var rect = svg.getBoundingClientRect();
    var vbx = (clientX - rect.left) / rect.width * W;
    var i = Math.round((vbx - pad.l) / plotW * (N - 1));
    i = Math.max(0, Math.min(N - 1, i));
    while (cursorG.firstChild) cursorG.removeChild(cursorG.firstChild);
    cursorG.style.display = '';
    var cx = xAt(i);
    cursorG.appendChild(el('line', { x1: cx, y1: pad.t, x2: cx, y2: H - pad.b, stroke: 'rgba(169,196,220,.4)', 'stroke-width': 1 }));
    var rows = '';
    SERIES.forEach(function (s) {
      if (hidden[s.key]) return;
      cursorG.appendChild(el('circle', { cx: cx, cy: yAt(s.data[i]), r: 3.6, fill: s.color, stroke: '#0c3350', 'stroke-width': 1.5 }));
      rows += '<div class="tiprow"><i style="background:' + s.color + '"></i>' + s.key + '<b>' + fmt(s.data[i]) + '</b></div>';
    });
    tip.innerHTML = '<div class="tiptitle">' + XL[i] + '</div>' + rows;
    tip.hidden = false;
    var px = cx / W * rect.width;
    tip.style.left = Math.max(6, Math.min(rect.width - tip.offsetWidth - 6, px + 14)) + 'px';
  }
  function hideCursor() { if (cursorG) cursorG.style.display = 'none'; tip.hidden = true; }

  SERIES.forEach(function (s) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'legitem';
    b.innerHTML = '<span class="legdot" style="background:' + s.color + '"></span>' + s.name + ' <b>' + fmt(s.data[N - 1]) + '</b>';
    b.addEventListener('click', function () {
      var visible = SERIES.filter(function (x) { return !hidden[x.key]; }).length;
      if (!hidden[s.key] && visible <= 1) return; // ostavi bar jednu liniju
      hidden[s.key] = !hidden[s.key];
      b.classList.toggle('is-off', hidden[s.key]);
      render();
    });
    legend.appendChild(b);
  });

  svg.addEventListener('mousemove', function (e) { moveCursor(e.clientX); });
  svg.addEventListener('mouseleave', hideCursor);
  svg.addEventListener('touchstart', function (e) { if (e.touches[0]) moveCursor(e.touches[0].clientX); }, { passive: true });
  svg.addEventListener('touchmove', function (e) { if (e.touches[0]) moveCursor(e.touches[0].clientX); }, { passive: true });

  render();
})();
