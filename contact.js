// The contact form on /share/ (build.mjs, contactForm). Without this file the form still posts to
// Web3Forms on its own. With it: the message sends without leaving the page, the work questions hide
// for Something else, and the guide (a red comet round the edge) sits on the next box to fill.
(function () {
  var form = document.querySelector('.contact-form');
  if (!form) return;
  var sent = document.querySelector('.contact-sent');
  var error = form.querySelector('.contact-error');
  var button = form.querySelector('[type="submit"]');
  var shareOnly = form.querySelectorAll('[data-share-only]');
  var title = form.querySelector('[data-share]');
  var aboutBox = form.elements.namedItem('about');
  // The first real choice (Share my work). Until they pick, the form reads as sharing.
  var shareValue = aboutBox.options[1].value;
  var sending = false;

  var value = function (name) { var el = form.elements.namedItem(name); return el ? el.value.trim() : ''; };
  var about = function () { return aboutBox.value || shareValue; };
  var sharing = function () { return about() === shareValue; };

  // Something else: the work questions go away, and their boxes are switched off so they aren't sent.
  function setMode() {
    var share = sharing();
    shareOnly.forEach(function (el) {
      el.hidden = !share;
      el.querySelectorAll('input, select').forEach(function (i) { i.disabled = !share; });
    });
    title.textContent = share ? title.dataset.share : title.dataset.other;
  }

  // The guide. A text box counts as done once it has something in it and they've moved on, so it
  // doesn't jump ahead mid-sentence. Show us is optional: it's passed once anything after it is filled.
  function guide() {
    var focused = document.activeElement;
    var away = function (name) { return focused !== form.elements.namedItem(name); };
    var done = function (name) { return value(name) !== '' && away(name); };
    var later = value('message') || value('name') || value('email');
    var steps = [['about', aboutBox.value !== '']];
    if (sharing()) steps.push(['makes', value('makes') !== ''], ['links', done('links') || !!later]);
    steps.push(['message', done('message')]);
    steps.push(['name', done('name')], ['email', done('email')]);
    var next = 'send';
    for (var i = 0; i < steps.length; i++) if (!steps[i][1]) { next = steps[i][0]; break; }
    form.querySelectorAll('[data-guide]').forEach(function (el) {
      // While the box itself has focus, its own red outline takes over from the comet.
      el.classList.toggle('is-guide', el.dataset.guide === next && !el.contains(focused));
    });
  }

  form.addEventListener('change', function (e) {
    if (e.target.name === 'about') setMode();
    guide();
  });
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
    var makes = sharing() ? value('makes') : '';
    data.set('about', about());
    ['makes', 'links', 'instagram'].forEach(function (k) { if (!value(k) || form.elements.namedItem(k).disabled) data.delete(k); });
    // What it's about in the subject, so messages sort at a glance in the inbox.
    data.set('subject', 'Dirtbag site · ' + about() + (makes ? ' · ' + makes : ''));
    // Lets the team reply straight from the inbox.
    data.set('replyto', value('email'));

    // No Web3Forms key yet: open an email to the team instead.
    if (!data.get('access_key')) {
      var lines = [];
      data.forEach(function (v, k) { if (['subject', 'from_name', 'replyto', 'about'].indexOf(k) < 0) lines.push(k + ': ' + v); });
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

  setMode();
  guide();
})();
