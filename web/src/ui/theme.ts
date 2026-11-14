/** Tema da interface: escuro (padrão do redesign) ou claro (papel, para impressão e sala iluminada). */
export type Theme = 'dark' | 'light';

const KEY = 'brasa-tema';

export function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* armazenamento bloqueado: segue o padrão */ }
  return 'dark';
}

/** Aplica no <html> antes de qualquer leitura de token (o mapa lê as cores do CSS). */
export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  try { window.localStorage.setItem(KEY, t); } catch { /* sem persistência */ }
}
