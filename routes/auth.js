// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// ================================
// 🧾 Registro
// ================================
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha, endereco } = req.body;

    const existe = await User.findOne({ email });
    if (existe) return res.status(400).json({ erro: 'Email já cadastrado' });

    // 🔹 Novos usuários são criados com role padrão "cliente"
    const novoUser = await User.create({
      nome,
      email,
      senha,
      endereco,
      role: "cliente"
    });

    const token = jwt.sign(
      { id: novoUser._id, email: novoUser.email, role: novoUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      mensagem: 'Usuário registrado com sucesso!',
      token,
      usuario: {
        id: novoUser._id,
        nome: novoUser.nome,
        email: novoUser.email,
        role: novoUser.role
      }
    });
  } catch (e) {
    console.error('💥 Erro no cadastro:', e);
    res.status(500).json({ erro: 'Erro no cadastro' });
  }
});

// ================================
// 🔐 Login
// ================================
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ erro: 'Usuário não encontrado' });

    const valido = await bcrypt.compare(senha.trim(), user.senha.trim());
    if (!valido) return res.status(401).json({ erro: 'Senha incorreta' });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      mensagem: 'Login realizado com sucesso!',
      token,
      usuario: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role
      }
    });
  } catch (e) {
    console.error('💥 Erro no login:', e);
    res.status(500).json({ erro: 'Erro interno no login' });
  }
});

// ================================
// 👤 Dados do usuário logado
// ================================
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('nome email role');
    if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(user);
  } catch (e) {
    console.error('💥 Erro em /me:', e);
    res.status(500).json({ erro: 'Erro ao buscar usuário' });
  }
});

// ================================
// 🔁 Esqueci minha senha (gera token temporário)
// ================================
router.post('/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ erro: 'Usuário não encontrado.' });

    const token = crypto.randomBytes(20).toString('hex');
    user.resetToken = token;
    user.resetTokenExpira = Date.now() + 1000 * 60 * 15; // 15 min
    await user.save();

    res.json({
      mensagem: 'Token de recuperação gerado (temporário).',
      token,
      aviso: 'Por enquanto, copie este token e use em /auth/reset.'
    });
  } catch (e) {
    console.error('💥 Erro em /forgot:', e);
    res.status(500).json({ erro: 'Erro ao gerar token de recuperação.' });
  }
});

// ================================
// ♻️ Redefinir senha via token
// ================================
router.post('/reset', async (req, res) => {
  try {
    const { token, novaSenha } = req.body;

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpira: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ erro: 'Token inválido ou expirado.' });

    user.senha = await bcrypt.hash(novaSenha, 10);
    user.resetToken = null;
    user.resetTokenExpira = null;
    await user.save();

    res.json({ mensagem: 'Senha redefinida com sucesso!' });
  } catch (e) {
    console.error('💥 Erro em /reset:', e);
    res.status(500).json({ erro: 'Erro ao redefinir senha.' });
  }
});

module.exports = router;
