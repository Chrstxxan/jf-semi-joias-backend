// backend/middleware/isAdmin.js
module.exports = (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ erro: 'Acesso negado: apenas administradores podem realizar esta ação.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno no middleware de admin.' });
  }
};
