/** Valida CPF (algoritmo oficial Receita Federal) */
export function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  const calc = (slice: string, factor: number): number => {
    let sum = 0;
    for (const d of slice) {
      sum += parseInt(d, 10) * factor--;
    }
    const rest = (sum * 10) % 11;
    return rest === 10 || rest === 11 ? 0 : rest;
  };

  const d1 = calc(digits.slice(0, 9), 10);
  const d2 = calc(digits.slice(0, 10), 11);
  return d1 === parseInt(digits[9]!, 10) && d2 === parseInt(digits[10]!, 10);
}

/** Valida e-mail simples */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Valida telefone brasileiro (10 ou 11 dígitos) */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

/** Valida CEP */
export function isValidZipCode(cep: string): boolean {
  return /^\d{5}-?\d{3}$/.test(cep);
}

/** Remove todos os não-dígitos */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Verifica se senha atende política mínima */
export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
