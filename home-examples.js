(function () {
  const exampleFileMap = {
    hello: 'examples/hello-world.cara',
    fibonacci: 'examples/fibonacci.cara',
    enum: 'examples/enum-usage.cara',
    'trailing-if': 'examples/trailing-if.cara',
    types: 'examples/types.cara',
  };

  const exampleSelectEl = document.getElementById('exampleSelect');
  const exampleCodeEl = document.getElementById('homeExampleCode');
  if (!exampleSelectEl || !exampleCodeEl) return;

  async function loadSelectedExample() {
    const filePath = exampleFileMap[exampleSelectEl.value] ?? exampleFileMap.hello;
    try {
      const response = await fetch(filePath);
      if (!response.ok) throw new Error('Could not load example file');
      const content = await response.text();
      exampleCodeEl.textContent = content;
      if (window._rehighlight) window._rehighlight();
    } catch (err) {
      exampleCodeEl.textContent = 'Unable to load example file.';
    }
  }

  exampleSelectEl.addEventListener('change', loadSelectedExample);
  loadSelectedExample();
})();
