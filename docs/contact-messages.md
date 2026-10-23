# Contact messages

The public contact form stores a message and sends the sender a short receipt. The address on the page stays a mailto link.

`submitContact` reads the honeypot `company_website` before anything else. A filled value returns success and stores nothing. That path skips Turnstile and the rate limit. An empty honeypot must pass Turnstile, then the field checks, then the rate limit. The limit is 20 messages per IP and 5 per email each hour. The row and the receipt job commit in one transaction.

The receipt template is `contact`. The English body is "We've received your message." The mail does not say the message is stored, who can read it, or how long it is kept. There is no staff notification email.

Admins open the list at `/admin/records?list=messages`. The detail page is `/admin/records/messages/[id]`. An editor or a reviewer cannot read or manage messages. Status is `new`, `read`, `archived`, or `spam`. Mark read is legal only from `new`, and it sets `read_at` once. Archive and spam can move to each other and leave `read_at` unchanged. Restore returns an unread row to `new` and a read row to `read`. A repeat of the current state writes nothing and records no event. Notes are rows in `contact_notes`.

The list filters by status. It has no attention filter and no CSV export. Search matches name, email, organization, phone, and body. The dashboard card counts rows with status `new`.
