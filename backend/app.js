const express = require('express');
const cors = require('cors');
const path = require('path');

const freteRoutes = require('./routes/frete');
const filialRoutes = require('./routes/filiais');
const clienteRoutes = require('./routes/clientes');

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/frete', freteRoutes);
app.use('/api/filiais', filialRoutes);
app.use('/api/clientes', clienteRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

module.exports = app;
