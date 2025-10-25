const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

/**
 * ⚙️ CONFIGURAÇÕES
 * Token vem do .env (adicione MELHOR_ENVIO_TOKEN)
 * Exemplo: MELHOR_ENVIO_TOKEN=teu_token_aqui
 */

const MELHOR_ENVIO_URL = "https://www.melhorenvio.com.br/api/v2/me/shipment/calculate"; 
// ⚠️ Troque para a URL de produção depois: https://www.melhorenvio.com.br/api/v2/me/shipment/calculate

router.post("/", async (req, res) => {
  try {
    const { cepDestino } = req.body;

    if (!cepDestino || cepDestino.length < 8) {
      return res.status(400).json({ erro: "CEP de destino inválido" });
    }

    console.log("🧾 Calculando frete via Melhor Envio para:", cepDestino);

    // Dados da loja (origem)
    const body = {
      from: { postal_code: "01001000" }, // CEP da loja
      to: { postal_code: cepDestino },
      products: [
        {
          id: "1",
          width: 15,
          height: 10,
          length: 20,
          weight: 0.3, // 300g
          insurance_value: 50,
          quantity: 1,
        },
      ],
      services: "1,2,3", // SEDEX, PAC, Jadlog, etc (você pode limitar)
      options: {
        receipt: false,
        own_hand: false,
      },
    };

    const response = await fetch(MELHOR_ENVIO_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    // Se o Melhor Envio retornar erro:
    if (!response.ok) {
      console.error("❌ Erro na API do Melhor Envio:", data);
      return res.status(500).json({
        Codigo: "000",
        Valor: "24,90",
        PrazoCorreios: 4,
        PrazoMedio: 9,
        PrazoMaximo: 14,
        MsgErro: data.message || "Erro ao consultar Melhor Envio (fallback)",
      });
    }

    console.log("📦 Retorno Melhor Envio:", data);

    // Usa o primeiro resultado de serviço (por exemplo, o mais barato)
    const servico = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!servico) {
      return res.status(500).json({
        Codigo: "000",
        Valor: "24,90",
        PrazoCorreios: 4,
        PrazoMedio: 9,
        PrazoMaximo: 14,
        MsgErro: "Nenhum serviço disponível (fallback)",
      });
    }

    // Calcula prazos adicionais (5 e 10 dias úteis)
    const prazoCorreios = Number(servico.delivery_time || 0);
    const prazoMedio = prazoCorreios + 5;
    const prazoMaximo = prazoCorreios + 10;

    const resultado = {
      Codigo: servico.id || "000",
      Nome: servico.name || "Serviço desconhecido",
      Valor: Number(servico.price).toFixed(2),
      PrazoCorreios: prazoCorreios,
      PrazoMedio: prazoMedio,
      PrazoMaximo: prazoMaximo,
      MsgErro: null,
    };

    return res.json(resultado);
  } catch (error) {
    console.error("💥 Erro geral ao calcular frete:", error.message);
    return res.json({
      Codigo: "000",
      Valor: "24,90",
      PrazoCorreios: 4,
      PrazoMedio: 9,
      PrazoMaximo: 14,
      MsgErro: "Erro geral — usando simulação local",
    });
  }
});

module.exports = router;
