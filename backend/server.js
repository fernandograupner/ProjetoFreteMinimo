const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`\n🚚 Frete Dashboard API rodando em http://localhost:${PORT}`);
  console.log(`📊 Dashboard em http://localhost:${PORT}/index.html\n`);
});
