const express = require('express');
const client = require('prom-client');

const app = express();

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

app.get('/', (req, res) => {
  httpRequestCounter.inc({ method: 'GET', route: '/', status: 200 });
  res.send('Hello from monitored Node.js app!');
});

app.get('/about', (req, res) => {
  httpRequestCounter.inc({ method: 'GET', route: '/about', status: 200 });
  res.json({ app: 'monitoring-lab', version: '1.0.0' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(3001, () => {
  console.log('App running on port 3001');
});
