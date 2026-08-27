import assert from "node:assert/strict";
import net from "node:net";
import { afterEach, test } from "node:test";
import { deliverSmtp, probeSmtp } from "../src/smtp.mjs";

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function fakeSmtp({ capabilities = ["PIPELINING"] } = {}) {
  const transcript = [];
  let data = "";
  const server = net.createServer((socket) => {
    socket.on("error", () => {});
    socket.write("220 test ESMTP ready\r\n");
    let buffer = "";
    let inData = false;
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      while (true) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          data = buffer.slice(0, end + 2);
          buffer = buffer.slice(end + 5);
          inData = false;
          socket.write("250 2.0.0 queued\r\n");
          continue;
        }
        const end = buffer.indexOf("\r\n");
        if (end < 0) return;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        transcript.push(line);
        if (line.startsWith("EHLO ")) {
          const lines = ["250-test", ...capabilities.map((capability, index) => (
            `250${index === capabilities.length - 1 ? " " : "-"}${capability}`
          ))];
          if (capabilities.length === 0) lines.push("250 ");
          socket.write(`${lines.join("\r\n")}\r\n`);
        }
        else if (line.startsWith("MAIL FROM:")) socket.write("250 sender ok\r\n");
        else if (line.startsWith("RCPT TO:")) socket.write("250 recipient ok\r\n");
        else if (line === "DATA") {
          inData = true;
          socket.write("354 continue\r\n");
        } else if (line === "QUIT") socket.end("221 bye\r\n");
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { port: server.address().port, transcript, readData: () => data };
}

test("delivers raw MIME to the local SMTP server with dot stuffing", async () => {
  const smtp = await fakeSmtp();
  const reply = await deliverSmtp({
    host: "127.0.0.1",
    port: smtp.port,
    hostname: "mail.gsyen.com",
    envelopeFrom: "sender@example.com",
    recipient: "ethan@gsyen.com",
    raw: Buffer.from("Subject: test\r\n\r\n.first line\r\nlast line"),
  });
  assert.match(reply, /^250 /);
  assert.deepEqual(smtp.transcript.slice(0, 4), [
    "EHLO mail.gsyen.com",
    "MAIL FROM:<sender@example.com>",
    "RCPT TO:<ethan@gsyen.com>",
    "DATA",
  ]);
  assert.match(smtp.readData(), /\r\n\.\.first line\r\n/);
});

test("uses SMTP MAIL FROM empty reverse-path for a null envelope sender", async () => {
  const smtp = await fakeSmtp();
  const reply = await deliverSmtp({
    host: "127.0.0.1",
    port: smtp.port,
    hostname: "mail.gsyen.com",
    envelopeFrom: "",
    recipient: "ethan@gsyen.com",
    raw: Buffer.from("Subject: delivery status\r\n\r\nnotification"),
  });
  assert.match(reply, /^250 /);
  assert.equal(smtp.transcript[1], "MAIL FROM:<>");
});

test("declares BODY=8BITMIME for an 8-bit body after checking EHLO", async () => {
  const smtp = await fakeSmtp({ capabilities: ["PIPELINING", "8BITMIME"] });
  await deliverSmtp({
    host: "127.0.0.1",
    port: smtp.port,
    hostname: "mail.gsyen.com",
    envelopeFrom: "sender@example.com",
    recipient: "ethan@gsyen.com",
    raw: Buffer.from("Subject: test\r\n\r\ncaf\xe9", "latin1"),
  });
  assert.equal(
    smtp.transcript[1],
    "MAIL FROM:<sender@example.com> BODY=8BITMIME",
  );
});

test("requires 8BITMIME instead of silently downgrading 8-bit content", async () => {
  const smtp = await fakeSmtp();
  await assert.rejects(deliverSmtp({
    host: "127.0.0.1",
    port: smtp.port,
    hostname: "mail.gsyen.com",
    envelopeFrom: "sender@example.com",
    recipient: "ethan@gsyen.com",
    raw: Buffer.from("Subject: test\r\n\r\ncaf\xe9", "latin1"),
  }), (error) => {
    assert.equal(error.message, "smtp_8bitmime_required");
    assert.equal(error.status, 422);
    return true;
  });
  assert.equal(smtp.transcript.length, 1);
});

test("declares SMTPUTF8 and 8BITMIME for UTF-8 envelope/header content", async () => {
  const smtp = await fakeSmtp({
    capabilities: ["8BITMIME", "SMTPUTF8", "PIPELINING"],
  });
  await deliverSmtp({
    host: "127.0.0.1",
    port: smtp.port,
    hostname: "mail.gsyen.com",
    envelopeFrom: "发件人@example.com",
    recipient: "ethan@gsyen.com",
    raw: Buffer.from("Subject: 中文\r\n\r\nbody", "utf8"),
  });
  assert.equal(
    Buffer.from(smtp.transcript[1], "latin1").toString("utf8"),
    "MAIL FROM:<发件人@example.com> BODY=8BITMIME SMTPUTF8",
  );
});

test("requires SMTPUTF8 when the envelope needs it", async () => {
  const smtp = await fakeSmtp({ capabilities: ["8BITMIME"] });
  await assert.rejects(deliverSmtp({
    host: "127.0.0.1",
    port: smtp.port,
    hostname: "mail.gsyen.com",
    envelopeFrom: "sender@example.com",
    recipient: "用户@gsyen.com",
    raw: Buffer.from("Subject: ascii\r\n\r\nbody"),
  }), (error) => {
    assert.equal(error.message, "smtp_smtputf8_required");
    assert.equal(error.status, 422);
    return true;
  });
});

test("health probe performs greeting and EHLO without issuing MAIL", async () => {
  const smtp = await fakeSmtp({ capabilities: ["8BITMIME", "SMTPUTF8"] });
  const result = await probeSmtp({
    host: "127.0.0.1",
    port: smtp.port,
    hostname: "mail.gsyen.com",
    timeoutMs: 1_000,
  });
  assert.deepEqual(result.capabilities, ["8BITMIME", "SMTPUTF8"]);
  assert.deepEqual(smtp.transcript, ["EHLO mail.gsyen.com"]);
});

test("enforces one hard deadline across an active SMTP transaction", async () => {
  const server = net.createServer((socket) => {
    socket.on("error", () => {});
    socket.write("220 slow ESMTP ready\r\n");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      const boundary = buffer.indexOf("\r\n");
      if (boundary < 0) return;
      const line = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      setTimeout(() => {
        if (socket.destroyed) return;
        if (line.startsWith("EHLO ")) socket.write("250 hello\r\n");
        else if (line.startsWith("MAIL FROM:")) socket.write("250 sender ok\r\n");
        else if (line.startsWith("RCPT TO:")) socket.write("250 recipient ok\r\n");
        else if (line === "DATA") socket.write("354 continue\r\n");
      }, 300);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);

  await assert.rejects(deliverSmtp({
    host: "127.0.0.1",
    port: server.address().port,
    hostname: "mail.gsyen.com",
    envelopeFrom: "sender@example.com",
    recipient: "ethan@gsyen.com",
    raw: Buffer.from("Subject: deadline\r\n\r\nmessage"),
    timeoutMs: 1_000,
  }), /smtp_deadline_exceeded/);
});
