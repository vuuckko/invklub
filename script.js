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

  /* ---- Live odbrojavanje (kvadratići: dani, sati, min, sek) ---- */
  var cdHosts = document.querySelectorAll('.cd[data-deadline]');
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tickCd() {
    var now = Date.now();
    cdHosts.forEach(function (el) {
      var t = new Date(el.getAttribute('data-deadline')).getTime() - now;
      if (isNaN(t)) return;
      if (t <= 0) { el.innerHTML = '<span class="cd--live">U toku</span>'; return; }
      var d = Math.floor(t / 864e5);
      var h = Math.floor(t % 864e5 / 36e5);
      var m = Math.floor(t % 36e5 / 6e4);
      var s = Math.floor(t % 6e4 / 1e3);
      el.innerHTML =
        '<span>' + d + '<i>dana</i></span>' +
        '<span>' + pad(h) + '<i>sati</i></span>' +
        '<span>' + pad(m) + '<i>min</i></span>' +
        '<span>' + pad(s) + '<i>sek</i></span>';
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
