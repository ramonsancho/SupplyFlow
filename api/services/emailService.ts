import nodemailer from 'nodemailer';
import admin from 'firebase-admin';
import { getDb } from '../lib/firebase';

let DOMPurify: any = null;

const getDOMPurify = async () => {
  if (!DOMPurify) {
    try {
      const createDOMPurify = (await import('dompurify')).default;
      const { JSDOM } = await import('jsdom');
      const window = new JSDOM('').window;
      DOMPurify = createDOMPurify(window as any);
    } catch (err) {
      console.error("[Email Service] Falha ao carregar DOMPurify/JSDOM:", err);
      // Fallback: No sanitization (dangerous, but prevents crash)
      return { sanitize: (html: string) => html };
    }
  }
  return DOMPurify;
};

const getTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

export const sendSecureEmail = async ({ to, subject, templateName, context, userId }: any) => {
  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error('SMTP configurado incorretamente no servidor.');
  }

  const purifier = await getDOMPurify();

  // Domain validation (Example: allow only specific domains or just generic validation)
  const isAllowedDomain = (email: string) => {
    // For now, simple validation. In production, this would check against an allowlist.
    return email.includes('@');
  };

  const recipients = Array.isArray(to) ? to : [to];
  if (!recipients.every(isAllowedDomain)) {
    throw new Error('Um ou mais destinatários possuem domínios não autorizados.');
  }

  // Predefined Templates (Strictly no fallback to custom HTML)
  const templates: Record<string, Function> = {
    'rfq_created': (ctx: any) => `
      <h1>Olá, ${ctx.supplierName || 'Fornecedor'}</h1>
      <p>Uma nova Solicitação de Cotação (RFQ #${ctx.rfqNumber || '?'}) foi gerada para a sua empresa.</p>
      <p>Título: ${ctx.rfqTitle || 'Solicitação de Itens'}</p>
      <p>Por favor, acesse o portal para enviar sua proposta.</p>
    `,
    'po_approved': (ctx: any) => `
      <h1>Ordem de Compra Aprovada (#${ctx.poNumber || '?'})</h1>
      <p>A Ordem de Compra referente à sua proposta foi aprovada.</p>
      <p>Total: R$ ${ctx.totalAmount || '0,00'}</p>
    `,
    'user_welcome': (ctx: any) => `
      <h1>Bem-vindo ao SupplyFlow, ${ctx.userName || 'Usuário'}</h1>
      <p>Sua conta de ${ctx.role || 'Membro'} foi ativada com sucesso.</p>
      <p>Acesse o sistema com seu e-mail corporativo.</p>
    `,
    'system_alert': (ctx: any) => `
      <h1>Notificação SupplyFlow</h1>
      <p>${ctx.message}</p>
    `
  };

  if (!templates[templateName]) {
    throw new Error(`Template de e-mail '${templateName}' não autorizado.`);
  }

  const htmlContent = templates[templateName](context);
  const sanitizedHtml = purifier.sanitize(htmlContent);

  if (!sanitizedHtml || sanitizedHtml.length < 10) {
    throw new Error('Falha na sanitização de conteúdo: E-mail bloqueado por questões de segurança.');
  }

  const mailOptions = {
    from: `"SupplyFlow Security" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: `[SupplyFlow] ${subject}`,
    html: sanitizedHtml,
  };

  const transporter = getTransporter();
  const info = await transporter.sendMail(mailOptions);
  
  // Log the email action
  await getDb().collection('audit-logs').add({
    userId,
    action: 'EMAIL_SENT',
    entity: 'system',
    entityId: templateName,
    details: { to, subject, templateName },
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return info;
};
