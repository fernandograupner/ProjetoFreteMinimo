/**
 * Serverless entrypoint para Vercel.
 * O Vercel executa este arquivo a partir de /var/task/api/,
 * então usamos __dirname para resolver o path do app corretamente.
 */
const path = require('path');
const serverless = require('serverless-http');

// Garante que require('../backend/app') funcione independente do cwd
const app = require(path.join(__dirname, '../backend/app'));

module.exports = serverless(app);
