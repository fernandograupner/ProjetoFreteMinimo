const express = require('express');
const cors = require('cors');
const path = require('path');

const freteRoutes = require('./routes/frete');
const filialRoutes = require('./routes/filiais');
const clienteRoutes = require('./routes/clientes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/frete', freteRoutes);
app.use('/api/filiais', filialRoutes);
app.use('/api/clientes', clienteRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback to frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚚 Frete Dashboard API rodando em http://localhost:${PORT}`);
  console.log(`📊 Dashboard em http://localhost:${PORT}/index.html\n`);
});
