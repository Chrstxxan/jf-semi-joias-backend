// backend/routes/frete.js
const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { cepDestino } = req.body;

    if (!cepDestino || cepDestino.length < 8) {
      return res.status(400).json({ erro: "CEP de destino inválido" });
    }

    console.log("🧾 Calculando frete via Melhor Envio para:", cepDestino);

    const resposta = await fetch("https://www.melhorenvio.com.br/api/v2/me/shipment/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        from: { postal_code: "01001000" }, // CEP da loja
        to: { postal_code: cepDestino },
        products: [
          {
            id: "1",
            width: 15,
            height: 10,
            length: 20,
            weight: 0.3,
            insurance_value: 50,
            quantity: 1,
          },
        ],
        options: {
          own_hand: false,
          receipt: false,
          collect: false,
        },
        services: "2", // SEDEX
      }),
    });

    const data = await resposta.json();
    console.log("📦 Retorno Melhor Envio:", data);

    // Corrige: pode vir como array ou como objeto único
    const servico = Array.isArray(data)
      ? data.find((s) => s.name?.toLowerCase().includes("sedex"))
      : data.name?.toLowerCase().includes("sedex")
      ? data
      : null;

    if (!servico || servico.error) {
      console.warn("⚠️ Nenhum serviço SEDEX disponível ou erro na resposta:", servico);
      return res.json({
        Codigo: "04014",
        Valor: "24,90",
        PrazoEntrega: 4,
        PrazoMedio: 9,
        PrazoMaximo: 14,
        MsgErro: "Erro geral — usando simulação local",
      });
    }

    const prazoCorreios = Number(servico.delivery_time) || 0;

    res.json({
      Codigo: "04014",
      Valor: Number(servico.price || 0).toFixed(2),
      PrazoEntrega: prazoCorreios,
      PrazoMedio: prazoCorreios + 5,
      PrazoMaximo: prazoCorreios + 10,
      MsgErro: null,
    });
  } catch (error) {
    console.error("💥 Erro ao calcular frete (Melhor Envio):", error.message || error);
    res.json({
      Codigo: "04014",
      Valor: "24,90",
      PrazoEntrega: 4,
      PrazoMedio: 9,
      PrazoMaximo: 14,
      MsgErro: "Erro geral — usando simulação local",
    });
  }
});

module.exports = router;
