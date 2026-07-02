import DOMPurify from 'dompurify';

// Reforça abertura segura de links em toda saída sanitizada: alvo em nova aba
// e rel anti-tabnabbing. Registrado uma única vez no load do módulo.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

const URL_REGEX = /\b(https?:\/\/[^\s<>"']+)/g;

export function processLinks(html) {
  if (!html) return html;

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild;
  if (!root) return html;

  root.querySelectorAll('a').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement && node.parentElement.closest('a')) continue;
    if (node.textContent && URL_REGEX.test(node.textContent)) {
      textNodes.push(node);
    }
    URL_REGEX.lastIndex = 0;
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent;
    const fragment = doc.createDocumentFragment();
    let lastIndex = 0;
    let match;
    URL_REGEX.lastIndex = 0;
    while ((match = URL_REGEX.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
      }
      const a = doc.createElement('a');
      a.href = match[1];
      a.textContent = match[1];
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      fragment.appendChild(a);
      lastIndex = match.index + match[1].length;
    }
    if (lastIndex < text.length) {
      fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
    }
    textNode.parentNode.replaceChild(fragment, textNode);
  }

  // Sanitiza contra XSS armazenado: conteúdo é gravado por qualquer usuário e
  // lido por todos (inclusive admin). Remove <script>, handlers on*, javascript:,
  // <img onerror>, <svg onload> etc. O hook acima reimpõe target/rel nos links.
  return DOMPurify.sanitize(root.innerHTML, { ADD_ATTR: ['target'] });
}
