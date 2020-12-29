import { keys } from 'lodash';
import { T_object } from '../../type';
import { Invalid_argument } from '../invalid_argument';

export function require_all(args: T_object): void {
  const lack = [];

  for (const key in args) {
    const value = args[key];
    if (value === undefined) {
      lack.push(key);
    }
  }

  if (lack.length) {
    throw new Invalid_argument('Missing following arguments: ' + JSON.stringify(lack));
  }
}

export function require_any(args: T_object): void {
  let valid = false;

  for (const key in args) {
    const value = args[key];
    if (value !== undefined) {
      valid = true;
      break;
    }
  }

  if ( ! valid) {
    throw new Invalid_argument('Missing one of these arguments: ' + JSON.stringify(keys(args)));
  }
}
