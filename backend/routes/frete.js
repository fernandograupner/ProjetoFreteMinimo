const express = require('express');
const router = express.Router();
const dados = require('../data/data.json');
const clientesRef = require('../data/clientes.json');
const filiaisRef = require('../data/filiais.json');

/** Ordenação dos meses (grade). */
const MESES_ORDEM = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Build lookup maps
const clienteMap = {};
clientesRef.forEach(c => { clienteMap[c['Cliente']] = c['Nome Ref']; });

const filialMap = {};
filiaisRef.forEach(f => { filialMap[f['Filial']] = f['Filial Ref']; });

/** Tolerância em R$ para comparar com o piso ANTT (centavos). */
const EPS_PISO = 0.01;

/**
 * Duas faixas vs piso ANTT: abaixo · dentro (= igual ou acima ao mínimo).
 */
function classificarVsPiso(valorValorada, freteAntt) {
  const v = Number(valorValorada) || 0;
  const p = Number(freteAntt) || 0;
  if (v < p - EPS_PISO) return 'abaixo';
  return 'dentro';
}

/** Frota usa frete peso como valor “efetivamente pago” na análise; Ag/Ter usam BIPE. */
function valorAnaliseContrato(r) {
  const c = r['Contrato'];
  if (c === 'Frota') return Number(r['Frete peso doctos.']) || 0;
  return Number(r['Frete pago BIPE']) || 0;
}

// Helper: get first name from cliente key
function getClienteNome(clienteKey) {
  if (clienteMap[clienteKey]) return clienteMap[clienteKey];
  if (!clienteKey) return 'N/A';
  const parts = clienteKey.split(' - ');
  return parts.length > 1 ? parts[1].split(' ')[0] : clienteKey;
}

function getFilialNome(sigla) {
  return filialMap[sigla] || sigla;
}

/** Lista de valores vindos da query (vírgula ou array repetido). */
function listaValores(query, key) {
  const raw = query[key];
  if (raw == null || raw === '') return null;
  const chunks = Array.isArray(raw) ? raw : [raw];
  const out = [];
  chunks.forEach(x => {
    String(x).split(',').forEach(p => {
      const t = p.trim();
      if (t) out.push(t);
    });
  });
  return out.length ? out : null;
}

/** Filtros múltiplos + sitEmb opcional (clique donut / drill). */
function applyFilters(data, query) {
  let result = data;

  const anos = listaValores(query, 'ano');
  if (anos) result = result.filter(r => anos.includes(String(r['Ano'])));

  const meses = listaValores(query, 'mes');
  if (meses) result = result.filter(r => meses.includes(r['Mês']));

  const filiais = listaValores(query, 'filial');
  if (filiais) result = result.filter(r => filiais.includes(r['Filial']));

  const contratos = listaValores(query, 'contrato');
  if (contratos) result = result.filter(r => contratos.includes(r['Contrato']));

  const tiposCte = listaValores(query, 'tipoCte');
  if (tiposCte) result = result.filter(r => tiposCte.includes(r['Tipo CTe']));

  const clientes = listaValores(query, 'cliente');
  if (clientes) {
    result = result.filter(r => {
      const key = r['Cliente'];
      const nome = getClienteNome(key);
      return clientes.some(v => v === nome || v === key);
    });
  }

  const sitEmbArr = listaValores(query, 'sitEmb');
  if (sitEmbArr && sitEmbArr.length >= 1) {
    result = result.filter(r => {
      const antt = Number(r['Frete ANTT Padrão']) || 0;
      const peso = Number(r['Frete peso doctos.']) || 0;
      return sitEmbArr.includes(classificarVsPiso(peso, antt));
    });
  }

  const sitPagArr = listaValores(query, 'sitPag');
  if (sitPagArr && sitPagArr.length >= 1) {
    result = result.filter(r => {
      const antt = Number(r['Frete ANTT Padrão']) || 0;
      const v = valorAnaliseContrato(r);
      return sitPagArr.includes(classificarVsPiso(v, antt));
    });
  }

  return result;
}

function contarFaixas(rows, valorFn) {
  let abaixo = 0;
  let dentro = 0;
  rows.forEach(r => {
    const antt = Number(r['Frete ANTT Padrão']) || 0;
    const cls = classificarVsPiso(valorFn(r), antt);
    if (cls === 'abaixo') abaixo++;
    else dentro++;
  });
  const n = rows.length;
  const pct = k => (n > 0 ? (k / n * 100) : 0);
  return {
    total: n,
    abaixo,
    dentro,
    percAbaixo: +pct(abaixo).toFixed(2),
    percDentro: +pct(dentro).toFixed(2)
  };
}

