export function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);

  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.type) node.type = options.type;

  for (const [key, value] of Object.entries(options.dataset || {})) {
    node.dataset[key] = String(value);
  }
  for (const [key, value] of Object.entries(options.attributes || {})) {
    node.setAttribute(key, String(value));
  }

  node.append(...children.filter(Boolean));
  return node;
}

export function replaceChildren(target, children) {
  target.replaceChildren(...children.filter(Boolean));
}
