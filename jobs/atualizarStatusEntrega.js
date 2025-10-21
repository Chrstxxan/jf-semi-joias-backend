// backend/jobs/atualizarStatusEntrega.js
const { rastrearEncomendas } = require("correios-brasil");
const Order = require("../models/Order");
const User = require("../models/User");
const sendEmail = require("../utils/mailer"); // ✅ utilitário de e-mail

async function atualizarStatusEntrega() {
  console.log("📦 Iniciando verificação automática de entregas...");

  try {
    // Busca pedidos que estão como "enviado" e têm código de rastreio
    const pedidos = await Order.find({
      status: "enviado",
      rastreio: { $ne: null },
    }).populate("usuario");

    if (pedidos.length === 0) {
      console.log("Nenhum pedido para verificar.");
      return;
    }

    for (const pedido of pedidos) {
      try {
        const codigo = pedido.rastreio.trim();
        console.log(`🔍 Verificando rastreio ${codigo}...`);

        const resultado = await rastrearEncomendas([codigo]);
        const eventos = resultado[0]?.eventos || [];

        if (eventos.length === 0) {
          console.warn(`⚠️ Nenhum evento encontrado para ${codigo}`);
          continue;
        }

        const ultimoEvento = eventos[0]?.descricao?.toLowerCase();

        // Detecta entrega confirmada pelos Correios
        if (ultimoEvento.includes("entregue") || ultimoEvento.includes("objeto entregue")) {
          pedido.status = "entregue";
          await pedido.save();

          console.log(`✅ Pedido ${pedido._id} marcado como ENTREGUE.`);

          const cliente = pedido.usuario;
          const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || "admin@jfsemijoias.com";

          // 💌 E-mail para o CLIENTE
          if (cliente?.email) {
            const assuntoCliente = `✨ Seu pedido ${pedido._id.toString().slice(-6).toUpperCase()} foi entregue!`;
            const corpoCliente = `
              <h2>Olá, ${cliente.nome}!</h2>
              <p>Temos uma ótima notícia 🎉</p>
              <p>Seu pedido <b>${pedido._id.toString().slice(-6).toUpperCase()}</b> foi <b>entregue</b> com sucesso.</p>
              <p>Esperamos que você ame suas novas joias 💖</p>
              <p><a href="${process.env.FRONT_ORIGIN}/meus-pedidos.html">Ver detalhes do pedido</a></p>
              <br/>
              <p>Com carinho,<br><b>Equipe JF Semi Joias</b></p>
            `;
            await sendEmail(cliente.email, assuntoCliente, corpoCliente);
            console.log(`📨 E-mail enviado ao cliente ${cliente.email}`);
          }

          // 💌 E-mail para o ADMIN
          const assuntoAdmin = `📬 Pedido entregue — ${pedido._id.toString().slice(-6).toUpperCase()}`;
          const corpoAdmin = `
            <h2>📦 Pedido entregue com sucesso!</h2>
            <p><b>ID do pedido:</b> ${pedido._id}</p>
            <p><b>Cliente:</b> ${cliente?.nome || "Desconhecido"} (${cliente?.email || "—"})</p>
            <p><b>Rastreio:</b> ${pedido.rastreio}</p>
            <p>Status atualizado automaticamente pelo sistema.</p>
            <p><a href="${process.env.FRONT_ORIGIN}/admin-rastreio.html">Ver no painel admin</a></p>
            <br/>
            <p>— Sistema JF Semi Joias</p>
          `;
          await sendEmail(adminEmail, assuntoAdmin, corpoAdmin);
          console.log(`📨 E-mail enviado para o admin (${adminEmail})`);
        } else {
          console.log(`🚚 Pedido ${pedido._id} ainda em trânsito (${ultimoEvento}).`);
        }
      } catch (err) {
        console.error(`Erro ao verificar ${pedido.rastreio}:`, err.message);
      }
    }
  } catch (e) {
    console.error("💥 Erro geral no verificador de entregas:", e.message);
  }
}

module.exports = atualizarStatusEntrega;
