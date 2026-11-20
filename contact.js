// The contact form on /share/ (build.mjs, contactForm). Without this file the form still posts to
// Web3Forms on its own. With it: the message sends without leaving the page, Your art offers kinds of
// art as they type, and the guide (a red comet round the edge) sits on the next box to fill.
(function () {
  // The copy button beside the email puts the address on the clipboard and shows a tick for a moment.
  // (Clicking the address itself opens their mail app.)
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    var label = btn.getAttribute('aria-label');
    var status = btn.parentElement.querySelector('[role="status"]');
    btn.addEventListener('click', function () {
      var text = btn.dataset.copy;
      var done = function () {
        btn.classList.add('is-copied');
        btn.setAttribute('aria-label', 'Copied');
        if (status) status.textContent = 'Email address copied';
        setTimeout(function () {
          btn.classList.remove('is-copied');
          btn.setAttribute('aria-label', label);
          if (status) status.textContent = '';
        }, 1600);
      };
      // Older browsers, or a page not on https: copy through a hidden text box instead.
      var fallback = function () {
        var box = document.createElement('textarea');
        box.value = text;
        box.setAttribute('readonly', '');
        box.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(box);
        box.select();
        try { if (document.execCommand('copy')) done(); } catch (e) {}
        box.remove();
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
  });

  var form = document.querySelector('.contact-form');
  if (!form) return;
  var sent = document.querySelector('.contact-sent');
  var error = form.querySelector('.contact-error');
  var button = form.querySelector('[type="submit"]');
  var sending = false;

  var value = function (name) { var el = form.elements.namedItem(name); return el ? el.value.trim() : ''; };

  // The guide. A text box counts as done once it has something in it and they've moved on, so it
  // doesn't jump ahead mid-sentence. Your art and Show us are optional: each is passed once anything
  // after it is filled.
  function guide() {
    var focused = document.activeElement;
    var away = function (name) { return focused !== form.elements.namedItem(name); };
    var done = function (name) { return value(name) !== '' && away(name); };
    var later = value('message') || value('name') || value('email');
    var steps = [
      ['art', done('art') || !!(value('links') || later)],
      ['links', done('links') || !!later],
      ['message', done('message')],
      ['name', done('name')], ['email', done('email')]
    ];
    var next = 'send';
    for (var i = 0; i < steps.length; i++) if (!steps[i][1]) { next = steps[i][0]; break; }
    form.querySelectorAll('[data-guide]').forEach(function (el) {
      // The comet stays on while they type in the box too; it must never drop out.
      el.classList.toggle('is-guide', el.dataset.guide === next);
    });
  }

  form.addEventListener('change', guide);
  form.addEventListener('input', guide);
  form.addEventListener('focusin', guide);
  form.addEventListener('focusout', function () { setTimeout(guide, 0); });

  // The browser has checked the required boxes before this runs.
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    // A quick double tap can submit twice before the button switches off.
    if (sending) return;
    error.hidden = true;
    var data = new FormData(form);
    // Spam trap tripped: pretend it worked, send nothing.
    if (data.get('botcheck')) return done();

    // Nothing for the boxes they left empty.
    var art = value('art');
    ['art', 'links', 'instagram'].forEach(function (k) { if (!value(k)) data.delete(k); });
    // Their art in the subject, so messages sort at a glance in the inbox. Without it, the form's own
    // subject (New message from the Dirtbag site) stands.
    if (art) data.set('subject', 'Dirtbag site · ' + art);
    // Lets the team reply straight from the inbox.
    data.set('replyto', value('email'));

    // No Web3Forms key yet: open an email to the team instead.
    if (!data.get('access_key')) {
      var lines = [];
      data.forEach(function (v, k) { if (['subject', 'from_name', 'replyto'].indexOf(k) < 0) lines.push(k + ': ' + v); });
      location.href = 'mailto:' + form.dataset.email + '?subject=' + encodeURIComponent(data.get('subject')) + '&body=' + encodeURIComponent(lines.join('\n\n'));
      return;
    }

    sending = true;
    button.disabled = true;
    form.classList.add('is-sending');
    fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body: data })
      .then(function (res) { return res.json().then(function (out) { if (!res.ok || !out.success) throw new Error(out.message); }); })
      .then(done)
      .catch(function () {
        sending = false;
        button.disabled = false;
        form.classList.remove('is-sending');
        error.hidden = false;
      });
  });

  function done() {
    form.hidden = true;
    sent.hidden = false;
    sent.focus({ preventScroll: true });
    sent.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  // Your art: kinds of art offered under the box as they type (the list is contact.art.suggestions in
  // content.js; it reaches the page as the box's <datalist>, which the browser shows by itself when this
  // file hasn't run). Tap one, or use the arrow keys and Enter. Anything can still be typed, and after a
  // comma it starts over, so someone can list more than one.
  (function () {
    var input = form.elements.namedItem('art');
    var source = input && input.list;
    var list = form.querySelector('.suggest');
    if (!input || !source || !list) return;
    var all = [].map.call(source.options, function (o) { return o.value; });
    var MAX = 6;
    var shown = [];
    var active = -1;

    // Ours takes the place of the browser's own list.
    input.removeAttribute('list');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');

    // What they're typing now: the part after the last comma.
    var parts = function () { return input.value.split(','); };
    var term = function () { var p = parts(); return p[p.length - 1].trim().toLowerCase(); };

    // Best first: the whole name starts with what they typed, then any word in it does, then (from two
    // letters) it's anywhere in the name. Nothing they've already listed, and not what they've typed in full.
    function matches(q) {
      if (!q) return [];
      var have = parts().slice(0, -1).map(function (p) { return p.trim().toLowerCase(); });
      var ranked = [];
      all.forEach(function (name, i) {
        var n = name.toLowerCase();
        if (n === q || have.indexOf(n) >= 0) return;
        var rank = n.indexOf(q) === 0 ? 0 : n.indexOf(' ' + q) >= 0 ? 1 : q.length > 1 && n.indexOf(q) >= 0 ? 2 : -1;
        if (rank >= 0) ranked.push([rank, i, name]);
      });
      ranked.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      return ranked.slice(0, MAX).map(function (r) { return r[2]; });
    }

    function setActive(i) {
      active = i;
      [].forEach.call(list.children, function (li, n) {
        li.classList.toggle('is-active', n === i);
        li.setAttribute('aria-selected', n === i ? 'true' : 'false');
      });
      if (i >= 0) input.setAttribute('aria-activedescendant', list.children[i].id);
      else input.removeAttribute('aria-activedescendant');
    }

    function close() {
      if (list.hidden) return;
      list.hidden = true;
      shown = [];
      setActive(-1);
      input.setAttribute('aria-expanded', 'false');
    }

    function update() {
      var next = matches(term());
      if (!next.length) return close();
      // The same names as before: leave the list (and the highlighted one) alone.
      if (next.join('|') !== shown.join('|')) {
        shown = next;
        list.textContent = '';
        shown.forEach(function (name, i) {
          var li = document.createElement('li');
          li.id = list.id + '-' + i;
          li.className = 'suggest-item';
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', 'false');
          li.textContent = name;
          list.appendChild(li);
        });
        setActive(-1);
      }
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      room();
    }

    // On a phone the keyboard covers the lower half of the screen. If the list runs under it (or off the
    // bottom of the window), the page moves up just enough to show all of it, keeping the box and its
    // label below the header.
    function room() {
      var vv = window.visualViewport;
      var top = vv ? vv.offsetTop : 0;
      var floor = top + (vv ? vv.height : window.innerHeight) - 12;
      var over = list.getBoundingClientRect().bottom - floor;
      var spare = input.getBoundingClientRect().top - top - 120;
      var by = Math.min(over, spare);
      if (by > 4) window.scrollBy({ top: by, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }

    // Puts the name in place of what they were typing, keeping anything before the last comma.
    function pick(name) {
      var p = parts();
      p[p.length - 1] = (p.length > 1 ? ' ' : '') + name;
      input.value = p.join(',');
      // Tells the guide the box has changed. (That also runs update, above; close after it.)
      input.dispatchEvent(new Event('input', { bubbles: true }));
      close();
    }

    input.addEventListener('input', update);
    input.addEventListener('keydown', function (e) {
      var open = !list.hidden;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!open) { update(); if (list.hidden) return; }
        e.preventDefault();
        var n = shown.length;
        var step = e.key === 'ArrowDown' ? 1 : -1;
        // Past either end is back in the box itself, with nothing highlighted.
        var to = active + step;
        setActive(to < -1 ? n - 1 : to >= n ? -1 : to);
      } else if (e.key === 'Enter' && open && active >= 0) {
        e.preventDefault();   // picks the name; doesn't send the form
        pick(shown[active]);
      } else if (e.key === 'Tab' && open && active >= 0) {
        pick(shown[active]);
      } else if (e.key === 'Escape' && open) {
        e.stopPropagation();
        close();
      }
    });
    // A press on the list mustn't take the cursor out of the box before the tap lands.
    list.addEventListener('mousedown', function (e) { e.preventDefault(); });
    list.addEventListener('click', function (e) {
      var li = e.target.closest('.suggest-item');
      if (!li) return;
      pick(li.textContent);
      input.focus();
    });
    list.addEventListener('pointermove', function (e) {
      var li = e.target.closest('.suggest-item');
      var i = li ? [].indexOf.call(list.children, li) : -1;
      if (i !== active && e.pointerType === 'mouse') setActive(i);
    });
    list.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') setActive(-1); });
    // Leaving the box closes it. The short wait lets a tap on a name land first on phones.
    input.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement !== input) close(); }, 160); });
  })();

  guide();
})();
