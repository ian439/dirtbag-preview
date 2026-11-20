// Ordering the Rag (build.mjs: orderForm, shopDock, shopCheckout and the thanks page; ORDERS.md explains the system).
// On /be-a-dirtbag/ (layout B, Nov 17, 2026): the buy box lives in the bar pinned to the bottom of the page. This
// keeps its total up to date (on the button too), opens and closes the bar on a phone, asks api/checkout.js to start
// a Stripe checkout, then opens Stripe's checkout form in its own section in place of the pages. For mail orders,
// when the address is complete it asks api/shipping.js for live USPS postage.
// On /be-a-dirtbag/thanks/: asks api/session.js whether the payment went through and shows what happens next.
// Stripe's script loads only when the buyer presses Continue, so nothing goes to Stripe before that.
(function () {
  var thanks = document.querySelector('[data-thanks]');
  if (thanks) { thankYou(thanks); return; }
  var dock = document.querySelector('.shop-dock');
  var form = document.querySelector('.order-form');
  if (!dock) return;

  // ---------- The bar: open and close on a phone ----------
  // On a computer (1200px and up, styles.css) the whole buy box sits in the bar and there is nothing to open.
  var wide = matchMedia('(min-width: 1200px)');
  var scrim = document.querySelector('.shop-scrim');
  var opener = dock.querySelector('.shop-dock-open');
  var closer = dock.querySelector('.shop-dock-close');
  // Back (Nov 17, 2026, AUDIT.md): opening the box adds a step to the history, so the phone's Back gesture closes it;
  // Continue does too, so Back from Stripe's form comes back to the order (like Change order). The ×, the dark layer
  // and Escape step back through that history rather than leaving a stale step behind.
  function atStep(kind) { return !!(history.state && history.state.ragOrder === kind); }
  function step(kind, replace) { var st = { ragOrder: kind }; if (replace) history.replaceState(st, ''); else history.pushState(st, ''); }
  function shut() { if (atStep('box')) history.back(); else setOpen(false); }
  function setOpen(open, quiet) {
    if (open && !quiet && !wide.matches && !atStep('box')) step('box');
    dock.classList.toggle('is-open', open);
    scrim.hidden = !open;
    if (opener) opener.setAttribute('aria-expanded', String(open));
    if (quiet) return;
    if (open) { var first = dock.querySelector('.pay-range'); if (first) first.focus({ preventScroll: true }); }
    else if (opener) opener.focus({ preventScroll: true });
  }
  if (opener) opener.addEventListener('click', function () { setOpen(true); });
  closer.addEventListener('click', shut);
  scrim.addEventListener('click', shut);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dock.classList.contains('is-open')) shut();
  });
  wide.addEventListener('change', function () { if (wide.matches) setOpen(false, true); });

  // The page keeps room at the bottom for the bar, however tall it is (styles.css, --dock-h): the whole bar on a
  // computer, the closed bar on a phone (it doesn't change while the buy box is open over the page).
  var peek = dock.querySelector('.shop-dock-peek');
  function room() {
    if (!peek || dock.classList.contains('is-open')) return;
    var h = wide.matches ? dock.offsetHeight : peek.offsetHeight;
    if (h) document.documentElement.style.setProperty('--dock-h', h + 'px');
  }
  room();
  if (window.ResizeObserver) new ResizeObserver(room).observe(dock);
  wide.addEventListener('change', room);

  // On a computer the bar is already open, so a Get the Rag that lands here lights it up once and puts the focus,
  // visibly, on the price slider. (Before, nothing on screen changed and the click looked dead.)
  var cueTimer;
  function cue() {
    var range = dock.querySelector('.pay-range');
    dock.classList.remove('is-cued');
    void dock.offsetWidth;
    dock.classList.add('is-cued');
    clearTimeout(cueTimer);
    cueTimer = setTimeout(function () { dock.classList.remove('is-cued'); }, 1700);
    if (range) {
      range.classList.add('is-cued');
      range.focus({ preventScroll: true });
      range.addEventListener('blur', function () { range.classList.remove('is-cued'); }, { once: true });
    }
  }
  // Arriving from Get the Rag (#order): on a phone, open the bar at its top; on a computer, cue it.
  function arrive() {
    if (location.hash !== '#order' && location.hash !== '#buy') return;
    if (!form) return;
    if (wide.matches) { cue(); return; }
    setOpen(true, true);
    var panel = dock.querySelector('.shop-dock-panel');
    if (panel) panel.scrollTop = 0;
  }
  arrive();
  window.addEventListener('pageshow', arrive, { once: true });
  // Experience the Rag on the same page: open the bar on a phone; on a computer, go to the price.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#order"], a[href="#buy"]');
    if (!a || !form) return;
    e.preventDefault();
    if (wide.matches) cue();
    else setOpen(true);
  });

  if (!form) return; // sold out: the bar just says so

  var min = Number(form.dataset.min);
  var max = Number(form.dataset.max);
  var maxCopies = Number(form.dataset.maxCopies);
  var words = form.dataset;
  var copiesInput = form.querySelector('#copies');
  var priceInput = form.querySelector('#price');
  var priceShown = form.querySelector('.pay-amount');
  var sum = form.querySelector('.order-sum');
  var amount = form.querySelector('.order-amount');
  var extra = form.querySelector('.order-extra');
  var goTotal = form.querySelector('.order-go-total');
  var peekAmount = dock.querySelector('.shop-dock-amount');
  var errorBox = form.querySelector('.contact-error');
  var errorText = form.querySelector('.order-error-text');
  var submit = form.querySelector('button[type="submit"]');
  var wrap = document.querySelector('.order-checkout');
  var recap = wrap.querySelector('.order-recap-line');
  var back = wrap.querySelector('.order-back');
  var panel = wrap.querySelector('.order-panel');
  var mountPoint = wrap.querySelector('#checkout-form');
  var main = document.querySelector('main');
  var checkoutForm = null;

  var whole = function (v) { return /^\d+$/.test(String(v).trim()) ? Number(v) : NaN; };
  var dollars = function (n) { return '$' + n; };
  var copiesWord = function (n) { return n + (n === 1 ? ' copy' : ' copies'); };

  // ---------- Reading the form ----------
  function copies() {
    var n = whole(copiesInput.value);
    return n >= 1 && n <= maxCopies ? n : NaN;
  }
  function price() {
    var n = whole(priceInput.value);
    return n >= min && n <= max ? n : NaN;
  }
  function method() {
    var picked = form.querySelector('input[name="method"]:checked');
    return picked ? picked.value : '';
  }

  // ---------- Keeping it up to date ----------
  function update() {
    var n = copies();
    var p = price();
    form.querySelectorAll('.qty-btn').forEach(function (b) {
      var off = b.dataset.step === '-1' ? (n || 1) <= 1 : (n || 1) >= maxCopies;
      b.setAttribute('aria-disabled', String(off));
    });
    // The slider: the big amount above it, the red fill up to the handle, and what a screen reader says.
    if (p) {
      // A small tick of the amount each time it changes (styles.css, pay-tick; only with motion on).
      if (priceShown.textContent !== dollars(p)) {
        priceShown.classList.remove('is-tick');
        void priceShown.offsetWidth;
        priceShown.classList.add('is-tick');
      }
      priceShown.textContent = dollars(p);
      if (peekAmount) peekAmount.textContent = dollars(p);
      priceInput.closest('.pay').style.setProperty('--frac', (p - min) / (max - min));
      priceInput.setAttribute('aria-valuetext', dollars(p) + ' ' + words.wPer);
    }
    var m = method();
    form.querySelectorAll('[data-note]').forEach(function (el) { el.hidden = el.dataset.note !== m; });
    if (n && p) {
      sum.textContent = copiesWord(n) + ' × ' + dollars(p);
      amount.textContent = dollars(n * p);
      goTotal.textContent = '· ' + dollars(n * p);
      extra.textContent = m === 'mail' ? words.wPostage : m === 'pickup' ? words.wFree : '';
    } else {
      goTotal.textContent = '';
    }
  }

  form.querySelectorAll('.qty-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var n = copies() || 1;
      copiesInput.value = Math.min(maxCopies, Math.max(1, n + Number(btn.dataset.step)));
      update();
    });
  });
  copiesInput.addEventListener('input', update);
  copiesInput.addEventListener('blur', function () {
    var n = whole(copiesInput.value);
    copiesInput.value = isNaN(n) ? 1 : Math.min(maxCopies, Math.max(1, n));
    update();
  });
  form.addEventListener('change', update);
  priceInput.addEventListener('input', update);
  update();

  // ---------- Errors ----------
  function showError(message) {
    errorText.textContent = message || words.wError;
    errorBox.hidden = false;
  }

  // ---------- Starting the checkout ----------
  function loadStripe() {
    return new Promise(function (resolve, reject) {
      if (window.Stripe) return resolve(window.Stripe);
      var s = document.createElement('script');
      s.src = 'https://js.stripe.com/endive/stripe.js';
      s.onload = function () { window.Stripe ? resolve(window.Stripe) : reject(new Error('no Stripe')); };
      s.onerror = function () { reject(new Error('no Stripe')); };
      document.head.appendChild(s);
    });
  }

  // Stripe's form in the site's colours (Stripe's docs, Customize appearance, embedded form): the night theme on
  // the page's own ground, ink fields, paper text, the emblem red for the Pay button and focus, square corners,
  // and the site's Archivo. Stripe allows colours, fonts and sizes here, not our own CSS.
  var appearance = {
    theme: 'night',
    labels: 'above',
    inputs: 'spaced',
    variables: {
      colorPrimary: '#d42a30',
      colorBackground: '#121112',
      colorText: '#f1eee8',
      colorTextSecondary: '#cfaeaf',
      colorDanger: '#ee5258',
      fontFamily: 'Archivo, system-ui, sans-serif',
      fontSizeBase: '16px',
      borderRadius: '0px',
      buttonBorderRadius: '0px',
      buttonColorBackground: '#d42a30',
      buttonColorText: '#ffffff',
      inputColorBorder: '#5a3a3b',
      inputFocusColorBorder: '#d42a30',
    },
  };
  var fonts = [{ family: 'Archivo', src: 'url(' + location.origin + '/fonts/archivo-latin.woff2)', weight: '400 900', display: 'swap' }];

  // Mail orders: once the address in Stripe's form is complete, our server prices postage for it and puts the
  // choices on the checkout (Stripe's docs, Dynamically customize shipping options, embedded form).
  function watchAddress(actions, stripeForm) {
    var done = false;
    stripeForm.on('change', async function (event) {
      var status = event.status || {};
      var complete = status.shippingAddress && status.shippingAddress.complete;
      if (complete && !done) {
        done = true;
        try {
          await actions.runServerUpdate(async function () {
            var r = await fetch('/api/shipping/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ checkout_session_id: actions.getSession().id, shipping_details: event.value.shippingAddress }),
            });
            var result = await r.json();
            if (result.type === 'error') throw new Error(result.message);
            return result;
          });
        } catch (err) {
          done = false;
        }
      } else if (!complete && done) {
        done = false;
      }
    });
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorBox.hidden = true;
    var n = copies(), p = price(), m = method();
    if (!n) { copiesInput.focus(); return; }
    if (!p) { priceInput.focus(); return; }
    if (!m) { form.querySelector('input[name="method"]').focus(); return; }
    if (form.classList.contains('is-sending')) return;
    form.classList.add('is-sending');
    submit.disabled = true;
    try {
      var r = await fetch('/api/checkout/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copies: n, price: p, method: m }),
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok || !data.clientSecret || !data.publishableKey) throw new Error(data.error || '');
      var Stripe = await loadStripe();
      var stripe = Stripe(data.publishableKey);
      var checkout;
      try { checkout = await stripe.initCheckoutFormSdk({ clientSecret: data.clientSecret, appearance: appearance, fonts: fonts }); }
      catch (styleErr) { checkout = await stripe.initCheckoutFormSdk({ clientSecret: data.clientSecret }); }
      var loaded = await checkout.loadActions();
      if (loaded.type !== 'success') throw new Error('');
      var actions = loaded.actions;
      checkoutForm = checkout.createForm();
      // Pay: Stripe's form hands the press to us, and we confirm it (Stripe's docs, embedded form quickstart,
      // Finalize payment). Without this, Pay does nothing. Stripe's form shows card errors itself.
      checkoutForm.on('confirm', async function (event) {
        try { await actions.confirm({ formConfirmEvent: event }); }
        catch (err) { console.error('Stripe confirm:', err); }
      });
      if (m === 'mail') watchAddress(actions, checkoutForm);
      recap.textContent = copiesWord(n) + ' × ' + dollars(p) + ' = ' + dollars(n * p) + '. ' + (m === 'mail' ? words.wMail : words.wPickup) + '.';
      // The bar and the pages step out, and the checkout takes their place at the top of the page.
      step('checkout', atStep('box'));
      setOpen(false, true);
      await leave(dock);
      main.classList.add('is-checkout');
      settle(dock);
      panel.classList.add('is-loading');
      wrap.hidden = false;
      window.scrollTo({ top: 0, behavior: 'auto' });
      checkoutForm.mount('#checkout-form');
      whenReady(checkoutForm, function () { panel.classList.remove('is-loading'); });
      enter(wrap.children);
      wrap.focus({ preventScroll: true });
    } catch (err) {
      showError(err && err.message && err.message !== 'no Stripe' ? err.message : '');
    } finally {
      form.classList.remove('is-sending');
      submit.disabled = false;
    }
  });

  // Change order: put the pages and the bar back, with the buy box open. The unpaid checkout simply expires at Stripe.
  // Back does the same.
  back.addEventListener('click', function () {
    if (back.disabled) return;
    if (atStep('checkout')) history.back(); else changeOrder();
  });
  window.addEventListener('popstate', function () {
    if (main.classList.contains('is-checkout')) { if (!atStep('checkout')) changeOrder(); }
    else if (dock.classList.contains('is-open') && !atStep('box')) setOpen(false);
  });
  async function changeOrder() {
    if (back.disabled) return;
    back.disabled = true;
    await leave(wrap);
    if (checkoutForm) {
      try { (checkoutForm.destroy || checkoutForm.unmount).call(checkoutForm); } catch (e) {}
      checkoutForm = null;
    }
    mountPoint.innerHTML = '';
    wrap.hidden = true;
    settle(wrap);
    main.classList.remove('is-checkout');
    back.disabled = false;
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (!wide.matches) { setOpen(true, true); step('box'); }
    enter([dock]);
    submit.focus({ preventScroll: true });
  }

  // ---------- Thank you ----------
  async function thankYou(root) {
    var id = new URLSearchParams(location.search).get('session_id');
    if (!id) return;
    var show = function (name, on) {
      var els = root.querySelectorAll('[data-show="' + name + '"]');
      els.forEach(function (el) { el.hidden = !on; });
      if (on) enter(els);
    };
    try {
      var r = await fetch('/api/session/?session_id=' + encodeURIComponent(id));
      var d = await r.json();
      if (!r.ok) return;
      if (d.status === 'open') { show('done', false); show('open', true); }
      else if (d.status === 'complete' && (d.method === 'mail' || d.method === 'pickup')) show(d.method, true);
    } catch (e) {}
  }

  // ---------- Moving between stages ----------
  // Out: a fade and a small lift, quick. In: each piece rises into place in turn. The same curves as the page
  // turns (styles.css, view transitions). Transform and opacity only. With reduced motion it just swaps.
  function still() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches || !document.body.animate;
  }
  function leave(el) {
    if (still()) return Promise.resolve();
    var a = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-12px)' }],
      { duration: 240, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
    // Never wait on it for long: a page in the background draws no frames, so its animations don't finish, and
    // the checkout must still open (switching apps right after Continue, on a phone).
    return Promise.race([a.finished.catch(function () {}), new Promise(function (r) { setTimeout(r, 400); })]);
  }
  function enter(els) {
    if (still()) return;
    Array.prototype.forEach.call(els, function (el, i) {
      if (el.hidden) return;
      el.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
        { duration: 460, delay: Math.min(i, 5) * 70, easing: 'cubic-bezier(0, 0, 0.2, 1)', fill: 'backwards' });
    });
  }
  // Drop a finished fill, so the element is back to its own styles when it shows again.
  function settle(el) { el.getAnimations().forEach(function (a) { a.cancel(); }); }
  // Stripe's form fades in once it has drawn itself. If it never says so, it shows anyway after 5 seconds.
  function whenReady(stripeForm, done) {
    var once = function () { if (done) { done(); done = null; } };
    try { stripeForm.on('ready', once); } catch (e) { once(); }
    setTimeout(once, 5000);
  }
})();
