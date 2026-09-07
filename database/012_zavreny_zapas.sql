-- Dohraný zápas jde v režii křížkem zavřít: zmizí ze stránky všem, ale
-- výsledek zůstává v databázi. Čas zavření místo příznaku, ať je vidět kdy;
-- NULL = otevřený. V debug módu ho režie vidí zašedlý a jde znovu otevřít.
ALTER TABLE zapas ADD COLUMN zavreny_v TIMESTAMPTZ;
