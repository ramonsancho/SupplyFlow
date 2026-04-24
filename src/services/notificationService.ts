import { PurchaseOrder, User } from '../types';

export const notificationService = {
  sendPOApprovalNotification: async (_po: PurchaseOrder, _approver: User, _requesterName: string) => {
    // Email notifications removed by user request
    return { emailSuccess: true };
  }
};
