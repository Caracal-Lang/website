(function () {
  'use strict';

  function parseFrontMatter(markdown) {
    if (!markdown.startsWith('---')) {
      return { meta: {}, content: markdown };
    }

    const metaEndIndex = markdown.indexOf('\n---', 3);
    if (metaEndIndex === -1) {
      return { meta: {}, content: markdown };
    }

    const rawMetadata = markdown.slice(3, metaEndIndex).trim();
    const bodyContent = markdown.slice(metaEndIndex + 4).replace(/^\n/, '');
    const metadata = {};

    rawMetadata.split('\n').forEach(function (line) {
      const separator = line.indexOf(':');
      if (separator <= 0) return;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (key) metadata[key] = value;
    });

    return { meta: metadata, content: bodyContent };
  }

  function formatDate(isoDate) {
    const dateObj = new Date(isoDate);
    if (Number.isNaN(dateObj.getTime())) return isoDate;
    const parts = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    }).formatToParts(dateObj);

    const partValues = {};
    parts.forEach(function (part) {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
        partValues[part.type] = part.value;
      }
    });

    if (!partValues.year || !partValues.month || !partValues.day) return isoDate;
    return `${partValues.year} ${partValues.month} ${partValues.day}`;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[\s\W-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function addHeadingAnchors(container) {
    if (!container) return;

    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const usedIds = Object.create(null);

    headings.forEach(function (heading) {
      const headingText = heading.textContent.trim();
      const baseId = heading.id || slugify(headingText) || 'section';
      const count = usedIds[baseId] || 0;
      usedIds[baseId] = count + 1;
      const uniqueId = count ? baseId + '-' + count : baseId;

      heading.id = uniqueId;

      if (heading.querySelector('.heading-anchor')) return;

      heading.textContent = '';

      const headingAnchorEl = document.createElement('a');
      headingAnchorEl.className = 'heading-anchor';
      headingAnchorEl.href = `#${uniqueId}`;
      headingAnchorEl.setAttribute('aria-label', `Link to section ${headingText}`);
      headingAnchorEl.textContent = headingText;

      const copyLink = document.createElement('a');
      copyLink.className = 'blog-anchor';
      copyLink.href = `#${uniqueId}`;
      copyLink.setAttribute('aria-label', `Copy link to section ${headingText}`);
      copyLink.textContent = '#';

      heading.appendChild(headingAnchorEl);
      heading.appendChild(document.createTextNode(' '));
      heading.appendChild(copyLink);
    });
  }

  function renderPostToc(container) {
    const tocContainer = document.getElementById('postToc');
    const loadingIndicator = document.getElementById('postTocLoading');
    if (!tocContainer) return;

    tocContainer.innerHTML = '';

    const headings = container.querySelectorAll('h2, h3, h4, h5, h6');
    if (!headings.length) {
      if (loadingIndicator) {
        loadingIndicator.innerHTML =
          '<span class="post-toc-empty">No headings in this post.</span>';
      }
      return;
    }

    if (loadingIndicator) {
      loadingIndicator.remove();
    }

    const currentHash = window.location.hash;

    headings.forEach(function (heading) {
      if (!heading.id) return;

      const level = Number(heading.tagName.slice(1));
      const link = document.createElement('a');
      link.className = `post-toc-link post-toc-level-${level}`;
      link.href = `#${heading.id}`;

      const headingAnchor = heading.querySelector('.heading-anchor');
      link.textContent = headingAnchor
        ? headingAnchor.textContent
        : heading.textContent.replace(/\s+#$/, '');

      if (currentHash === `#${heading.id}`) {
        link.classList.add('active');
      }

      tocContainer.appendChild(link);
    });
  }

  function scrollToCurrentHash() {
    if (window._adjustScrollToHash && typeof window._adjustScrollToHash === 'function') {
      window._adjustScrollToHash(0);
      return;
    }

    const rawHash = window.location.hash;
    if (!rawHash || rawHash.length < 2) return;

    let id = '';
    try {
      id = decodeURIComponent(rawHash.slice(1));
    } catch (error) {
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
    if (Math.abs(desired - current) <= 2) return;
    window.scrollTo({ top: desired, behavior: 'auto' });
  }

  function renderError(message) {
    const container = document.getElementById('blogContent') || document.getElementById('blogList');
    if (!container) return;
    container.innerHTML = `<p class="tip"><strong>Note:</strong> ${escapeHtml(message)}</p>`;
  }

  function requireMarked() {
    if (!window.marked || typeof window.marked.parse !== 'function') {
      renderError('Markdown parser failed to load.');
      return false;
    }
    return true;
  }

  function getRoutePrefix() {
    const path = String(window.location.pathname || '').replace(/\\+/g, '/');
    if (path.endsWith('/blog') || path.endsWith('/blog/')) {
      return '../';
    }
    return '';
  }

  const routePrefix = getRoutePrefix();

  function getPostHref(post) {
    if (post && typeof post.url === 'string' && post.url) {
      // If it's an absolute URL, try to convert same-site links to relative
      try {
        const parsed = new URL(post.url, window.location.href);
        // Preserve external absolute URLs unchanged
        if (parsed.protocol && parsed.hostname && parsed.hostname !== 'caracal-lang.org' && parsed.hostname !== window.location.hostname) {
          return post.url;
        }

        // For same-site URLs (production domain or current origin), emit a
        // repository-friendly relative path like `blog/slug/` so local testing
        // (http://localhost:8000) resolves correctly. Strip leading slash.
        const path = (parsed.pathname || '').replace(/^\/+/, '');
        const suffix = (parsed.search || '') + (parsed.hash || '');
        return routePrefix + path + suffix;
      } catch (e) {
        // Not a parseable absolute URL — fall back to previous behavior
        if (post.url.startsWith('/')) return post.url;
        return routePrefix + post.url;
      }
    }

    return routePrefix + 'blog/' + encodeURIComponent(post.slug || '') + '/';
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Failed to load JSON: ' + url);
    }

    const text = await response.text();
    const sanitized = text.replace(/^\uFEFF/, '');
    return JSON.parse(sanitized);
  }

  function asPostArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') return [payload];
    return [];
  }

  function renderBlogList(posts) {
    const listElement = document.getElementById('blogList');
    if (!listElement) return;

    if (!Array.isArray(posts) || !posts.length) {
      listElement.innerHTML = '<p>No posts found.</p>';
      return;
    }

    const listHtml = posts
      .map(function (post) {
        const href = getPostHref(post);
        const date = post.date
          ? `<time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDate(post.date))}</time>`
          : '';
        const description = post.description ? `<p>${escapeHtml(post.description)}</p>` : '';
        return [
          '<article class="blog-card">',
          `  <h2><a href="${escapeHtml(href)}">${escapeHtml(post.title || post.slug)}</a></h2>`,
          `  ${date}`,
          `  ${description}`,
          '</article>',
        ].join('\n');
      })
      .join('\n');

    listElement.innerHTML = listHtml;
  }

  function renderBlogSidebarPosts(posts) {
    const sidebarContainer = document.getElementById('blogPostNav');
    const loadingIndicator = document.getElementById('blogPostNavLoading');
    if (!sidebarContainer) return;

    sidebarContainer.innerHTML = '';

    if (!Array.isArray(posts) || !posts.length) {
      if (loadingIndicator) {
        loadingIndicator.innerHTML = '<span class="post-toc-empty">No posts yet.</span>';
      }
      return;
    }

    if (loadingIndicator) {
      loadingIndicator.remove();
    }

    posts.forEach(function (post) {
      if (!post || !post.slug) return;

      const link = document.createElement('a');
      link.className = 'blog-nav-post-link';
      link.href = getPostHref(post);
      link.textContent = post.title || post.slug;

      sidebarContainer.appendChild(link);
    });
  }

  async function initBlogList() {
    const listElement = document.getElementById('blogList');
    if (!listElement) return;

    try {
      const posts = asPostArray(await fetchJson(routePrefix + 'blog/index.json'));
      posts.sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
      renderBlogList(posts);
      renderBlogSidebarPosts(posts);
    } catch (error) {
      renderError('Unable to load posts. If you opened this with file://, run a local server.');
      console.error(error);
    }
  }

  async function initBlogPost() {
    const contentElement = document.getElementById('blogContent');
    if (!contentElement) return;
    if (!requireMarked()) return;

    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');

    if (!slug) {
      renderError('Missing post slug.');
      return;
    }

    try {
      let postFile = slug + '.md';

      try {
        const indexedPosts = asPostArray(await fetchJson(routePrefix + 'blog/index.json'));
        const currentPost = indexedPosts.find(function (post) {
          return post && post.slug === slug;
        });

        if (currentPost && currentPost.file) {
          postFile = currentPost.file;
        }
      } catch (indexError) {
        console.warn('Index lookup failed, using slug fallback.', indexError);
      }

      const response = await fetch(routePrefix + 'posts/' + encodeURIComponent(postFile), {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Post not found.');

      const markdown = await response.text();
      const parsed = parseFrontMatter(markdown);
      const title = parsed.meta.title || slug;
      const date = parsed.meta.date || '';

      const titleEl = document.getElementById('postTitle');
      const dateEl = document.getElementById('postDate');
      const tocTitleEl = document.getElementById('postTocTitle');

      if (titleEl) titleEl.textContent = title;
      if (tocTitleEl) tocTitleEl.textContent = title;
      if (dateEl) {
        dateEl.textContent = date ? formatDate(date) : '';
        if (date) dateEl.setAttribute('datetime', date);
      }

      contentElement.innerHTML = window.marked.parse(parsed.content);
      addHeadingAnchors(contentElement);
      renderPostToc(contentElement);
      if (window._rehighlight) window._rehighlight();
      scrollToCurrentHash();
    } catch (error) {
      renderError('Unable to load this post. Check slug and server path.');
      console.error(error);
    }
  }

  initBlogList();
  initBlogPost();
  window.addEventListener('hashchange', scrollToCurrentHash);
})();
