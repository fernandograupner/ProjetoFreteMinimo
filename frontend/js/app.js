// ── CONFIG ────────────────────────────────────────────────────────────────────
const API = (typeof window !== 'undefined' && window.location.origin && window.location.protocol.startsWith('http'))
  ? `${window.location.origin}/api`
  : 'http://localhost:3001/api';

const GRADE_LIMIT = 150;

let charts = {};
let filtersData = {};
/** Drill dos donuts · query sitEmb/sitPag */
let chartOverlay = { sitEmb: null, sitPag: null };
let gradePage = 1;
/** Ordenação servidor da planilha: '' = ordem da base filtrada */
let gradeSort = { key: '', dir: 'asc' };
let destinoFilialRows = [];
let destinoSort = { key: 'qtd', dir: 'desc' };

const FILTER_KEYS = ['ano', 'mes', 'filial', 'contrato', 'tipoCte', 'cliente'];

if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

const fmt = {
  currency: v => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  pct: v => v == null ? '—' : Number(v).toFixed(1) + '%',
  num: v => v == null ? '—' : Number(v).toLocaleString('pt-BR'),
  diff: v => {
    if (v == null) return '—';
    const n = Number(v);
    const sign = n >= 0 ? '+' : '';
    return sign + 'R$ ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j && j.error) msg = j.error;
    } catch (_) { /* ignorar parse */ }
    throw new Error(msg);
  }
  return res.json();
}

function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function optionsBox(key) {
  return document.querySelector(`.filter-dd-options[data-options="${key}"]`);
}

function dropdownWrap(key) {
  return document.querySelector(`.filter-dropdown[data-filter="${key}"]`);
}

function getSelectedFilterValues(key) {
  const box = optionsBox(key);
  if (!box) return [];
  return [...box.querySelectorAll('input[type="checkbox"]:checked')]
    .map(i => i.value)
    .filter(Boolean);
}

function updateFilterSummary(key) {
  const vals = getSelectedFilterValues(key);
  const el = dropdownWrap(key)?.querySelector('.filter-dd-summary');
  if (!el) return;
  el.classList.toggle('has-selection', vals.length > 0);
  if (vals.length === 0) {
    el.textContent = 'Todos';
    return;
  }
  if (key === 'cliente' && vals.length === 1) {
    const box = optionsBox(key);
    const cb = box && [...box.querySelectorAll('input[type="checkbox"]')].find(i => i.value === vals[0]);
    const txt = cb?.closest('label')?.querySelector('.filter-dd-opt-txt');
    el.textContent = txt ? txt.textContent.trim() : vals[0].substring(0, 14) + '…';
    return;
  }
  const short = vals.slice(0, 2).join(', ');
  el.textContent = vals.length <= 2 ? short : `${short} +${vals.length - 2}`;
}

function setFilterValues(key, values) {
  const want = new Set((Array.isArray(values) ? values : [values]).map(String));
  const box = optionsBox(key);
  if (!box) return;
  box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = want.has(cb.value);
  });
  updateFilterSummary(key);
  document.querySelectorAll('.filter-dropdown.open').forEach(w => w.classList.remove('open'));
}

function clearAllFilterChecks() {
  FILTER_KEYS.forEach(k => {
    const box = optionsBox(k);
    if (!box) return;
    box.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    updateFilterSummary(k);
  });
}

function findClienteKeyByNome(nome) {
  const box = optionsBox('cliente');
  if (!box || !nome) return null;
  const labels = box.querySelectorAll('label.filter-dd-opt');
  for (const lab of labels) {
    const t = lab.querySelector('.filter-dd-opt-txt');
    if (t && t.textContent.trim() === String(nome).trim()) {
      return lab.querySelector('input')?.value || null;
    }
  }
  return null;
}

function wireFilterDropdowns() {
  document.querySelectorAll('.filter-dropdown').forEach(wrap => {
    const toggle = wrap.querySelector('.filter-dd-toggle');
    const panel = wrap.querySelector('.filter-dd-panel');
    toggle?.addEventListener('click', e => {
      e.stopPropagation();
      const wasOpen = wrap.classList.contains('open');
      document.querySelectorAll('.filter-dropdown.open').forEach(w => w.classList.remove('open'));
      if (!wasOpen) wrap.classList.add('open');
    });
    panel?.addEventListener('click', e => e.stopPropagation());
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.filter-dropdown.open').forEach(w => w.classList.remove('open'));
  });

  document.querySelector('.filters-bar')?.addEventListener('click', e => {
    const mini = e.target.closest('.filter-dd-mini[data-action]');
    if (!mini) return;
    const wrap = mini.closest('.filter-dropdown');
    const key = wrap?.dataset.filter;
    const panel = mini.closest('.filter-dd-panel');
    if (!key || !panel) return;
    panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = mini.dataset.action === 'all';
    });
    updateFilterSummary(key);
    chartOverlay.sitEmb = null;
    chartOverlay.sitPag = null;
    gradePage = 1;
    refreshDonutDrillChip();
    scheduleReload();
  });

  document.querySelector('.filters-bar')?.addEventListener('change', e => {
    if (!e.target.matches('.filter-dd-options input[type="checkbox"]')) return;
    const key = e.target.closest('.filter-dropdown')?.dataset.filter;
    if (key) updateFilterSummary(key);
    chartOverlay.sitEmb = null;
    chartOverlay.sitPag = null;
    gradePage = 1;
    refreshDonutDrillChip();
    scheduleReload();
  });
}

