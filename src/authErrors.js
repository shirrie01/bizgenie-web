// Maps Supabase Auth errors to safe, user-readable messages. Raw provider
// error text, error codes tied to internals, tokens, or database details
// must never reach the UI or the console from this module.
const SAFE_MESSAGES = {
  invalidCredentials: "That email and password combination doesn't match an account.",
  userAlreadyExists: "An account with that email already exists. Try signing in instead.",
  weakPassword: "Choose a password with at least 8 characters.",
  emailNotConfirmed: "Check your inbox to confirm your email before signing in.",
  rateLimited: "Too many attempts. Please wait a moment and try again.",
  invalidEmail: "Enter a valid email address.",
  default: "Something went wrong. Please try again.",
};

export function toSafeAuthMessage(error) {
  if (!error) return "";
  const code = String(error.code || "").toLowerCase();
  const rawMessage = String(error.message || "").toLowerCase();

  if (code === "invalid_credentials" || rawMessage.includes("invalid login credentials")) {
    return SAFE_MESSAGES.invalidCredentials;
  }
  if (
    code === "user_already_exists" ||
    rawMessage.includes("already registered") ||
    rawMessage.includes("already exists")
  ) {
    return SAFE_MESSAGES.userAlreadyExists;
  }
  if (code === "weak_password" || (rawMessage.includes("password") && rawMessage.includes("least"))) {
    return SAFE_MESSAGES.weakPassword;
  }
  if (code === "email_not_confirmed" || rawMessage.includes("confirm")) {
    return SAFE_MESSAGES.emailNotConfirmed;
  }
  if (code === "over_request_rate_limit" || rawMessage.includes("rate limit")) {
    return SAFE_MESSAGES.rateLimited;
  }
  if (code === "invalid_email" || rawMessage.includes("invalid email") || rawMessage.includes("unable to validate email")) {
    return SAFE_MESSAGES.invalidEmail;
  }
  return SAFE_MESSAGES.default;
}
