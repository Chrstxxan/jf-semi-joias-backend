// backend/routes/payment.js
const express = require("express");
const mongoose = require("mongoose");
const fetch = require("node-fetch");
const Order = require("../models/Order");
const Produto = require("../models/Produto");
const User = require("../models/User");
const auth = require("../middleware/auth");
const enviarEmail = require("../utils/mailer");

const router = express.Router();

// ============ Utils ============
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function mpFetch(path, options = {}) {
  const url = `https://api.mercadopago.com${path}`;
  const resp = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      "User-Agent": "JF-SemiJoias-Server/1.0",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, body: json };
}

// ================================
// 💳 CRIAR PREFERÊNCIA DE PAGAMENTO
// ================================
router.post("/mp/preference", auth, async (req, res) => {
  try {
    const { itens, enderecoEntrega, frete } = req.body;
    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: "Itens inválidos" });
    }

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
        imagem: p.imagens?.[0] || "",
        preco: p.preco,
        quantidade: qnt,
        tamanho: i.tamanho || null,
      });
    }

    // ✅ Calcula frete e total
    const freteFinal =
      itensValidados.length === 1 && itensValidados[0].preco === 1 ? 0 : Number(frete || 0);
    const total = subtotal + freteFinal;

    // ✅ Cria pedido no banco
    const order = await Order.create({
      usuario: req.user.id,
      produtos: itensValidados,
      subtotal,
      frete: freteFinal,
      total,
      statusPagamento: "pendente",
      status: "pendente",
      enderecoEntrega,
    });

    // ✅ Origem segura (sem barra final)
    const rawFront = (process.env.FRONT_ORIGIN || "https://jfsemijoias.com").trim();
    const frontOrigin = rawFront.replace(/\/$/, "");

    // ✅ Cria preferência Mercado Pago
    const prefBody = {
      items: [
        ...itensValidados.map((i) => ({
          id: String(order._id),
          title: `${i.nome}${i.tamanho ? ` (Tamanho ${i.tamanho})` : ""}`,
          quantity: i.quantidade,
          unit_price: i.preco,
          currency_id: "BRL",
        })),
        ...(freteFinal > 0
          ? [
              {
                id: `frete-${order._id}`,
                title: "Frete",
                quantity: 1,
                unit_price: freteFinal,
                currency_id: "BRL",
              },
            ]
          : []),
      ],
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
    };

    const pref = await mpFetch("/checkout/preferences", { method: "POST", body: prefBody });
    if (!pref.ok) {
      console.error("💥 Erro MP:", pref.body);
      throw new Error(pref.body?.message || "Falha ao criar preferência");
    }

    await Order.findByIdAndUpdate(order._id, { mpPreferenceId: pref.body.id });

    res.json({
      init_point: pref.body.init_point,
      preference_id: pref.body.id,
      mode: "production",
    });
  } catch (e) {
    console.error("💥 Erro ao criar preferência:", e);
    res.status(500).json({ erro: "Falha ao criar preferência de pagamento" });
  }
});

