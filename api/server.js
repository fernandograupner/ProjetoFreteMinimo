/**
 * Entry serverless na Vercel · export direto do app Express
 * (bundler nativo; ver https://vercel.com/guides/using-express-with-vercel )
 */
const path = require('path');

module.exports = require(path.join(__dirname, '..', 'backend', 'app'));
