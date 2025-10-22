// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function (req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: 'Não autenticado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // 🔍 Busca o usuário e injeta no req.user
    const user = await User.findById(payload.id).select('nome email role');
    if (!user) return res.status(401).json({ erro: 'Usuário não encontrado' });

    req.user = { id: user._id, email: user.email, role: user.role, nome: user.nome };
    next();
  } catch (err) {
    console.error('Erro na autenticação:', err.message);
    res.status(401).json({ erro: 'Token inválido' });
  }
};
