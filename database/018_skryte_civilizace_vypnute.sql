-- Hide Civilizations se do 9. 9. 2026 ukládalo jako null („je to jedno“),
-- protože žádnou výchozí hodnotu nemělo. Od té doby je výchozí vypnuto a
-- prázdná hodnota by v okně zůstala viset jako „–“, dokud by na ni někdo
-- nesáhl. Volba „je to jedno“ zůstává — jen se přestává dědit z dob, kdy
-- byla jediná možná.
UPDATE akce
   SET nastaveni_lobby = jsonb_set(coalesce(nastaveni_lobby, '{}'::jsonb), '{skrytCivilizace}', 'false'::jsonb)
 WHERE nastaveni_lobby IS NULL
    OR NOT (nastaveni_lobby ? 'skrytCivilizace')
    OR nastaveni_lobby -> 'skrytCivilizace' = 'null'::jsonb;

UPDATE akce
   SET ulozene_nastaveni_lobby = jsonb_set(ulozene_nastaveni_lobby, '{skrytCivilizace}', 'false'::jsonb)
 WHERE ulozene_nastaveni_lobby IS NOT NULL
   AND (NOT (ulozene_nastaveni_lobby ? 'skrytCivilizace')
        OR ulozene_nastaveni_lobby -> 'skrytCivilizace' = 'null'::jsonb);
