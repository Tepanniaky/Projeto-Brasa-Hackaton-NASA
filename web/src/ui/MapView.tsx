/**
 * Mapa da Bahia por município (MapLibre GL JS).
 * - Mapa de fundo: OpenFreeMap "positron" (OpenMapTiles/OpenStreetMap). Se não carregar,
 *   o mapa continua funcional só com os municípios (fundo liso) e avisa.
 * - Camadas próprias inseridas ANTES do primeiro símbolo do mapa de fundo, para não cobrir rótulos
 *   (skill maplibre-cartography / maplibre-source-wiring).
 * - promoteId = cod_mun: necessário para feature-state (hover, seleção e classe).
 * - Estados não dependem só de cor: alerta usa anéis de tamanho diferente no centroide.
 */
import { AttributionControl, Map as MLMap, NavigationControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset } from '../data/types';
import type { Filters, MapMode } from '../domain/filters';
import { fmt1 } from '../domain/format';
import { activityValues, classOf } from '../domain/mapValues';

setWorkerUrl(workerUrl);

const BASEMAP = 'https://tiles.openfreemap.org/styles/positron';
const BLANK: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'fundo', type: 'background', paint: { 'background-color': '#ece6db' } }],
};
const SRC = 'municipios';
const ALERT_COLORS = ['#efe9df', '#e8833a', '#b42318'];   // normal, acima, muito_acima
const SEQ = ['#efe9df', '#f39a55', '#e47a33', '#cc5e1c', '#a64714', '#76320d'];

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
  onSelect: (cod: string) => void;
  onMapMode: (m: MapMode) => void;
}

