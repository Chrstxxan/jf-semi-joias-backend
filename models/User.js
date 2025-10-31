const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String, required: true },

  endereco: {
    cep: String,
    rua: String,
    numero: String,
    complemento: String,
    bairro: String,
    cidade: String,
    uf: String
  },

  cidade: String,
  cep: String,
  estado: String,

  criadoEm: { type: Date, default: Date.now },

  // ⭐ Produtos favoritados
  favoritos: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Produto'
    }
  ],

  // 🧭 Nível de acesso
  role: {
    type: String,
    enum: ['cliente', 'admin'],
    default: 'cliente'
  },

  // 🔒 Recuperação de senha
  resetToken: { type: String, default: null },
  resetTokenExpira: { type: Date, default: null }
});

// Criptografa senha antes de salvar
userSchema.pre('save', async function (next) {
  if (!this.isModified('senha')) return next();
  const salt = await bcrypt.genSalt(10);
  this.senha = await bcrypt.hash(this.senha, salt);
  next();
});

// Verifica senha no login
userSchema.methods.verificarSenha = async function (senhaDigitada) {
  return await bcrypt.compare(senhaDigitada, this.senha);
};

// 🔁 Atualiza senha manualmente (sem reset via e-mail)
// 🔁 Atualiza senha (deixa o pre('save') hashear UMA vez)
userSchema.methods.atualizarSenha = async function (novaSenha) {
  this.senha = novaSenha; // texto puro; o pre('save') vai hashear
  await this.save();      // dispara o pre('save') e faz 1 único hash
};


module.exports = mongoose.model('User', userSchema);
