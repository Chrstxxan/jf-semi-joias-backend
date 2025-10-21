// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticação por JWT.
 * - Lê o token do header Authorization: "Bearer <token>"
 * - Valida com JWT_SECRET do .env
 * - Injeta req.user = { id, email } se estiver ok
 * - Se não houver token ou for inválido, responde 401
 */
module.exports = function (req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: 'Não autenticado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, email: payload.email };
    return next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido' });
  }
};