function refreshDonutDrillChip() {
  const btn = document.getElementById('btn-clear-chart-filter');
  if (!btn) return;
  const has = !!(chartOverlay.sitEmb || chartOverlay.sitPag);
  btn.hidden = !has;
}

function drillAfterChange() {
  gradePage = 1;
  refreshDonutDrillChip();
  scheduleReload();
}

function clearDonutDrill() {
  chartOverlay.sitEmb = null;
  chartOverlay.sitPag = null;
  refreshDonutDrillChip();
  scheduleReload();
}

let _reloadT = null;
function scheduleReload() {
  clearTimeout(_reloadT);
  _reloadT = setTimeout(() => loadAll(), 380);
}

function buildQuery(extraParams) {
  const p = new URLSearchParams();
  FILTER_KEYS.forEach(k => {
    const vals = getSelectedFilterValues(k);
    if (vals.length) p.set(k, vals.join(','));
  });
  if (chartOverlay.sitEmb) p.set('sitEmb', chartOverlay.sitEmb);
  if (chartOverlay.sitPag) p.set('sitPag', chartOverlay.sitPag);
  if (extraParams && typeof extraParams === 'object') {
    Object.entries(extraParams).forEach(([kk, vv]) => {
      if (vv != null && vv !== '') p.set(kk, String(vv));
    });
  }
  const s = p.toString();
  return s ? '?' + s : '';
}

function getContratoTag(c) {
  const tags = { Frota: 'tag-purple', Agregado: 'tag-cyan', Terceiro: 'tag-yellow' };
  return `<span class="tag ${tags[c] || 'tag-blue'}">${escHtml(c)}</span>`;
}

function farolDot(kind) {
  if (kind === 'abaixo') return '<span class="farol-dot dot-red" title="Abaixo do piso"></span>';
  return '<span class="farol-dot dot-green" title="Dentro do piso (≥ mínimo ANTT)"></span>';
}

function getSituacaoTag(s) {
  if (s === 'abaixo') return '<span class="tag tag-red">Abaixo</span>';
  return '<span class="tag tag-green">Dentro do piso</span>';
}

function fmtMargemPctCell(v) {
  if (v == null || v === '') {
    return '<span style="color:var(--text-muted)" class="mono">—</span>';
  }
  return `<span class="mono">${Number(v).toFixed(1)}%</span>`;
}

function textoRegistroJson(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function renderDlRegistroCompleto(reg) {
  const keys = Object.keys(reg).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return `<dl class="detail-grid">${keys.map(k =>
    `<dt>${escHtml(k)}</dt><dd>${escHtml(textoRegistroJson(reg[k]))}</dd>`
  ).join('')}</dl>`;
}

function closeModalViagem() {
  const modal = document.getElementById('modal-viagem');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
}

async function openModalViagemPorBipe(bipeCrudo) {
  const bipe = String(bipeCrudo).trim();
  const modal = document.getElementById('modal-viagem');
  const bodyEl = document.getElementById('modal-viagem-body');
  const sub = document.getElementById('modal-viagem-bipe');
  if (!modal || !bodyEl || !bipe) return;
  modal.hidden = false;
  modal.removeAttribute('aria-hidden');
  if (sub) sub.textContent = `BIPE ${bipe} · todos os campos da base`;
  bodyEl.innerHTML = '<div class="empty-state"><p>Carregando…</p></div>';
  try {
    const q = buildQuery();
    const url = `${API}/frete/viagem/${encodeURIComponent(bipe)}${q}`;
    const { registro } = await fetchJSON(url);
    bodyEl.innerHTML = renderDlRegistroCompleto(registro);
  } catch (err) {
    console.error(err);
    bodyEl.innerHTML = `<div class="empty-state"><p>${escHtml(String(err.message || err))}</p></div>`;
  }
}

function wireModalViagemLinhas() {
  document.body.addEventListener('click', e => {
    if (e.target.closest('[data-close-modal]')) {
      closeModalViagem();
      return;
    }
    const tr = e.target.closest('tbody.tbody-click-bipe tr[data-bipe]');
    if (!tr) return;
    if (e.target.closest('button,a,input')) return;
    openModalViagemPorBipe(tr.getAttribute('data-bipe'));
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('modal-viagem');
    if (modal && !modal.hidden) closeModalViagem();
  });
}

// ── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    filtersData = await fetchJSON(`${API}/frete/filters`);
    populateFilters(filtersData);
    wireFilterDropdowns();
    wireModalViagemLinhas();
    wireGradeSortHeaders();
    wireDestinoFilialSort();
    updateGradeSortHeaders();
    FILTER_KEYS.forEach(updateFilterSummary);
    await loadAll();
    document.getElementById('loading').classList.add('hidden');
    refreshDonutDrillChip();
    document.getElementById('btn-clear-chart-filter')?.addEventListener('click', clearDonutDrill);
    document.getElementById('grade-prev')?.addEventListener('click', () => {
      if (gradePage > 1) { gradePage--; loadGrade(); }
    });
    document.getElementById('grade-next')?.addEventListener('click', async () => {
      gradePage++;
      await loadGrade();
    });
  } catch (e) {
    console.error(e);
    document.getElementById('loading').innerHTML = `
      <div style="text-align:center;color:#ef4444;max-width:420px;margin:0 auto;padding:16px;">
        <div style="font-size:32px">⚠️</div>
        <p style="margin-top:12px;font-size:13px">Não foi possível carregar os dados.<br>
        Confira o terminal (<code style="background:#1a2540;padding:2px 8px;border-radius:4px">npm start</code> na pasta backend).<br><br>
        <span style="color:var(--text-muted,#8892a4);font-family:monospace;font-size:11px">${String(e.message || e)}</span></p>
      </div>`;
  }
}

