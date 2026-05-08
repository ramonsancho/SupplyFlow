import { auth, getAuthToken } from '../firebase';

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
}

/**
 * Custom Email Service to send emails via our backend.
 * Designed to be as simple to use as Firebase Auth's email functions.
 */
export const emailService = {
  sendCustomEmail: async (payload: EmailPayload) => {
    console.log('[EmailService] Enviando e-mail:', { 
      to: payload.to, 
      subject: payload.subject,
      fromName: payload.fromName 
    });
    const token = await getAuthToken();
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...payload,
        replyTo: auth.currentUser?.email,
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Falha ao enviar e-mail.';
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } else {
        const text = await response.text();
        console.error('Server error response:', text);
        errorMessage = `Erro do servidor (${response.status}): ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  }
};
