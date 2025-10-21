const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  usuario: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  produtos: [
    {
      produtoId: { type: mongoose.Schema.Types.ObjectId, ref: "Produto" },
      nome: String,
      preco: Number,
      quantidade: { type: Number, default: 1 },
      imagem: String,
    },
  ],
  subtotal: { type: Number, required: true },
  frete: { type: Number, default: 0 },
  total: { type: Number, required: true },
  enderecoEntrega: {
    cep: String,
    rua: String,
    numero: String,
    complemento: String,
    bairro: String,
    cidade: String,
    uf: String,
  },
  statusPagamento: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  mpPreferenceId: { type: String }, // ID da preferência do Mercado Pago

  status: { 
    type: String, 
    enum: ["pendente", "pago", "enviado", "entregue", "cancelado"], 
    default: "pendente" 
  },

  // 🆕 Campos adicionados
  rastreio: { type: String, default: null }, // Código de rastreamento dos Correios
  dataEnvio: { type: Date, default: null },  // Data em que o pedido foi enviado

  criadoEm: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Order", orderSchema);