function viagensPorCliente(rows, valorFn) {
  const agrupado = {};
  rows.forEach(r => {
    const clienteKey = r['Cliente'];
    const nome = getClienteNome(clienteKey);
    const cnpj = clienteKey ? String(clienteKey).split(' - ')[0] : '';
    const antt = Number(r['Frete ANTT Padrão']) || 0;
    const cls = classificarVsPiso(valorFn(r), antt);
    if (!agrupado[nome]) {
      agrupado[nome] = {
        cliente: nome,
        cnpjTruncado: (cnpj.substring(0, 8) || '—') + '...',
        qtd: 0,
        abaixo: 0,
        dentro: 0
      };
    }
    agrupado[nome].qtd++;
    if (cls === 'abaixo') agrupado[nome].abaixo++;
    else agrupado[nome].dentro++;
  });
  return Object.values(agrupado)
    .map(c => {
      const n = c.qtd;
      return {
        ...c,
        percAbaixo: n > 0 ? (c.abaixo / n * 100).toFixed(1) : '0.0',
        percDentro: n > 0 ? (c.dentro / n * 100).toFixed(1) : '0.0'
      };
    })
    .sort((a, b) => b.qtd - a.qtd);
}

const GRADE_SORT_KEYS = new Set([
  'bipe', 'ano', 'mes', 'filial', 'cliente', 'destino', 'contrato', 'pisoMinimo',
  'fretePeso', 'faixaFretePeso', 'fretePago', 'diferencaAntt', 'faixaFretePago',
  'margemPagoPct', 'margemMinPisoPct', 'placa'
]);

/**
 * Extrai valores comparáveis para ordenação da grade (registro cru do JSON).
 * @returns {number|string|null} null vai para o fim na ordenação.
 */
function gradeValorOrdenacao(r, key) {
  const antt = Number(r['Frete ANTT Padrão']) || 0;
  const peso = Number(r['Frete peso doctos.']) || 0;
  const pago = Number(r['Frete pago BIPE']) || 0;
  const ct = r['Contrato'];
  const valFarolPg = valorAnaliseContrato(r);
  switch (key) {
    case 'bipe':
      return Number(r['BIPE']) || 0;
    case 'ano':
      return Number(r['Ano']) || 0;
    case 'mes': {
      const i = MESES_ORDEM.indexOf(r['Mês']);
      return i < 0 ? 99 : i;
    }
    case 'filial':
      return String(r['Filial'] ?? '');
    case 'cliente':
      return getClienteNome(r['Cliente']).toLowerCase();
    case 'destino':
      return String(r['Destino'] ?? '').toLowerCase();
    case 'contrato':
      return String(r['Contrato'] ?? '');
    case 'pisoMinimo':
      return antt;
    case 'fretePeso':
      return peso;
    case 'faixaFretePeso':
      return classificarVsPiso(peso, antt) === 'abaixo' ? 0 : 1;
    case 'fretePago':
      return pago;
    case 'diferencaAntt':
      return Number(r['Diferença ANTT Padrão']) || 0;
    case 'faixaFretePago':
      return classificarVsPiso(valFarolPg, antt) === 'abaixo' ? 0 : 1;
    case 'margemPagoPct': {
      if (ct !== 'Agregado' && ct !== 'Terceiro') return null;
      if (peso <= EPS_PISO) return null;
      return (pago / peso) * 100;
    }
    case 'margemMinPisoPct': {
      if (ct !== 'Agregado' && ct !== 'Terceiro') return null;
      if (peso <= EPS_PISO) return null;
      if (classificarVsPiso(pago, antt) !== 'abaixo') return null;
      return (antt / peso) * 100;
    }
    case 'placa':
      return String(r['Placa'] ?? '').toLowerCase();
    default:
      return 0;
  }
}

