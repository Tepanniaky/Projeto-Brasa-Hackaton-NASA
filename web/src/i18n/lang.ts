/**
 * Idioma da interface: português (padrão) ou inglês, para colaboradores da NASA.
 *
 * - `tr('texto em português', 'English text')` fica ao lado de cada texto, para a equipe
 *   manter as duas versões juntas sem chaves de dicionário.
 * - O idioma vive num único estado de módulo (como o tema); componentes usam `useLang()`
 *   para re-renderizar quando ele muda. Funções puras de domínio leem `getLang()`.
 * - Escolha: URL (`?lang=en`) > escolha salva no navegador > idioma do navegador
 *   (português → pt; qualquer outro → en). Em testes unitários fica 'pt' até alguém mudar.
 */
import { useSyncExternalStore } from 'react';

export type Lang = 'pt' | 'en';
export const LANGS: Lang[] = ['pt', 'en'];

const KEY = 'brasa-idioma';
let current: Lang = 'pt';
const listeners = new Set<() => void>();

export const getLang = (): Lang => current;

/** Texto no idioma atual. */
export const tr = <T,>(pt: T, en: T): T => (current === 'en' ? en : pt);

/** Código BCP 47 do idioma atual (atributo lang, Intl, ordenação). */
export const locale = (l: Lang = current): string => (l === 'en' ? 'en-US' : 'pt-BR');

function isLang(x: unknown): x is Lang {
  return x === 'pt' || x === 'en';
}

export function initialLang(): Lang {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (isLang(fromUrl)) return fromUrl;
  } catch { /* sem URL (testes) */ }
  try {
    const saved = window.localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch { /* armazenamento bloqueado */ }
  const prefs = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  return prefs.some((p) => /^pt\b/i.test(p ?? '')) || !prefs.length ? 'pt' : 'en';
}

/** Troca o idioma; `persist` grava a escolha (falso na inicialização, para não fixar o idioma detectado). */
export function setLang(l: Lang, persist = true): void {
  current = l;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale(l);
    document.title = tr('BRASA · Calendário do fogo na Bahia', 'BRASA · Fire calendar for Bahia, Brazil');
    document.querySelector('meta[name="description"]')?.setAttribute('content', tr(
      'BRASA: calendário explicável de atividade de fogo na Bahia a partir de NASA FIRMS (MODIS e VIIRS).',
      'BRASA: an explainable calendar of fire activity in Bahia, Brazil, from NASA FIRMS (MODIS and VIIRS).'));
  }
  if (persist) {
    try { window.localStorage.setItem(KEY, l); } catch { /* sem persistência */ }
  }
  listeners.forEach((f) => f());
}

export function subscribeLang(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Idioma atual como estado React: o componente re-renderiza quando ele muda. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, getLang);
}

/** Acrescenta `lang=en` à busca da URL (português é o padrão e não aparece). */
export function searchWithLang(search: string, l: Lang = current): string {
  const p = new URLSearchParams(search);
  if (l === 'en') p.set('lang', 'en'); else p.delete('lang');
  const s = p.toString();
  return s ? `?${s}` : '';
}
