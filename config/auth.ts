// Access control configuration.
//
// After authentication, only the emails listed here are allowed to use the
// app. Everyone else is signed out immediately after they authenticate.
export const ALLOWED_EMAILS = ["8svskhd@gmail.com"];

export const isEmailAllowed = (email?: string | null): boolean => {
  if (!email) return false;
  return ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(
    email.toLowerCase(),
  );
};
