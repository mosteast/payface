import { readFileSync } from "fs";
import { nanoid } from "nanoid";
import { Verification_error } from "./error/verification_error";
import { Tenpay } from "./tenpay";

let client: Tenpay;

describe("tenpay", () => {
  const id = process.env.tenpay_id as string;
  const mchid = process.env.tenpay_mchid as string;
  const tenpay_cert_content_public = readFileSync(
    __dirname + "/test_asset/tenpay/apiclient_cert.pem"
  );
  const tenpay_cert_content_private = readFileSync(
    __dirname + "/test_asset/tenpay/apiclient_key.pem"
  );

  if (!id || !mchid) {
    console.warn("Empty env: tenpay_id or tenpay_mchid");
    return;
  }

  beforeEach(() => {
    client = new Tenpay({
      id,
      mch_id: mchid,
      notify_url: "https://example.com",
      tenpay_cert_content_public,
      tenpay_cert_content_private,
    });
  });

  it("pay_qrcode", async () => {
    const r = await client.pay_qrcode({
      fee: 0.1,
      unique: "test_" + nanoid(),
      subject: "Test order",
      client_ip: "123.139.93.107",
    });
    expect(r.url).toBeTruthy();
    console.info("Payment url:", r.url);
    expect(r).toBeTruthy();
  });

  it("mobile_web", async () => {
    const r = await client.pay_mobile_web({
      fee: 0.1,
      unique: "test_" + nanoid(),
      subject: "Test order",
      client_ip: "123.139.93.107",
    });
    expect(r.url).toBeTruthy();
    console.info("Payment url:", r.url);
    expect(r).toBeTruthy();
  });

  it("pay_app", async () => {
    const r = await client.pay_app({
      fee: 0.1,
      unique: "test_" + nanoid(),
      subject: "Test order",
      client_ip: "123.139.93.107",
    });
    expect(r.prepay_id).toBeTruthy();
    expect(r.timestamp_sign).toBeTruthy();
    expect(parseInt(r.timestamp_sign as string)).toBeTruthy();
    console.info("prepay_id", r.prepay_id);
  });

  describe("order", () => {
    const unique = process.env.tenpay_order_id;
    if (!unique) {
      console.warn("Require env: tenpay_order_id");
      return;
    }

    it("query", async () => {
      const r = await client.query({ unique });
      expect(r?.ok).toBeTruthy();
      expect(r?.unique).toBeTruthy();
      expect(r?.created_at).toBeTruthy();
      expect(r?.fee).toBeTruthy();
    });

    it("verify", async () => {
      await expect(client.verify({ unique })).resolves.not.toThrow();
      await expect(
        client.verify({ unique: "invalid_order_90971234" })
      ).rejects.toThrow(Verification_error);
    });
  });

  describe("verify_notify_sign", () => {
    it("common", async () => {
      const raw = {
        appid: "wx41d141be52130624",
        bank_type: "CMB_DEBIT",
        cash_fee: "1",
        fee_type: "CNY",
        is_subscribe: "Y",
        mch_id: "1373091502",
        nonce_str: "x497uFKK7JHgInT0",
        openid: "oIYGjt1dQ2ntgwsL3n-Z18E8T3TE",
        out_trade_no: "giao_payment25DZYMQVSPHK",
        result_code: "SUCCESS",
        return_code: "SUCCESS",
        sign: "AD1881435AF65D13529A2C4492EDBAEF",
        time_end: "20210223143409",
        total_fee: 1,
        trade_type: "NATIVE",
        transaction_id: "4200000939202102230544535527",
      };
      const r = await client.verify_notify_sign(raw);
      console.log(r);
    });
  });
});
