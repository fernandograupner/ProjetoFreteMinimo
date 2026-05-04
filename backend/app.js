const path = require('path');
const express = require('express');
const cors = require('cors');

const filialRoutes = require('./routes/filiais');
const clienteRoutes = require('./routes/clientes');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

/** Lazy: `frete.js` faz `require` da base grande (~data.json). Só carrega no 1.º pedido a /api/frete/… (arranque da função mais leve na Vercel). */
let freteRoutesCache;
app.use('/api/frete', (req, res, next) => {
  try {
    if (!freteRoutesCache) freteRoutesCache = require('./routes/frete');
    return freteRoutesCache(req, res, next);
  } catch (err) {
    next(err);
  }
});
app.use('/api/filiais', filialRoutes);
app.use('/api/clientes', clienteRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/** Só em local: na Vercel o estático vem do CDN (`outputDirectory`); servir `frontend` aqui quebra o bundle da função. */
if (process.env.VERCEL !== '1') {
  const frontendDir = path.join(__dirname, '..', 'frontend');
  app.use(express.static(frontendDir, { index: 'index.html', extensions: ['html'] }));
}

module.exports = app;
