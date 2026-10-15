// Læses før Supabase-klienten rydder URL'en. Fortæller om brugeren kommer fra et invitations- eller nulstillingslink.
const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
export const initialLinkType: string | null = params.get('type');