function filterCheckboxRow(value, labelText) {
  return `<label class="filter-dd-opt"><input type="checkbox" value="${escAttr(value)}"><span class="filter-dd-opt-txt">${escHtml(labelText)}</span></label>`;
}

function populateFilters(data) {
  optionsBox('ano').innerHTML = data.anos.map(i => filterCheckboxRow(String(i), String(i))).join('');
  optionsBox('mes').innerHTML = data.meses.map(i => filterCheckboxRow(String(i), String(i))).join('');
  optionsBox('filial').innerHTML = data.filiais.map(i =>
    filterCheckboxRow(String(i.sigla), `${i.sigla} — ${i.nome}`)
  ).join('');
  optionsBox('contrato').innerHTML = data.contratos.map(i => filterCheckboxRow(String(i), String(i))).join('');
  optionsBox('tipoCte').innerHTML = data.tiposCte.map(i => filterCheckboxRow(String(i), String(i))).join('');
  optionsBox('cliente').innerHTML = data.clientes.map(c =>
    filterCheckboxRow(String(c.key), c.nome)
  ).join('');
}

async function loadAll() {
  await loadGradeIfActive();
  const q = buildQuery();
  const tab = document.querySelector('.tab-btn.active')?.dataset.tab || 'overview';
  await loadOverview(q);
  if (tab === 'embarque') await loadEmbarque(q);
  if (tab === 'pagamento') await loadPagamento(q);
  if (tab === 'filiais') await loadFiliais(q);
  if (tab === 'destinos') await loadDestinoFilial(q);
}

async function loadGradeIfActive() {
  const tab = document.querySelector('.tab-btn.active')?.dataset.tab || 'overview';
  if (tab === 'planilha') await loadGrade();
}

function updateGradeSortHeaders() {
  document.querySelectorAll('#thead-grade th[data-sort]').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (gradeSort.key === th.dataset.sort) {
      th.classList.add(gradeSort.dir === 'desc' ? 'sorted-desc' : 'sorted-asc');
    }
  });
}

function wireGradeSortHeaders() {
  document.getElementById('thead-grade')?.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    e.preventDefault();
    const key = th.dataset.sort;
    if (!key) return;
    if (gradeSort.key === key) {
      gradeSort.dir = gradeSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      gradeSort.key = key;
      gradeSort.dir = 'asc';
    }
    gradePage = 1;
    loadGrade();
  });
}

function campoDestFilialValor(r, campo) {
  switch (campo) {
    case 'siglaFilial':
      return String(r.siglaFilial || '');
    case 'destino':
      return String(r.destino || '').toLowerCase();
    case 'qtd':
      return Number(r.qtd) || 0;
    case 'embAb':
      return Number(r.embAb) || 0;
    case 'embDentro':
      return Number(r.embDentro) || 0;
    case 'pagAb':
      return Number(r.pagAb) || 0;
    case 'pagDentro':
      return Number(r.pagDentro) || 0;
    case 'percPagAbaixo':
      return Number(r.percPagAbaixo) || 0;
    case 'margemPagoPct':
      return r.margemPagoPct == null ? null : Number(r.margemPagoPct);
    default:
      return 0;
  }
}

