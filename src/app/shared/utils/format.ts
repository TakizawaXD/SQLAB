/** Formatea un valor devuelto por PGlite para mostrarlo en pantalla o exportarlo. */
export function formatCellValue(value: unknown, pgType?: string): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return 'Invalid Date';
    const iso = value.toISOString();
    if (pgType === 'DATE') return iso.slice(0, 10);
    // PGlite trabaja en UTC: se muestra la marca de tiempo sin conversión de zona
    return iso.slice(0, 19).replace('T', ' ');
  }
  if (value instanceof Uint8Array) {
    return '\\x' + Array.from(value, b => b.toString(16).padStart(2, '0')).join('');
  }
  if (Array.isArray(value)) {
    return '{' + value.map(v => (v === null ? 'NULL' : formatCellValue(v))).join(',') + '}';
  }
  try {
    return JSON.stringify(value, jsonReplacer);
  } catch {
    return String(value);
  }
}

/** Reemplazador para JSON.stringify que soporta BigInt y binarios. */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return formatCellValue(value);
  return value;
}

/** Descarga contenido de texto como archivo en el navegador. */
export function downloadFile(content: string | Blob, filename: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
