export const BOOTSTRAP_ADMIN_EMAILS = [
  "ramon.souza@oeg.group",
  "ramonsancho@gmail.com"
];

export const isBootstrapAdmin = (email: string | null | undefined) => {
  if (!email) return false;
  return BOOTSTRAP_ADMIN_EMAILS.includes(email.toLowerCase().trim());
};
