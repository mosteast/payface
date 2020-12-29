import { nanoid } from 'nanoid';

/**
 * random order id
 */
export function random_oid() {
  return 'auto_id_' + nanoid();
}
