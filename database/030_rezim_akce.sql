-- database/030_rezim_akce.sql
-- Mód akce (spec Diplomacie §4.1 H1). Klasický večer je výchozí, takže
-- stávající akce se nemění. Nový mód = nová hodnota v CHECK.
ALTER TABLE akce ADD COLUMN rezim TEXT NOT NULL DEFAULT 'klasicky'
  CHECK (rezim IN ('klasicky', 'diplomacie'));
