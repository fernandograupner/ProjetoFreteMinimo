const path = require('path');
const express = require('express');
const cors = require('cors');

const freteRoutes  = require('./routes/frete');
const filialRoutes = require('./routes/filiais');
const clienteRoutes = require('./routes/clientes');

const app = express();

const frontendDir = path.join(__dirname, '..', 'frontend');

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/frete',    freteRoutes);
app.use('/api/filiais',  filialRoutes);
app.use('/api/clientes', clienteRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/** Em local, o mesmo servidor entrega o dashboard (css/js em /). Na Vercel o estático vem do CDN. */
app.use(express.static(frontendDir, { index: 'index.html', extensions: ['html'] }));

module.exports = app;
