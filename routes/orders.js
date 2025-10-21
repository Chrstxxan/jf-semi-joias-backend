const express = require('express');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin'); // middleware de admin
const router = express.Router();

// ================================
// 📦 Criar um novo pedido (manual ou teste)
// ================================
router.post('/', auth, async (req, res) => {
  try {
    const { produtos, total, frete = 0, enderecoEntrega } = req.body;

    const order = new Order({
      usuario: req.user.id,
      produtos,
      subtotal: total - frete,
      frete,
      total,
      enderecoEntrega,
      status: 'pendente',
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
// 🧠 (Opcional) Listar todos os pedidos — apenas para Admin
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
// ================================
router.put('/:id/status', auth, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const pedido = await Order.findById(req.params.id);

    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

    pedido.status = status;
    await pedido.save();

    res.json({ mensagem: 'Status atualizado com sucesso!', pedido });
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({ erro: 'Erro ao atualizar status do pedido' });
  }
});

module.exports = router;