// ================================
// 📩 WEBHOOK MERCADO PAGO (INALTERADO)
// ================================
router.post("/mp/webhook", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("📩 Webhook recebido:", JSON.stringify(req.body, null, 2));

    const { data, resource } = req.body;
    let pagamentoId =
      data?.id || (resource?.includes("payments") ? resource.split("/").pop() : null);

    if (!pagamentoId) {
      console.warn("⚠️ Webhook sem ID válido:", req.body);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    console.log(`🔎 Buscando pagamento ${pagamentoId}...`);
    let got = await mpFetch(`/v1/payments/${pagamentoId}`);
    if (!got.ok || !got.body?.id) {
      console.warn(`⚠️ Pagamento vazio, retry 5s...`);
      await wait(5000);
      got = await mpFetch(`/v1/payments/${pagamentoId}`);
    }

    if (!got.ok || !got.body?.id) {
      console.warn(`⚠️ Nenhum dado de pagamento encontrado (${pagamentoId})`);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    const paymentData = got.body;
    const orderId =
      paymentData.metadata?.order_id ||
      paymentData.metadata?.orderId ||
      paymentData.external_reference;
    if (!orderId) {
      console.warn("⚠️ Pagamento sem referência de pedido:", pagamentoId);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    const mpStatus = paymentData.status;
    console.log(`💳 Status do pagamento ${pagamentoId}: ${mpStatus}`);

    const order = await Order.findById(orderId).populate("usuario").session(session);
    if (!order) {
      console.warn(`⚠️ Pedido ${orderId} não encontrado`);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    if (order.lastPaymentId === String(pagamentoId) && order.statusPagamento === "pago") {
      console.log(`ℹ️ Pagamento ${pagamentoId} já processado`);
      await session.abortTransaction();
      session.endSession();
      return res.sendStatus(200);
    }

    const statusPagamento =
      mpStatus === "approved" ? "pago" : mpStatus === "rejeitado" ? "rejeitado" : "pendente";

    order.statusPagamento = statusPagamento;
    order.status = statusPagamento === "pago" ? "pago" : order.status;
    order.lastPaymentId = String(pagamentoId);
    await order.save({ session });

    if (statusPagamento === "pago") {
      for (const item of order.produtos) {
        const produto = await Produto.findById(item.produtoId).session(session);
        if (produto) {
          produto.estoque = Math.max(0, (produto.estoque || 0) - item.quantidade);
          await produto.save({ session });
        }
      }
    }

    await session.commitTransaction();
    session.endSession();

    // ✉️ E-mails
    try {
      if (statusPagamento === "pago") {
        console.log("🧩 Enviando e-mails pós-pagamento...");
        const cliente = order.usuario || {};
        const endereco = order.enderecoEntrega || {};
        const adminEmail =
          process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || "admin@jfsemijoias.com";

        const resumoProdutos = (order.produtos || [])
          .map(
            (p) =>
              `<li>${p.nome || "Produto"}${p.tamanho ? ` (Tamanho ${p.tamanho})` : ""} (x${p.quantidade || 0}) — R$ ${(
                (p.preco || 0) * (p.quantidade || 0)
              ).toFixed(2)}</li>`
          )
          .join("");

        const emailCliente = `
          <h2>💖 Pedido confirmado!</h2>
          <p>Olá, ${cliente.nome || "cliente"}! Seu pedido foi confirmado e logo será enviado.</p>
          <ul>${resumoProdutos}</ul>
          <p><b>Total:</b> R$ ${Number(order.total || 0).toFixed(2)}</p>
          <p><b>Endereço:</b> ${[
            endereco.rua,
            endereco.numero,
            `${endereco.cidade}/${endereco.uf}`,
            endereco.cep ? `(${endereco.cep})` : "",
          ]
            .filter(Boolean)
            .join(", ")}</p>
        `;

        const emailAdmin = `
          <h2>🛍️ Novo pedido pago!</h2>
          <p><b>Cliente:</b> ${cliente.nome || "N/A"} (${cliente.email || "sem e-mail"})</p>
          <p><b>Valor total:</b> R$ ${Number(order.total || 0).toFixed(2)}</p>
          <p><b>Data:</b> ${new Date(order.criadoEm).toLocaleString("pt-BR")}</p>
          <h3>Itens:</h3>
          <ul>${resumoProdutos}</ul>
          <p>📦 Pedido ID: ${order._id}</p>
        `;

        try {
          if (cliente.email) {
            await enviarEmail(cliente.email, "Confirmação do seu pedido ✨", emailCliente);
            console.log(`📨 E-mail enviado ao cliente: ${cliente.email}`);
          }
        } catch (e1) {
          console.warn("❌ Erro ao enviar e-mail ao cliente:", e1.message);
        }

        try {
          await enviarEmail(adminEmail, "Novo pedido confirmado 🛍️", emailAdmin);
          console.log(`📨 E-mail enviado ao admin: ${adminEmail}`);
        } catch (e2) {
          console.warn("❌ Erro ao enviar e-mail ao admin:", e2.message);
        }

        console.log("✅ E-mails enviados (ou ignorados). Pedido finalizado.");
      }
    } catch (mailErr) {
      console.warn("⚠️ Falha geral no bloco de e-mail:", mailErr.message);
    }

    console.log(`✅ Pedido ${order._id} atualizado para: ${statusPagamento}`);
    return res.sendStatus(200);
  } catch (e) {
    console.error("💥 Erro no webhook (rollback ativado):", e);
    await session.abortTransaction();
    session.endSession();
    res.sendStatus(200);
  }
});

module.exports = router;
