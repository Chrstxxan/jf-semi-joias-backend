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

    let resultadoFrete = [];
    try {
      resultadoFrete = await calcularPrecoPrazo(args);
      if (!Array.isArray(resultadoFrete)) resultadoFrete = [resultadoFrete];
      console.log("📦 Resultado Correios:", resultadoFrete);
    } catch (apiError) {
      console.warn("⚠️ Falha na API dos Correios:", apiError.message || apiError);
      resultadoFrete = [];
    }

    let frete = resultadoFrete[0];

    if (!frete) {
      console.warn("⚠️ Retorno inválido da API. Usando frete simulado.");
      frete = {
        Codigo: "04014",
        Valor: "24,90",
        PrazoEntrega: "4",
        MsgErro: "Simulado (fallback)",
      };
    }

    // ✅ Adiciona prazos extras de encomenda
    const prazoCorreios = parseInt(frete.PrazoEntrega || "0", 10);
    const prazoMedio = prazoCorreios + 5;
    const prazoMaximo = prazoCorreios + 10;

    const resposta = {
      ...frete,
      PrazoEntrega: String(prazoCorreios),
      PrazoMedio: String(prazoMedio),
      PrazoMaximo: String(prazoMaximo),
      Observacao:
        "Prazo de entrega inclui tempo adicional de fabricação/encomenda.",
    };

    res.json(resposta);
  } catch (error) {
    console.error("💥 Erro ao calcular frete:", error.message || error);
    res.json({
      Codigo: "04014",
      Valor: "24,90",
      PrazoEntrega: "4",
      PrazoMedio: "9",
      PrazoMaximo: "14",
      MsgErro: "Erro real — usando simulação local",
    });
  }
});

module.exports = router;
