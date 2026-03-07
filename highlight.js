(function () {
  'use strict';

  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const highlightRules = [
    { re: /\/\*[\s\S]*?\*\//g, cls: 'hl-cmt' },
    { re: /\/\/[^\n]*/g, cls: 'hl-cmt' },
    { re: /^[ \t]*#\s*\w+[^\n]*/gm, cls: 'hl-prep' },
    { re: /"(?:[^"\\]|\\.)*"/g, cls: 'hl-str' },
    { re: /'(?:[^'\\]|\\.)*'/g, cls: 'hl-str' },
    { re: /\b0[xX][0-9a-fA-F]+\b/g, cls: 'hl-num' },
    { re: /\b\d+\.?\d*(?:[eE][+-]?\d+)?[fFuUlL]*\b/g, cls: 'hl-num' },
    {
      re: /\b(?:def|type|enum|variant|break|skip|return|while|continue|if|else|for|switch|match|and|or|not)\b/g,
      cls: 'hl-kw',
    },
    {
      re: /\b(?:i8|i16|i32|i64|u8|u16|u32|u64|f32|f64|bool|string|step|flag|true|false|BuildStage|Permission|OS|One|Two|Values)\b/g,
      cls: 'hl-type',
    },
    { re: /\b[A-Z]\w*(?=::)/g, cls: 'hl-ns' },
    { re: /\b([A-Za-z_]\w*)(?=\s*\()/g, cls: 'hl-fn' },
  ];

  function highlightText(inputText) {
    const normalized = inputText.replace(/\r\n?/g, '\n');
    const matches = [];

    for (const rule of highlightRules) {
      const regex = new RegExp(rule.re.source, rule.re.flags || '');
      let match;
      while ((match = regex.exec(normalized)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          cls: rule.cls,
          text: match[0],
        });
        if (!regex.global) break;
      }
    }

    matches.sort((a, b) => a.start - b.start || b.end - a.end);

    const nonOverlappingMatches = [];
    let lastEnd = 0;
    for (const token of matches) {
      if (token.start >= lastEnd) {
        nonOverlappingMatches.push(token);
        lastEnd = token.end;
      }
    }

    let html = '',
      cursor = 0;
    for (const token of nonOverlappingMatches) {
      if (token.start > cursor) html += escapeHtml(normalized.substring(cursor, token.start));
      html += `<span class="${token.cls}">${escapeHtml(token.text)}</span>`;
      cursor = token.end;
    }
    if (cursor < normalized.length) html += escapeHtml(normalized.substring(cursor));
    return html;
  }

  const rehighlightCodeBlocks = (selector = 'pre code') => {
    const codeBlocks = document.querySelectorAll(selector);
    codeBlocks.forEach((el) => {
      el.innerHTML = highlightText(el.textContent || '');
    });
  };

  window._rehighlight = rehighlightCodeBlocks;
  rehighlightCodeBlocks();
})();
