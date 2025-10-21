// Importa o mongoose para trabalhar com banco MongoDB
const mongoose = require('mongoose');

// Define como será o modelo de produto
const ProdutoSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  descricao: { type: String },
  preco: { type: Number, required: true },
  estoque: { type: Number, default: 0 },
  imagens: { type: [String] }, // Array de URLs das imagens
  categoria: { type: String }
});

// Exporta o modelo para ser usado em outras partes do backend
module.exports = mongoose.model('Produto', ProdutoSchema);
