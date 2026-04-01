# SupplyFlow - Arquitetura e Design do Sistema

## 1. Diagrama de Arquitetura

O sistema segue uma arquitetura **Full-Stack** moderna:

- **Frontend**: React 19 + Vite + Tailwind CSS + Recharts (Dashboard) + Lucide (Ícones).
- **Backend**: Node.js + Express.js (API RESTful).
- **Banco de Dados**: Firestore (NoSQL) para a implementação real, mas desenhado com lógica relacional.
- **Autenticação**: Firebase Auth (JWT).
- **Hospedagem**: Google Cloud Run.

## 2. Esquema de Banco de Dados Relacional (Conceitual)

Embora implementado em Firestore, aqui está o modelo relacional solicitado:

### Tabelas Principais:

1. **suppliers (fornecedores)**
   - `id` (UUID, PK)
   - `name` (VARCHAR)
   - `document` (VARCHAR, CPF/CNPJ)
   - `address` (TEXT)
   - `contact_name` (VARCHAR)
   - `email` (VARCHAR)
   - `phone` (VARCHAR)
   - `payment_terms` (VARCHAR)
   - `rating` (DECIMAL)
   - `notes` (TEXT)
   - `created_at` (TIMESTAMP)

2. **families (famílias/categorias)**
   - `id` (UUID, PK)
   - `name` (VARCHAR)

3. **supplier_families (N:N)**
   - `supplier_id` (FK)
   - `family_id` (FK)

4. **rfqs (solicitações de cotação)**
   - `id` (UUID, PK)
   - `number` (SERIAL)
   - `title` (VARCHAR)
   - `status` (ENUM: draft, sent, closed)
   - `desired_date` (DATE)
   - `created_at` (TIMESTAMP)

5. **rfq_items**
   - `id` (UUID, PK)
   - `rfq_id` (FK)
   - `description` (TEXT)
   - `quantity` (DECIMAL)
   - `unit` (VARCHAR)

6. **proposals (propostas)**
   - `id` (UUID, PK)
   - `rfq_id` (FK)
   - `supplier_id` (FK)
   - `total_value` (DECIMAL)
   - `delivery_date` (DATE)
   - `status` (ENUM: pending, accepted, rejected)

7. **purchase_orders (OC)**
   - `id` (UUID, PK)
   - `number` (SERIAL)
   - `proposal_id` (FK, NULLABLE)
   - `supplier_id` (FK)
   - `status` (ENUM: draft, approved, sent, received, closed)
   - `total_amount` (DECIMAL)
   - `received_amount` (DECIMAL)
   - `created_at` (TIMESTAMP)

8. **audit_logs**
   - `id` (UUID, PK)
   - `user_id` (FK)
   - `action` (VARCHAR)
   - `entity` (VARCHAR)
   - `entity_id` (VARCHAR)
   - `timestamp` (TIMESTAMP)

## 3. Consultas SQL de Exemplo

### Filtro por Família:
```sql
SELECT s.* 
FROM suppliers s
JOIN supplier_families sf ON s.id = sf.supplier_id
JOIN families f ON sf.family_id = f.id
WHERE f.name = 'Eletrônicos';
```

### Saldo em Aberto por OC:
```sql
SELECT 
    number, 
    total_amount, 
    received_amount, 
    (total_amount - received_amount) AS balance
FROM purchase_orders
WHERE status != 'closed' AND (total_amount - received_amount) > 0;
```

## 4. Endpoints RESTful

### Fornecedores
- `GET /api/suppliers`: Lista fornecedores com filtros.
- `POST /api/suppliers`: Cria novo fornecedor.
- `GET /api/suppliers/:id`: Detalhes do fornecedor.

### RFQs
- `POST /api/rfqs`: Cria RFQ.
  - **Payload**: `{ "title": "Compra de PCs", "items": [{ "description": "i7 16GB", "quantity": 10 }] }`
  - **Resposta**: `201 Created` com o objeto RFQ.

### Ordens de Compra
- `POST /api/purchase-orders`: Cria OC.
- `PATCH /api/purchase-orders/:id/status`: Atualiza status (ex: 'received').

## 5. Fluxos de Negócio e Critérios de Aceitação

### Cadastro de Fornecedor
- **Fluxo**: Usuário preenche formulário -> Sistema valida CNPJ -> Salva no banco.
- **Critério**: Deve permitir associar múltiplas famílias.

### Ciclo de RFQ
- **Fluxo**: Criar RFQ -> Adicionar Itens -> Enviar para Fornecedores -> Registrar Propostas.
- **Critério**: Propostas devem estar vinculadas ao RFQ original.

### Ordem de Compra e Saldo
- **Fluxo**: Aceitar Proposta -> Gerar OC -> Registrar Recebimento Parcial -> Atualizar Saldo.
- **Critério**: O saldo deve ser calculado em tempo real (Total - Recebido).
