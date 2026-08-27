# Network desired state (not an apply script)

`firewall-security-group.desired.tsv` is a review checklist only. Nothing under
this directory calls an Alibaba Cloud API, changes UFW/nftables, or opens a mail
port. Every `__REQUIRED_*__` value must be rendered in a separate change record.

Before any network change:

1. inventory the other ECS that currently shares the security group;
2. create a target-specific security group instead of editing the shared group;
3. record current rule IDs/order, console access, exact admin CIDRs and rollback;
4. keep Stalwart SMTP/IMAP/JMAP ports closed while Cloudflare remains the MX;
5. verify Caddy is the only public HTTP listener and both application ranges are
   loopback-only;
6. keep public IPv6 and AAAA absent until a symmetric IPv6 Caddy/SG/UFW plan has
   been separately reviewed;
7. observe required egress before enforcing it. Retained Gemini and Google OAuth
   are external allowlisted services, not permission to retain Cloud Run/GCS/AR.

Creating a security group, changing UFW, applying an egress deny or changing MX
is a production mutation and still requires explicit user approval.
