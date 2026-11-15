/**
 * Mapa da Bahia por município (MapLibre GL JS).
 * - Mapa de fundo por tema: OpenFreeMap "dark" (tema escuro) ou "positron" (tema claro), ambos
 *   OpenMapTiles/OpenStreetMap. Se não carregar, cai para um fundo liso do tema e avisa.
 * - Camadas próprias inseridas ANTES do primeiro símbolo do mapa de fundo, para não cobrir rótulos
 *   (skill maplibre-cartography / maplibre-source-wiring).
 * - promoteId = cod_mun: necessário para feature-state (cor, hover e seleção).
 * - Cores lidas dos tokens do tema (CSS custom properties), relidas a cada troca de tema.
 * - Estados não dependem só de cor: alerta usa anéis de tamanho diferente no centroide; seleção usa contorno.
 * - Textos em português ou inglês; a atribuição dentro do mapa é recriada ao trocar o idioma.
 */
import { AttributionControl, Map as MLMap, NavigationControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset } from '../data/types';
import type { Filters, MapMode } from '../domain/filters';
import { fmt1, fmtInt } from '../domain/format';
import { activityValues, classOf, meanDensityValues, polygonAreaKm2, type RatioClass, ratioClass } from '../domain/mapValues';
import { type Lang, tr } from '../i18n/lang';
import type { Theme } from './theme';

setWorkerUrl(workerUrl);

const BASEMAP: Record<Theme, string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
};
const blank = (bg: string): StyleSpecification => ({
  version: 8, sources: {}, layers: [{ id: 'fundo', type: 'background', paint: { 'background-color': bg } }],
});
const SRC = 'municipios';
const BAHIA: [[number, number], [number, number]] = [[-46.7, -18.4], [-37.3, -8.5]];

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

const RATIO_TOKEN: Record<RatioClass, string> = {
  muito_acima: '--al2', acima: '--al1', normal: '--zero', abaixo: '--b1', muito_abaixo: '--b2', sem_base: '--band',
};
const alertLabel = (a: 'normal' | 'acima' | 'muito_acima') => ({
  normal: tr('dentro do normal', 'within normal'),
  acima: tr('acima do normal (acima do p75)', 'above normal (above p75)'),
  muito_acima: tr('muito acima (acima do p90)', 'well above (above p90)'),
})[a];

/** `curto`: rótulo do celular, para os quatro modos caberem numa linha sem cobrir o mapa. */
const MODES: { id: MapMode; label: [string, string]; curto: [string, string] }[] = [
  { id: 'alerta', label: ['Alerta recente', 'Recent alert'], curto: ['Alerta', 'Alert'] },
  { id: 'media', label: ['Média anual', 'Annual mean'], curto: ['Média', 'Mean'] },
  { id: 'razao', label: ['Ano ÷ normal', 'Year ÷ normal'], curto: ['Ano ÷ normal', 'Year ÷ normal'] },
  { id: 'atividade', label: ['Por sensor', 'By sensor'], curto: ['Sensor', 'Sensor'] },
];
const attribution = () => tr('Limites municipais: IBGE · Dados: NASA FIRMS', 'Municipal boundaries: IBGE · Data: NASA FIRMS');

function centroid(geom: Polygon | MultiPolygon): [number, number] {
  const ring = geom.type === 'Polygon' ? geom.coordinates[0]
    : geom.coordinates.reduce((a: number[][], p: number[][][]) => (p[0].length > a.length ? p[0] : a), geom.coordinates[0][0]);
  let x = 0; let y = 0;
  for (const [lx, ly] of ring) { x += lx; y += ly; }
  return [x / ring.length, y / ring.length];
}

interface Props {
  ds: Dataset;
  filters: Filters;
  theme: Theme;
  lang: Lang;
  onSelect: (cod: string) => void;
  onMapMode: (m: MapMode) => void;
  /** conteúdo abaixo do mapa (a série anual que escolhe o período) */
  children?: React.ReactNode;
}

