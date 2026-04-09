import { PurchaseOrder, User } from '../types';
import { emailService } from './emailService';
import { teamsService } from './teamsService';

export const notificationService = {
  sendPOApprovalNotification: async (po: PurchaseOrder, approver: User, requesterName: string) => {
    let emailSuccess = false;
    let teamsSuccess = false;

    // 1. Enviar E-mail
    try {
      await emailService.sendCustomEmail({
        to: approver.email,
        subject: `Aprovação Necessária: OC #${po.number} - ${po.supplierName}`,
        fromName: 'SupplyFlow',
        text: `Solicitação de Aprovação - Ordem de Compra #${po.number}\n\nOlá,\nUma nova Ordem de Compra foi gerada e requer sua aprovação.\n\nFornecedor: ${po.supplierName}\nValor Total: R$ ${po.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\nSolicitante: ${requesterName}\n\nAcesse o sistema para aprovar: ${window.location.origin}`,
        html: `
          <div style="font-family: sans-serif; color: #141414; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E5E5; border-radius: 12px;">
            <h2 style="color: #141414;">Solicitação de Aprovação</h2>
            <p>Olá <strong>${approver.name}</strong>,</p>
            <p>Uma nova <strong>Ordem de Compra (#${po.number})</strong> foi gerada e requer sua análise e aprovação.</p>
            
            <div style="background-color: #F5F5F5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Fornecedor:</strong> ${po.supplierName}</p>
              <p style="margin: 5px 0;"><strong>Valor Total:</strong> R$ ${po.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p style="margin: 5px 0;"><strong>Solicitante:</strong> ${requesterName}</p>
            </div>

            <p>Por favor, acesse o sistema SupplyFlow para revisar os detalhes:</p>
            <p><a href="${window.location.origin}" style="color: #0052FF; font-weight: bold; text-decoration: none;">Acessar SupplyFlow</a></p>
            
            <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 20px 0;" />
            <p style="font-size: 12px; color: #8E9299;">Este é um e-mail automático do sistema SupplyFlow.</p>
          </div>
        `
      });
      emailSuccess = true;
    } catch (error) {
      console.error(`[Notification] Erro ao enviar e-mail para ${approver.email}:`, error);
    }

    // 2. Enviar Teams (se configurado)
    if (approver.teamsWebhookUrl) {
      try {
        await teamsService.sendNotification({
          webhookUrl: approver.teamsWebhookUrl,
          title: `Solicitação de Aprovação: OC #${po.number}`,
          text: `Uma nova Ordem de Compra foi gerada e requer sua aprovação.`,
          sections: [{
            activityTitle: `OC #${po.number} - ${po.supplierName}`,
            activitySubtitle: `Solicitante: ${requesterName}`,
            facts: [
              { name: "Valor Total:", value: `R$ ${po.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
              { name: "Fornecedor:", value: po.supplierName },
              { name: "Data:", value: new Date().toLocaleDateString() }
            ],
            markdown: true
          }],
          potentialAction: [{
            "@type": "OpenUri",
            "name": "Ver no SupplyFlow",
            "targets": [{ "os": "default", "uri": window.location.origin }]
          }]
        });
        teamsSuccess = true;
      } catch (error) {
        console.error(`[Notification] Erro ao enviar Teams para ${approver.name}:`, error);
      }
    }

    return { emailSuccess, teamsSuccess };
  }
};