function ordenarDestFilial(rows) {
  const key = destinoSort.key;
  const mul = destinoSort.dir === 'desc' ? -1 : 1;
  const copia = [...rows];
  copia.sort((a, b) => {
    const va = campoDestFilialValor(a, key);
    const vb = campoDestFilialValor(b, key);
    const inv = x => x === null || x === undefined || (typeof x === 'number' && Number.isNaN(x));
    if (inv(va) && inv(vb)) {
      return String(a.siglaFilial).localeCompare(String(b.siglaFilial), 'pt-BR')
        || String(a.destino).localeCompare(String(b.destino), 'pt-BR');
    }
    if (inv(va)) return 1;
    if (inv(vb)) return -1;
    let cmp = 0;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' });
    if (cmp !== 0) return cmp * mul;
    return String(a.destino).localeCompare(String(b.destino), 'pt-BR');
  });
  return copia;
}

function atualizarCabecDestinosOrdem() {
  document.querySelectorAll('#thead-destinos th[data-dsort]').forEach(th => {
    th.classList.remove('sorted-d-asc', 'sorted-d-desc');
    if (destinoSort.key === th.dataset.dsort) {
      th.classList.add(destinoSort.dir === 'desc' ? 'sorted-d-desc' : 'sorted-d-asc');
    }
  });
}

function renderizarTabelaDestinoFilial() {
  const tbody = document.getElementById('tbody-destinos');
  if (!tbody) return;
  atualizarCabecDestinosOrdem();
  const rows = ordenarDestFilial(destinoFilialRows);
  tbody.innerHTML = rows.length
    ? rows.map(r => `
        <tr>
          <td>
            <span class="tag tag-blue mono">${escHtml(r.siglaFilial)}</span>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${escHtml(r.nomeFilial)}</div>
          </td>
          <td style="max-width:16rem">${escHtml(r.destino)}</td>
          <td class="mono num">${fmt.num(r.qtd)}</td>
          <td class="mono num" style="color:var(--red)">${fmt.num(r.embAb)}</td>
          <td class="mono num" style="color:var(--green)">${fmt.num(r.embDentro)}</td>
          <td class="mono num" style="color:var(--red)">${fmt.num(r.pagAb)}</td>
          <td class="mono num" style="color:var(--green)">${fmt.num(r.pagDentro)}</td>
          <td class="mono num">${fmt.pct(r.percPagAbaixo)}</td>
          <td class="mono num">${r.margemPagoPct == null ? '—' : `${Number(r.margemPagoPct).toFixed(1)}%`}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="9"><div class="empty-state"><p>Nenhum registro nos filtros atuais.</p></div></td></tr>';
}

async function loadDestinoFilial(qIn) {
  const q = qIn || buildQuery();
  const tbody = document.getElementById('tbody-destinos');
  const cnt = document.getElementById('count-destino-filial');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><p>Carregando…</p></div></td></tr>';
  try {
    destinoFilialRows = await fetchJSON(`${API}/frete/por-destino-filial${q}`);
    if (cnt) cnt.textContent = `${fmt.num(destinoFilialRows.length)} grupo(s)`;
    renderizarTabelaDestinoFilial();
  } catch (e) {
    console.error(e);
    destinoFilialRows = [];
    if (cnt) cnt.textContent = '—';
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><p>${escHtml(String(e.message))}</p></div></td></tr>`;
  }
}

function wireDestinoFilialSort() {
  document.getElementById('thead-destinos')?.addEventListener('click', e => {
    const th = e.target.closest('th[data-dsort]');
    if (!th) return;
    const col = th.dataset.dsort;
    if (!col) return;
    if (destinoSort.key === col) {
      destinoSort.dir = destinoSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      destinoSort.key = col;
      destinoSort.dir = col === 'siglaFilial' || col === 'destino' ? 'asc' : 'desc';
    }
    renderizarTabelaDestinoFilial();
  });
}

