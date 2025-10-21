// utils/mailer.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,      // Ex: smtp.gmail.com
  port: process.env.SMTP_PORT,      // Ex: 587
  secure: false,                    // Gmail usa STARTTLS, então fica false
  auth: {
    user: process.env.SMTP_USER,    // Seu e-mail
    pass: process.env.SMTP_PASS     // Senha de app do Gmail
  },
  tls: {
    rejectUnauthorized: false       // Evita erro em dev/local
  }
});

/**
 * Envia um e-mail
 * @param {string} para - E-mail de destino
 * @param {string} assunto - Assunto do e-mail
 * @param {string} html - Conteúdo HTML do corpo da mensagem
 */
async function enviarEmail(para, assunto, html) {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"JF Semi Joias" <noreply@jfsemijoias.com>',
      to: para,
      subject: assunto,
      html
    });

    console.log(`📨 E-mail enviado para ${para}: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error("❌ Erro ao enviar e-mail:", err.message);
    return false;
  }
}

module.exports = enviarEmail;
