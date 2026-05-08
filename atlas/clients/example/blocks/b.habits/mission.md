# b.habits — mission

Storage for the user's habits: name, frequency (daily/weekly), reminder
time, active/archived status, metadata (icon, color).

PostgreSQL as the primary store — a simple relational model, millions
of rows are no problem. No JSON columns for primary attributes — only
structured columns. This keeps indexing and analytics simple.
