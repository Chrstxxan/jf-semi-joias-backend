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

// 🕒 Job de atualização automática de entregas
const atualizarStatusEntrega = require('./jobs/atualizarStatusEntrega');

const app = express();
const PORT = process.env.PORT || 5000;

/* =========================================
   CORS multi-domínio (usa FRONT_ORIGINS)
   Exemplo .env no Render:
   FRONT_ORIGINS=https://www.jfsemijoias.com,https://jfsemijoias.com,https://jf-semi-joias-frontend.vercel.app,http://127.0.0.1:5500
========================================= */
const rawOrigins = process.env.FRONT_ORIGINS
  ? process.env.FRONT_ORIGINS.split(',').map(s => s.trim().replace(/\/$/, ''))
  : ['http://127.0.0.1:5500'];

// gera variantes www/sem-www automaticamente
function variants(origin) {
  try {
    const u = new URL(origin);
    const hostSemWww = u.hostname.replace(/^www\./, '');
    return new Set([
      `${u.protocol}//${hostSemWww}`,
      `${u.protocol}//www.${hostSemWww}`,
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
    // requests sem Origin (curl/healthchecks) passam
    if (!origin) return cb(null, true);
    if (allowed.has(origin)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
// ✅ Express 5: use '/*' em vez de '*'
app.options('/*', cors(corsOptions));

// Fallback simples para OPTIONS (evita 404 em preflight)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use(cookieParser());

/* (Opcional) Log rápido pra debugar origem nos produtos — remova depois */
app.use((req, res, next) => {
  if (req.path.startsWith('/produtos')) {
    console.log('[CORS] Origin:', req.headers.origin, '→', req.method, req.path);
  }
  next();
});

/* =========================================
   Conexão com MongoDB
========================================= */
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB conectado ✅'))
  .catch((err) => console.error('Erro MongoDB:', err));

/* =========================================
   Rotas
========================================= */

// Produtos (listagem, detalhes)
app.use('/produtos', produtosRoutes);

// Autenticação (login, cadastro, logout)
app.use('/auth', authRoutes);

// Pedidos (checkout, histórico, etc)
app.use('/orders', orderRoutes);

// Pagamentos (Mercado Pago, Pix, etc)
app.use('/payment', paymentRoutes);

// Frete (Correios)
app.use('/frete', freteRoutes);

// Usuários (favoritos, perfil, etc)
app.use('/users', userRoutes);

// Admin (gerenciar rastreios, pedidos, etc)
app.use('/admin', adminOrdersRoutes);

/* =========================================
   Rota de teste raiz
========================================= */
app.get('/', (req, res) => {
  res.send('Servidor da JF Semi Joias está rodando ✅');
});

/* =========================================
   Rota de compra simples (debug)
========================================= */
app.post('/comprar', (req, res) => {
  const { nomeProduto, precoProduto } = req.body;
  console.log(`Pedido recebido: ${nomeProduto} - R$ ${precoProduto}`);
  res.json({ mensagem: 'Pedido recebido com sucesso!', status: 'ok' });
});

/* =========================================
   Handler de erro CORS (deixa o 403 claro)
========================================= */
app.use((err, req, res, next) => {
  if (err && typeof err.message === 'string' && err.message.startsWith('Not allowed by CORS')) {
    return res.status(403).json({ error: 'CORS bloqueado', detail: err.message });
  }
  next(err);
});

/* =========================================
   Inicialização do Servidor
========================================= */
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log('🌐 Origens permitidas:', Array.from(allowed).join(' | '));

  // ✅ Inicia o job automático de verificação de entregas
  console.log('🕒 Agendando verificação automática de entregas...');
  setTimeout(atualizarStatusEntrega, 2 * 60 * 1000);        // primeira execução em 2 min
  setInterval(atualizarStatusEntrega, 6 * 60 * 60 * 1000);  // depois a cada 6h
});
