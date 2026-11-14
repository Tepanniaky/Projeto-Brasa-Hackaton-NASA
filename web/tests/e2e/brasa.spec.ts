import { expect, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { CSV_COLUMNS } from '../../src/domain/csv';

async function pickMunicipality(page: Page, name: string) {
  const box = page.getByTestId('busca-municipio');
  await box.fill(name);
  await page.getByRole('option', { name, exact: true }).click();
  await expect(page.getByTestId('nome-local')).toHaveText(name);
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();

const weekCells = (page: Page) => page.getByTestId('calendario-semanal').locator('rect.cal-celula');

test('abre na Bahia com calendário, período crítico e avisos obrigatórios', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('nome-local')).toHaveText('Bahia');
  await expect(page.getByTestId('avisos')).toContainText('NASA FIRMS');
  await expect(page.getByTestId('avisos')).toContainText('não um incêndio individual');
  await expect(page.getByTestId('avisos')).toContainText('Não é previsão de incêndio');
  await expect(page.getByTestId('numero-destaque')).toContainText('2026 está');
  await tab(page, 'Calendário');
  await expect(page).toHaveURL(/aba=cal/);
  await expect(page.getByTestId('calendario-semanal')).toContainText('Período crítico');
  await expect(weekCells(page)).toHaveCount(24 * 52); // 2003–2026
  // semanas futuras do ano corrente aparecem como "sem dado", não como zero
  expect(await page.locator('rect.cal-celula[data-estado="sem_dado"]').count()).toBeGreaterThan(0);
  await expect(page.getByTestId('mapa')).toBeVisible();
  await expect(page.getByTestId('status-dados')).toContainText('Dados reais');
});

test('região e período filtram calendário, sensores e CSV de forma consistente', async ({ page }) => {
  await page.goto('/');
  await pickMunicipality(page, 'Formosa do Rio Preto');
  await expect(page).toHaveURL(/local=2911105/);
  await page.getByTestId('ano-inicial').selectOption('2020');
  await page.getByTestId('ano-final').selectOption('2025');
  await tab(page, 'Calendário');
  await expect(weekCells(page)).toHaveCount(6 * 52);
  await tab(page, 'Sensores');
  for (const id of ['MODIS_AQUA', 'VIIRS_NOAA20']) {
    await expect(page.getByTestId(`calendario-mensal-${id}`).locator('rect.cal-celula')).toHaveCount(6 * 12);
  }
  await expect(page.getByTestId('explicacao-original')).toContainText('vezes mais');

  const download = page.waitForEvent('download');
  await page.getByTestId('exportar-csv').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('brasa_formosa-do-rio-preto_2020-2025_original.csv');
  const text = readFileSync(await file.path(), 'utf-8').replace(/^﻿/, '');
  const lines = text.trim().split('\r\n');
  expect(lines[0]).toBe(CSV_COLUMNS.join(','));
  const rows = lines.slice(1).map((l) => l.split(','));
  const col = (name: string) => CSV_COLUMNS.indexOf(name as (typeof CSV_COLUMNS)[number]);
  expect(rows.every((r) => r[col('regiao_cod')] === '2911105')).toBe(true);
  const years = new Set(rows.map((r) => Number(r[col('ano')])));
  expect([...years].every((y) => y >= 2020 && y <= 2025)).toBe(true);
  // camada A: 6 anos × 52 semanas; camada B: 72 meses × 2 sensores, em linhas separadas
  expect(rows.filter((r) => r[col('camada')] === 'A_equipe')).toHaveLength(6 * 52);
  const series = rows.filter((r) => r[col('camada')] === 'B_pipeline').map((r) => r[col('serie')]);
  expect(series.filter((s) => s === 'MODIS_AQUA_original')).toHaveLength(72);
  expect(series.filter((s) => s === 'VIIRS_NOAA20_original')).toHaveLength(72);
  expect(rows.every((r) => r[col('tipo_dado')] === 'real')).toBe(true);
});

test('casos da demo: Barra, Formosa do Rio Preto e Vitória da Conquista carregam sem erro', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?local=2902708');
  await expect(page.getByTestId('nome-local')).toHaveText('Barra');
  await expect(page.getByTestId('numero-destaque')).toContainText('3,8 vezes acima');
  await pickMunicipality(page, 'Formosa do Rio Preto');
  await pickMunicipality(page, 'Vitória da Conquista');
  await expect(page.getByTestId('grafico-anual')).toBeVisible();
  expect(errors).toEqual([]);
});

test('alternar para harmonizado mostra o que muda após o ajuste e a auditoria', async ({ page }) => {
  await page.goto('/?local=2911105&de=2020&ate=2025');
  await page.getByRole('button', { name: 'Harmonizado' }).click();
  await expect(page).toHaveURL(/visao=harmonizado/);
  await tab(page, 'Sensores');
  const box = page.getByTestId('o-que-muda');
  await expect(box).toContainText('Antes do ajuste');
  await expect(box).toContainText('Depois do ajuste');
  await expect(box).toContainText('Nos anos de avaliação');
  await expect(page.getByTestId('numeros-ajuste')).toContainText('MODIS/Aqua observado');
  await expect(page.getByTestId('auditoria')).toContainText('VIIRS convertido');
  // comparador dentro da seção: lado a lado com a mesma escala
  await page.getByTestId('comparador').getByRole('button', { name: 'Lado a lado' }).click();
  await expect(page).toHaveURL(/comparar=lado/);
  await expect(page.getByTestId('lado-a-lado').locator('svg')).toHaveCount(2);
  await expect(page.getByTestId('o-que-muda')).toContainText('Depois do ajuste');
  await page.getByTestId('comparador').getByRole('button', { name: 'Originais' }).click();
  await expect(page.getByTestId('explicacao-original')).toContainText('vezes mais');
});