async function loadGrade(pageOverride) {
  if (pageOverride != null) gradePage = pageOverride;
  const extra = { page: gradePage, limit: GRADE_LIMIT };
  if (gradeSort.key) {
    extra.sortBy = gradeSort.key;
    extra.sortDir = gradeSort.dir;
  }
  const q = buildQuery(extra);
  const tbody = document.getElementById('tbody-grade');
  const meta = document.getElementById('grade-meta');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="16"><div class="empty-state"><p>Carregando…</p></div></td></tr>';
  try {
    const resp = await fetchJSON(`${API}/frete/grade${q}`);
    gradePage = resp.page;
    updateGradeSortHeaders();
    const from = resp.total === 0 ? 0 : (resp.page - 1) * resp.limit + 1;
    const to = Math.min(resp.page * resp.limit, resp.total);
    if (meta) {
      meta.textContent = `${fmt.num(resp.total)} viagens · ${from}–${to} · pág. ${resp.page}/${resp.paginasTotal}`;
    }
    document.getElementById('grade-page-lbl').textContent = `Página ${resp.page} de ${resp.paginasTotal}`;
    document.getElementById('grade-prev').disabled = resp.page <= 1;
    document.getElementById('grade-next').disabled = resp.page >= resp.paginasTotal;

    tbody.innerHTML = resp.linhas.length
      ? resp.linhas.map(r => `
          <tr data-bipe="${escAttr(String(r.bipe))}">
            <td class="mono cell-nowrap-mono">${escHtml(r.bipe)}</td>
            <td class="mono">${escHtml(r.ano)}</td>
            <td>${escHtml(r.mes)}</td>
            <td><span class="tag tag-blue mono">${escHtml(r.siglaFilial)}</span></td>
            <td>${escHtml(r.cliente)}</td>
            <td class="cell-destino">${escHtml(r.destino)}</td>
            <td>${getContratoTag(r.contrato)}</td>
            <td class="mono cell-nowrap-mono">${fmt.currency(r.pisoMinimo)}</td>
            <td class="mono cell-nowrap-mono">${fmt.currency(r.fretePeso)}</td>
            <td>${farolDot(r.faixaFretePeso)}</td>
            <td class="mono cell-nowrap-mono">${fmt.currency(r.fretePago)}</td>
            <td class="mono cell-nowrap-mono">${fmt.diff(r.diferencaAntt)}</td>
            <td>${farolDot(r.faixaFretePago)}</td>
            <td class="mono td-margem cell-nowrap-mono">${r.margemPagoPct == null ? '—' : `${Number(r.margemPagoPct).toFixed(1)}%`}</td>
            <td class="mono td-margem cell-nowrap-mono">${r.margemMinPisoPct == null ? '—' : `${Number(r.margemMinPisoPct).toFixed(1)}%`}</td>
            <td class="mono" style="font-size:11px">${escHtml(r.placa)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="16"><div class="empty-state"><p>Nenhuma viagem nos filtros atuais.</p></div></td></tr>';
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="16"><div class="empty-state"><p>${escHtml(String(e.message))}</p></div></td></tr>`;
  }
}

// ── OVERVIEW ──────────────────────────────────────────────────────────────────
async function loadOverview(q) {
  const [
    kpis,
    tendencia,
    farol,
    desvios,
    dadosEmbCli,
    dadosPagCli,
    dadosFilial
  ] = await Promise.all([
    fetchJSON(`${API}/frete/kpis${q}`),
    fetchJSON(`${API}/frete/tendencia-mensal${q}`),
    fetchJSON(`${API}/frete/farol-contrato${q}`),
    fetchJSON(`${API}/frete/top-desvios${q ? `${q}&` : '?'}limite=20`),
    fetchJSON(`${API}/frete/viagens-embarcador${q}`),
    fetchJSON(`${API}/frete/viagens-pagamento-ag-ter${q}`),
    fetchJSON(`${API}/frete/por-filial${q}`)
  ]);

  document.getElementById('kpi-registros').textContent = fmt.num(kpis.totalRegistros);

  const emb = kpis.embarcador;
  document.getElementById('kpi-emb-ab').textContent = fmt.num(emb.abaixo);
  document.getElementById('kpi-emb-ab-p').textContent = fmt.pct(emb.percAbaixo);
  document.getElementById('kpi-emb-dentro').textContent = fmt.num(emb.dentro);
  document.getElementById('kpi-emb-dentro-p').textContent = fmt.pct(emb.percDentro);

  document.getElementById('kpi-pag-total').textContent = fmt.num(kpis.totalPagamentoAgTer);
  const pag = kpis.pagamentoAgTer;
  document.getElementById('kpi-pag-ab').textContent = fmt.num(pag.abaixo);
  document.getElementById('kpi-pag-ab-p').textContent = kpis.totalPagamentoAgTer ? fmt.pct(pag.percAbaixo) : '—';
  document.getElementById('kpi-pag-dentro').textContent = kpis.totalPagamentoAgTer ? fmt.num(pag.dentro) : '—';
  document.getElementById('kpi-pag-dentro-p').textContent = kpis.totalPagamentoAgTer ? fmt.pct(pag.percDentro) : '—';

  renderFarolOverview(farol);
  renderTendenciaLinha('chart-tendencia-emb', tendencia,
    ['pctEmbAb', 'pctEmbDentro'],
    ['% Abaixo', '% Dentro'],
    ['#ef4444', '#10b981'],
    'tendEmb');
  renderTendenciaLinha('chart-tendencia-pag', tendencia,
    ['pctPagAb', 'pctPagDentro'],
    ['% Abaixo BIPE', '% Dentro'],
    ['#ef4444', '#10b981'],
    'tendPag');
  renderTripDonut('chart-status-emb', emb.abaixo, emb.dentro, 'donutEmb', 'sitEmb');
  renderTripDonut('chart-status-pag', pag.abaixo, pag.dentro, 'donutPag', 'sitPag');
  renderFarolMixChart(farol);
  renderStackedPctChart('chart-viagens-embarcador', dadosEmbCli.slice(0, 15), 'stackEmb');
  renderStackedPctChart('chart-viagens-pagamento', dadosPagCli.slice(0, 15), 'stackPag');
  renderFiliaisChart(dadosFilial);
  renderDesvios(desvios);
}

function renderFarolOverview(data) {
  data.forEach(item => {
    const id = item.contrato.toLowerCase();
    const card = document.getElementById(`farol-${id}`);
    if (!card) return;

    const ok = Number(item.percSemRisco) || 0;
    card.querySelector('.farol-perc').textContent = fmt.pct(item.percSemRisco);
    card.querySelector('.farol-perc').className = `farol-perc ${item.farol}`;
    card.querySelector('.semaforo').className = `semaforo ${item.farol}`;
    card.querySelector('.progress-bar-fill').style.width = `${Math.min(ok, 100)}%`;
    card.querySelector('.progress-bar-fill').className = `progress-bar-fill ${item.farol}`;
    card.querySelector('.farol-total').textContent = `${fmt.num(item.total)} viagens`;

    card.querySelector('.farol-n-abaixo').textContent = fmt.num(item.abaixo);
    card.querySelector('.farol-n-dentro').textContent = fmt.num(item.dentro);
    card.querySelector('.farol-n-pcta').textContent = fmt.pct(item.percAbaixo);
  });
}

function renderTendenciaLinha(canvasId, series, keys, labels, colors, chartKey) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  if (charts[chartKey]) charts[chartKey].destroy();

  charts[chartKey] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.map(d => d.periodo),
      datasets: keys.map((k, i) => ({
        label: labels[i],
        data: series.map(d => Number(d[k]) || 0),
        borderColor: colors[i],
        backgroundColor: 'transparent',
        tension: 0.35,
        fill: false,
        pointRadius: 3,
        borderWidth: 2
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8892a4', font: { size: 11 }, boxWidth: 12 } },
        datalabels: {
          align: 'top',
          offset: 2,
          clip: false,
          color: '#dbe4f7',
          textStrokeWidth: 2,
          textStrokeColor: 'rgba(0,0,0,0.45)',
          font: { size: 8, weight: '600' },
          formatter: v => {
            const n = Number(v);
            return n >= 6 ? `${n.toFixed(0)}%` : '';
          }
        },
        tooltip: {
          callbacks: {
            label: c => ` ${c.dataset.label}: ${Number(c.raw).toFixed(1)}%`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8892a4', font: { size: 10 } },
          title: { display: true, text: 'Clique num ponto para filtrar período', color: '#576077', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8892a4', font: { size: 10 }, callback: v => `${v}%` },
          suggestedMin: 0,
          suggestedMax: 100
        }
      },
      onClick(ev, elems) {
        if (!elems.length) return;
        const i = elems[0].index;
        const row = series[i];
        if (!row || row.ano == null || row.mes == null) return;
        setFilterValues('ano', [String(row.ano)]);
        setFilterValues('mes', [row.mes]);
        chartOverlay.sitEmb = null;
        chartOverlay.sitPag = null;
        gradePage = 1;
        refreshDonutDrillChip();
        scheduleReload();
      }
    }
  });
}

function renderTripDonut(canvasId, abaixo, dentro, chartKey, overlayKey) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  if (charts[chartKey]) charts[chartKey].destroy();

  const total = abaixo + dentro;

  charts[chartKey] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Abaixo do piso', 'Dentro do piso'],
      datasets: [{
        data: [abaixo, dentro],
        backgroundColor: ['#ef4444', '#10b981'],
        borderColor: 'transparent',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#8892a4', font: { size: 11 }, boxWidth: 12 }
        },
        subtitle: {
          display: true,
          text: overlayKey === 'sitEmb'
            ? 'Clique para filtrar faixa vs frete peso'
            : 'Clique para filtrar faixa BIPE × piso (só contratos Agregado/Terceiro)',
          color: '#576077',
          font: { size: 9 }
        },
        datalabels: {
          color: '#fff',
          font: { size: 11, weight: '700' },
          textStrokeWidth: 2,
          textStrokeColor: 'rgba(0,0,0,0.4)',
          formatter: (v, ctx) => {
            const sum = ctx.dataset.data.reduce((a, b) => a + Number(b), 0);
            const n = Number(v);
            return sum && n > 0 ? `${Math.round(n / sum * 100)}%` : '';
          }
        },
        tooltip: {
          callbacks: {
            label: c => ` ${c.label}: ${fmt.num(c.raw)} (${total ? (100 * c.raw / total).toFixed(1) : 0}%)`
          }
        }
      },
      onClick(ev, elems) {
        if (!elems.length) return;
        const ix = elems[0].index;
        const map = ['abaixo', 'dentro'];
        const val = map[ix];
        chartOverlay.sitEmb = overlayKey === 'sitEmb' ? val : chartOverlay.sitEmb;
        chartOverlay.sitPag = overlayKey === 'sitPag' ? val : chartOverlay.sitPag;
        drillAfterChange();
      }
    }
  });
}

