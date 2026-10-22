# Contact messages

The contact form does not save what a visitor types. Submit opens the visitor's mail app with that text filled in.

Saving those messages on the server is not built. There is no contact table and no admin page for them.

Saving them later would need three things.

- A table that holds the message, apart from nominations and partner inquiries. A row stays in that table. No job deletes it.
- Turnstile on the public write, so a script cannot fill the table.
- A short email that tells the sender the message was received. The email does not say the message is stored, who can read it, or how long it is kept.