function ordenarGradeRows(rows, sortBy, sortDir) {
  if (!sortBy || !GRADE_SORT_KEYS.has(sortBy) || !rows.length) return rows;
  const asc = sortDir !== 'desc';
  const mul = asc ? 1 : -1;
  const copia = [...rows];
  copia.sort((a, b) => {
    const va = gradeValorOrdenacao(a, sortBy);
    const vb = gradeValorOrdenacao(b, sortBy);
    const invalid = x => x === null || x === undefined || (typeof x === 'number' && Number.isNaN(x));
    const na = invalid(va);
    const nb = invalid(vb);
    if (na && nb) return String(a['BIPE']).localeCompare(String(b['BIPE']), 'pt-BR');
    if (na) return 1;
    if (nb) return -1;
    let cmp = 0;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' });
    if (cmp !== 0) return cmp * mul;
    return String(a['BIPE']).localeCompare(String(b['BIPE']), 'pt-BR') * mul;
  });
  return copia;
}

// ─── GET /api/frete/filters ──────────────────────────────────────────────────
// Returns available filter options
router.get('/filters', (req, res) => {
  const anos = [...new Set(dados.map(r => r['Ano']))].filter(Boolean).sort();
  const meses = [...new Set(dados.map(r => r['Mês']))].filter(Boolean);
  const filiais = filiaisRef.map(f => ({ sigla: f['Filial'], nome: f['Filial Ref'] }));
  const contratos = [...new Set(dados.map(r => r['Contrato']))].filter(Boolean);
  const tiposCte = [...new Set(dados.map(r => r['Tipo CTe']))].filter(Boolean);
  const clientes = clientesRef.map(c => ({ key: c['Cliente'], nome: c['Nome Ref'] }));

  res.json({ anos, meses, filiais, contratos, tiposCte, clientes });
});

// ─── GET /api/frete/kpis ─────────────────────────────────────────────────────
// Resumo logístico: faixas abaixo vs dentro do piso (sem ênfase em R$ totais)
router.get('/kpis', (req, res) => {
  const data = applyFilters(dados, req.query);
  const pagamentoSubset = data.filter(r => r['Contrato'] === 'Agregado' || r['Contrato'] === 'Terceiro');

  const embarcador = contarFaixas(data, r => Number(r['Frete peso doctos.']) || 0);
  const pagamentoAgTer = contarFaixas(pagamentoSubset, r => Number(r['Frete pago BIPE']) || 0);

  const porContrato = {};
  ['Frota', 'Agregado', 'Terceiro'].forEach(c => {
    const sub = data.filter(r => r['Contrato'] === c);
    porContrato[c] = contarFaixas(sub, valorAnaliseContrato);
  });

  res.json({
    totalRegistros: data.length,
    totalPagamentoAgTer: pagamentoSubset.length,
    embarcador,
    pagamentoAgTer,
    porContrato
  });
});

// ─── GET /api/frete/viagens-embarcador ──────────────────────────────────────────
// Por cliente: cada linha = viagem · Frete peso (documentos) vs piso ANTT
router.get('/viagens-embarcador', (req, res) => {
  const data = applyFilters(dados, req.query);
  res.json(viagensPorCliente(data, r => Number(r['Frete peso doctos.']) || 0));
});

// ─── GET /api/frete/viagens-pagamento-ag-ter ────────────────────────────────────
// Agregado + Terceiro: Frete pago BIPE vs piso · por cliente
router.get('/viagens-pagamento-ag-ter', (req, res) => {
  const data = applyFilters(dados, req.query).filter(
    r => r['Contrato'] === 'Agregado' || r['Contrato'] === 'Terceiro'
  );
  res.json(viagensPorCliente(data, r => Number(r['Frete pago BIPE']) || 0));
});

// ─── GET /api/frete/por-cliente ───────────────────────────────────────────────
// Análise 1: Embarcador paga o mínimo? (Frete Peso vs ANTT) agrupado por cliente
router.get('/por-cliente', (req, res) => {
  const data = applyFilters(dados, req.query);
  const agrupado = {};

  data.forEach(r => {
    const clienteKey = r['Cliente'];
    const nome = getClienteNome(clienteKey);
    const cnpj = clienteKey ? clienteKey.split(' - ')[0] : '';
    const fretePeso = Number(r['Frete peso doctos.']) || 0;
    const freteAntt = Number(r['Frete ANTT Padrão']) || 0;
    const fretePago = Number(r['Frete pago BIPE']) || 0;
    const diferenca = Number(r['Diferença ANTT Padrão']) || 0;

    if (!agrupado[nome]) {
      agrupado[nome] = {
        cliente: nome,
        cnpjTruncado: cnpj.substring(0, 8) + '...',
        qtd: 0,
        freteEmbarqueTotal: 0,
        freteAnttTotal: 0,
        fretePagoTotal: 0,
        diferencaTotal: 0,
        acimaPiso: 0,
        abaixoPiso: 0
      };
    }

    agrupado[nome].qtd++;
    agrupado[nome].freteEmbarqueTotal += fretePeso;
    agrupado[nome].freteAnttTotal += freteAntt;
    agrupado[nome].fretePagoTotal += fretePago;
    agrupado[nome].diferencaTotal += diferenca;

    if (fretePago >= freteAntt) agrupado[nome].acimaPiso++;
    else agrupado[nome].abaixoPiso++;
  });

  const resultado = Object.values(agrupado).map(c => ({
    ...c,
    percCompliance: c.qtd > 0 ? (c.acimaPiso / c.qtd * 100).toFixed(1) : 0,
    desvioMedio: c.qtd > 0 ? (c.diferencaTotal / c.qtd).toFixed(2) : 0
  })).sort((a, b) => b.freteEmbarqueTotal - a.freteEmbarqueTotal);

  res.json(resultado);
});

