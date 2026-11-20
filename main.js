(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');
  if (!reduce) document.documentElement.classList.add('motion');
  // iPhone Safari only shows :active press states when the page listens for touches.
  document.addEventListener('touchstart', function () {}, { passive: true });

  var mark = document.querySelector('.cover-mark');


  // Phones: the burger opens and closes the dropdown of tabs. A tap on a tab, a tap outside, or Escape closes it.
  var burger = document.querySelector('.nav-burger');
  var bar = document.querySelector('.site-header');
  if (burger && bar) {
    var setNav = function (open) {
      bar.classList.toggle('nav-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
    };
    burger.addEventListener('click', function (e) { e.stopPropagation(); setNav(!bar.classList.contains('nav-open')); });
    document.addEventListener('click', function (e) { if (!bar.contains(e.target)) setNav(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });
    bar.querySelectorAll('.site-nav a').forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });
    window.matchMedia('(min-width: 521px)').addEventListener('change', function (e) { if (e.matches) setNav(false); });
  }

  // Phones have no hover, so buttons play their hover look by themselves as they come into view,
  // one after another (CSS: .is-shown under (hover: none)). Each plays once.
  if (!reduce && window.matchMedia('(hover: none)').matches && 'IntersectionObserver' in window) {
    var hintables = document.querySelectorAll('.site-nav a, .button, .filter, .ig-row:not(.is-draft), .reader-btn, .more');
    var queue = 0;
    var shown = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        shown.unobserve(e.target);
        var el = e.target;
        setTimeout(function () { el.classList.add('is-shown'); }, 700 + (queue++ % 6) * 180);
      });
    }, { threshold: 0.9 });
    hintables.forEach(function (el) { shown.observe(el); });
  }

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
  // own scroll-snap does the swiping). Each page has its own arrows and count under it (Ian, Nov 17, 2026: they sat
  // far below the pages before); they and the arrow keys move the row; tapping a page opens its story,
  // and the address follows along (#p-10) so a page can be shared.
  var track = document.querySelector('.reader-track');
  if (track) {
    var slides = track.querySelectorAll('.reader-page');
    var live = document.querySelector('.reader-live');
    var at = 0;
    var go = function (i) {
      at = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: slides[at].offsetLeft - track.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
    };
    // The first update, as the page loads, leaves the address alone. Rewriting it then sent the browser after the new
    // #s-... (or lost a link's own #stories), and order.js still needs #order or #buy to open the buy bar. After that
    // the address follows the story in view.
    var first = true;
    var setCurrent = function (i) {
      at = i;
      slides.forEach(function (sl, k) { sl.classList.toggle('is-current', k === i); });
      if (live && !first) live.textContent = (i + 1) + ' / ' + slides.length;
      if (first) first = false;
      else history.replaceState(null, '', '#' + slides[i].id);
    };
    track.querySelectorAll('.reader-prev').forEach(function (b) { b.addEventListener('click', function () { go(at - 1); }); });
    track.querySelectorAll('.reader-next').forEach(function (b) { b.addEventListener('click', function () { go(at + 1); }); });

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

  // Home: the hero fades its logo and title as the next section rises, the photo drifts a little, the nav
  // changes tone over paper and red, and a quiet row of dashes shows which section you're in. Scroll only.
  var hfHero = document.getElementById('hf-hero');
  if (hfHero) {
    // Opening the link always starts at the top of the home page, on a phone or a computer (no remembered
    // scroll spot from a last visit), unless the link points at a part of the page.
    if (!location.hash) { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; window.scrollTo(0, 0); }
    var hfTop = document.getElementById('hfTop');
    var hfPhoto = hfHero.querySelector('.hf-photo img');
    var hfSecs = ['hf-hero', 'hf-about', 'hf-aboutus', 'hf-issue', 'hf-artists', 'hf-share', 'hf-find'].map(function (id) { return document.getElementById(id); });
    var hfAbout = document.getElementById('hf-about');
    var hfWords = document.querySelectorAll('#hf-about .mission .w');
    var hfQuote = document.querySelector('#hf-about .mission');
    var hfBusy = false;
    var hfTick = function () {
      hfBusy = false;
      var h = window.innerHeight, cur = 0;
      hfSecs.forEach(function (el, i) { if (el && el.getBoundingClientRect().top < h * 0.5) cur = i; });
      var tone = hfSecs[cur].dataset.tone || 'dark';
      document.body.classList.toggle('on-paper', tone === 'paper');
      document.body.classList.toggle('on-red', tone === 'red');
      if (reduce) return;
      // The tagline's words light up as the quote travels from 85% to 35% of the screen height (and dim again going back up).
      if (hfQuote) {
        var qt = (h * 0.85 - hfQuote.getBoundingClientRect().top) / (h * 0.5);
        var lit = Math.round(Math.max(0, Math.min(1, qt)) * hfWords.length);
        hfWords.forEach(function (w, i) { w.classList.toggle('is-lit', i < lit); });
      }
      var p = Math.min(1, Math.max(0, 1 - hfAbout.getBoundingClientRect().top / h));
      hfPhoto.style.setProperty('--sy', String(p * 6));
      hfTop.style.transform = 'translate3d(0,' + (-p * 40) + 'px,0)';
      hfTop.style.opacity = String(Math.max(0, 1 - p * 2.6));
      var hfCue = document.getElementById('hfCue'); if (hfCue) hfCue.style.visibility = p > 0.04 ? 'hidden' : 'visible';
    };
    var hfQueue = function () { if (!hfBusy) { hfBusy = true; requestAnimationFrame(hfTick); } };
    window.addEventListener('scroll', hfQueue, { passive: true });
    window.addEventListener('resize', hfQueue);
    hfTick();
  }

  // A tagline marked mission-auto sets itself word by word as the page opens.
  var wordsStart = mark ? 600 : 250;
  document.querySelectorAll('.mission-auto .w').forEach(function (w, i) {
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

  // ---------- The nav tucks away while you scroll down (Ian, Nov 15, 2026) ----------
  // Scrolling down, the header logo takes off and glides across the top to the right-hand corner, with two wing
  // beats and a small dip, shrinking as it goes. Each button drops out as the wings pass over it, and the logo lands
  // as the small wings, black and white until you point at them (Ian picked this "fly-by", Nov 15, 2026, over the
  // red squeegee bar). Tapping the wings, tabbing into the nav, or reaching the top of the page (on home, the "An outlet for all art" section) plays the same timeline backwards:
  // the wings fly home and the buttons pop back up behind them. Changing direction halfway turns it around where it
  // is, so it never jumps. On a phone the menu button's three lines give way to the wings instead of the buttons.
  // Near the top of the page the nav always shows, and it never tucks while the phone menu is open. With reduced
  // motion it crossfades. Transform and opacity only, run by the browser's animation engine (the Web Animations
  // API), so it stays smooth while the page scrolls.
  var tuck = (function () {
    var nav = header && header.querySelector('.site-nav');
    if (!nav || !nav.animate) return null;
    var links = nav.querySelectorAll('a');
    var logo = header.querySelector('.brand-mark');
    var menuButton = header.querySelector('.nav-burger');
    // The tab (the wings in the corner) is for pointers and touch. Keyboard users get the nav back by tabbing into it.
    var tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'nav-tab';
    tab.tabIndex = -1;
    tab.setAttribute('aria-hidden', 'true');
    var wingsSrc = (logo && logo.getAttribute('src')) || '/images/emblem-small.webp';
    var wingsImg = '<img src="' + wingsSrc + '" width="400" height="138" alt="" decoding="async">';
    tab.innerHTML = wingsImg;
    nav.appendChild(tab);
    // Phones: the wings sit in the menu button, on top of its three lines.
    var menuLines = menuButton && menuButton.querySelector('.burger-lines');
    var menuWings = null;
    if (menuButton) {
      menuButton.insertAdjacentHTML('beforeend', wingsImg);
      menuWings = menuButton.lastElementChild;
      menuWings.className = 'burger-wings';
    }

    var phone = window.matchMedia('(max-width: 520px)');
    var DURATION = 600;
    var TAKE_OFF = 0.02; // when the logo leaves, as a share of the timeline
    var LAND = 0.72;     // when it reaches the corner (the wings then fade in over the rest, so going home they fade out before it lifts off)
    var STEPS = 20;      // points along the flight path
    var group = null;
    var tucked = false;

    // Eases in and out of the flight.
    function glide(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function middle(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

    // Every moving part, as one timeline: 0 is the nav as normal, 1 is tucked into the wings.
    function build() {
      var opts = { duration: DURATION, fill: 'both' };
      var anims = [];
      var onPhone = phone.matches;
      var wings = onPhone ? menuWings : tab;
      // Header A (Ian, Nov 17, 2026): the shop tab stays put; the wings land just left of it (styles.css, --shop-w).
      var shopLink = nav.querySelector('.nav-shop');
      if (shopLink) nav.style.setProperty('--shop-w', shopLink.offsetWidth + 'px');
      var leaving = onPhone ? (menuLines ? [menuLines] : []) : Array.prototype.slice.call(links).filter(function (el) { return !el.classList.contains('nav-shop'); });
      var pauseAll = function () { anims.forEach(function (a) { a.pause(); }); return anims; };

      if (reduce || !wings) {
        leaving.forEach(function (el) { anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], opts)); });
        if (logo) anims.push(logo.animate([{ opacity: 1 }, { opacity: 0 }], opts));
        if (wings) anims.push(wings.animate([{ opacity: 0 }, { opacity: 1 }], opts));
        return pauseAll();
      }

      // Where it flies from and to. The logo makes the flight when it's showing. On home before it has appeared,
      // and on the narrowest phones where it steps aside, the wings make the same flight from the logo's place.
      var to = (onPhone ? menuWings : tab.querySelector('img')).getBoundingClientRect();
      var from = logo ? logo.getBoundingClientRect() : null;
      var logoFlies = !!(from && from.width && parseFloat(getComputedStyle(logo.parentNode).opacity) > 0.5);
      if (!from || !from.width) {
        var edge = header.getBoundingClientRect().left + parseFloat(getComputedStyle(header).paddingLeft);
        from = { left: edge, top: to.top, width: to.width, height: to.height };
      }
      var a = middle(from), b = middle(to);
      var dx = b.x - a.x, dy = b.y - a.y;
      var shrink = to.width / from.width;
      var dip = Math.min(12, 4 + Math.abs(dx) * 0.012);

      // The path, as a run of keyframes. Two wing beats on the way (the wings pull in sideways and spread again)
      // and a small dip in the middle, like a glide. The logo is moved from its own place; the wings stand-in is
      // moved back from the corner, so it ends where it rests.
      var flyer = logoFlies ? logo : wings;
      var path = [];
      for (var i = 0; i <= STEPS; i++) {
        var q = glide(i / STEPS);
        var size = (1 + (shrink - 1) * q) / (logoFlies ? 1 : shrink);
        var beat = 1 - 0.22 * Math.pow(Math.sin(Math.PI * 2 * q), 2);
        var x = dx * q - (logoFlies ? 0 : dx);
        var y = dy * q + Math.sin(Math.PI * q) * dip - (logoFlies ? 0 : dy);
        path.push({
          offset: TAKE_OFF + (LAND - TAKE_OFF) * (i / STEPS),
          transform: 'translate(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px) scale(' + (size * beat).toFixed(4) + ', ' + size.toFixed(4) + ')',
        });
      }
      var landed = path[path.length - 1].transform;
      var frames = [{ offset: 0, transform: path[0].transform }].concat(path, [{ offset: 1, transform: landed }]);
      anims.push(flyer.animate(frames, opts));
      if (logoFlies) {
        // The logo hands over to the wings in the corner: the same picture, in the same place.
        // A long crossfade, not a one-frame swap: flying home, the wings fade out as the logo fades in (Jameson, Nov 20, 2026).
        anims.push(logo.animate([{ opacity: 1 }, { offset: LAND, opacity: 1 }, { offset: 0.98, opacity: 0 }, { opacity: 0 }], opts));
        anims.push(wings.animate([{ opacity: 0 }, { offset: LAND, opacity: 0 }, { offset: 0.98, opacity: 1 }, { opacity: 1 }], opts));
      } else {
        anims.push(wings.animate([{ opacity: 0 }, { offset: 0.5, opacity: 1 }, { opacity: 1 }], opts));
        // The hidden logo stays hidden while tucked, even if home shows it meanwhile.
        if (logo) anims.push(logo.animate([{ opacity: 1 }, { offset: 0.05, opacity: 0 }, { opacity: 0 }], opts));
      }

      // Each button drops out as the front of the wings reaches it.
      leaving.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var reach = r.left + r.width * 0.2;
        var pass = LAND;
        for (var k = 0; k <= 100; k++) {
          var g = glide(k / 100);
          if (a.x + dx * g + (from.width * (1 + (shrink - 1) * g)) / 2 >= reach) { pass = TAKE_OFF + (LAND - TAKE_OFF) * (k / 100); break; }
        }
        var start = Math.max(0, pass - 0.02);
        var gone = Math.min(0.98, pass + 0.1);
        var down = 'translateY(12px) scale(0.9)';
        anims.push(el.animate([
          { offset: 0, opacity: 1, transform: 'translateY(0px) scale(1)' },
          { offset: start, opacity: 1, transform: 'translateY(0px) scale(1)', easing: 'ease-in' },
          { offset: gone, opacity: 0, transform: down },
          { offset: 1, opacity: 0, transform: down },
        ], opts));
      });
      return pauseAll();
    }

    function run(toTucked) {
      if (toTucked && header.classList.contains('nav-open')) return;
      if (toTucked === tucked) return;
      // Measure before changing anything, so the browser doesn't have to redo the header's styles mid-frame.
      if (!group && toTucked) group = build();
      tucked = toTucked;
      // Going in, the wings land red (the logo's own color) and then fade to black and white (styles.css, .wings-hold / .wings-fade).
      header.classList.remove('wings-fade');
      if (toTucked) header.classList.add('wings-hold');
      header.classList.toggle('is-tucked', toTucked);
      if (!group) return;
      group.forEach(function (a) { a.playbackRate = toTucked ? 1 : -1; a.play(); });
      cleanUpWhenBack(group);
    }
    // Back to normal: drop the animations so the nav's own styles (hover lifts and so on) take over again.
    function cleanUpWhenBack(g) {
      g[0].onfinish = function () {
        if (tucked && group === g) {
          // Landed: the wings let go of the red slowly.
          header.classList.add('wings-fade');
          header.classList.remove('wings-hold');
        } else if (!tucked && group === g) { g.forEach(function (a) { a.cancel(); }); group = null; header.classList.remove('wings-hold'); }
      };
    }

    // A new width means new measurements: rebuild at the same point and carry on. Only the width matters, so
    // iPhone Safari's toolbar shrinking as you scroll (a height change) never interrupts it.
    var lastWidth = window.innerWidth;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      if (!group) return;
      var time = group[0].currentTime;
      var rate = group[0].playbackRate;
      var running = group[0].playState === 'running';
      group.forEach(function (a) { a.cancel(); });
      group = build();
      group.forEach(function (a) { a.currentTime = time; a.playbackRate = rate; if (running) a.play(); });
      cleanUpWhenBack(group);
    });
    // Opened by hand (the wings, or tabbing into the nav): it stays open while you read on, and only tucks again
    // once you've scrolled well past where you opened it. Without this, the next nudge of the page flipped the
    // animation back around halfway through, which looked like a glitch (Jameson, Nov 20, 2026).
    var HOLD = 400;
    var holdY = null;
    function openByHand() {
      holdY = window.scrollY;
      run(false);
    }
    // Clicking the wings keeps their colored look until they've faded into the logo (styles.css, .wings-hold).
    tab.addEventListener('click', function () {
      if (tucked) header.classList.add('wings-hold');
      openByHand();
    });
    header.addEventListener('focusin', function (e) { if (e.target !== tab) openByHand(); });
    if (menuButton) menuButton.addEventListener('click', openByHand);

    // Decided once per frame from the scroll position: it takes a deliberate 10px in one direction to change.
    var lastY = window.scrollY;
    var travel = 0;
    var about = isHome ? document.getElementById('hf-about') : null;
    return function (y, maxY) {
      // iPhones bounce past the ends of the page; count only the real range, so the bounce back at the bottom
      // doesn't read as scrolling up.
      y = Math.max(0, Math.min(y, maxY));
      var d = y - lastY;
      lastY = y;
      // On a phone the nav no longer tucks (header A): the menu lines and the logo stay where they are.
      // At the top of the page the nav is always open, and that is the only place scrolling reopens it.
      // On home the open zone runs down through the "An outlet for all art" section: the nav reopens as that section
      // comes back into view (Jameson, Nov 20, 2026), not only at the very top.
      var inOpenZone = y < 80 || (about && about.getBoundingClientRect().bottom > 70);
      if (inOpenZone || phone.matches || header.classList.contains('nav-open')) { travel = 0; holdY = null; run(false); return; }
      if (d * travel < 0) travel = 0;
      travel += d;
      // Scrolling back up never reopens it mid-page: the wings (or the top of the page) do.
      if (holdY !== null) {
        if (y < holdY + HOLD) { travel = 0; return; }
        holdY = null;
      }
      if (travel > 10) run(true);
    };
  })();

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
    // Backup for the reveal observer, which some browsers (iPhone Safari) run late: anything already
    // on screen shows now (measured here, shown with the other writes below).
    var showNow = [];
    if (!reduce) {
      pendingReveal.forEach(function (el) {
        if (el.classList.contains('is-in')) return;
        var r = el.getBoundingClientRect();
        if (r.top < vh * 0.95 && r.bottom > 0) showNow.push(el);
      });
    }
    // The nav tuck measures (when it starts) and then writes, so it goes after the reads.
    if (tuck) tuck(y, docH);

    // On home the header's emblem waits until the big one has scrolled away.
    header.classList.toggle('is-scrolled', y > (isHome ? vh * 0.4 : 8));
    if (fill) fill.style.transform = 'scaleY(' + (docH > 0 ? Math.min(1, y / docH) : 0).toFixed(4) + ')';

    if (reduce) return;
    rows.forEach(function (row, i) { row.classList.toggle('is-active', i === active); });
    showNow.forEach(function (el) { el.classList.add('is-in'); });
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

