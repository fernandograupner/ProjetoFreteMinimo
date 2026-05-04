/**
 * Vercel: export direto do Express (sem serverless-http — evita pedidos pendurados na edge).
 */
const path = require('path');

const app = require(path.join(__dirname, '..', 'backend', 'app'));
module.exports = app;
module.exports.default = app;