// ─── GET /api/frete/por-filial ────────────────────────────────────────────────
// Por filial: viagens por frete peso vs piso ANTT (visão contrato embarque)
router.get('/por-filial', (req, res) => {
  const data = applyFilters(dados, req.query);
  const agrupado = {};

  data.forEach(r => {
    const sigla = r['Filial'];
    const nome = getFilialNome(sigla);
    const freteAntt = Number(r['Frete ANTT Padrão']) || 0;
    const fretePeso = Number(r['Frete peso doctos.']) || 0;
    const cls = classificarVsPiso(fretePeso, freteAntt);

    if (!agrupado[sigla]) {
      agrupado[sigla] = {
        sigla, nome, qtd: 0,
        abaixo: 0, dentro: 0
      };
    }

    agrupado[sigla].qtd++;
    if (cls === 'abaixo') agrupado[sigla].abaixo++;
    else agrupado[sigla].dentro++;
  });

  const resultado = Object.values(agrupado).map(f => {
    const n = f.qtd;
    return {
      ...f,
      percAbaixo: n > 0 ? (f.abaixo / n * 100).toFixed(1) : '0.0',
      percDentro: n > 0 ? (f.dentro / n * 100).toFixed(1) : '0.0',
      fracAbaixo: n > 0 ? f.abaixo / n : 0
    };
  }).sort((a, b) => b.fracAbaixo - a.fracAbaixo);

  resultado.forEach(f => delete f.fracAbaixo);
  res.json(resultado);
});

// ─── GET /api/frete/farol-contrato ───────────────────────────────────────────
// Frota: frete peso vs ANTT · Agregado/Terceiro: frete pago BIPE vs ANTT
router.get('/farol-contrato', (req, res) => {
  const data = applyFilters(dados, req.query);
  const contratos = ['Frota', 'Agregado', 'Terceiro'];
  const resultado = contratos.map(contrato => {
    const registros = data.filter(r => r['Contrato'] === contrato);
    let abaixo = 0;
    let dentro = 0;

    registros.forEach(r => {
      const antt = Number(r['Frete ANTT Padrão']) || 0;
      const cls = classificarVsPiso(valorAnaliseContrato(r), antt);
      if (cls === 'abaixo') abaixo++;
      else dentro++;
    });

    const total = registros.length;
    const percSemRisco = total > 0 ? (dentro / total * 100) : 0;
    let farol = 'verde';
    if (percSemRisco < 80) farol = 'amarelo';
    if (percSemRisco < 60) farol = 'vermelho';

    const basePct = total > 0 ? 100 / total : 0;
    return {
      contrato,
      total,
      abaixo,
      dentro,
      percAbaixo: (abaixo * basePct).toFixed(1),
      percDentro: (dentro * basePct).toFixed(1),
      percSemRisco: percSemRisco.toFixed(1),
      farol
    };
  });

  res.json(resultado);
});

