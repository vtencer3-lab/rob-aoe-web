import { useEffect, useState } from "react";
import type { DiploZapas, ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import type { NastaveniLobby } from "../../../src/shared/lobbyKontrola.js";
import type { ZapasView } from "../../../src/shared/types.js";
import type { Hlidej } from "../rezimy/index.js";
import { Rozbalovaci } from "../views/Rozbalovaci.js";
import { diploApi } from "./api.js";

const bezPripony = (jmeno: string) => jmeno.replace(/\.aoe2scenario$/i, "");

/**
 * Na které verzi scénáře zápas pojede (uživatel 5. 10. 2026): v úpravě
 * zápasu místo jména scénáře výběr z verzí nahraných na web. Nabízí jen
 * rozebrané (ty jde hrát); po rozdání rolí je verze daná a výběr zašedne.
 * Změna se uloží hned — s verzí se mění i to, co hlídá kontrola lobby.
 */
export function VyberScenare({ zapas, diplo, hlidej, onVybrano }: { zapas: ZapasView; diplo: DiploZapas; hlidej: Hlidej; onVybrano: (n: Partial<NastaveniLobby>) => void }) {
  const [verze, setVerze] = useState<ScenarVerze[] | null>(null);
  useEffect(() => {
    let platne = true;
    diploApi
      .verze()
      .then((r) => platne && setVerze(r.verze.filter((v) => v.rozbor !== null)))
      .catch(() => platne && setVerze([]));
    return () => {
      platne = false;
    };
  }, []);

  if (verze === null) return <span className="jmeno">načítám verze…</span>;
  if (verze.length === 0) return <span className="jmeno">scénář zatím nikdo nenahrál</span>;
  const vybrana = verze.find((v) => v.id === diplo.scenarId) ?? null;
  const vPriprave = diplo.stav === "priprava";
  return (
    <span className="vyber-scenare-obal" data-testid="vyber-scenare" title={vPriprave ? undefined : "Role už jsou rozdané — verze scénáře se mění jen v přípravě."}>
      <Rozbalovaci<ScenarVerze | null>
        trida="vyber-scenare"
        popisek={`Verze scénáře zápasu #${zapas.poradi}`}
        polozky={verze}
        hodnota={vybrana}
        vypnuto={!vPriprave}
        klic={(v) => v?.id ?? "zadna"}
        obsah={(v) =>
          v === null ? (
            <span>vyber verzi</span>
          ) : (
            <span>
              {bezPripony(v.jmenoHry)}
              {v.aktivni ? " (aktivní)" : ""}
              {v.poznamka ? <span className="poznamka"> — {v.poznamka}</span> : null}
            </span>
          )
        }
        onZmena={(v) => {
          if (v === null || v.id === diplo.scenarId) return;
          void hlidej(async () => onVybrano((await diploApi.scenarZapasu(zapas.id, v.id)).nastaveni));
        }}
      />
    </span>
  );
}
