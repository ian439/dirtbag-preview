(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');
  if (!reduce) document.documentElement.classList.add('motion');
  // iPhone Safari only shows :active press states when the page listens for touches.
  document.addEventListener('touchstart', function () {}, { passive: true });

  // Emblem: the red DB lands, then the white wings open. Once on load, again on tap.
  var mark = document.querySelector('.cover-mark');
  function play() {
    if (reduce || !mark) return;
    mark.classList.remove('is-play');
    void mark.getBoundingClientRect();
    mark.classList.add('is-play');
  }
  play();
  if (mark) mark.addEventListener('click', play);

  // Story filters on the issue page: everything is in the HTML, this only hides and shows.
  // The choice goes in the address (?s=music) so a filtered view can be shared.
  var filters = document.querySelectorAll('.filter');
  var cards = document.querySelectorAll('#stories .toc-row');
  function applyFilter(section) {
    filters.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.filter === section)); });
    var shown = 0;
    cards.forEach(function (c) {
      c.hidden = !!section && c.dataset.section !== section;
      c.classList.add('is-in');
      // The rows that stay deal back in, one after another.
      if (!c.hidden && !reduce && c.animate) {
        c.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
          { duration: 380, delay: Math.min(shown++, 10) * 35, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
      }
    });
    var url = new URL(window.location.href);
    if (section) url.searchParams.set('s', section); else url.searchParams.delete('s');
    history.replaceState(null, '', url);
  }
  if (filters.length) {
    filters.forEach(function (b) { b.addEventListener('click', function () { applyFilter(b.dataset.filter); }); });
    var start = new URL(window.location.href).searchParams.get('s');
    if (start && document.querySelector('.filter[data-filter="' + start + '"]')) applyFilter(start);
  }

  // The Rag: turn it over on tap.
  document.querySelectorAll('.rag-flip').forEach(function (rag) {
    rag.addEventListener('click', function () {
      rag.setAttribute('aria-pressed', String(rag.getAttribute('aria-pressed') !== 'true'));
    });
  });

  // The magazine reader on the issue page: the first stories sit in a row you swipe through (the browser's
  // own scroll-snap does the swiping). The arrows, arrow keys and the segment line move it; tapping a page
  // opens its story,
  // and the address follows along (#p-10) so a page can be shared.
  var track = document.querySelector('.reader-track');
  if (track) {
    var slides = track.querySelectorAll('.reader-page');
    var dots = document.querySelectorAll('.reader-dot');
    var count = document.querySelector('.reader-at');
    var at = 0;
    var go = function (i) {
      at = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: slides[at].offsetLeft - track.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
    };
    var setCurrent = function (i) {
      at = i;
      slides.forEach(function (sl, k) { sl.classList.toggle('is-current', k === i); });
      if (count) count.textContent = String(i + 1);
      dots.forEach(function (d, k) { if (k === i) d.setAttribute('aria-current', 'page'); else d.removeAttribute('aria-current'); });
      history.replaceState(null, '', '#' + slides[i].id);
    };
    document.querySelector('.reader-prev').addEventListener('click', function () { go(at - 1); });
    document.querySelector('.reader-next').addEventListener('click', function () { go(at + 1); });
    dots.forEach(function (d, k) { d.addEventListener('click', function (e) { e.preventDefault(); go(k); }); });

    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
    });
    // Whichever page the row has come to rest nearest is the current one.
    var nearest = function () {
      var best = 0, bestD = Infinity;
      slides.forEach(function (sl, k) {
        var d = Math.abs(sl.offsetLeft - track.offsetLeft - track.scrollLeft);
        if (d < bestD) { bestD = d; best = k; }
      });
      return best;
    };
    var pending = false;
    track.addEventListener('scroll', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; if (nearest() !== at || !slides[at].classList.contains('is-current')) setCurrent(nearest()); });
    }, { passive: true });
    // Arriving with #p-10 (from the home page or a story) opens the magazine at that page.
    var start = document.getElementById(location.hash.slice(1));
    if (start && start.classList.contains('reader-page')) {
      track.scrollLeft = start.offsetLeft - track.offsetLeft;
      document.querySelector('.reader').scrollIntoView();
    }
    setCurrent(nearest());
  }

  // The mission line sets itself word by word as the page opens (on home, once the emblem has landed).
  var autoWords = document.querySelectorAll('.mission-auto .w');
  var wordsStart = mark ? 900 : 250;
  autoWords.forEach(function (w, i) {
    if (reduce) return w.classList.add('is-lit');
    setTimeout(function () { w.classList.add('is-lit'); }, wordsStart + i * 110);
  });

  // ---------- Everything tied to scrolling, in one frame loop ----------
  var header = document.querySelector('.site-header');
  var isHome = document.body.classList.contains('is-home');
  var fill = document.querySelector('.spine-fill');
  var rows = document.querySelectorAll('.lit-row');
  var pendingReveal = document.querySelectorAll('.reveal');
  var vh = window.innerHeight;
  var ticking = false;

  function frame() {
    ticking = false;
    var y = window.scrollY;
    var docH = document.documentElement.scrollHeight - vh;

    // Read everything first, then write, so the browser lays out once per frame.
    // The row nearest the middle of the screen lights up (hidden rows measure zero and are skipped).
    var active = -1;
    rows.forEach(function (row, i) {
      var r = row.getBoundingClientRect();
      if (r.height && r.top < vh * 0.55 && r.bottom > vh * 0.45) active = i;
    });

    // On home the header's emblem waits until the big one has scrolled away.
    header.classList.toggle('is-scrolled', y > (isHome ? vh * 0.4 : 8));
    if (fill) fill.style.transform = 'scaleY(' + (docH > 0 ? Math.min(1, y / docH) : 0).toFixed(4) + ')';

    if (reduce) return;
    rows.forEach(function (row, i) { row.classList.toggle('is-active', i === active); });
    // Backup for the reveal observer, which some browsers (iPhone Safari) run late: anything already
    // on screen shows now.
    pendingReveal.forEach(function (el) {
      if (el.classList.contains('is-in')) return;
      var r = el.getBoundingClientRect();
      if (r.top < vh * 0.95 && r.bottom > 0) el.classList.add('is-in');
    });
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { vh = window.innerHeight; onScroll(); });
  // First pass after the page has painted, so on-screen reveals still get to animate in.
  requestAnimationFrame(function () { requestAnimationFrame(frame); });

  // Rise and fade into place as each block scrolls in.
  var items = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('is-in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  items.forEach(function (el) { io.observe(el); });
})();