// ─── GET /api/frete/tendencia-mensal ─────────────────────────────────────────
// % de viagens abaixo vs dentro do piso (emb = frete peso; pag Ag/Ter = BIPE)
router.get('/tendencia-mensal', (req, res) => {
  const data = applyFilters(dados, req.query);
  const mesesOrdem = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const agrupado = {};
  data.forEach(r => {
    const chave = `${r['Ano']}-${r['Mês']}`;
    if (!agrupado[chave]) {
      agrupado[chave] = {
        ano: r['Ano'], mes: r['Mês'],
        ordem: mesesOrdem.indexOf(r['Mês']),
        qtdEmb: 0, embAb: 0, embDentro: 0,
        qtdPag: 0, pagAb: 0, pagDentro: 0
      };
    }
    const bucket = agrupado[chave];
    const antt = Number(r['Frete ANTT Padrão']) || 0;

    bucket.qtdEmb++;
    const cEmb = classificarVsPiso(Number(r['Frete peso doctos.']) || 0, antt);
    if (cEmb === 'abaixo') bucket.embAb++;
    else bucket.embDentro++;

    if (r['Contrato'] === 'Agregado' || r['Contrato'] === 'Terceiro') {
      bucket.qtdPag++;
      const cPag = classificarVsPiso(Number(r['Frete pago BIPE']) || 0, antt);
      if (cPag === 'abaixo') bucket.pagAb++;
      else bucket.pagDentro++;
    }
  });

  const pct = (part, whole) => (whole > 0 ? (part / whole * 100).toFixed(1) : '0');

  const resultado = Object.values(agrupado)
    .sort((a, b) => a.ano - b.ano || a.ordem - b.ordem)
    .map(m => ({
      periodo: `${m.mes.substring(0, 3)}/${m.ano}`,
      ano: m.ano,
      mes: m.mes,
      qtdEmb: m.qtdEmb,
      pctEmbAb: pct(m.embAb, m.qtdEmb),
      pctEmbDentro: pct(m.embDentro, m.qtdEmb),
      qtdPag: m.qtdPag,
      pctPagAb: pct(m.pagAb, m.qtdPag),
      pctPagDentro: pct(m.pagDentro, m.qtdPag)
    }));

  res.json(resultado);
});

// ─── GET /api/frete/top-desvios ───────────────────────────────────────────────
// Top registros com maior desvio (positivo ou negativo)
router.get('/top-desvios', (req, res) => {
  const data = applyFilters(dados, req.query);
  const limite = parseInt(req.query.limite) || 20;

  const resultado = data
    .map(r => {
      const antt = Number(r['Frete ANTT Padrão']) || 0;
      const valorCamp = valorAnaliseContrato(r);
      const situacao = classificarVsPiso(valorCamp, antt);
      return {
        bipe: r['BIPE'],
        filial: getFilialNome(r['Filial']),
        cliente: getClienteNome(r['Cliente']),
        contrato: r['Contrato'],
        destino: r['Destino'],
        freteAntt: antt,
        valorComparado: valorCamp,
        diferenca: Number(r['Diferença ANTT Padrão']) || 0,
        situacao
      };
    })
    .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
    .slice(0, limite);

  res.json(resultado);
});

// ─── GET /api/frete/viagem/:bipe ────────────────────────────────────────────────
/** Registro bruto da planilha (JSON) para um BIPE, respeitando filtros da query. */
router.get('/viagem/:bipe', (req, res) => {
  const want = String(req.params.bipe).trim();
  if (!want) return res.status(400).json({ error: 'BIPE inválido.' });
  const data = applyFilters(dados, req.query);
  const row = data.find(r => String(r['BIPE']) === want);
  if (!row) {
    return res.status(404).json({ error: 'Viagem não encontrada com os filtros atuais.' });
  }
  res.json({ registro: row });
});

