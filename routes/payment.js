// backend/routes/payment.js
const express = require("express");
const mercadopago = require("mercadopago");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Produto = require("../models/Produto");
const User = require("../models/User");
const auth = require("../middleware/auth");
const enviarEmail = require("../utils/mailer");

const router = express.Router();

// ================================
// 🔧 CONFIGURAÇÃO DO SDK (PRODUÇÃO)
// ================================
const MP = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});
const preferenceClient = new mercadopago.Preference(MP);
const paymentClient = new mercadopago.Payment(MP);
const merchantOrderClient = new mercadopago.MerchantOrder(MP);

// ================================
// 💳 CRIAR PREFERÊNCIA DE PAGAMENTO
// ================================
router.post("/mp/preference", auth, async (req, res) => {
  try {
    let { itens, enderecoEntrega, frete } = req.body;
    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: "Itens inválidos" });
    }

    // Valida produtos e calcula subtotal
    let subtotal = 0;
    const itensValidados = [];
    for (const i of itens) {
      const p = await Produto.findById(String(i.produtoId).trim());
      if (!p)
        return res.status(400).json({ erro: `Produto inválido: ${i.produtoId}` });

      const qnt = Number(i.quantidade || 1);
      subtotal += p.preco * qnt;

      itensValidados.push({
        produtoId: p._id,
        nome: p.nome,
        imagem: p.imagens?.[0] || "",
        preco: p.preco,
        quantidade: qnt,
      });
    }

    // 🧪 Produto de teste (R$1) = sem frete
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
      statusPagamento: "pendente",
      status: "pendente",
      enderecoEntrega,
    });

    const frontOrigin =
      process.env.FRONT_ORIGIN?.trim().replace(/\/$/, "") ||
      "http://127.0.0.1:5500";

    // 🧾 Cria preferência
    const pref = await preferenceClient.create({
      body: {
        items: itensValidados.map((i) => ({
          id: String(order._id),
          title: i.nome,
          quantity: i.quantidade,
          unit_price: i.preco,
          currency_id: "BRL",
        })),
        back_urls: {
          success: `${frontOrigin}/index.html?pagamento=success`,
          failure: `${frontOrigin}/index.html?pagamento=failure`,
          pending: `${frontOrigin}/index.html?pagamento=pending`,
        },
        auto_return: "approved",
        metadata: {
          order_id: String(order._id),
          user_id: String(req.user.id),
          generated_at: new Date().toISOString(),
        },
        external_reference: String(order._id),
        notification_url: `${process.env.BASE_URL}/payment/mp/webhook`,
      },
    });

    await Order.findByIdAndUpdate(order._id, { mpPreferenceId: pref.id });

    res.json({
      init_point: pref.init_point,
      preference_id: pref.id,
      mode: "production",
    });
  } catch (e) {
    console.error("💥 Erro ao criar preferência:", e);
    res.status(500).json({ erro: "Falha ao criar preferência de pagamento" });
  }
});

