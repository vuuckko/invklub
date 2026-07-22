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
  var heroBg = document.querySelector('.hero__bg');
  if (heroBg) {
    // nasumičan redosled slajdova pri svakom učitavanju
    var scrim = heroBg.querySelector('.hero__scrim');
    var toShuffle = Array.prototype.slice.call(heroBg.querySelectorAll('.slide'));
    for (var si = toShuffle.length - 1; si > 0; si--) {
      var sj = Math.floor(Math.random() * (si + 1));
      var tmp = toShuffle[si]; toShuffle[si] = toShuffle[sj]; toShuffle[sj] = tmp;
    }
    toShuffle.forEach(function (el) {
      el.classList.remove('is-active');
      heroBg.insertBefore(el, scrim);
    });
    toShuffle[0].classList.add('is-active');
  }

  var slides = Array.prototype.slice.call(document.querySelectorAll('.hero__bg .slide'));
  var dots = Array.prototype.slice.call(document.querySelectorAll('.hero__dots button'));
  if (slides.length > 1) {
    var current = 0;
    var slideTimer = null;

    function showSlide(i) {
      slides[current].classList.remove('is-active');
      if (dots[current]) dots[current].classList.remove('is-active');
      current = (i + slides.length) % slides.length;
      slides[current].classList.add('is-active');
      if (dots[current]) dots[current].classList.add('is-active');
    }
    function startAuto() {
      if (reduce) return;
      if (slideTimer) clearInterval(slideTimer);
      slideTimer = setInterval(function () { showSlide(current + 1); }, 6000);
    }
    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        showSlide(i);
        startAuto();
      });
    });
    startAuto();
  }

  /* ---- Odbrojavanje do projekta (kompaktno: za X dana) ---- */
  var soonCounts = document.querySelectorAll('.soon-count[data-deadline]');
  if (soonCounts.length) {
    var nowMs = Date.now();
    soonCounts.forEach(function (el) {
      var t = new Date(el.getAttribute('data-deadline')).getTime() - nowMs;
      if (isNaN(t)) return;
      if (t <= 0) { el.textContent = 'U toku'; return; }
      var d = Math.ceil(t / 864e5);
      el.textContent = 'za ' + d + ' ' + (d === 1 ? 'dan' : 'dana');
    });
  }

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
