const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const isAdmin = require("../middleware/isAdmin");
const Order = require("../models/Order");
const enviarEmail = require("../utils/mailer");

router.post("/orders/:id/rastreio", auth, isAdmin, async (req, res) => {
  try {
    const { rastreio } = req.body;
    const pedido = await Order.findById(req.params.id).populate("usuario");

    if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });

    pedido.rastreio = rastreio;
    pedido.status = "enviado";
    pedido.dataEnvio = new Date();
    await pedido.save();

    const emailCliente = `
      <h2>📦 Seu pedido foi enviado!</h2>
      <p>Olá, ${pedido.usuario.nome}! Seu pedido foi postado. 📨</p>
      <p><b>Código de rastreio:</b> ${rastreio}</p>
      <p>Acompanhe pelos Correios: 
      <a href="https://rastreamento.correios.com.br/app/index.php">clique aqui</a></p>
    `;

    await enviarEmail(pedido.usuario.email, "Seu pedido foi enviado 💌", emailCliente);

    res.json({ sucesso: true, mensagem: "Rastreio cadastrado e cliente notificado." });
  } catch (error) {
    console.error("Erro ao cadastrar rastreio:", error);
    res.status(500).json({ erro: "Erro ao cadastrar rastreio." });
  }
});

module.exports = router;
