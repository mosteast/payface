import { EID_common } from "@mosteast/common_eid";
import { E } from "@mosteast/e";
import { E_level } from "../type";

export class Invalid_state extends E {
  eid = EID_common.invalid_state;
}

export class Invalid_state_external extends Invalid_state {
  level = E_level.external;
  status_code = 400;
}
