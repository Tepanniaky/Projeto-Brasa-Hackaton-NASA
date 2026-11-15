import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { Harmonization, Manifest, TeamAudit } from '../../src/data/types';
import { buildRows } from '../../src/domain/csv';
import { criticalPeriodText, currentYearHeadline, rankText } from '../../src/domain/explain';
import { DEFAULT_FILTERS } from '../../src/domain/filters';
import { fmt1, fmtDayMonth, fmtHour, fmtInt, fmtIsoDate, fmtMonth, fmtPct } from '../../src/domain/format';
import { DATA_EN, dataText, flagText } from '../../src/i18n/dataText';
import { getLang, searchWithLang, setLang } from '../../src/i18n/lang';
import { dataset, teamCal } from './fixtures';

const pub = (p: string) => JSON.parse(readFileSync(new URL(`../../public/${p}`, import.meta.url), 'utf-8'));

afterEach(() => setLang('pt', false));

describe('idioma: formatação', () => {
  it('português é o padrão e usa vírgula decimal, dia/mês e "h"', () => {
    expect(getLang()).toBe('pt');
    expect(fmtInt(14409)).toBe('14.409');
    expect(fmt1(2.75)).toBe('2,8');
    expect(fmtDayMonth('16/07')).toBe('16/07');
    expect(fmtIsoDate('2026-11-13')).toBe('13/11/2026');
    expect(fmtHour(13.65)).toBe('13h39');
    expect(fmtMonth('2024-09')).toBe('set/2024');
  });
  it('inglês usa vírgula de milhar, ponto decimal, mês por extenso e 24 h', () => {
    setLang('en', false);
    expect(fmtInt(14409)).toBe('14,409');
    expect(fmt1(2.75)).toBe('2.8');
    expect(fmtPct(0.19)).toBe('19%');
    expect(fmtDayMonth('16/07')).toBe('Jul 16');
    expect(fmtIsoDate('2026-11-13')).toBe('Nov 13, 2026');
    expect(fmtHour(13.65)).toBe('13:39');
    expect(fmtMonth('2024-09')).toBe('Sep 2024');
  });
  it('lang=en vai para a URL e português não aparece nela', () => {
    expect(searchWithLang('?local=29&aba=cal', 'en')).toBe('?local=29&aba=cal&lang=en');
    expect(searchWithLang('?lang=en&aba=cal', 'pt')).toBe('?aba=cal');
    expect(searchWithLang('', 'pt')).toBe('');
  });
});

describe('idioma: frases calculadas', () => {
  it('ano corrente, período crítico e posição em inglês', () => {
    setLang('en', false);
    expect(currentYearHeadline(teamCal()).text).toContain('times above normal so far');
    const c = teamCal(); c.ano_atual.razao_vs_mediana = 0.81;
    expect(currentYearHeadline(c).text).toMatch(/19% below normal/);
    expect(criticalPeriodText(teamCal())).toMatch(/^Critical period: [A-Z][a-z]{2} \d+ to [A-Z][a-z]{2} \d+/);
    expect(rankText('11 de 24 (1 = menor)')).toBe('11 of 24 (1 = lowest)');
  });
  it('CSV mantém colunas e códigos, mas traduz unidade e observação', () => {
    setLang('en', false);
    const rows = buildRows(dataset, { ...DEFAULT_FILTERS, region: '2900001', yearFrom: 2025, yearTo: 2025 }, teamCal());
    const team = rows.find((r) => r.camada === 'A_equipe');
    expect(team).toMatchObject({ serie: 'harmonizada_equipe', unidade: 'MODIS-equivalent detections per week' });
    expect(String(team?.observacao)).toMatch(/VIIRS converted by the team|no data/);
  });
});

describe('idioma: textos que vêm dos dados publicados', () => {
  const manifest = pub('data/real/manifest.json') as Manifest;
  const harm = pub('data/real/harmonizacao.json') as Harmonization;
  const audit = pub('data/real/auditoria_equipe.json') as TeamAudit;

  it('todo texto livre exibido dos JSON tem tradução para o inglês', () => {
    const shown = [
      manifest.definicao_dia,
      String(manifest.atribuicao_municipio.predicado),
      ...manifest.sensores.map((s) => s.regra_qualidade),
      ...manifest.metricas.flatMap((m) => [m.rotulo, m.descricao]),
      ...manifest.indisponibilidades.flatMap((g) => [g.kind, g.note]),
      harm.unidade, harm.intervalo, harm.aviso,
      ...Object.values(harm.grades).flatMap((g) => g.avaliacao.metricas.map((m) => m.divisao)),
      audit.metodo,
      ...Object.values(audit.regioes).flatMap((r) => r.comparacao_anual.map((c) => c.origem_equipe)),
    ];
    const missing = [...new Set(shown)].filter((s) => !(s in DATA_EN));
    expect(missing).toEqual([]);
    setLang('en', false);
    expect(dataText(manifest.metricas[0].rotulo)).not.toBe(manifest.metricas[0].rotulo);
  });

  it('toda marcação automática da avaliação é remontada em inglês', () => {
    setLang('en', false);
    const flags = Object.values(harm.grades).flatMap((g) => g.avaliacao.marcacoes);
    expect(flags.length).toBeGreaterThan(0);
    for (const f of flags) {
      const en = flagText(f);
      expect(en).toMatch(/^In \d{4} \(/);
      expect(en).not.toMatch(/(?<!\p{L})(não|modelo|erro|valores)(?!\p{L})/u);
      // os números da mensagem original sobrevivem à tradução
      for (const n of f.mensagem.match(/\d+(\.\d+)?(?=[%×)\s])/g) ?? []) expect(en).toContain(n);
    }
  });
});
