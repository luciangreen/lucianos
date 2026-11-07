export const $ = (id) => document.getElementById(id);

// el('div', { className: 'x', onclick }, child, 'text', ...)
// Properties that are attributes only in HTML (list, aria-*, data-*) are set as attributes.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (k.startsWith('aria-') || k.startsWith('data-') || k === 'list' || k === 'role') node.setAttribute(k, v);
    else node[k] = v;
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
