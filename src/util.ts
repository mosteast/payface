import { nanoid } from 'nanoid';

/**
 * random order id
 */
export function random_unique() {
  return 'auto_id_' + nanoid();
}

export function get_header_value(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  for (const k in headers) {
    if (k.toLowerCase() !== key.toLowerCase()) continue;
    const v = headers[k];
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  }
  return undefined;
}
