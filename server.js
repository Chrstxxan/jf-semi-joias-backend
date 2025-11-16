require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

// Rotas
const produtosRoutes = require('./routes/produtos');
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const freteRoutes = require('./routes/frete');
const userRoutes = require('./routes/users');
const adminOrdersRoutes = require('./routes/adminOrders');

// 🕒 Job
const atualizarStatusEntrega = require('./jobs/atualizarStatusEntrega');

const app = express();
const PORT = process.env.PORT || 5000;

/* ================================
   CORS multi-domínio (FRONT_ORIGINS)
   Exemplo no Render:
   FRONT_ORIGINS=https://www.jfsemijoias.com,https://jfsemijoias.com,https://jf-semi-joias-frontend.vercel.app,http://127.0.0.1:5500
================================ */
const rawOrigins = process.env.FRONT_ORIGINS
  ? process.env.FRONT_ORIGINS.split(',').map(s => s.trim().replace(/\/$/, ''))
  : ['http://127.0.0.1:5500'];

function variants(origin) {
  try {
    const u = new URL(origin);
    const host = u.hostname.replace(/^www\./, '');
    return new Set([
      `${u.protocol}//${host}`,
      `${u.protocol}//www.${host}`,
      origin.replace(/\/$/, ''),
    ]);
  } catch {
    return new Set([origin]);
  }
}

const allowed = new Set();
rawOrigins.forEach(o => variants(o).forEach(v => allowed.add(v)));

const corsOptions = {
  origin(origin, cb) {
    // Sem Origin (curl/healthcheck) -> ok
    if (!origin) return cb(null, true);
    if (allowed.has(origin)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  // opcional: status do preflight (p/ alguns proxies chatos)
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));              // ✅ já trata preflight (OPTIONS) no Express 5

app.use(express.json());
app.use(cookieParser());

// (debug rápido — remova depois)
app.use((req, res, next) => {
  if (req.path.startsWith('/produtos')) {
    console.log('[CORS]', req.headers.origin, '→', req.method, req.path);
  }
  next();
});

/* ================================
   MongoDB
================================ */
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB conectado ✅'))
  .catch((err) => console.error('Erro MongoDB:', err));

/* ================================
   Rotas
================================ */
app.use('/produtos', produtosRoutes);
app.use('/auth', authRoutes);
app.use('/orders', orderRoutes);
app.use('/payment', paymentRoutes);
app.use('/frete', freteRoutes);
app.use('/users', userRoutes);
app.use('/admin', adminOrdersRoutes);

/* ================================
   Healthcheck
================================ */
app.get('/', (_req, res) => res.send('Servidor da JF Semi Joias está rodando ✅'));

/* ================================
   Debug de compra simples
================================ */
app.post('/comprar', (req, _res) => {
  const { nomeProduto, precoProduto } = req.body || {};
  console.log(`Pedido recebido: ${nomeProduto} - R$ ${precoProduto}`);
  _res.json({ mensagem: 'Pedido recebido com sucesso!', status: 'ok' });
});

/* ================================
   Handler de erro CORS (403 claro)
================================ */
app.use((err, _req, res, next) => {
  if (err && typeof err.message === 'string' && err.message.startsWith('Not allowed by CORS')) {
    return res.status(403).json({ error: 'CORS bloqueado', detail: err.message });
  }
  next(err);
});

/* ================================
   Start
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log('🌐 Origens permitidas:', Array.from(allowed).join(' | '));

  console.log('🕒 Agendando verificação automática de entregas...');
  setTimeout(atualizarStatusEntrega, 2 * 60 * 1000);
  setInterval(atualizarStatusEntrega, 6 * 60 * 60 * 1000);
});
