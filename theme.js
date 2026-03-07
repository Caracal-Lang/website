(function () {
  'use strict';

  /* ---------- Storage helpers (localStorage + window.name fallback) ---------- */
  function saveTheme(theme) {
    try {
      localStorage.setItem('caracal-theme', theme);
    } catch (e) {
      /* ignore storage errors */
    }
    window.name = `caracal-theme=${theme}`;
  }

  function loadTheme() {
    // 1) Try localStorage
    try {
      const stored = localStorage.getItem('caracal-theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch (e) {
      /* ignore storage read errors */
    }

    // 2) Fallback: window.name (survives file:// navigations in same tab)
    const nameMatch = (window.name || '').match(/caracal-theme=(light|dark)/);
    if (nameMatch) return nameMatch[1];

    return null;
  }

  /* ---------- Apply theme immediately (also called from inline <head> script) ---------- */
  const rootElement = document.documentElement;
  const savedTheme = loadTheme();
  if (savedTheme) rootElement.setAttribute('data-theme', savedTheme);

  // Expose for the inline head script
  window._tsDocLoadTheme = loadTheme;

  /* ---------- Theme toggle button ---------- */
  const toggleButton = document.getElementById('themeToggle');
  const themeIconEl = document.getElementById('themeIcon');
  const themeLabelEl = document.getElementById('themeLabel');

  if (toggleButton && themeIconEl && themeLabelEl) {
    updateButton();

    toggleButton.addEventListener('click', function () {
      const current = rootElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      rootElement.setAttribute('data-theme', next);
      saveTheme(next);
      updateButton();
      if (window._rehighlight) window._rehighlight();
    });
  }

  function updateButton() {
    const isDark = (rootElement.getAttribute('data-theme') || 'dark') === 'dark';
    themeIconEl.innerHTML = isDark ? '\u2600' : '\u263E';
    themeLabelEl.textContent = isDark ? 'Light' : 'Dark';
  }

  function normalizePath(pathname) {
    let path = String(pathname || '/').replace(/\\+/g, '/');
    if (!path.startsWith('/')) path = '/' + path;
    path = path.replace(/\/+/g, '/');

    if (path.endsWith('/index.html')) {
      path = path.slice(0, -'index.html'.length);
    } else if (path.endsWith('.html')) {
      path = path.slice(0, -'.html'.length);
    }

    if (!path.endsWith('/')) {
      const hasExtension = /\/[^/]+\.[^/]+$/.test(path);
      if (!hasExtension) path += '/';
    }

    return path || '/';
  }

  function hrefToPath(href) {
    if (!href) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;

    try {
      const url = new URL(href, window.location.href);
      return normalizePath(url.pathname);
    } catch (error) {
      return null;
    }
  }

  /* ---------- Active nav link ---------- */
  function updateActiveLink() {
    const currentPath = normalizePath(location.pathname);
    const navLinks = document.querySelectorAll('nav ul li a');
    let bestMatch = null;
    const isHomeMobile =
      document.body.classList.contains('home-page') &&
      window.matchMedia('(max-width: 800px)').matches;

    navLinks.forEach(function (link) {
      link.classList.remove('active');
      const href = link.getAttribute('href') || '';

      const parts = href.split('#');
      const linkPage = parts[0] ? hrefToPath(parts[0]) : currentPath;
      const linkHash = parts.length > 1 ? '#' + parts[1] : '';

      if (!linkPage) return;

      if (linkPage === currentPath) {
        // Prefer the page-level link (without a hash) so section anchors don't
        // remain highlighted as the active sidebar item.
        if (!linkHash && !bestMatch) {
          bestMatch = link;
        }
      }
    });

    if (!isHomeMobile && bestMatch) bestMatch.classList.add('active');
  }

  updateActiveLink();
  // Ensure scrolling to anchors accounts for the top nav height
  function adjustScrollToHash(delay = 0) {
    setTimeout(function () {
      const rawHash = window.location.hash;
      if (!rawHash || rawHash.length < 2) return;
      let id = '';
      try {
        id = decodeURIComponent(rawHash.slice(1));
      } catch (e) {
        id = rawHash.slice(1);
      }

      const target = document.getElementById(id);
      if (!target) return;

      const topNav = document.querySelector('.top-nav');
      const navHeight = topNav ? topNav.getBoundingClientRect().height : 0;
      const extraOffset = 12;
      const targetTop =
        window.pageYOffset + target.getBoundingClientRect().top - navHeight - extraOffset;
      const desired = Math.max(0, targetTop);
      const current = window.pageYOffset || window.scrollY || 0;

      // If we're already at (or very near) the desired position, do nothing to avoid twitch
      if (Math.abs(desired - current) <= 2) return;
      window.scrollTo({ top: desired, behavior: 'smooth' });
    }, delay);
  }

  // adjust on hashchange so non-js anchor navigation is handled
  window.addEventListener('hashchange', function () {
    adjustScrollToHash();
  });

  // expose helper so other scripts can reuse the same scroll behavior
  window._adjustScrollToHash = adjustScrollToHash;
  window.addEventListener('hashchange', updateActiveLink);

  /* ---------- Top nav active link ---------- */
  function updateTopNavActiveLink() {
    const currentPath = normalizePath(location.pathname);
    const topNavLinks = document.querySelectorAll('.top-nav-link');

    topNavLinks.forEach(function (link) {
      const linkHref = link.getAttribute('href') || '';
      const linkPath = hrefToPath(linkHref);
      if (linkPath && linkPath === currentPath) {
        link.classList.add('active');
      }
    });
  }
  updateTopNavActiveLink();

  function addSectionHeaderAnchors() {
    // Add anchors for section H2 headers
    const headers = document.querySelectorAll('.docs-page main section[id] > h2');
    headers.forEach(function (header) {
      const section = header.parentElement;
      if (!section) return;

      const sectionId = section.getAttribute('id');
      if (!sectionId) return;
      if (header.querySelector('.heading-anchor')) return;

      const headingText = header.textContent.trim();
      if (!headingText) return;

      header.textContent = '';

      const headingAnchor = document.createElement('a');
      headingAnchor.className = 'heading-anchor';
      headingAnchor.href = `#${sectionId}`;
      headingAnchor.setAttribute('aria-label', `Link to section ${headingText}`);
      headingAnchor.textContent = headingText;

      header.appendChild(headingAnchor);
      // add a hidden copy/link anchor (appears on hover via CSS)
      if (!header.querySelector('.blog-anchor')) {
        const copyLink = document.createElement('a');
        copyLink.className = 'blog-anchor';
        copyLink.href = `#${sectionId}`;
        copyLink.setAttribute('aria-label', `Copy link to section ${headingText}`);
        copyLink.textContent = '#';
        header.appendChild(document.createTextNode(' '));
        header.appendChild(copyLink);
      }
    });

    // Helper to create URL-friendly ids
    function slugify(text) {
      return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
    }

    // Add anchors for H3 headers and inject indented sidebar links
    const sections = document.querySelectorAll('.docs-page main section[id]');
    sections.forEach(function (section) {
      const sectionId = section.getAttribute('id');
      if (!sectionId) return;

      const h3s = section.querySelectorAll('h3');
      if (!h3s || h3s.length === 0) return;

      h3s.forEach(function (h3) {
        // ensure id
        if (!h3.id) h3.id = slugify(h3.textContent || h3.innerText || '');

        // make the h3 text a link like h2 (heading-anchor) if not already
        if (!h3.querySelector('.heading-anchor')) {
          const headingText = h3.textContent.trim();
          const headingAnchor = document.createElement('a');
          headingAnchor.className = 'heading-anchor';
          headingAnchor.href = `#${h3.id}`;
          headingAnchor.setAttribute('aria-label', `Link to heading ${headingText}`);
          headingAnchor.textContent = headingText;

          // replace h3 text content while preserving children if any
          h3.textContent = '';
          h3.appendChild(headingAnchor);
          // add a hidden copy/link anchor (appears on hover via CSS)
          if (!h3.querySelector('.blog-anchor')) {
            const copy = document.createElement('a');
            copy.className = 'blog-anchor';
            copy.href = `#${h3.id}`;
            copy.setAttribute('aria-label', `Copy link to heading ${headingText}`);
            copy.textContent = '#';
            h3.appendChild(document.createTextNode(' '));
            h3.appendChild(copy);
          }
        }
      });
    });

    try {
      updateActiveLink();
    } catch (e) {
      /* ignore if not available yet */
    }
  }

  addSectionHeaderAnchors();

  /* ---------- Hamburger menu toggle ---------- */
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('nav');
  const navOverlay = document.getElementById('navOverlay');

  if (hamburger && nav && navOverlay) {
    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('active');
      nav.classList.toggle('active');
      navOverlay.classList.toggle('active');
    });

    navOverlay.addEventListener('click', function () {
      hamburger.classList.remove('active');
      nav.classList.remove('active');
      navOverlay.classList.remove('active');
    });

    // Close menu when any nav link is clicked
    nav.addEventListener('click', function (event) {
      const link = event.target.closest('a');
      if (!link || !nav.contains(link)) return;

      hamburger.classList.remove('active');
      nav.classList.remove('active');
      navOverlay.classList.remove('active');

      // After closing the menu, adjust scroll so top nav doesn't cover target
      adjustScrollToHash(60);
      try {
        updateActiveLink();
      } catch (e) {
        /* ignore if unavailable */
      }
    });
  }

  // Intercept same-document anchor clicks to avoid native jumps that cause twitch
  document.addEventListener('click', function (event) {
    const anchor = event.target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';

    let url;
    try {
      url = new URL(href, window.location.href);
    } catch (e) {
      return;
    }

    // Only handle same-origin, same-path anchors
    if (url.origin !== window.location.origin) return;
    const currentPath = normalizePath(window.location.pathname);
    const linkPath = normalizePath(url.pathname);
    if (linkPath !== currentPath) return;

    const hash = url.hash || '';
    if (!hash) return;

    const id = decodeURIComponent(hash.slice(1));
    const target = document.getElementById(id);
    if (!target) return;

    // Prevent native jump and perform controlled scroll
    event.preventDefault();
    try {
      history.pushState(null, '', hash);
    } catch (e) {
      window.location.hash = hash;
    }
    adjustScrollToHash(0);
    try {
      updateActiveLink();
    } catch (e) {
      /* ignore if unavailable */
    }
  });

  // Run once on load in case the page was opened with a hash
  adjustScrollToHash(0);
})();
