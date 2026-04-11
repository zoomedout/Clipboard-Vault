/* ── SPA Router ────────────────────────────────────────── */
/* Hash-based routing: #home, #features, #compare, etc.   */
/* Fetches content fragments from html/ and swaps <main>   */
/* Note: innerHTML is used to inject trusted first-party   */
/* HTML fragments served from the same origin. No user     */
/* input is involved — all content is static site pages.   */

(function () {
  var PAGE_CSS = {};        // cache: route → <link> element
  var PAGE_CACHE = {};      // cache: route → HTML string
  var currentRoute = null;

  // Pages that use light mode (override dark theme)
  var LIGHT_PAGES = { privacy: true, 'privacy-choices': true };

  // Map route names to CSS files (null = no page-specific CSS)
  var CSS_MAP = {
    home: 'css/guide.css',
    features: 'css/features.css',
    compare: 'css/compare.css',
    'in-action': 'css/in-action.css',
    support: 'css/support.css',
    privacy: 'css/privacy.css',
    'privacy-choices': 'css/privacy-choices.css'
  };

  // Map route names to page titles
  var TITLE_MAP = {
    home: 'Clipboard Vault \u2014 Encrypted Clipboard Manager for Mac, iPhone & iPad',
    features: 'Features \u2014 Clipboard Vault',
    compare: 'Compare \u2014 Clipboard Vault',
    'in-action': 'See It In Action \u2014 Clipboard Vault',
    support: 'Support \u2014 Clipboard Vault',
    privacy: 'Privacy Policy \u2014 Clipboard Vault',
    'privacy-choices': 'Your Privacy Choices \u2014 Clipboard Vault'
  };

  function getRouteFromHash() {
    var hash = location.hash.replace('#', '').replace(/^\//, '');
    return hash || 'home';
  }

  function loadPageCSS(route) {
    var cssFile = CSS_MAP[route];
    if (!cssFile) return;

    if (PAGE_CSS[route]) {
      PAGE_CSS[route].disabled = false;
      return;
    }

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssFile;
    link.setAttribute('data-page', route);
    document.head.appendChild(link);
    PAGE_CSS[route] = link;
  }

  function unloadPageCSS(route) {
    if (PAGE_CSS[route]) {
      PAGE_CSS[route].disabled = true;
    }
  }

  function updateNavActive(route) {
    var links = document.querySelectorAll('.nav-links a[data-route]');
    for (var i = 0; i < links.length; i++) {
      var linkRoute = links[i].getAttribute('data-route');
      if (linkRoute === route) {
        links[i].classList.add('active');
      } else {
        links[i].classList.remove('active');
      }
    }
  }

  function applyTheme(route) {
    var body = document.body;
    var canvas = document.getElementById('universe');
    if (LIGHT_PAGES[route]) {
      body.classList.add('light-mode');
      if (canvas) canvas.style.display = 'none';
    } else {
      body.classList.remove('light-mode');
      if (canvas) canvas.style.display = '';
    }
  }

  function rerunFadeIn() {
    if (typeof observer !== 'undefined') {
      document.querySelectorAll('.fade-in').forEach(function (el) {
        observer.observe(el);
      });
    }
  }

  async function navigate(route, pushState) {
    if (route === currentRoute) return;

    var main = document.getElementById('page-content');
    if (!main) return;

    // Fetch content first (before animation, so swap is instant)
    var html;
    if (PAGE_CACHE[route]) {
      html = PAGE_CACHE[route];
    } else {
      try {
        var resp = await fetch('html/' + route + '.html');
        if (!resp.ok) {
          main.textContent = 'Page not found: ' + route;
          return;
        }
        html = await resp.text();
        PAGE_CACHE[route] = html;
      } catch (e) {
        main.textContent = 'Failed to load page: ' + e.message;
        return;
      }
    }

    // Fade out old content (skip on initial load)
    if (currentRoute) {
      main.classList.add('page-exit');
      await new Promise(function (r) { setTimeout(r, 250); });
      unloadPageCSS(currentRoute);
    }

    // Swap content — trusted first-party HTML fragments only
    main.innerHTML = html;

    // Load page CSS
    loadPageCSS(route);

    // Apply theme
    applyTheme(route);

    // Update title
    document.title = TITLE_MAP[route] || 'Clipboard Vault';

    // Update nav active state
    updateNavActive(route);

    // Update hash
    if (pushState !== false) {
      history.pushState({ route: route }, '', '#' + route);
    }

    // Scroll to top
    window.scrollTo(0, 0);

    // Fade in new content
    // Force reflow so the transition triggers
    void main.offsetHeight;
    main.classList.remove('page-exit');

    // Re-run fade-in animations
    rerunFadeIn();

    currentRoute = route;
  }

  // Mobile hamburger toggle
  var hamburger = document.getElementById('nav-hamburger');
  var navLinks = document.getElementById('nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('open');
      navLinks.classList.toggle('mobile-open');
    });
  }

  function closeMobileNav() {
    if (hamburger && navLinks) {
      hamburger.classList.remove('open');
      navLinks.classList.remove('mobile-open');
    }
  }

  // Intercept clicks on data-route links
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[data-route]');
    if (!link) return;
    e.preventDefault();
    closeMobileNav();
    var route = link.getAttribute('data-route');
    navigate(route);
  });

  // Handle browser back/forward
  window.addEventListener('popstate', function (e) {
    var route = (e.state && e.state.route) || getRouteFromHash();
    navigate(route, false);
  });

  // Initial load
  var initialRoute = getRouteFromHash();
  history.replaceState({ route: initialRoute }, '', '#' + initialRoute);
  navigate(initialRoute, false);
})();
