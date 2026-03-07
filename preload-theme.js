(function () {
  'use strict';
  let themeValue = null;
  try {
    themeValue = localStorage.getItem('caracal-theme');
  } catch (e) {
    /* ignore storage errors */
  }

  if (!themeValue) {
    const nameMatch = (window.name || '').match(/caracal-theme=(light|dark)/);
    if (nameMatch) themeValue = nameMatch[1];
  }

  if (themeValue) document.documentElement.setAttribute('data-theme', themeValue);
})();
