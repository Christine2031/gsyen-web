import net from "node:net";

const MAX_REPLY_BUFFER_BYTES = 64 * 1024;

function safeAddress(value, name, { allowEmpty = false } = {}) {
  if (allowEmpty && value === "") return value;
  if (!value || value.length > 254 || /[\r\n<>]/.test(value)) {
    throw new Error(`invalid_${name}`);
  }
  return value;
}

function safeHostname(value) {
  if (typeof value !== "string"
    || value.length === 0
    || value.length > 253
    || !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value)) {
    throw new Error("invalid_hostname");
  }
  return value;
}

function validateConnection({ host, port, hostname, timeoutMs }) {
  safeHostname(host);
  safeHostname(hostname);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("invalid_smtp_port");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error("invalid_smtp_timeout");
  }
}

function dotStuff(raw) {
  let binary = raw.toString("latin1");
  binary = binary.replace(/(^|\r\n)\./g, "$1..");
  if (!binary.endsWith("\r\n")) binary += "\r\n";
  return Buffer.from(`${binary}.\r\n`, "latin1");
}

function permanentSmtpError(message) {
  return Object.assign(new Error(message), {
    permanent: true,
    status: 422,
  });
}

function replyError(reply, command) {
  const label = command?.split(" ", 1)[0] ?? "greeting";
  const error = new Error(`smtp_${reply.code}_${label}`);
  if (reply.code >= 500) {
    error.permanent = true;
    error.status = 422;
  }
  return error;
}

function hasNonAscii(value) {
  return /[^\u0000-\u007f]/.test(value);
}

function bufferHasEightBit(buffer) {
  return buffer.some((byte) => byte > 0x7f);
}

function rawHeaders(raw) {
  const crlfBoundary = raw.indexOf(Buffer.from("\r\n\r\n", "ascii"));
  if (crlfBoundary >= 0) return raw.subarray(0, crlfBoundary);
  const lfBoundary = raw.indexOf(Buffer.from("\n\n", "ascii"));
  return lfBoundary >= 0 ? raw.subarray(0, lfBoundary) : raw;
}

function ehloCapabilities(reply) {
  const capabilities = new Set();
  // RFC 5321 reserves the first EHLO line for the server identity/greeting;
  // extension keywords begin on subsequent lines.
  for (const line of reply.lines.slice(1)) {
    const token = line.text.trim().split(/[ \t]/, 1)[0]?.toUpperCase();
    if (token) capabilities.add(token);
  }
  return capabilities;
}

