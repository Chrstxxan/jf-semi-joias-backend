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

    console.log("🧾 Calculando frete via correiosapi.app.br para:", cepDestino);

    const payload = {
      sCepOrigem: "05659000", // CEP da loja (ajusta pro teu)
      sCepDestino: cepDestino,
      nVlPeso: "1",
      nCdFormato: "1",
      nVlComprimento: "20",
      nVlAltura: "10",
      nVlLargura: "15",
      nCdServico: "04014", // SEDEX
      nVlDiametro: "0",
    };

    let resultado;
    try {
      const response = await fetch("https://correiosapi.app.br/api/frete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
      resultado = await response.json();
      console.log("📦 Resultado API Correios:", resultado);
    } catch (apiErr) {
      console.warn("⚠️ Falha ao chamar API Correios:", apiErr.message);
      resultado = null;
    }

    // Se a API falhar, usa fallback
    if (!resultado || !resultado[0] || !resultado[0].Valor) {
      console.warn("⚠️ Retorno inválido. Usando frete simulado.");
      return res.json({
        Codigo: "04014",
        Valor: "24,90",
        PrazoCorreios: 4,
        PrazoMedio: 9,
        PrazoMaximo: 14,
        MsgErro: "Erro geral — usando simulação local",
      });
    }

    const frete = resultado[0];
    const prazoCorreios = Number(frete.PrazoEntrega || 0);
    const prazoMedio = prazoCorreios + 5;
    const prazoMaximo = prazoCorreios + 10;

    res.json({
      Codigo: frete.Codigo,
      Valor: frete.Valor,
      PrazoCorreios: prazoCorreios,
      PrazoMedio: prazoMedio,
      PrazoMaximo: prazoMaximo,
      MsgErro: frete.MsgErro || "",
    });
  } catch (error) {
    console.error("💥 Erro ao calcular frete:", error.message);
    res.json({
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
