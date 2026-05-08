import { auth, getAuthToken } from '../firebase';

export interface EmailPayload {
  to: string | string[];
  subject: string;
  templateName?: string;
  context?: any;
  html?: string;
  text?: string;
  fromName?: string;
}

/**
 * Custom Email Service to send emails via our backend.
 * Uses secure templates on the server to prevent HTML injection from the client.
 */
export const emailService = {
  sendCustomEmail: async (payload: EmailPayload) => {
    console.log('[EmailService] Enviando e-mail:', { 
      to: payload.to, 
      subject: payload.subject,
      templateName: payload.templateName 
    });
    
    const token = await getAuthToken();
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        to: payload.to,
        subject: payload.subject,
        templateName: payload.templateName,
        context: payload.context || { html: payload.html },
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Falha ao enviar e-mail.';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        errorMessage = `Erro do servidor (${response.status})`;
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  }
};
