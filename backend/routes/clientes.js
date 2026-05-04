const express = require('express');
const router = express.Router();
const clientes = require('../data/clientes.json');

// GET /api/clientes — lista todos os clientes com nome de referência
router.get('/', (req, res) => {
  res.json(clientes);
});

module.exports = router;
