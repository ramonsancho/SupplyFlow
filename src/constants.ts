// System roles
export type AppRole = 'Administrador' | 'Comprador' | 'Aprovador' | 'Requisitante';

export const APP_ROLES: AppRole[] = ['Administrador', 'Comprador', 'Aprovador', 'Requisitante'];

export const ROLE_LABELS: Record<AppRole, string> = {
  'Administrador': 'Administrador',
  'Comprador': 'Comprador',
  'Aprovador': 'Aprovador Financeiro',
  'Requisitante': 'Requisitante'
};
