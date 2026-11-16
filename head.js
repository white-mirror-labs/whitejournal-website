/* Loaded synchronously in <head>, before first paint. Kept tiny.

   1. Opt in to reveal animations before first paint, so above-the-fold
      content is never painted visible and then snapped to opacity 0. Without
      this class every .reveal element stays plainly visible, which is also
      what happens with JS off or reduced motion on.
   2. Queue for Vercel Web Analytics events fired before its script loads.
   3. The app hands over the buyer's email as /shop?email=… (old builds) or
      /preorder#email=… (fragment: never sent to a server). Either way it is
      taken out of the address bar here, before the analytics script runs,
      and kept only in memory for main.js to prefill the pre-order form. */
(function () {
  var email = null;
  try {
    email = new URLSearchParams(location.search).get('email') ||
            new URLSearchParams(location.hash.slice(1)).get('email');
  } catch (e) { /* very old browser: no prefill */ }

  if (email) {
    var path = location.pathname.replace(/\/$/, '');
    if (path === '/shop' || path === '/shop-ar') {
      location.replace((path === '/shop-ar' ? '/preorder-ar' : '/preorder') +
        '#email=' + encodeURIComponent(email));
      return;
    }
    window.wmPrefillEmail = email;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* keep going */ }
  }


  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !reduce) {
    document.documentElement.classList.add('has-motion');
  }
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
})();