function renderFarolMixChart(farolData) {
  const ctx = document.getElementById('chart-farol-mix')?.getContext('2d');
  if (!ctx) return;
  if (charts.farolMix) charts.farolMix.destroy();

  const labels = farolData.map(d => d.contrato);
  charts.farolMix = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Abaixo', data: farolData.map(d => d.abaixo), backgroundColor: 'rgba(239,68,68,0.85)' },
        { label: 'Dentro piso', data: farolData.map(d => d.dentro), backgroundColor: 'rgba(16,185,129,0.85)' }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8892a4', font: { size: 11 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            footer: items => {
              const i = items[0]?.dataIndex;
              if (i == null) return '';
              const d = farolData[i];
              return ` Total: ${d.total} viagens`;
            }
          }
        },
        subtitle: {
          display: true,
          text: 'Clique na barra (contrato) para filtrar',
          color: '#576077',
          font: { size: 10 },
          padding: { bottom: 4 }
        },
        datalabels: {
          color: '#ffffff',
          font: { size: 9, weight: '700' },
          textStrokeWidth: 1,
          textStrokeColor: 'rgba(0,0,0,0.55)',
          formatter: v => {
            const n = Math.round(Number(v));
            return n > 0 ? String(n) : '';
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8892a4' } },
        y: { stacked: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8892a4' } }
      },
      onClick(ev, elems) {
        if (!elems.length) return;
        const di = elems[0].index;
        const contrato = labels[di];
        if (!contrato) return;
        setFilterValues('contrato', [contrato]);
        chartOverlay.sitEmb = null;
        chartOverlay.sitPag = null;
        gradePage = 1;
        refreshDonutDrillChip();
        scheduleReload();
      }
    }
  });
}