// YouTube videos load only when someone presses play, so nothing is sent to YouTube before that.
// (The privacy-enhanced youtube-nocookie.com address is used, and the player starts right away.)
(function () {
  document.querySelectorAll('[data-yt]').forEach(function (box) {
    var btn = box.querySelector('.watch-play');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var frame = document.createElement('iframe');
      frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(box.dataset.yt) + '?autoplay=1';
      frame.title = box.dataset.title;
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      box.replaceChildren(frame);
      frame.focus();
    });
  });

  // Be a Dirtbag: the tabs show every kind (All) or just one, with no page load (build.mjs, storeTabs).
  (function () {
    var tabs = document.querySelectorAll('.store-tab');
    if (!tabs.length) return;
    var shop = document.querySelector('.store-shop');
    var bar = document.querySelector('.store-tabs');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var f = tab.dataset.filter;
        tabs.forEach(function (t) { t.setAttribute('aria-pressed', String(t === tab)); });
        shop.classList.toggle('is-filtered', f !== 'all');
        var first = null;
        document.querySelectorAll('.store-kind').forEach(function (k) {
          var show = f === 'all' || k.dataset.kind === f;
          (k.closest('.is-off') || k).hidden = !show;
          if (show && !first) first = k;
        });
        // If the list has scrolled up under the tabs (they stick under the header on a phone), bring its top back.
        var b = bar.getBoundingClientRect();
        if (first && first.getBoundingClientRect().top < b.bottom) {
          window.scrollTo({ top: window.scrollY + first.getBoundingClientRect().top - b.bottom - 8, behavior: 'auto' });
        }
      });
    });
  })();
})();