test('clicar no mapa seleciona um município', async ({ page }) => {
  await page.goto('/');
  const map = page.getByTestId('mapa');
  await expect(map.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  const b = (await map.boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.55, b.y + b.height * 0.5);
  await expect(page.getByTestId('nome-local')).not.toHaveText('Bahia', { timeout: 20_000 });
  await expect(page).toHaveURL(/local=\d{7}/);
});

test('município sem nenhuma detecção mostra estado vazio explicativo', async ({ page }) => {
  await page.goto('/?local=2919926');
  await expect(page.getByTestId('sem-registros-equipe')).toContainText('não comprova que nunca houve fogo');
});

test('período fora da cobertura por sensor mostra indisponibilidade e atalho', async ({ page }) => {
  await page.goto('/?de=2003&ate=2010&aba=sens');
  await expect(page.getByText('O período escolhido não tem dados por sensor')).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar 2020–2025' }).click();
  await expect(page).toHaveURL(/de=2020&ate=2025/);
});

test('dados sintéticos exibem a faixa permanente de demonstração', async ({ page }) => {
  await page.route('**/data/real/manifest.json', async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    await route.fulfill({ response: res, json: { ...json, dataset_kind: 'synthetic' } });
  });
  await page.goto('/');
  await expect(page.getByTestId('faixa-sintetica')).toHaveText(/Dados de demonstração — sintéticos/);
  await page.evaluate(() => window.scrollTo(0, 3000));
  await expect(page.getByTestId('faixa-sintetica')).toBeInViewport();
});

test('camada por sensor indisponível não derruba o calendário', async ({ page }) => {
  await page.route('**/data/real/manifest.json', (route) => route.fulfill({ status: 404, body: 'not found' }));
  await page.goto('/');
  await expect(page.getByTestId('nome-local')).toHaveText('Bahia');
  await tab(page, 'Sensores');
  await expect(page.getByText('Dados por sensor indisponíveis')).toBeVisible();
  await tab(page, 'Calendário');
  await expect(weekCells(page)).toHaveCount(24 * 52);
});

test('restaurar filtros, arrastar a série anual e clicar num ano do calendário', async ({ page }) => {
  await page.goto('/?local=2911105&de=2020&ate=2025&visao=harmonizado&aba=cal');
  await expect(page.getByTestId('nome-local')).toHaveText('Formosa do Rio Preto');
  await page.getByTestId('restaurar-filtros').click();
  await expect(page.getByTestId('nome-local')).toHaveText('Bahia');
  await expect(page).toHaveURL(/\?aba=cal$/);
  await expect(page.getByText('Filtros restaurados.')).toBeVisible();
  // série anual sob o mapa como seletor de período
  const bars = page.getByTestId('grafico-anual');
  const b2010 = (await bars.locator('[data-ano="2010"]').boundingBox())!;
  const b2014 = (await bars.locator('[data-ano="2014"]').boundingBox())!;
  await page.mouse.move(b2010.x + b2010.width / 2, b2010.y + b2010.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2014.x + b2014.width / 2, b2014.y + b2014.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page).toHaveURL(/de=2010&ate=2014/);
  await expect(weekCells(page)).toHaveCount(5 * 52);
  // clicar no rótulo de um ano isola o ano; clicar de novo volta ao período completo
  await page.getByTestId('ano-2012').click();
  await expect(weekCells(page)).toHaveCount(52);
  await page.getByTestId('ano-2012').click();
  await expect(weekCells(page)).toHaveCount(24 * 52);
});

test('tema claro/escuro, modos novos do mapa e atalho para o método', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Mudar para o tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Média anual' }).click();
  await expect(page.getByTestId('legenda-mapa')).toContainText('Média anual 2003–2025 por 1.000 km²');
  await page.getByRole('button', { name: '2026 ÷ normal' }).click();
  await expect(page).toHaveURL(/mapa=razao/);
  await expect(page.getByTestId('legenda-mapa')).toContainText('sem base histórica');
  await page.getByRole('button', { name: 'Metodologia e fontes' }).click();
  await expect(page.getByTestId('metodologia')).toContainText('Limitações que mudam a leitura');
});

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('filtros abrem em gaveta e o conteúdo vem logo abaixo do mapa', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('nome-local')).toHaveText('Bahia');
    await expect(page.getByTestId('busca-municipio')).not.toBeVisible();
    await page.getByRole('button', { name: /Filtros$/ }).click();
    await expect(page.getByTestId('busca-municipio')).toBeVisible();
    await pickMunicipality(page, 'Barra');
    await expect(page.getByTestId('busca-municipio')).not.toBeVisible();
    await expect(page.getByTestId('numero-destaque')).toContainText('vezes acima');
  });
});