function renderDesvios(data) {
  const tbody = document.getElementById('tbody-desvios');
  if (!tbody) return;

  tbody.innerHTML = data.map(r => `
    <tr data-bipe="${escAttr(String(r.bipe))}">
      <td class="mono" style="color:var(--text-secondary)">${escHtml(r.bipe)}</td>
      <td><strong>${escHtml(r.filial)}</strong></td>
      <td>${escHtml(r.cliente)}</td>
      <td>${getContratoTag(r.contrato)}</td>
      <td style="color:var(--text-secondary);font-size:12px">${escHtml(String(r.destino || ''))}</td>
      <td class="mono">${fmt.currency(r.freteAntt)}</td>
      <td class="mono">${fmt.currency(r.valorComparado)}</td>
      <td class="${Number(r.diferenca) >= 0 ? 'num-positive' : 'num-negative'}">${fmt.diff(r.diferenca)}</td>
      <td>${getSituacaoTag(r.situacao)}</td>
    </tr>
  `).join('');
}

// ── EMBARCADOR / PAGAMENTO — tabelas e barras ─────────────────────────────────
async function loadEmbarque(q) {
  const data = await fetchJSON(`${API}/frete/viagens-embarcador${q}`);
  renderViagensTable(document.getElementById('tbody-viagens-embarcador'), data);
  document.getElementById('count-embarcador').textContent = `${data.length} embarcadores`;
}

async function loadPagamento(q) {
  const data = await fetchJSON(`${API}/frete/viagens-pagamento-ag-ter${q}`);
  renderViagensTable(document.getElementById('tbody-viagens-pagamento'), data);
  document.getElementById('count-pagamento').textContent = `${data.length} clientes com Ag/Ter`;
}

