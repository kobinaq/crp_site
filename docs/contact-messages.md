# Contact messages

The contact form does not save what a visitor types. Submit opens the visitor's mail app with that text filled in.

Saving those messages on the server is not built. There is no contact table and no admin page for them.

Saving them later would need four things.

- A table that holds the message, apart from nominations and partner inquiries.
- Turnstile on the public write, so a script cannot fill the table.
- A retention rule that says how long a message stays and when it is deleted.
- An email notice that tells the sender the message was stored and who can read it.
