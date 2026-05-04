const express = require('express');
const router = express.Router();
const filiais = require('../data/filiais.json');

// GET /api/filiais — lista todas as filiais
router.get('/', (req, res) => {
  res.json(filiais);
});

module.exports = router;
