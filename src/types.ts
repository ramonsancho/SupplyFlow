export type Supplier = {
  id: string;
  name: string;
  document: string; // CPF/CNPJ
  address: string;
  contactName: string;
  email: string;
  phone: string;
  families: string[];
  paymentTerms: string;
  rating: number;
  accuracy: number;
  isCritical: boolean;
  notes: string;
  createdAt: string;
};

export type Currency = 'BRL' | 'USD' | 'EUR';

export type RFQ = {
  id: string;
  number: number;
  title: string;
  family?: string;
  status: 'draft' | 'sent' | 'closed';
  desiredDate: string;
  items: RFQItem[];
  currency?: Currency;
  createdAt: string;
};

export type RFQItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
};

export type Proposal = {
  id: string;
  rfqId: string;
  supplierId: string;
  supplierName: string;
  totalValue: number;
  freightValue?: number;
  taxValue?: number;
  discountValue?: number;
  deliveryDate: string;
  status: 'pending' | 'accepted' | 'rejected';
  items: ProposalItem[];
  currency?: Currency;
  createdAt: string;
};

export type ProposalItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type Receipt = {
  id: string;
  amount: number;
  invoiceNumber: string;
  receivedAt: string;
  receivedBy: string;
};

export type PurchaseOrder = {
  id: string;
  number: number;
  proposalId?: string;
  supplierId: string;
  supplierName: string;
  family?: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'received' | 'closed' | 'cancelled';
  totalAmount: number;
  originalAmount?: number; // Pre-negotiation or reference amount for savings calculation
  receivedAmount: number;
  receipts?: Receipt[];
  items: POItem[];
  currency?: Currency;
  createdAt: string;
  updatedAt?: string;
  revision?: number;
  createdBy?: string;
  createdByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rating?: number;
  hasRNC?: boolean;
  completedAt?: string;
  receivedAt?: string;
  deliveryDate?: string;
};

export type POItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  tax: number;
};

export type AuditLog = {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: 'Administrador' | 'Comprador' | 'Aprovador' | 'Requisitante';
  status: 'Ativo' | 'Inativo';
  approvalLimit?: number;
  createdAt: string;
};

export type Contract = {
  id: string;
  supplierId: string;
  supplierName: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'terminated';
  lastAdjustmentDate?: string;
  lastAdjustmentPercentage?: number;
  notes?: string;
  createdAt: string;
};
