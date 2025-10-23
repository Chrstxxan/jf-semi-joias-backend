// backend/routes/payment.js
const express = require('express');
const mercadopago = require('mercadopago');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Produto = require('../models/Produto');
const User = require('../models/User');
const auth = require('../middleware/auth');
const enviarEmail = require('../utils/mailer');

const router = express.Router();

// ================================
// 🔧 CONFIGURAÇÃO DO SDK (PRODUÇÃO)
// ================================
const MP = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});
const preferenceClient = new mercadopago.Preference(MP);
const paymentClient = new mercadopago.Payment(MP);
const merchantOrderClient = new mercadopago.MerchantOrder(MP);

// ================================
// 💳 CRIAR PREFERÊNCIA DE PAGAMENTO
// (Cria o pedido ANTES de abrir o MP, e envia metadata.orderId)
// ================================
router.post('/mp/preference', auth, async (req, res) => {
  try {
    let { itens, enderecoEntrega, frete } = req.body;
    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: 'Itens inválidos' });
    }

    // Busca produtos e valida
    let subtotal = 0;
    const itensValidados = [];
    for (const i of itens) {
      const p = await Produto.findById(String(i.produtoId).trim());
      if (!p) return res.status(400).json({ erro: `Produto inválido: ${i.produtoId}` });

      const qnt = Number(i.quantidade || 1);
      subtotal += p.preco * qnt;

      itensValidados.push({
        produtoId: p._id,
        nome: p.nome,
        imagem: p.imagens?.[0] || '',
        preco: p.preco,
        quantidade: qnt
      });
    }

    // 🧪 Se for o produto de teste de R$1, zera o frete
    if (itensValidados.length === 1 && itensValidados[0].preco === 1) {
      frete = 0;
    }

    const total = subtotal + Number(frete || 0);

    // 📦 Cria pedido
    const order = await Order.create({
      usuario: req.user.id,
      produtos: itensValidados,
      subtotal,
      frete: Number(frete || 0),
      total,
      statusPagamento: 'pendente',
      status: 'pendente',
      enderecoEntrega, // 👈 já com nome e telefone
    });

    const frontOrigin =
      process.env.FRONT_ORIGIN?.trim().replace(/\/$/, '') || 'http://127.0.0.1:5500';

    // 🧾 Cria preferência no Mercado Pago
    const pref = await preferenceClient.create({
      body: {
        items: itensValidados.map(i => ({
          id: String(order._id),                // 👈 opcional, mas útil
          title: i.nome,
          quantity: i.quantidade,
          unit_price: i.preco,
          currency_id: 'BRL'
        })),
        back_urls: {
          success: `${frontOrigin}/index.html?pagamento=success`,
          failure: `${frontOrigin}/index.html?pagamento=failure`,
          pending: `${frontOrigin}/index.html?pagamento=pending`
        },
        auto_return: 'approved',
        metadata: { orderId: String(order._id) }, // 👈 usado no webhook
        notification_url: `${process.env.BASE_URL}/payment/mp/webhook`
      }
    });

    await Order.findByIdAndUpdate(order._id, { mpPreferenceId: pref.id });

    res.json({
      init_point: pref.init_point,
      preference_id: pref.id,
      mode: 'production'
    });
  } catch (e) {
    console.error('💥 Erro ao criar preferência:', e);
    res.status(500).json({ erro: 'Falha ao criar preferência de pagamento' });
  }
});

