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

  // 👇 agora com nome e telefone
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

  // 👇 padronizado em PT-BR
  statusPagamento: {
    type: String,
    enum: ["pendente", "pago", "rejeitado"],
    default: "pendente",
  },

  mpPreferenceId: { type: String },

  status: { 
    type: String, 
    enum: ["pendente", "pago", "enviado", "entregue", "cancelado"], 
    default: "pendente" 
  },

  rastreio: { type: String, default: null },
  dataEnvio: { type: Date, default: null },

  criadoEm: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Order", orderSchema);