async function withSmtpSession({ host, port, hostname, timeoutMs }, operation) {
  validateConnection({ host, port, hostname, timeoutMs });
  const socket = net.createConnection({ host, port });
  socket.setTimeout(timeoutMs);
  socket.setNoDelay(true);

  let pending = "";
  let bufferedReplyBytes = 0;
  const replies = [];
  let fatalError = null;
  let wake = null;
  let finished = false;

  function notify() {
    const resolve = wake;
    wake = null;
    resolve?.();
  }

  function fail(error) {
    if (finished || fatalError) return;
    fatalError = error instanceof Error ? error : new Error(String(error));
    notify();
  }

  function flushReplies() {
    while (true) {
      const boundary = pending.indexOf("\r\n");
      if (boundary < 0) return;
      const encoded = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      const match = /^(\d{3})([ -])(.*)$/.exec(encoded);
      if (!match) {
        fail(new Error("smtp_malformed_reply"));
        socket.destroy();
        return;
      }
      replies.push({
        code: Number(match[1]),
        final: match[2] === " ",
        line: encoded,
        text: match[3],
      });
      bufferedReplyBytes += Buffer.byteLength(encoded, "latin1") + 2;
      if (bufferedReplyBytes > MAX_REPLY_BUFFER_BYTES) {
        fail(new Error("smtp_reply_too_large"));
        socket.destroy();
        return;
      }
      notify();
    }
  }

  socket.on("data", (chunk) => {
    pending += chunk.toString("latin1");
    if (pending.length > MAX_REPLY_BUFFER_BYTES) {
      fail(new Error("smtp_reply_too_large"));
      socket.destroy();
      return;
    }
    flushReplies();
  });
  socket.once("error", fail);
  socket.once("timeout", () => fail(new Error("smtp_timeout")));
  socket.once("close", () => fail(new Error("smtp_connection_closed")));

  const deadline = setTimeout(() => {
    const error = new Error("smtp_deadline_exceeded");
    fail(error);
    socket.destroy(error);
  }, timeoutMs);

  async function response() {
    while (!replies.some((reply) => reply.final)) {
      if (fatalError) throw fatalError;
      await new Promise((resolve) => { wake = resolve; });
    }
    if (fatalError) throw fatalError;
    const finalIndex = replies.findIndex((reply) => reply.final);
    const lines = replies.splice(0, finalIndex + 1);
    bufferedReplyBytes -= lines.reduce(
      (total, line) => total + Buffer.byteLength(line.line, "latin1") + 2,
      0,
    );
    const code = lines.at(-1).code;
    if (lines.some((line) => line.code !== code)) {
      throw new Error("smtp_inconsistent_multiline_reply");
    }
    return { code, line: lines.at(-1).line, lines };
  }

  async function expect(expected, command) {
    if (command) socket.write(`${command}\r\n`);
    const reply = await response();
    if (!expected.includes(reply.code)) throw replyError(reply, command);
    return reply;
  }

  try {
    await expect([220]);
    const ehlo = await expect([250], `EHLO ${hostname}`);
    return await operation({
      capabilities: ehloCapabilities(ehlo),
      expect,
      socket,
    });
  } finally {
    finished = true;
    clearTimeout(deadline);
    socket.destroy();
  }
}

export async function probeSmtp({
  host,
  port,
  hostname,
  timeoutMs = 5_000,
}) {
  return withSmtpSession({ host, port, hostname, timeoutMs }, async ({ capabilities, socket }) => {
    socket.write("QUIT\r\n");
    return { capabilities: [...capabilities].sort() };
  });
}

export async function deliverSmtp({
  host,
  port,
  hostname,
  envelopeFrom,
  recipient,
  raw,
  timeoutMs = 15_000,
}) {
  safeAddress(envelopeFrom, "envelope_from", { allowEmpty: true });
  safeAddress(recipient, "recipient");
  if (!Buffer.isBuffer(raw) || raw.length === 0) throw new Error("empty_message");

  const needsEightBitMime = bufferHasEightBit(raw);
  const needsSmtpUtf8 = hasNonAscii(envelopeFrom)
    || hasNonAscii(recipient)
    || bufferHasEightBit(rawHeaders(raw));

  return withSmtpSession(
    { host, port, hostname, timeoutMs },
    async ({ capabilities, expect, socket }) => {
      if (needsEightBitMime && !capabilities.has("8BITMIME")) {
        throw permanentSmtpError("smtp_8bitmime_required");
      }
      if (needsSmtpUtf8 && !capabilities.has("SMTPUTF8")) {
        throw permanentSmtpError("smtp_smtputf8_required");
      }

      const mailParameters = [];
      if (needsEightBitMime) mailParameters.push("BODY=8BITMIME");
      if (needsSmtpUtf8) mailParameters.push("SMTPUTF8");
      const suffix = mailParameters.length > 0 ? ` ${mailParameters.join(" ")}` : "";

      await expect([250], `MAIL FROM:<${envelopeFrom}>${suffix}`);
      await expect([250, 251], `RCPT TO:<${recipient}>`);
      await expect([354], "DATA");
      socket.write(dotStuff(raw));
      const accepted = await expect([250]);
      socket.write("QUIT\r\n");
      return accepted.line;
    },
  );
}