// ================================
// 📩 WEBHOOK
// Mapeia status do MP -> PT-BR e atualiza o pedido
// ================================
router.post('/mp/webhook', async (req, res) => {
  console.log('📩 Webhook recebido:', JSON.stringify(req.body, null, 2));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { topic, type, data, resource } = req.body;
    let paymentId = null;

    // Detecta formato da notificação
    if (data?.id) {
      paymentId = data.id;
    } else if (typeof resource === 'string' && resource.includes('/payments/')) {
      paymentId = resource.split('/payments/')[1];
    } else if (typeof resource === 'string' && /^[0-9]+$/.test(resource)) {
      paymentId = resource;
    }

    // 🧩 Caso venha como merchant_order
    if (!paymentId && (topic === 'merchant_order' || type === 'merchant_order')) {
      const orderIdMatch = resource?.match(/merchant_orders\/(\d+)/);
      const merchantOrderId = orderIdMatch ? orderIdMatch[1] : null;

      if (merchantOrderId) {
        console.log(`🔍 Buscando merchant_order ${merchantOrderId}...`);
        const merchantOrder = await merchantOrderClient.get({ merchantOrderId });
        if (merchantOrder.body.payments?.length) {
          paymentId = merchantOrder.body.payments[0].id;
          console.log(`✅ Pagamento encontrado dentro da merchant_order: ${paymentId}`);
        } else {
          console.warn(`⚠️ Nenhum pagamento vinculado à merchant_order ${merchantOrderId}`);
        }
      }
    }

    if (!paymentId) {
      console.warn('⚠️ Webhook recebido sem ID válido:', req.body);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    console.log(`🔎 Buscando informações do pagamento ${paymentId}...`);
    const payment = await paymentClient.get({ id: paymentId });

    if (!payment.body) {
      console.warn(`⚠️ Resposta vazia do MP para o pagamento ${paymentId}`);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    const mpStatus = payment.body.status;
    const orderId = payment.body.metadata?.orderId;

    if (!orderId) {
      console.warn(`⚠️ Pagamento ${paymentId} sem metadata.orderId`);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    const order = await Order.findById(orderId).populate('usuario').session(session);
    if (!order) {
      console.warn(`⚠️ Pedido ${orderId} não encontrado`);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    // 🎯 Mapeia status para PT-BR
    const statusPagamento =
      mpStatus === 'approved'
        ? 'pago'
        : mpStatus === 'rejected'
        ? 'rejeitado'
        : 'pendente';

    order.statusPagamento = statusPagamento;
    // Convenção: status do pedido segue statusPagamento (pode ser ajustado depois)
    order.status = statusPagamento === 'pago' ? 'pago' : order.status;

    await order.save({ session });

    if (statusPagamento === 'pago') {
      // 🔻 Decrementa estoque
      for (const item of order.produtos) {
        const produto = await require('../models/Produto').findById(item.produtoId).session(session);
        if (produto) {
          produto.estoque = Math.max(0, (produto.estoque || 0) - item.quantidade);
          await produto.save({ session });
        }
      }

      // 📧 E-mails (cliente + admin)
      const cliente = order.usuario;
      const endereco = order.enderecoEntrega;
      const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || 'admin@jfsemijoias.com';

      const resumoProdutos = order.produtos
        .map(
          p => `<li>${p.nome} (x${p.quantidade}) — R$ ${(p.preco * p.quantidade).toFixed(2)}</li>`
        )
        .join('');

      const emailCliente = `
        <h2>💖 Pedido confirmado!</h2>
        <p>Olá, ${cliente.nome}! Seu pedido foi confirmado e logo será enviado.</p>
        <ul>${resumoProdutos}</ul>
        <p><b>Total:</b> R$ ${order.total.toFixed(2)}</p>
        <p><b>Endereço:</b> ${endereco.rua}, ${endereco.numero} - ${endereco.cidade}/${endereco.uf}</p>
      `;

      const emailAdmin = `
        <h2>🛍️ Novo pedido pago!</h2>
        <p><b>Cliente:</b> ${cliente.nome} (${cliente.email})</p>
        <p><b>Valor total:</b> R$ ${order.total.toFixed(2)}</p>
        <p><b>Data:</b> ${new Date(order.criadoEm).toLocaleString('pt-BR')}</p>
        <h3>Endereço:</h3>
        <p>${endereco.rua}, ${endereco.numero} - ${endereco.cidade}/${endereco.uf} (${endereco.cep})</p>
        <h3>Itens:</h3>
        <ul>${resumoProdutos}</ul>
        <p>📦 Pedido ID: ${order._id}</p>
      `;

      try {
        await enviarEmail(cliente.email, "Confirmação do seu pedido ✨", emailCliente);
        await enviarEmail(adminEmail, "Novo pedido confirmado 🛍️", emailAdmin);
      } catch (mailErr) {
        console.warn('⚠️ Falha ao enviar e-mails:', mailErr.message);
      }
    }

    await session.commitTransaction();
    session.endSession();
    res.sendStatus(200);
  } catch (e) {
    console.error('💥 Erro no webhook (rollback ativado):', e);
    await session.abortTransaction();
    session.endSession();
    res.sendStatus(200);
  }
});

module.exports = router;
