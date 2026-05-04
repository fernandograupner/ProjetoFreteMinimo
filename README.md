# 🚚 Dashboard — Auditoria de Piso Mínimo de Frete

Painel executivo para análise de compliance do piso mínimo de frete (ANTT) por embarcador, contrato e filial.

---

## 📁 Estrutura

```
frete-dashboard/
├── api/
│   └── server.js          # servidor serverless na Vercel (rewrite → aqui)
├── package.json           # deps na raiz (deploy Vercel)
├── vercel.json
├── backend/
│   ├── app.js             # aplicação Express (exportável)
│   ├── server.js          # servidor local (porta 3001)
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

## 🚀 Como Rodar (local)

Use a pasta **deste projeto** (onde estão `package.json`, `backend/` e `frontend/`), não outro app na porta 3000.

### Opção A — só backend (como antes)
```bash
cd backend
npm install
node server.js
```
Abra o painel em **http://localhost:3001/** (ou `/index.html`). A API continua em **`/api/*`**.

### Opção B — pela raiz (recomendado)
```bash
npm install
npm start
```
Mesma coisa: dashboard em **http://localhost:3001/** — **não** use `localhost:3000` a menos que seja outro servidor.

---

## ▲ Deploy na Vercel

1. Crie conta em [vercel.com](https://vercel.com) e conecte ao GitHub.
2. **Import** o repositório [ProjetoFreteMinimo](https://github.com/fernandograupner/ProjetoFreteMinimo).
3. **Root Directory**: deixe **vazio** (a raiz do repositório tem de ser onde estão `vercel.json`, `api/` e `backend/`).
4. **Framework Preset**: Other · **Build Command**: vazio ou `npm run vercel-build` · **Output Directory**: em branco na UI (o `vercel.json` define `frontend`).  
5. **Install Command**: `npm install` (na raiz; instala Express e cors).
6. Deploy. A URL gerada (`https://xxx.vercel.app`) servirá o HTML e `/api/*` pelo mesmo domínio (o frontend já usa `/api` em relação à origem).

**Erros comuns no deploy**

- `path-to-regexp` / rewrite inválido: use sempre o `vercel.json` deste repo (rotas `/api/:path*`, não `/(.*)`).
- Plano gratuito (Hobby): evite `maxDuration` altos no JSON; timeout no cold start com `data.json` grande aparece só na primeira requisição.

- Se aparecer **404**, confira na Vercel (**Settings → General**) se **Root Directory** está vazio e faça novo deploy depois do `git pull` dos ficheiros `vercel.json` e `api/server.js`.
- O `data.json` é carregado no cold start da função; base muito grande pode deixar a primeira abertura mais lenta.
- Plano gratuito há limites de execução e tamanho; monitore no painel da Vercel se algo falhar no build.

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