export function MapView({ ds, filters, theme, lang, onSelect, onMapMode, children }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const attrib = useRef<AttributionControl | null>(null);
  const attribLang = useRef(lang);
  const fellBack = useRef(false);
  const firstTheme = useRef(theme);
  const [rev, setRev] = useState(0);             // muda quando as camadas próprias são (re)criadas
  const [basemapFailed, setBasemapFailed] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; cod: string } | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const names = useMemo(() => new Map(ds.teamIndex.map((m) => [m.cod_mun, m])), [ds.teamIndex]);
  const areas = useMemo(() => new Map(ds.municipalities.features.map((f) => [f.properties.cod_mun, polygonAreaKm2(f.geometry)])), [ds.municipalities]);
  // o idioma entra nas dependências porque os rótulos das legendas são calculados aqui
  const media = useMemo(() => meanDensityValues(ds.teamIndex, areas), [ds.teamIndex, areas, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const activity = useMemo(() => (filters.mapMode === 'atividade' ? activityValues(ds, filters) : null), [ds, filters, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const year = ds.teamState.ano_atual.ano;

  const points = useMemo<FeatureCollection<Point, { cod_mun: string; alerta: string }>>(() => ({
    type: 'FeatureCollection',
    features: ds.municipalities.features.map((f) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: centroid(f.geometry) },
      properties: { cod_mun: f.properties.cod_mun, alerta: names.get(f.properties.cod_mun)?.alerta_ultimas_4_semanas ?? 'normal' },
    })),
  }), [ds.municipalities, names]);

  const addOwnLayers = useRef<() => void>(() => {});
  addOwnLayers.current = () => {
    const m = map.current;
    if (!m || m.getSource(SRC)) return;
    const firstSymbol = m.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
    m.addSource(SRC, { type: 'geojson', data: ds.municipalities, promoteId: 'cod_mun' });
    m.addSource('centroides', { type: 'geojson', data: points, promoteId: 'cod_mun' });
    m.addLayer({
      id: 'mun-preench', type: 'fill', source: SRC,
      paint: {
        'fill-color': ['coalesce', ['feature-state', 'cor'], token('--zero')],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.97, 0.85],
      },
    }, firstSymbol);
    m.addLayer({
      id: 'mun-borda', type: 'line', source: SRC,
      paint: { 'line-color': token('--mline'), 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 9, 1.1] },
    }, firstSymbol);
    m.addLayer({
      id: 'mun-selecao', type: 'line', source: SRC,
      paint: {
        'line-color': token('--sel'),
        'line-width': ['case', ['boolean', ['feature-state', 'selecionado'], false], 3,
          ['boolean', ['feature-state', 'hover'], false], 1.6, 0],
      },
    });
    m.addLayer({
      id: 'alerta-aneis', type: 'circle', source: 'centroides',
      filter: ['in', ['get', 'alerta'], ['literal', ['acima', 'muito_acima']]],
      paint: {
        'circle-radius': ['match', ['get', 'alerta'], 'muito_acima', 5.5, 3.5],
        'circle-color': ['match', ['get', 'alerta'], 'muito_acima', token('--sel'), 'rgba(0,0,0,0)'],
        'circle-stroke-color': token('--sel'),
        'circle-stroke-width': ['match', ['get', 'alerta'], 'muito_acima', 2.2, 1.4],
        'circle-opacity': ['case', ['boolean', ['feature-state', 'visivel'], true], 0.92, 0],
        'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'visivel'], true], 1, 0],
      },
    });
    setRev((r) => r + 1);
  };

  const fallback = () => {
    const m = map.current;
    if (!m || fellBack.current) return;
    fellBack.current = true;
    setBasemapFailed(true);
    m.setStyle(blank(token('--mapbg')));
    m.once('style.load', () => addOwnLayers.current());
  };

  // criação do mapa (uma vez)
  useEffect(() => {
    if (!el.current) return;
    const m = new MLMap({
      container: el.current, style: BASEMAP[firstTheme.current], bounds: BAHIA,
      fitBoundsOptions: { padding: 20 }, attributionControl: false, dragRotate: false, pitchWithRotate: false,
    });
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    attrib.current = new AttributionControl({ compact: true, customAttribution: attribution() });
    m.addControl(attrib.current, 'bottom-right');
    m.once('load', () => addOwnLayers.current());
    // Mapa de fundo indisponível (offline, bloqueio): cai para fundo liso, sem travar a aplicação.
    const timer = window.setTimeout(() => { if (!m.isStyleLoaded()) fallback(); }, 8000);
    m.on('error', (e) => {
      const msg = String((e as unknown as { error?: { message?: string } }).error?.message ?? '');
      if (!m.isStyleLoaded() && /style|Failed to fetch|NetworkError/i.test(msg)) fallback();
    });
    let hovered: string | null = null;
    m.on('mousemove', 'mun-preench', (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const cod = String(f.properties?.cod_mun);
      if (hovered && hovered !== cod) m.setFeatureState({ source: SRC, id: hovered }, { hover: false });
      hovered = cod;
      m.setFeatureState({ source: SRC, id: cod }, { hover: true });
      m.getCanvas().style.cursor = 'pointer';
      setHover({ x: e.point.x, y: e.point.y, cod });
    });
    m.on('mouseleave', 'mun-preench', () => {
      if (hovered && m.getSource(SRC)) m.setFeatureState({ source: SRC, id: hovered }, { hover: false });
      hovered = null;
      m.getCanvas().style.cursor = '';
      setHover(null);
    });
    m.on('click', 'mun-preench', (e) => {
      const cod = e.features?.[0]?.properties?.cod_mun;
      if (cod) selectRef.current(String(cod));
    });
    return () => { window.clearTimeout(timer); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // troca de tema: novo mapa de fundo (ou fundo liso) e camadas próprias recriadas com as cores do tema
  useEffect(() => {
    const m = map.current;
    if (!m || theme === firstTheme.current) return;
    firstTheme.current = theme;
    m.setStyle(fellBack.current ? blank(token('--mapbg')) : BASEMAP[theme]);
    m.once('style.load', () => addOwnLayers.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // troca de idioma: a atribuição do MapLibre não tem setter, então o controle é recriado
  useEffect(() => {
    const m = map.current;
    if (!m || !attrib.current || attribLang.current === lang) return;
    attribLang.current = lang;
    m.removeControl(attrib.current);
    attrib.current = new AttributionControl({ compact: true, customAttribution: attribution() });
    m.addControl(attrib.current, 'bottom-right');
  }, [lang]);

  // cor de cada município conforme o modo
  const colorOf = useMemo(() => {
    const t = (n: string) => token(n);
    const zero = t('--zero');
    const ramp = [zero, t('--r1'), t('--r2'), t('--r3'), t('--r4'), t('--r5')];
    const al = { normal: zero, acima: t('--al1'), muito_acima: t('--al2') };
    const ratio = Object.fromEntries(Object.entries(RATIO_TOKEN).map(([k, v]) => [k, t(v)])) as Record<RatioClass, string>;
    const band = t('--band');
    return (cod: string): string => {
      const item = names.get(cod);
      switch (filters.mapMode) {
        case 'alerta': return al[item?.alerta_ultimas_4_semanas ?? 'normal'];
        case 'media': { const v = media.values.get(cod) ?? null; return v === null ? band : ramp[classOf(v, media.breaks)]; }
        case 'razao': return ratio[ratioClass(item?.razao_ano_atual_vs_mediana ?? null)];
        case 'atividade': {
          if (!activity) return zero;
          const v = activity.values.get(cod) ?? null;
          return v === null ? band : ramp[classOf(v, activity.breaks)];
        }
      }
    };
    // tema entra na dependência porque os tokens mudam com ele
  }, [filters.mapMode, names, media, activity, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // aplica cores, seleção e visibilidade dos anéis
  useEffect(() => {
    const m = map.current;
    if (!m || !rev || !m.getSource(SRC)) return;
    for (const f of ds.municipalities.features) {
      const cod = f.properties.cod_mun;
      m.setFeatureState({ source: SRC, id: cod }, { cor: colorOf(cod), selecionado: cod === filters.region });
      m.setFeatureState({ source: 'centroides', id: cod }, { visivel: filters.mapMode === 'alerta' });
    }
  }, [rev, colorOf, filters.region, filters.mapMode, ds.municipalities]);

  // enquadramento ao trocar de local
  useEffect(() => {
    const m = map.current;
    if (!m || !rev) return;
    if (filters.region !== '29') {
      const f = ds.municipalities.features.find((x) => x.properties.cod_mun === filters.region);
      if (f) {
        const coords = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flat(2) as number[][];
        const xs = coords.map((c) => c[0]); const ys = coords.map((c) => c[1]);
        m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60, maxZoom: 9, duration: 600 });
      }
    } else {
      m.fitBounds(BAHIA, { padding: 20, duration: 600 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.region, rev > 0]);

  const hoverItem = hover ? names.get(hover.cod) : null;
  const hoverText = (cod: string): string => {
    const it = names.get(cod);
    switch (filters.mapMode) {
      case 'alerta': return `${tr('Últimas 4 semanas', 'Last 4 weeks')}: ${alertLabel(it?.alerta_ultimas_4_semanas ?? 'normal')}`;
      case 'media': {
        const v = media.values.get(cod);
        return v === null || v === undefined ? tr('área indisponível', 'area unavailable')
          : v > 0 ? tr(`${fmt1(v)} detecções harmonizadas/ano por 1.000 km²`, `${fmt1(v)} harmonized detections/year per 1,000 km²`)
          : tr('nenhuma detecção no histórico', 'no detections on record');
      }
      case 'razao': {
        const r = it?.razao_ano_atual_vs_mediana;
        return r === null || r === undefined ? tr('sem base histórica para comparar', 'no historical baseline to compare')
          : tr(`${year}: ${fmt1(r)}× a mediana histórica até a data`, `${year}: ${fmt1(r)}× the historical median to date`);
      }
      case 'atividade': {
        const v = activity?.values.get(cod);
        return v === null || v === undefined ? tr('sem valor calculável', 'no computable value')
          : `${fmt1(v)}${activity?.kind === 'razao' ? '×' : tr(' por 1.000 km²', ' per 1,000 km²')}`;
      }
    }
  };

  const Sw = ({ c, children, hatch }: { c?: string; children: React.ReactNode; hatch?: boolean }) => (
    <li><span className={`amostra${hatch ? ' hachura' : ''}`} style={c ? { background: `var(${c})` } : undefined} />{children}</li>
  );
  const agg = <p className="nota">{tr('Agregação por município (417). Não são pontos de detecção nem área queimada.', 'Aggregated by municipality (417). These are not detection points or burned area.')}</p>;
  const upTo = (v: string) => tr(`até ${v}`, `up to ${v}`);

  return (
    <section className="coluna-mapa" aria-label={tr('Mapa dos municípios da Bahia', 'Map of Bahia municipalities')}>
      <div className="mapa-area">
        <div ref={el} className="mapa" data-testid="mapa" />
        <div className="cartao mapa-modos">
          <div className="segmentos na-superficie" role="group" aria-label={tr('O que o mapa mostra', 'What the map shows')}>
            {MODES.map((md) => (
              <button key={md.id} type="button" aria-pressed={filters.mapMode === md.id} onClick={() => onMapMode(md.id)}
                      disabled={md.id === 'atividade' && !ds.sensors}
                      title={md.id === 'razao' ? tr(`${year} acumulado ÷ mediana histórica até a data`, `${year} cumulative ÷ historical median to date`) : undefined}>
                <span className="rotulo-longo">{md.id === 'razao' ? `${year} ÷ normal` : tr(...md.label)}</span>
                <span className="rotulo-curto">{md.id === 'razao' ? `${year} ÷ normal` : tr(...md.curto)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="cartao legenda" data-testid="legenda-mapa">
          {filters.mapMode === 'alerta' && (
            <>
              <div className="legenda-titulo">{tr('Últimas 4 semanas × normal da semana', 'Last 4 weeks × normal for those weeks')}</div>
              <ul>
                <Sw c="--al2">◉ {tr('Muito acima (acima do p90)', 'Well above (above p90)')}</Sw>
                <Sw c="--al1">○ {tr('Acima (acima do p75)', 'Above (above p75)')}</Sw>
                <Sw c="--zero">{tr('Dentro do normal', 'Within normal')}</Sw>
              </ul>
              <p className="nota">{tr('Série da equipe. Comparação histórica, não alerta operacional.', 'Team series. Historical comparison, not an operational alert.')}</p>
            </>
          )}
          {filters.mapMode === 'media' && (
            <>
              <div className="legenda-titulo">{media.label}</div>
              <ul>
                {media.breaks.map((b, i) => <Sw key={i} c={`--r${i + 1}`}>{upTo(fmt1(b))}</Sw>)}
                <Sw c="--zero">{tr('Nenhuma detecção', 'No detections')}</Sw>
              </ul>
              <p className="nota">{tr('Detecções harmonizadas (equiv. MODIS) · classes por quintis.', 'Harmonized detections (MODIS equiv.) · quintile classes.')}</p>
            </>
          )}
          {filters.mapMode === 'razao' && (
            <>
              <div className="legenda-titulo">{tr(`${year} acumulado ÷ mediana histórica até a data`, `${year} cumulative ÷ historical median to date`)}</div>
              <ul>
                <Sw c="--al2">{tr('2× ou mais', '2× or more')}</Sw>
                <Sw c="--al1">{tr('1,05–2×', '1.05–2×')}</Sw>
                <Sw c="--zero">{tr('perto do normal (±5 %)', 'near normal (±5%)')}</Sw>
                <Sw c="--b1">{tr('0,5–0,95×', '0.5–0.95×')}</Sw>
                <Sw c="--b2">{tr('menos da metade', 'less than half')}</Sw>
                <Sw c="--band">{tr('sem base histórica', 'no historical baseline')}</Sw>
              </ul>
            </>
          )}
          {filters.mapMode === 'atividade' && (activity ? (
            <>
              <div className="legenda-titulo">{activity.label}</div>
              <ul>
                {activity.breaks.map((b, i) => <Sw key={i} c={`--r${i + 1}`}>{upTo(`${fmt1(b)}${activity.kind === 'razao' ? '×' : ''}`)}</Sw>)}
                <Sw c="--zero">{tr('Nenhuma detecção', 'No detections')}</Sw>
                {activity.kind === 'razao' && <Sw c="--band">{tr('MODIS sem detecção (razão indefinida)', 'No MODIS detection (ratio undefined)')}</Sw>}
              </ul>
              {activity.kind === 'razao' && <p className="nota">{tr('Os sensores não são somados: o mapa mostra quantas vezes o VIIRS registra mais que o MODIS.', 'The sensors are not added together: the map shows how many times more VIIRS records than MODIS.')}</p>}
            </>
          ) : <p className="nota">{tr('Dados por sensor indisponíveis para o período (cobrem 2020–2025).', 'Sensor data unavailable for this period (they cover 2020–2025).')}</p>)}
          {agg}
        </div>
        {basemapFailed && (
          <div className="cartao mapa-aviso" role="status">{tr('Mapa de fundo indisponível (sem conexão com OpenFreeMap). Os municípios continuam clicáveis.', 'Basemap unavailable (no connection to OpenFreeMap). Municipalities remain clickable.')}</div>
        )}
        {hover && hoverItem && (
          <div className="mapa-tooltip" style={{ left: hover.x, top: hover.y }}>
            <strong>{hoverItem.nome}</strong>
            <div>{hoverText(hover.cod)}</div>
            {filters.mapMode === 'media' && <div style={{ opacity: 0.8 }}>{tr('Média anual', 'Annual mean')}: {fmtInt(hoverItem.media_anual)}</div>}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
