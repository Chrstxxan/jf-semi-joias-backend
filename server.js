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

// 🕒 Importa o job de atualização automática de entregas
const atualizarStatusEntrega = require('./jobs/atualizarStatusEntrega');

const app = express();
const PORT = process.env.PORT || 5000;

// ================================
// Configuração de Middlewares
// ================================
app.use(
  cors({
    origin: process.env.FRONT_ORIGIN || 'http://127.0.0.1:5500',
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// ================================
// Conexão com MongoDB
// ================================
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB conectado ✅'))
  .catch((err) => console.error('Erro MongoDB:', err));

// ================================
// Rotas
// ================================

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

// ================================
// Rota de teste raiz
// ================================
app.get('/', (req, res) => {
  res.send('Servidor da JF Semi Joias está rodando ✅');
});

// ================================
// Rota de compra simples (debug)
// ================================
app.post('/comprar', (req, res) => {
  const { nomeProduto, precoProduto } = req.body;
  console.log(`Pedido recebido: ${nomeProduto} - R$ ${precoProduto}`);
  res.json({ mensagem: 'Pedido recebido com sucesso!', status: 'ok' });
});

// ================================
// Inicialização do Servidor
// ================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);

  // ✅ Inicia o job automático de verificação de entregas
  console.log('🕒 Agendando verificação automática de entregas...');
  
  // Primeira execução 2 minutos após iniciar
  setTimeout(atualizarStatusEntrega, 2 * 60 * 1000);
  
  // Depois, executa a cada 6 horas (1000 * 60 * 60 * 6)
  setInterval(atualizarStatusEntrega, 6 * 60 * 60 * 1000);
});
