import { nanoid } from "nanoid";
import { Tenpay } from "./tenpay";

beforeEach(() => {
  const id = process.env.tenpay_id;
  const secret = process.env.tenpay_secret;
  const mchid = process.env.tenpay_mchid;

  if (!id || !secret || !mchid) {
    console.warn("Empty env: tenpay_id or tenpay_secret or tenpay_mchid");
    return;
  }

  it("pay_qrcode", async () => {
    const row = new Tenpay({
      id,
      secret,
      mchid,
      notify_url: "https://example.com",
    });
    const r = await row.pay_qrcode({
      fee: 0.1,
      order_id: "test_" + nanoid(),
      subject: "Test order",
    });
    console.info("Payment url:", r);
    expect(r).toBeTruthy();
  });

  it("pay_qrcode", async () => {
    const row = new Tenpay({
      id,
      secret,
      mchid,
      notify_url: "https://example.com",
    });
    const r = await row.pay_mobile_web({
      fee: 0.1,
      order_id: "test_" + nanoid(),
      subject: "Test order",
      client_ip: "123.139.93.107",
    });
    console.info("Payment url:", r);
    expect(r).toBeTruthy();
  });

  it("pay_app", async () => {
    const row = new Tenpay({
      id,
      secret,
      mchid,
      notify_url: "https://example.com",
    });
    const r = await row.pay_app({
      fee: 0.1,
      order_id: "test_" + nanoid(),
      subject: "Test order",
      client_ip: "123.139.93.107",
    });
    console.info("Payment url:", r);
    expect(r).toBeTruthy();
  });
});
