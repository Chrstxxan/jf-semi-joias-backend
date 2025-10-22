const express = require('express');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const router = express.Router();

// ================================
// 📦 Criar um novo pedido (uso genérico/teste)
// OBS: agora o fluxo recomendado é criar pedido via /payment/mp/preference,
// que já cria o pedido com base no carrinho.
// Mantemos essa rota para compatibilidade.
// ================================
router.post('/', auth, async (req, res) => {
  try {
    const { produtos, total, frete = 0, enderecoEntrega } = req.body;

    const order = new Order({
      usuario: req.user.id,
      produtos,
      subtotal: Number(total) - Number(frete || 0),
      frete: Number(frete || 0),
      total: Number(total),
      enderecoEntrega,
      status: 'pendente',
      statusPagamento: 'pendente',
    });

    await order.save();
    res.status(201).json({ mensagem: 'Pedido criado com sucesso!', order });
  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    res.status(500).json({ erro: 'Erro interno ao criar pedido' });
  }
});

// ================================
// 🧾 Listar pedidos do usuário logado
// ================================
router.get('/', auth, async (req, res) => {
  try {
    const pedidos = await Order.find({ usuario: req.user.id })
      .sort({ criadoEm: -1 })
      .populate('usuario', 'nome email');

    res.json(pedidos);
  } catch (error) {
    console.error('Erro ao buscar pedidos:', error);
    res.status(500).json({ erro: 'Erro ao buscar pedidos' });
  }
});

// ================================
// 🧠 Listar todos os pedidos — Admin
// ================================
router.get('/all', auth, isAdmin, async (req, res) => {
  try {
    const pedidos = await Order.find()
      .populate('usuario', 'nome email')
      .sort({ criadoEm: -1 });

    res.json(pedidos);
  } catch (error) {
    console.error('Erro ao listar pedidos (admin):', error);
    res.status(500).json({ erro: 'Erro ao listar pedidos' });
  }
});

// ================================
// 🚚 Atualizar status do pedido (Admin)
// Compatível com seu front: POST /orders/:id/status
// ================================
router.post('/:id/status', auth, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const pedido = await Order.findById(req.params.id);

    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

    // status permitido: pendente, pago, enviado, entregue, cancelado
    pedido.status = status;
    await pedido.save();

    res.json({ mensagem: 'Status atualizado com sucesso!', pedido });
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({ erro: 'Erro ao atualizar status do pedido' });
  }
});

// ================================
// ✉️ Atualizar rastreio (Admin)
// Compatível com seu front: POST /orders/:id/rastreio
// ================================
router.post('/:id/rastreio', auth, isAdmin, async (req, res) => {
  try {
    const { rastreio } = req.body;
    const pedido = await Order.findById(req.params.id);

    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

    pedido.rastreio = rastreio;
    if (!pedido.dataEnvio) pedido.dataEnvio = new Date();
    await pedido.save();

    res.json({ mensagem: 'Rastreio atualizado com sucesso!', pedido });
  } catch (error) {
    console.error('Erro ao atualizar rastreio:', error);
    res.status(500).json({ erro: 'Erro ao atualizar rastreio' });
  }
});

module.exports = router;
