const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  // 🧾 Produtos do pedido
  produtos: [
    {
      produtoId: { type: mongoose.Schema.Types.ObjectId, ref: "Produto" },
      nome: String,
      preco: Number,
      quantidade: { type: Number, default: 1 },
      imagem: String,

      // 🆕 Campo adicionado: tamanho (usado para anéis, mas opcional)
      tamanho: { type: Number, required: false }
    },
  ],

  // 💰 Totais
  subtotal: { type: Number, required: true },
  frete: { type: Number, default: 0 },
  total: { type: Number, required: true },

  // 🏠 Endereço de entrega completo
  enderecoEntrega: {
    nome: String,
    telefone: String,
    cep: String,
    rua: String,
    numero: String,
    complemento: String,
    bairro: String,
    cidade: String,
    uf: String,
  },

  // 💳 Status de pagamento (integrado com Mercado Pago)
  statusPagamento: {
    type: String,
    enum: ["pendente", "pago", "rejeitado"],
    default: "pendente",
  },

  // 🔗 ID da preferência do Mercado Pago
  mpPreferenceId: { type: String },

  // 📦 Status geral do pedido
  status: {
    type: String,
    enum: ["pendente", "pago", "enviado", "entregue", "cancelado"],
    default: "pendente",
  },

  // 🚚 Rastreamento e envio
  rastreio: { type: String, default: null },
  dataEnvio: { type: Date, default: null },

  // 🕒 Registro da criação
  criadoEm: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Order", orderSchema);
