// dom helpers for reading and writing the active editable target on the page.

export type EditableTarget =
  | { kind: 'value'; el: HTMLInputElement | HTMLTextAreaElement }
  | { kind: 'content'; el: HTMLElement };

let lastEditable: EditableTarget | null = null;

function isTextInput(el: Element | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  const t = (el.type || 'text').toLowerCase();
  return ['text', 'search', 'url', 'email', 'tel', ''].includes(t);
}

export function trackEditable(el: EventTarget | null) {
  if (el instanceof HTMLTextAreaElement || isTextInput(el as Element)) {
    lastEditable = { kind: 'value', el: el as HTMLInputElement | HTMLTextAreaElement };
  } else if (el instanceof HTMLElement && el.isContentEditable) {
    lastEditable = { kind: 'content', el };
  }
}

export function getActiveEditable(): EditableTarget | null {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement || isTextInput(active)) {
    return { kind: 'value', el: active as HTMLInputElement | HTMLTextAreaElement };
  }
  if (active instanceof HTMLElement && active.isContentEditable) {
    return { kind: 'content', el: active };
  }
  return lastEditable;
}

export function readSelection(): string {
  const sel = window.getSelection?.();
  return sel ? sel.toString().trim() : '';
}

/** Best-effort: selection first, otherwise the focused/last editable's content. */
export function readPromptSource(): { text: string; fromSelection: boolean } {
  const selection = readSelection();
  if (selection) return { text: selection, fromSelection: true };
  const target = getActiveEditable();
  if (!target) return { text: '', fromSelection: false };
  if (target.kind === 'value') return { text: target.el.value.trim(), fromSelection: false };
  return { text: (target.el.innerText || '').trim(), fromSelection: false };
}

export function replacePrompt(text: string): boolean {
  const target = getActiveEditable();
  if (!target) return false;
  if (target.kind === 'value') {
    const el = target.el;
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.focus();
    return true;
  }
  // contenteditable
  target.el.focus();
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    document.execCommand('insertText', false, text);
  } else {
    target.el.innerText = text;
    target.el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
  return true;
}
