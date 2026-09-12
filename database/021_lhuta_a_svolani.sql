-- Lhůta aktivity je od teď věcí akce, ne konstantou (přání uživatele: admin
-- si ji nastaví, 2 minuty až 2 hodiny). Server ji čte z akce při každém
-- přihlášení, obnovení i pulsu; prohlížeč ji dostane ve stavu a počítá z ní
-- práh pro „Jsem tu!“.
ALTER TABLE akce ADD COLUMN lhuta_aktivity_minut INTEGER NOT NULL DEFAULT 15
  CHECK (lhuta_aktivity_minut BETWEEN 2 AND 120);

-- Svolání do radnice: admin klikne na zvonek u hráče a hráči zazvoní poplach.
-- Stav se posílá celý, tak se pamatuje čas posledního svolání a prohlížeč
-- zvoní, když se u něj změní.
ALTER TABLE prihlaska ADD COLUMN svolan_v TIMESTAMPTZ;
