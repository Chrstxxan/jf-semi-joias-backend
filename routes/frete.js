const express = require("express");
const { calcularPrecoPrazo } = require("correios-brasil");
const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { cepDestino } = req.body;

    if (!cepDestino || cepDestino.length < 8) {
      return res.status(400).json({ erro: "CEP de destino inválido" });
    }

    const args = {
      sCepOrigem: "01001000", // CEP da loja (pode alterar pro seu)
      sCepDestino: cepDestino,
      nVlPeso: "1",
      nCdFormato: "1",
      nVlComprimento: "20",
      nVlAltura: "10",
      nVlLargura: "15",
      nCdServico: "04014", // SEDEX — precisa ser string!
      nVlDiametro: "0",
    };

    console.log("🧾 Calculando frete para:", cepDestino);

    let resultadoFrete;
    try {
      resultadoFrete = await calcularPrecoPrazo(args);
      console.log("📦 Resultado Correios:", resultadoFrete);
    } catch (apiError) {
      console.warn("⚠️ Falha na API dos Correios:", apiError.message || apiError);
      resultadoFrete = null;
    }

    // Se a API dos Correios retornar erro ou vazio → usa fallback
    if (!resultadoFrete || !Array.isArray(resultadoFrete) || resultadoFrete.length === 0) {
      console.warn("⚠️ Retorno inválido da API. Usando frete simulado.");
      return res.json({
        Codigo: "04014",
        Valor: "24,90",
        PrazoEntrega: "4",
        MsgErro: "Simulado (fallback)",
      });
    }

    res.json(resultadoFrete[0]);
  } catch (error) {
    console.error("💥 Erro ao calcular frete:", error.message || error);
    // Fallback automático em caso de erro geral
    res.json({
      Codigo: "04014",
      Valor: "24,90",
      PrazoEntrega: "4",
      MsgErro: "Erro real — usando simulação local",
    });
  }
});

module.exports = router;
