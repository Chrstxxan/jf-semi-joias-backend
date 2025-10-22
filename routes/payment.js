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

// ================================
// 💳 CRIAR PREFERÊNCIA DE PAGAMENTO
// ================================

router.post('/mp/preference', auth, async (req, res) => {
  try {
    // ⚠️ usa "let" pra poder sobrescrever o frete se for teste
    let { itens, enderecoEntrega, frete } = req.body;
    console.log("📥 Body recebido do front:", req.body);
    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: 'Itens inválidos' });
    }

    console.log('🛒 Itens recebidos no pagamento:', itens);

    let subtotal = 0;
    const itensValidados = [];

    for (const i of itens) {
      const p = await Produto.findById(i.produtoId.trim());
      if (!p) return res.status(400).json({ erro: `Produto inválido: ${i.produtoId}` });

      subtotal += p.preco * (i.quantidade || 1);

      itensValidados.push({
        produtoId: p._id,
        nome: p.nome,
        imagem: p.imagens?.[0] || '',
        preco: p.preco,
        quantidade: i.quantidade || 1
      });
    }

    // 🧪 Se o produto de teste for aquele de R$1, zera o frete
    if (itensValidados.length === 1 && itensValidados[0].preco === 1) {
      console.log('🧪 Teste detectado — frete zerado automaticamente');
      frete = 0;
    }

    const total = subtotal + Number(frete || 0);
    console.log(`💰 Subtotal: ${subtotal}, Frete: ${frete}, Total: ${total}`);

    // 📦 Cria pedido no banco antes de gerar preferência MP
    const order = await Order.create({
      usuario: req.user.id,
      produtos: itensValidados,
      subtotal,
      frete: frete || 0,
      total,
      statusPagamento: 'pending',
      enderecoEntrega
    });

    console.log(`📦 Pedido criado (${order._id}) — Total: R$${total}`);

    const frontOrigin =
      process.env.FRONT_ORIGIN?.trim().replace(/\/$/, '') || 'http://127.0.0.1:5500';

    // 🧾 Cria preferência no Mercado Pago
    const pref = await preferenceClient.create({
      body: {
        items: itensValidados.map(i => ({
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
        metadata: { orderId: String(order._id) },
        notification_url: `${process.env.BASE_URL}/payment/mp/webhook`
      }
    });

    const checkoutUrl = pref.init_point;
    console.log(`✅ Preferência criada (PRODUÇÃO) — ${pref.id}`);

    await Order.findByIdAndUpdate(order._id, { mpPreferenceId: pref.id });

    res.json({
      init_point: checkoutUrl,
      preference_id: pref.id,
      mode: 'production'
    });
  } catch (e) {
    console.error('💥 Erro ao criar preferência:', e);
    res.status(500).json({ erro: 'Falha ao criar preferência de pagamento' });
  }
});

// ================================
// 📩 WEBHOOK COM TRANSAÇÃO ATÔMICA + E-MAILS
// ================================
router.post('/mp/webhook', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('📩 Webhook recebido:', req.body);
    const { data } = req.body;
    if (!data?.id) {
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    const paymentClient = new mercadopago.Payment(MP);
    const payment = await paymentClient.get({ id: data.id });
    const status = payment.body.status;
    const orderId = payment.body.metadata?.orderId;

    if (!orderId) {
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

    order.statusPagamento = status;
    order.status = status === 'approved' ? 'pago' : 'pendente';
    await order.save({ session });

    // Só processa o resto se o pagamento for aprovado
    if (status === 'approved') {
      console.log(`💰 Pagamento aprovado para pedido ${orderId}`);

      // 🔻 Decrementa estoque (dentro da transação)
      for (const item of order.produtos) {
        const produto = await Produto.findById(item.produtoId).session(session);
        if (produto) {
          produto.estoque = Math.max(0, (produto.estoque || 0) - item.quantidade);
          await produto.save({ session });
        }
      }

      // 📧 E-mails (cliente + admin)
      const cliente = order.usuario;
      const endereco = order.enderecoEntrega;
      const adminEmail =
        process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || 'admin@jfsemijoias.com';

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
        <p><a href="${process.env.FRONT_ORIGIN}/admin-rastreio.html">Gerenciar rastreio</a></p>
      `;

      await enviarEmail(cliente.email, "Confirmação do seu pedido ✨", emailCliente);
      await enviarEmail(adminEmail, "Novo pedido confirmado 🛍️", emailAdmin);

      console.log(`📨 E-mails enviados para ${cliente.email} e ${adminEmail}.`);
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
