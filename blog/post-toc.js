(function () {
  const tocContainer = document.getElementById('postToc');
  const loadingListItem = document.getElementById('postTocLoading');
  if (!tocContainer) return;

  const headingElements = document.querySelectorAll(
    '.blog-content h2[id], .blog-content h3[id], .blog-content h4[id], .blog-content h5[id], .blog-content h6[id]'
  );

  if (!headingElements.length) {
    if (loadingListItem) {
      loadingListItem.innerHTML = '<span class="post-toc-empty">No headings in this post.</span>';
    }
    return;
  }

  if (loadingListItem) loadingListItem.remove();

  const currentHash = window.location.hash;

  headingElements.forEach((heading) => {
    const level = Number(heading.tagName.slice(1));
    const link = document.createElement('a');
    link.className = 'post-toc-link post-toc-level-' + level;
    link.href = '#' + heading.id;

    const headingAnchor = heading.querySelector('.heading-anchor');
    link.textContent = headingAnchor
      ? headingAnchor.textContent
      : heading.textContent.replace(/\s+#$/, '');

    if (currentHash === '#' + heading.id) link.classList.add('active');

    tocContainer.appendChild(link);
  });
})();

if (window._rehighlight) {
  window._rehighlight();
}