// ─── GET /api/frete/por-destino-filial ────────────────────────────────────────
/** Destino × filial: contagens embarcador (peso×piso), pagamento (valor análise×piso) e margem Ag/Ter. */
router.get('/por-destino-filial', (req, res) => {
  const data = applyFilters(dados, req.query);
  const map = {};

  data.forEach(r => {
    const sigla = r['Filial'];
    const destino = String(r['Destino'] ?? '').trim() || '(sem destino)';
    const antt = Number(r['Frete ANTT Padrão']) || 0;
    const peso = Number(r['Frete peso doctos.']) || 0;
    const pagCls = classificarVsPiso(valorAnaliseContrato(r), antt);
    const embCls = classificarVsPiso(peso, antt);
    const key = `${sigla}\t${destino}`;
    if (!map[key]) {
      map[key] = {
        siglaFilial: sigla,
        nomeFilial: getFilialNome(sigla),
        destino,
        qtd: 0,
        embAb: 0,
        embDentro: 0,
        pagAb: 0,
        pagDentro: 0,
        sumPagMargem: 0,
        sumPesoMargem: 0
      };
    }
    const bucket = map[key];
    bucket.qtd++;
    if (embCls === 'abaixo') bucket.embAb++;
    else bucket.embDentro++;
    if (pagCls === 'abaixo') bucket.pagAb++;
    else bucket.pagDentro++;
    const ct = r['Contrato'];
    if ((ct === 'Agregado' || ct === 'Terceiro') && peso > EPS_PISO) {
      bucket.sumPagMargem += Number(r['Frete pago BIPE']) || 0;
      bucket.sumPesoMargem += peso;
    }
  });

  const resultado = Object.values(map).map(x => {
    const n = x.qtd;
    const margemPagoPct = x.sumPesoMargem > EPS_PISO
      ? Math.round((x.sumPagMargem / x.sumPesoMargem) * 1000) / 10
      : null;
    return {
      siglaFilial: x.siglaFilial,
      nomeFilial: x.nomeFilial,
      destino: x.destino,
      qtd: x.qtd,
      embAb: x.embAb,
      embDentro: x.embDentro,
      pagAb: x.pagAb,
      pagDentro: x.pagDentro,
      percEmbAbaixo: n > 0 ? (x.embAb / n * 100).toFixed(1) : '0.0',
      percEmbDentro: n > 0 ? (x.embDentro / n * 100).toFixed(1) : '0.0',
      percPagAbaixo: n > 0 ? (x.pagAb / n * 100).toFixed(1) : '0.0',
      percPagDentro: n > 0 ? (x.pagDentro / n * 100).toFixed(1) : '0.0',
      margemPagoPct
    };
  }).sort((a, b) => b.qtd - a.qtd);

  res.json(resultado);
});

// ─── GET /api/frete/grade ───────────────────────────────────────────────────────
/** Planilha paginada com faróis — só mapeia o slice da página (desempenho). */
router.get('/grade', (req, res) => {
  let filtered = applyFilters(dados, req.query);
  const sortBy = String(req.query.sortBy || '').trim();
  const sortDir = String(req.query.sortDir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  if (sortBy && GRADE_SORT_KEYS.has(sortBy)) {
    filtered = ordenarGradeRows(filtered, sortBy, sortDir);
  }

  const total = filtered.length;
  const limit = Math.min(500, Math.max(25, parseInt(req.query.limit, 10) || 200));
  const paginasTotal = Math.max(1, Math.ceil(total / limit));
  let page = Math.max(1, parseInt(req.query.page, 10) || 1);
  page = Math.min(page, paginasTotal);
  const start = (page - 1) * limit;
  const slice = filtered.slice(start, start + limit);

  const linhas = slice.map(r => {
    const antt = Number(r['Frete ANTT Padrão']) || 0;
    const fretePeso = Number(r['Frete peso doctos.']) || 0;
    const fretePago = Number(r['Frete pago BIPE']) || 0;
    const valFarolPg = valorAnaliseContrato(r);
    const ct = r['Contrato'];
    let margemPagoPct = null;
    let margemMinPisoPct = null;
    if (ct === 'Agregado' || ct === 'Terceiro') {
      if (fretePeso > EPS_PISO) {
        margemPagoPct = Math.round((fretePago / fretePeso) * 1000) / 10;
      }
      if (
        fretePeso > EPS_PISO &&
        classificarVsPiso(fretePago, antt) === 'abaixo'
      ) {
        margemMinPisoPct = Math.round((antt / fretePeso) * 1000) / 10;
      }
    }
    return {
      bipe: r['BIPE'],
      cliente: getClienteNome(r['Cliente']),
      siglaFilial: r['Filial'],
      filial: getFilialNome(r['Filial']),
      contrato: r['Contrato'],
      ano: r['Ano'],
      mes: r['Mês'],
      tipoCte: r['Tipo CTe'],
      placa: String(r['Placa'] ?? '').trim(),
      pisoMinimo: antt,
      fretePeso,
      faixaFretePeso: classificarVsPiso(fretePeso, antt),
      fretePago,
      diferencaAntt: Number(r['Diferença ANTT Padrão']) || 0,
      faixaFretePago: classificarVsPiso(valFarolPg, antt),
      margemPagoPct,
      margemMinPisoPct,
      destino: String(r['Destino'] ?? '').trim()
    };
  });

  res.json({
    total,
    page,
    limit,
    paginasTotal,
    linhas
  });
});

module.exports = router;
