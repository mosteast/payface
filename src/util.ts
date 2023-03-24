import { nanoid } from 'nanoid';

/**
 * random order id
 */
export function random_unique() {
  return 'auto_id_' + nanoid();
}
