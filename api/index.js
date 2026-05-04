/**
 * Entrada serverless na Vercel.
 * Reescrever para `/api` + `serverless-http` mantém o pathname real (/api/frete/…) no Express.
 */
const path = require('path');
const serverless = require('serverless-http');
const app = require(path.join(__dirname, '..', 'backend', 'app'));

module.exports = serverless(app);
