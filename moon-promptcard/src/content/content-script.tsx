import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FloatingApp } from './FloatingApp';
import contentCss from '@/styles/global.css?inline';

// Mount everything inside a Shadow DOM so the host page's CSS can't bleed into
// our UI and our Tailwind reset can't affect the host page.
const HOST_ID = 'moon-promptcard-root';

function mount() {
  if (document.getElementById(HOST_ID)) return;
  const host = document.createElement('div');
  host.id = HOST_ID;
  // The host element itself is a zero-size anchor; the React app uses
  // position: fixed children, so it never affects page layout.
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = contentCss;
  shadow.appendChild(style);

  const appRoot = document.createElement('div');
  appRoot.className = 'mpc-shadow-root font-sans';
  shadow.appendChild(appRoot);

  createRoot(appRoot).render(
    <StrictMode>
      <FloatingApp />
    </StrictMode>,
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
