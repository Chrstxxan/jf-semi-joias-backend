const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Produto = require("../models/Produto");
const auth = require("../middleware/auth");

// Obter favoritos do usuário
router.get("/favoritos", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("favoritos");
    res.json(user.favoritos);
  } catch (err) {
    res.status(500).json({ erro: "Erro ao carregar favoritos" });
  }
});

// Adicionar produto aos favoritos
router.post("/favoritos", auth, async (req, res) => {
  try {
    const { produtoId } = req.body;
    const user = await User.findById(req.user.id);

    if (!user.favoritos.includes(produtoId)) {
      user.favoritos.push(produtoId);
      await user.save();
    }

    res.json({ sucesso: true, favoritos: user.favoritos });
  } catch (err) {
    res.status(500).json({ erro: "Erro ao adicionar favorito" });
  }
});

// Remover produto dos favoritos
router.delete("/favoritos/:id", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.favoritos = user.favoritos.filter(fav => fav.toString() !== req.params.id);
    await user.save();
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ erro: "Erro ao remover favorito" });
  }
});

module.exports = router;
