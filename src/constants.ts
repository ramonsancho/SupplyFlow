export const BOOTSTRAP_ADMIN_EMAILS = [
  "ramon.souza@oeg.group",
  "ramonsancho@gmail.com"
];

export const isBootstrapAdmin = (email: string | null | undefined) => {
  if (!email) return false;
  return BOOTSTRAP_ADMIN_EMAILS.includes(email.toLowerCase().trim());
};

export const parseBrazilianNumber = (val: any): number => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  
  let str = String(val).trim();
  str = str.replace(/R\$\s?/i, ''); // Remove R$
  if (!str) return 0;

  if (str.includes(',')) {
    if (str.includes('.')) {
      str = str.replace(/\./g, '');
    }
    str = str.replace(',', '.');
  } else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      str = str.replace(/\./g, '');
    }
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
};
