require ["variables", "duplicate"];

# mail-ingest is the only component allowed to add the first
# X-GSYEN-Mirror-ID field. Restrict tracking to loopback SMTP sessions so a
# public sender cannot poison the duplicate list with a forged header.
if anyof (
  string :is "${env.remote_ip}" "127.0.0.1",
  string :is "${env.remote_ip}" "::1",
  string :is "${env.remote_ip}" "::ffff:127.0.0.1"
) {
  if duplicate
      :header "X-GSYEN-Mirror-ID"
      :handle "gsyen-cloudflare-mirror-v1"
      :seconds 2678400 {
    discard;
    stop;
  }
}
