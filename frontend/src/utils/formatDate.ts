// Buenos Aires es UTC-3 todo el año (Argentina no tiene horario de verano).
const BA_OFFSET_HOURS = 3;

// SQLite CURRENT_TIMESTAMP guarda "YYYY-MM-DD HH:MM:SS" sin indicador de zona
// horaria, pero siempre es UTC. Hay que marcarlo explícitamente antes de
// parsearlo — sin la "Z", algunos motores lo interpretan como hora local.
function parseAsUtc(input: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date(`${input}T00:00:00Z`);
  if (input.includes('T') || input.endsWith('Z')) return new Date(input);
  return new Date(`${input.replace(' ', 'T')}Z`);
}

// Fecha simple ("yyyy-mm-dd" o "yyyy-mm-dd HH:MM:SS") a "dd-mm-aaaa". No hace
// conversión de huso horario — es una fecha de calendario, no un instante.
export function formatDateDDMMYYYY(input: string | null | undefined): string {
  if (!input) return '-';
  const datePart = input.split(' ')[0].split('T')[0];
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return input;
  return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
}

// Timestamp completo (ej. generated_at) convertido a hora de Buenos Aires,
// mostrado como "dd-mm-aaaa hh:mm".
export function formatDateTimeBA(input: string | null | undefined): string {
  if (!input) return '-';
  const utcDate = parseAsUtc(input);
  if (isNaN(utcDate.getTime())) return input;
  const ba = new Date(utcDate.getTime() - BA_OFFSET_HOURS * 3600 * 1000);
  const dd = String(ba.getUTCDate()).padStart(2, '0');
  const mm = String(ba.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = ba.getUTCFullYear();
  const hh = String(ba.getUTCHours()).padStart(2, '0');
  const min = String(ba.getUTCMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}
