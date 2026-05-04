# 🚚 Dashboard — Auditoria de Piso Mínimo de Frete

Painel executivo para análise de compliance do piso mínimo de frete (ANTT) por embarcador, contrato e filial.

---

## 📁 Estrutura

```
frete-dashboard/
├── backend/
│   ├── server.js          # Servidor Express (porta 3001)
│   ├── package.json
│   ├── routes/
│   │   ├── frete.js       # /api/frete/* — todas as análises
│   │   ├── filiais.js     # /api/filiais
│   │   └── clientes.js    # /api/clientes
│   └── data/
│       ├── data.json      # Base principal (16.076 registros)
│       ├── clientes.json  # De/para clientes
│       └── filiais.json   # De/para filiais
└── frontend/
    ├── index.html         # Dashboard principal
    ├── css/style.css      # Estilos
    └── js/app.js          # Lógica frontend
```

---

## 🚀 Como Rodar

### 1. Instalar dependências
```bash
cd backend
npm install
```

### 2. Iniciar o servidor
```bash
node server.js
```

### 3. Abrir o dashboard
Acesse: **http://localhost:3001**

---

## 🔌 Rotas da API

| Rota | Descrição |
|------|-----------|
| `GET /api/frete/filters` | Opções disponíveis para filtros |
| `GET /api/frete/kpis` | KPIs gerais (totais, %, desvios) |
| `GET /api/frete/por-cliente` | Análise por embarcador (CNPJ truncado) |
| `GET /api/frete/por-filial` | Análise por filial com de/para |
| `GET /api/frete/farol-contrato` | Farol por tipo de contrato |
| `GET /api/frete/tendencia-mensal` | Série temporal mensal |
| `GET /api/frete/top-desvios` | Maiores desvios absolutos |

### Parâmetros de filtro (query string)
Todas as rotas aceitam: `?ano=2025&mes=Janeiro&filial=LE&contrato=Agregado&tipoCte=Fracionado&cliente=Klabin`

---

## 📊 Análises do Dashboard

### 1. Visão Geral
- KPIs: Total CTe's, Frete Embarque, Piso ANTT, Frete Pago, Diferença, Compliance %
- Gráfico de linha — evolução mensal Frete Pago vs ANTT
- Donut — proporção acima/abaixo do piso

### 2. Análise Embarque
- Responde: **O embarcador está pagando o mínimo?**
- Comparativo Frete Peso (col N) vs Frete ANTT Padrão (col O)
- Quebra por cliente com CNPJ truncado e nome de referência (aba Clientes)
- Barra de compliance por embarcador

### 3. Farol Contratos
- **Semáforo verde/amarelo/vermelho** por tipo: Frota · Agregado · Terceiro
- Diferença total e desvio percentual por contrato
- Tabela top 20 maiores desvios absolutos

### 4. Por Filial
- Performance de cada filial com sigla → nome (aba Filiais de/para)
- Gráfico horizontal de diferença ANTT
- Compliance por filial com barra visual

---

## 🔄 Atualizar Dados

Substitua o arquivo `backend/data/data.json` com nova exportação da planilha.
Para re-exportar do Excel:

```bash
python3 exportar.py
```

---

## 🛠 Tecnologias

- **Backend**: Node.js + Express
- **Frontend**: HTML5 + CSS3 + Vanilla JS
- **Gráficos**: Chart.js 4
- **Dados**: JSON (exportado do Excel via pandas)
