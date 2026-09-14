-- Odpověď na zprávu v chatu (uživatel 14. 9. 2026, po vzoru UnityChat):
-- zpráva může odkazovat na jinou zprávu téhož zápasu. Když původní zmizí
-- (smazal ji admin), odkaz se jen vynuluje — odpověď zůstane a ukáže se
-- bez náhledu.
ALTER TABLE zprava ADD COLUMN odpoved_na INTEGER REFERENCES zprava(id) ON DELETE SET NULL;
