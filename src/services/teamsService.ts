export interface TeamsPayload {
  webhookUrl: string;
  title: string;
  text: string;
  sections?: any[];
  potentialAction?: any[];
}

export const teamsService = {
  sendNotification: async (payload: TeamsPayload) => {
    console.log('[TeamsService] Enviando notificação para Teams:', { 
      title: payload.title,
      webhookUrl: payload.webhookUrl.substring(0, 30) + '...'
    });

    const response = await fetch('/api/send-teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Teams notification error:', errorData);
      const message = errorData.details || errorData.error || response.statusText;
      throw new Error(`Falha ao enviar para o Teams: ${message}`);
    }

    return true;
  }
};
