// Friendly client-side checks. The server repeats every one of them and is the authority.

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < 8) return "Password must be at least 8 characters."
  if (password.length > 128) return "Password must be 128 characters or fewer."
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    return "Password must contain at least one letter and one number."
  const local = email.split("@")[0].toLowerCase()
  if (local.length >= 4 && password.toLowerCase().includes(local))
    return "Password must not contain your email name."
  return null
}

/** Accepts Philippine mobile (09xx / +639xx) and landline-with-area-code input. */
export function phoneLooksValid(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 25 || /[^0-9+()\-.\s]/.test(trimmed))
    return false
  let digits = trimmed.replace(/[^0-9]/g, "")
  if (trimmed.startsWith("+") && !digits.startsWith("63")) return false
  if (digits.startsWith("63") && digits.length === 12)
    digits = "0" + digits.slice(2)
  return /^09\d{9}$/.test(digits) || /^0[2-8]\d{8,9}$/.test(digits)
}

export function emailLooksValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.length <= 254
}