function renderViagensTable(tbody, rows) {
  if (!tbody) return;

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${escHtml(r.cliente)}</strong><br><span class="mono" style="font-size:10px;color:var(--text-muted)">${escHtml(r.cnpjTruncado)}</span></td>
      <td class="mono">${fmt.num(r.qtd)}</td>
      <td class="mono" style="color:var(--red)">${fmt.num(r.abaixo)}</td>
      <td class="mono" style="color:var(--green)">${fmt.num(r.dentro)}</td>
      <td class="mono">${fmt.pct(r.percAbaixo)}</td>
      <td class="mono">${fmt.pct(r.percDentro)}</td>
    </tr>
  `).join('');
}

function renderStackedPctChart(canvasId, sliceData, chartKey) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  if (charts[chartKey]) charts[chartKey].destroy();
  if (!sliceData.length) {
    charts[chartKey] = null;
    return;
  }

  charts[chartKey] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sliceData.map(d => d.cliente),
      datasets: [
        {
          label: '% Abaixo',
          data: sliceData.map(d => Number(d.percAbaixo) || 0),
          backgroundColor: 'rgba(239,68,68,0.9)'
        },
        {
          label: '% Dentro',
          data: sliceData.map(d => Number(d.percDentro) || 0),
          backgroundColor: 'rgba(16,185,129,0.9)'
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8892a4', font: { size: 11 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: c => ` ${c.dataset.label}: ${Number(c.raw).toFixed(1)}% (${fmt.num(sliceData[c.dataIndex].qtd)} viagens)`
          }
        },
        subtitle: {
          display: true,
          text: 'Clique numa faixa/barra horizontal para filtrar cliente',
          color: '#576077',
          font: { size: 10 }
        },
        datalabels: {
          color: '#ffffff',
          font: { size: 8, weight: '700' },
          textStrokeWidth: 1,
          textStrokeColor: 'rgba(0,0,0,0.5)',
          formatter: v => {
            const n = Number(v);
            return n >= 10 ? `${Math.round(n)}%` : '';
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          max: 100,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8892a4', callback: v => `${v}%` }
        },
        y: {
          stacked: true,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8892a4', font: { size: 10 }, autoSkip: false }
        }
      },
      onClick(ev, elems) {
        if (!elems.length) return;
        const clienteNome = sliceData[elems[0].index]?.cliente;
        if (!clienteNome) return;
        const key = findClienteKeyByNome(clienteNome);
        if (key) setFilterValues('cliente', [key]);
        chartOverlay.sitEmb = null;
        chartOverlay.sitPag = null;
        gradePage = 1;
        refreshDonutDrillChip();
        scheduleReload();
      }
    }
  });
}

// ── FILIAIS ────────────────────────────────────────────────────────────────────
async function loadFiliais(q) {
  const data = await fetchJSON(`${API}/frete/por-filial${q}`);
  const tbody = document.getElementById('tbody-filiais');
  if (tbody) {
    tbody.innerHTML = data.map(r => `
      <tr>
        <td><span class="tag tag-blue mono">${escHtml(r.sigla)}</span></td>
        <td><strong>${escHtml(r.nome)}</strong></td>
        <td class="mono">${fmt.num(r.qtd)}</td>
        <td class="mono" style="color:var(--red)">${fmt.num(r.abaixo)}</td>
        <td class="mono" style="color:var(--green)">${fmt.num(r.dentro)}</td>
        <td class="mono">${fmt.pct(r.percAbaixo)}</td>
        <td class="mono">${fmt.pct(r.percDentro)}</td>
      </tr>
    `).join('');
  }
}

function renderFiliaisChart(data) {
  const ctx = document.getElementById('chart-filiais')?.getContext('2d');
  if (!ctx) return;
  if (charts.filiais) charts.filiais.destroy();
  if (!data.length) return;

  const sorted = [...data].sort((a, b) => Number(b.percAbaixo) - Number(a.percAbaixo)).slice(0, 22);

  charts.filiais = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(d => `${d.sigla} — ${d.nome}`),
      datasets: [{
        label: '% viagens abaixo do piso',
        data: sorted.map(d => Number(d.percAbaixo) || 0),
        backgroundColor: sorted.map(d => {
          const p = Number(d.percAbaixo) || 0;
          return p >= 40 ? 'rgba(239,68,68,0.85)' : p >= 20 ? 'rgba(245,158,11,0.85)' : 'rgba(148,163,184,0.6)';
        })
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => ` ${Number(c.raw).toFixed(1)}% (${fmt.num(sorted[c.dataIndex].qtd)} viagens)`
          }
        },
        subtitle: {
          display: true,
          text: 'Clique para filtrar filial',
          color: '#576077',
          font: { size: 10 }
        },
        datalabels: {
          anchor: 'end',
          align: 'start',
          offset: 6,
          clip: false,
          color: '#e2e8f0',
          textStrokeWidth: 2,
          textStrokeColor: 'rgba(0,0,0,0.4)',
          font: { size: 9, weight: '600' },
          formatter: v => {
            const n = Number(v);
            return n >= 4 ? `${n.toFixed(0)}%` : '';
          }
        }
      },
      scales: {
        x: {
          suggestedMax: 100,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8892a4', callback: v => `${v}%` }
        },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8892a4', font: { size: 10 }, autoSkip: false } }
      },
      onClick(ev, elems) {
        if (!elems.length) return;
        const lab = sorted[elems[0].index];
        if (!lab) return;
        setFilterValues('filial', [lab.sigla]);
        chartOverlay.sitEmb = null;
        chartOverlay.sitPag = null;
        gradePage = 1;
        refreshDonutDrillChip();
        scheduleReload();
      }
    }
  });
}

// ── TABS ───────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`)?.classList.add('active');

    const q = buildQuery();
    const tab = btn.dataset.tab;
    if (tab === 'embarque') await loadEmbarque(q);
    if (tab === 'pagamento') await loadPagamento(q);
    if (tab === 'filiais') await loadFiliais(q);
    if (tab === 'destinos') await loadDestinoFilial(q);
    if (tab === 'planilha') await loadGrade(1);
  });
});

document.getElementById('btn-apply')?.addEventListener('click', async () => {
  gradePage = 1;
  await loadAll();
});

document.getElementById('btn-reset')?.addEventListener('click', async () => {
  clearAllFilterChecks();
  chartOverlay.sitEmb = null;
  chartOverlay.sitPag = null;
  gradePage = 1;
  refreshDonutDrillChip();
  await loadAll();
});

init();
