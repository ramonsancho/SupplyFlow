import { PurchaseOrder, User } from '../types';
import { emailService } from './emailService';

export const notificationService = {
  sendPOApprovalNotification: async (po: PurchaseOrder, approver: User) => {
    try {
      await emailService.sendCustomEmail({
        to: approver.email,
        subject: `Aprovação Necessária: OC #${po.number} - ${po.supplierName}`,
        fromName: 'SupplyFlow Notifications',
        html: `
          <div style="font-family: sans-serif; color: #141414; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E5E5; border-radius: 12px;">
            <h2 style="color: #141414;">Solicitação de Aprovação de OC</h2>
            <p>Olá <strong>${approver.name}</strong>,</p>
            <p>Uma nova Ordem de Compra foi gerada e requer sua aprovação, pois o valor está dentro do seu limite.</p>
            
            <div style="background-color: #F5F5F5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Número da OC:</strong> #${po.number}</p>
              <p style="margin: 5px 0;"><strong>Fornecedor:</strong> ${po.supplierName}</p>
              <p style="margin: 5px 0;"><strong>Valor Total:</strong> R$ ${po.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p style="margin: 5px 0;"><strong>Criado por:</strong> ${po.createdByName || po.createdBy}</p>
            </div>

            <p>Por favor, acesse o sistema SupplyFlow para revisar os detalhes e realizar a aprovação.</p>
            
            <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 20px 0;" />
            <p style="font-size: 12px; color: #8E9299;">Este é um e-mail automático, por favor não responda.<br /><strong>SupplyFlow Management System</strong></p>
          </div>
        `
      });
      return true;
    } catch (error) {
      console.error('Erro ao enviar email de aprovação:', error);
      return false;
    }
  }
};
