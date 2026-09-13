-- Úprava vlastní zprávy (šipka nahoru v chatu): text se přepíše a pamatuje
-- se čas úpravy, u zprávy se pak ukáže nenápadné „(editováno)“.
ALTER TABLE zprava ADD COLUMN upraveno_v TIMESTAMPTZ;
