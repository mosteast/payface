import { EID_common } from "@mosteast/common_eid";
import { E } from "@mosteast/e";

export class Verification_error extends E {
  eid = EID_common.invalid_state;

  constructor(data?: any, msg = "Failed to verify payment") {
    super(msg);
    this.data = data;
  }
}