export function MapView({ ds, filters, onSelect, onMapMode }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; cod: string } | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const names = useMemo(() => new Map(ds.teamIndex.map((m) => [m.cod_mun, m])), [ds.teamIndex]);
  const activity = useMemo(() => (filters.mapMode === 'atividade' ? activityValues(ds, filters) : null), [ds, filters]);

  const points = useMemo<FeatureCollection<Point, { cod_mun: string; alerta: string }>>(() => ({
    type: 'FeatureCollection',
    features: ds.municipalities.features.map((f) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: centroid(f.geometry) },
      properties: { cod_mun: f.properties.cod_mun, alerta: names.get(f.properties.cod_mun)?.alerta_ultimas_4_semanas ?? 'normal' },
    })),
  }), [ds.municipalities, names]);

  // criação do mapa (uma vez)
  useEffect(() => {
    if (!el.current) return;
    let fellBack = false;
    const m = new MLMap({
      container: el.current, style: BASEMAP, bounds: [[-46.7, -18.4], [-37.3, -8.5]],
      fitBoundsOptions: { padding: 20 }, attributionControl: false, dragRotate: false, pitchWithRotate: false,
    });
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new AttributionControl({ compact: true, customAttribution: 'Limites municipais: IBGE' }), 'bottom-right');
    const addOwnLayers = () => {
      if (m.getSource(SRC)) return;
      const firstSymbol = m.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
      m.addSource(SRC, { type: 'geojson', data: ds.municipalities, promoteId: 'cod_mun' });
      m.addSource('centroides', { type: 'geojson', data: points, promoteId: 'cod_mun' });
      m.addLayer({
        id: 'mun-preench', type: 'fill', source: SRC,
        paint: {
          'fill-color': ['coalesce', ['feature-state', 'cor'], '#efe9df'],
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, 0.82],
        },
      }, firstSymbol);
      m.addLayer({
        id: 'mun-borda', type: 'line', source: SRC,
        paint: { 'line-color': '#7d766c', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 9, 1] },
      }, firstSymbol);
      m.addLayer({
        id: 'mun-selecao', type: 'line', source: SRC,
        paint: {
          'line-color': '#24221e',
          'line-width': ['case', ['boolean', ['feature-state', 'selecionado'], false], 3,
            ['boolean', ['feature-state', 'hover'], false], 1.6, 0],
        },
      });
      m.addLayer({
        id: 'alerta-aneis', type: 'circle', source: 'centroides',
        filter: ['in', ['get', 'alerta'], ['literal', ['acima', 'muito_acima']]],
        paint: {
          'circle-radius': ['match', ['get', 'alerta'], 'muito_acima', 6, 3.5],
          'circle-color': ['match', ['get', 'alerta'], 'muito_acima', '#ffffff', 'rgba(255,255,255,0)'],
          'circle-stroke-color': '#24221e',
          'circle-stroke-width': ['match', ['get', 'alerta'], 'muito_acima', 2.5, 1.5],
          'circle-opacity': ['case', ['boolean', ['feature-state', 'visivel'], true], 1, 0],
          'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'visivel'], true], 1, 0],
        },
      });
      setReady(true);
    };
    m.on('load', addOwnLayers);
    // Mapa de fundo indisponível (offline, bloqueio): cai para fundo liso, sem travar a aplicação.
    const timer = window.setTimeout(() => {
      if (!m.isStyleLoaded() && !fellBack) {
        fellBack = true;
        setBasemapFailed(true);
        m.setStyle(BLANK);
        m.once('styledata', addOwnLayers);
      }
    }, 8000);
    m.on('error', (e) => {
      const msg = String((e as unknown as { error?: { message?: string } }).error?.message ?? '');
      if (!m.isStyleLoaded() && !fellBack && /style|Failed to fetch|NetworkError/i.test(msg)) {
        fellBack = true;
        setBasemapFailed(true);
        m.setStyle(BLANK);
        m.once('styledata', addOwnLayers);
      }
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
      if (hovered) m.setFeatureState({ source: SRC, id: hovered }, { hover: false });
      hovered = null;
      m.getCanvas().style.cursor = '';
      setHover(null);
    });
    m.on('click', 'mun-preench', (e) => {
      const cod = e.features?.[0]?.properties?.cod_mun;
      if (cod) selectRef.current(String(cod));
    });
    return () => { window.clearTimeout(timer); m.remove(); map.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cores por município conforme o modo e os filtros
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    for (const f of ds.municipalities.features) {
      const cod = f.properties.cod_mun;
      let cor = '#efe9df';
      if (filters.mapMode === 'alerta') {
        const a = names.get(cod)?.alerta_ultimas_4_semanas ?? 'normal';
        cor = ALERT_COLORS[a === 'muito_acima' ? 2 : a === 'acima' ? 1 : 0];
      } else if (activity) {
        const v = activity.values.get(cod) ?? null;
        cor = v === null ? '#d9d1c4' : SEQ[classOf(v, activity.breaks)];
      }
      m.setFeatureState({ source: SRC, id: cod }, { cor });
      m.setFeatureState({ source: 'centroides', id: cod }, { visivel: filters.mapMode === 'alerta' });
    }
  }, [ready, filters.mapMode, activity, ds.municipalities, names]);

  // seleção
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    m.removeFeatureState({ source: SRC });
    if (filters.region !== '29') {
      m.setFeatureState({ source: SRC, id: filters.region }, { selecionado: true });
      const f = ds.municipalities.features.find((x) => x.properties.cod_mun === filters.region);
      if (f) {
        const coords = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flat(2) as number[][];
        const xs = coords.map((c) => c[0]); const ys = coords.map((c) => c[1]);
        m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60, maxZoom: 9, duration: 600 });
      }
    } else {
      m.fitBounds([[-46.7, -18.4], [-37.3, -8.5]], { padding: 20, duration: 600 });
    }
    // reaplica cores removidas pelo removeFeatureState
    for (const f of ds.municipalities.features) {
      const cod = f.properties.cod_mun;
      let cor = '#efe9df';
      if (filters.mapMode === 'alerta') {
        const a = names.get(cod)?.alerta_ultimas_4_semanas ?? 'normal';
        cor = ALERT_COLORS[a === 'muito_acima' ? 2 : a === 'acima' ? 1 : 0];
      } else if (activity) {
        const v = activity.values.get(cod) ?? null;
        cor = v === null ? '#d9d1c4' : SEQ[classOf(v, activity.breaks)];
      }
      m.setFeatureState({ source: SRC, id: cod }, { cor, selecionado: cod === filters.region });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filters.region]);

  const hoverItem = hover ? names.get(hover.cod) : null;
  const hoverValue = hover && activity ? activity.values.get(hover.cod) : undefined;

  return (
    <div className="coluna-mapa" aria-label="Mapa dos municípios da Bahia">
      <div ref={el} className="mapa" data-testid="mapa" />
      <div className="mapa-controles">
        <div className="segmentos" role="group" aria-label="O que o mapa mostra">
          <button type="button" aria-pressed={filters.mapMode === 'alerta'} onClick={() => onMapMode('alerta')}>Alerta recente</button>
          <button type="button" aria-pressed={filters.mapMode === 'atividade'} onClick={() => onMapMode('atividade')}
                  disabled={!ds.sensors}>Atividade no período</button>
        </div>
        <div className="legenda" data-testid="legenda-mapa">
          {filters.mapMode === 'alerta' ? (
            <>
              <div className="legenda-titulo">Últimas 4 semanas comparadas ao normal (série da equipe)</div>
              <ul>
                <li><span className="amostra" style={{ background: ALERT_COLORS[2] }} /> ◉ Muito acima (acima do p90)</li>
                <li><span className="amostra" style={{ background: ALERT_COLORS[1] }} /> ○ Acima (acima do p75)</li>
                <li><span className="amostra" style={{ background: ALERT_COLORS[0] }} /> Dentro do normal</li>
              </ul>
            </>
          ) : activity ? (
            <>
              <div className="legenda-titulo">{activity.label}</div>
              <ul>
                {activity.breaks.map((b, i) => (
                  <li key={i}><span className="amostra" style={{ background: SEQ[i + 1] }} />
                    até {fmt1(b)}{activity.kind === 'razao' ? '×' : ''}</li>
                ))}
                <li><span className="amostra" style={{ background: SEQ[0] }} /> Nenhuma detecção</li>
                {activity.kind === 'razao' && <li><span className="amostra" style={{ background: '#d9d1c4' }} /> MODIS sem detecção (razão indefinida)</li>}
              </ul>
              {activity.kind === 'razao' && <p className="nota" style={{ margin: '4px 0 0' }}>Os sensores não são somados: o mapa mostra quantas vezes o VIIRS registra mais que o MODIS.</p>}
            </>
          ) : <p className="nota">Dados por sensor indisponíveis.</p>}
        </div>
      </div>
      {basemapFailed && (
        <div className="mapa-aviso" role="status">Mapa de fundo indisponível (sem conexão com OpenFreeMap). Os municípios continuam clicáveis.</div>
      )}
      {hover && hoverItem && (
        <div className="mapa-tooltip" style={{ left: hover.x, top: hover.y }}>
          <strong>{hoverItem.nome}</strong>
          {filters.mapMode === 'alerta'
            ? <div>Alerta: {hoverItem.alerta_ultimas_4_semanas.replace('_', ' ')}</div>
            : <div>{hoverValue === null || hoverValue === undefined ? 'sem valor calculável' : `${fmt1(hoverValue)}${activity?.kind === 'razao' ? '×' : ' por 1.000 km²'}`}</div>}
        </div>
      )}
    </div>
  );
}
