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

  return root.innerHTML;
}
