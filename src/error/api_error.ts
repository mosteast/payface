import { EID_common } from "@mosteast/common_eid";
import { E } from "@mosteast/e";
import { E_level } from "../type";

export class Api_error extends E {
  eid = EID_common.invalid_state;

  constructor(msg: string, data?: any) {
    super();
    this.message = msg;
    this.data = data;
  }
}

/**
 * Api error shortcut
 */
export class Api_error_external extends Api_error {
  level = E_level.external;
  status_code = 403;
}
