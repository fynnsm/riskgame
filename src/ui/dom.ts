type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  /** Always inserted as text, never as HTML (S-04). */
  text?: string;
  attrs?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) node.setAttribute(name, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

interface ButtonOptions {
  /** The primary button of a screen is what the Enter key triggers. */
  primary?: boolean;
  class?: string;
  testId?: string;
  disabled?: boolean;
}

export function button(
  label: string,
  onClick: () => void,
  options: ButtonOptions = {},
): HTMLButtonElement {
  const classes = ['btn', options.primary ? 'btn-primary' : '', options.class ?? '']
    .filter(Boolean)
    .join(' ');
  const node = el('button', { class: classes, text: label, attrs: { type: 'button' } });
  if (options.primary) node.dataset.primary = 'true';
  if (options.testId) node.dataset.testid = options.testId;
  if (options.disabled) node.disabled = true;
  node.addEventListener('click', onClick);
  return node;
}

export function clear(node: Element): void {
  node.replaceChildren();
}
