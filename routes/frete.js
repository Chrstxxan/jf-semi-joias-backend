const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { cepDestino } = req.body;

    if (!cepDestino || cepDestino.length < 8) {
      return res.status(400).json({ erro: "CEP de destino inválido" });
    }

    const payload = {
      sCepOrigem: "01001000", // CEP da loja
      sCepDestino: cepDestino,
      nVlPeso: "1",
      nCdFormato: "1",
      nVlComprimento: "20",
      nVlAltura: "10",
      nVlLargura: "15",
      nCdServico: "04014", // SEDEX
      nVlDiametro: "0",
    };

    console.log("🧾 Calculando frete para:", cepDestino);

    // 🔹 1️⃣ Tenta via API moderna (proxy REST)
    const resp = await fetch("https://api-frete-v2.correios.app.br/calcular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let resultado;
    try {
      resultado = await resp.json();
    } catch (err) {
      console.warn("⚠️ Falha ao converter resposta da API:", err);
    }

    if (resultado && resultado.Valor) {
      const prazoCorreios = parseInt(resultado.PrazoEntrega) || 0;
      const prazoMedio = prazoCorreios + 5;
      const prazoMaximo = prazoCorreios + 10;

      return res.json({
        Codigo: resultado.Codigo || "04014",
        Valor: resultado.Valor,
        PrazoCorreios: prazoCorreios,
        PrazoMedio: prazoMedio,
        PrazoMaximo: prazoMaximo,
        MsgErro: resultado.MsgErro || "",
      });
    }

    // 🔹 2️⃣ Se a API falhar → fallback
    console.warn("⚠️ API de frete falhou, usando simulação local.");
    return res.json({
      Codigo: "04014",
      Valor: "24,90",
      PrazoCorreios: 4,
      PrazoMedio: 9, // 4 + 5
      PrazoMaximo: 14, // 4 + 10
      MsgErro: "Simulado (API fallback)",
    });
  } catch (error) {
    console.error("💥 Erro geral no cálculo de frete:", error.message || error);
    return res.json({
      Codigo: "04014",
      Valor: "24,90",
      PrazoCorreios: 4,
      PrazoMedio: 9,
      PrazoMaximo: 14,
      MsgErro: "Erro geral — usando simulação local",
    });
  }
});

module.exports = router;