// ================================
// 📩 WEBHOOK MERCADO PAGO
// ================================
router.post("/mp/webhook", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("📩 Webhook recebido:", JSON.stringify(req.body, null, 2));

    let pagamentoId = null;
    let orderId = null;

    const { data, resource, topic } = req.body;

    // Detecta ID do pagamento
    if (data?.id) {
      pagamentoId = data.id;
    } else if (resource && resource.includes("payments")) {
      pagamentoId = resource.split("/").pop();
    } else if (resource && resource.includes("merchant_orders")) {
      const merchantId = resource.split("/").pop();
      console.log(`🔍 Buscando merchant_order ${merchantId}...`);
      try {
        const merchant = await merchantOrderClient.get({ merchantOrderId: merchantId });
        const payments = merchant.body?.payments || [];
        const firstPayment =
          payments.find((p) => p.status === "approved") || payments[0];
        if (firstPayment) {
          pagamentoId = firstPayment.id;
          console.log(`✅ Pagamento encontrado na merchant_order: ${pagamentoId}`);
        } else {
          console.warn(`⚠️ Nenhum pagamento vinculado à merchant_order ${merchantId}`);
        }
      } catch (err) {
        console.warn(`⚠️ Falha ao buscar merchant_order ${merchantId}:`, err.message);
      }
    }

    if (!pagamentoId) {
      console.warn("⚠️ Webhook sem ID de pagamento válido:", req.body);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    console.log(`🔎 Buscando informações do pagamento ${pagamentoId}...`);

    let paymentData = null;
    try {
      const payment = await paymentClient.get({ id: pagamentoId });
      paymentData = payment?.body;
    } catch (err) {
      console.warn(`⚠️ Erro ao buscar pagamento ${pagamentoId}:`, err.message);
    }

    // Retry caso a resposta venha vazia (MP delay)
    if (!paymentData || Object.keys(paymentData).length === 0) {
      console.warn(`⚠️ Resposta vazia do MP para ${pagamentoId}, tentando novamente em 5s...`);
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const retryPayment = await paymentClient.get({ id: pagamentoId });
        paymentData = retryPayment?.body;
      } catch (err) {
        console.warn(`⚠️ Ainda vazio após retry: ${err.message}`);
      }
    }

    // Fallback: busca por merchant_order
    if (!paymentData) {
      try {
        const merchantOrders = await merchantOrderClient.search({
          qs: { external_reference: pagamentoId },
        });
        const mo = merchantOrders?.body?.elements?.[0];
        const firstPayment = mo?.payments?.[0];
        if (firstPayment) {
          paymentData = firstPayment;
          console.log(`✅ Fallback bem-sucedido via merchant_order`);
        }
      } catch (err) {
        console.warn(`⚠️ Fallback falhou:`, err.message);
      }
    }

    if (!paymentData) {
      console.warn(`⚠️ Nenhum dado de pagamento encontrado (${pagamentoId}). Delay provável.`);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    // Captura orderId por diferentes fontes
    orderId =
      paymentData.metadata?.order_id ||
      paymentData.metadata?.orderId ||
      paymentData.external_reference;

    if (!orderId) {
      console.warn("⚠️ Pagamento sem referência de pedido:", paymentData.id);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    const mpStatus = paymentData.status;

    const order = await Order.findById(orderId).populate("usuario").session(session);
    if (!order) {
      console.warn(`⚠️ Pedido ${orderId} não encontrado no banco`);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    const statusPagamento =
      mpStatus === "approved"
        ? "pago"
        : mpStatus === "rejected"
        ? "rejeitado"
        : "pendente";

    order.statusPagamento = statusPagamento;
    order.status = statusPagamento === "pago" ? "pago" : order.status;
    await order.save({ session });

    if (statusPagamento === "pago") {
      // 🔻 Atualiza estoque
      for (const item of order.produtos) {
        const produto = await Produto.findById(item.produtoId).session(session);
        if (produto) {
          produto.estoque = Math.max(0, (produto.estoque || 0) - item.quantidade);
          await produto.save({ session });
        }
      }

      // 📧 E-mails
      const cliente = order.usuario;
      const endereco = order.enderecoEntrega;
      const adminEmail =
        process.env.ADMIN_EMAIL ||
        process.env.EMAIL_FROM ||
        "admin@jfsemijoias.com";

      const resumoProdutos = order.produtos
        .map(
          (p) =>
            `<li>${p.nome} (x${p.quantidade}) — R$ ${(p.preco * p.quantidade).toFixed(
              2
            )}</li>`
        )
        .join("");

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
        <p><b>Data:</b> ${new Date(order.criadoEm).toLocaleString("pt-BR")}</p>
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
        console.warn("⚠️ Falha ao enviar e-mails:", mailErr.message);
      }
    }

    await session.commitTransaction();
    session.endSession();
    console.log(`✅ Pedido ${orderId} atualizado: ${statusPagamento}`);
    res.sendStatus(200);
  } catch (e) {
    console.error("💥 Erro no webhook (rollback ativado):", e);
    await session.abortTransaction();
    session.endSession();
    res.sendStatus(200);
  }
});

module.exports = router;
