import { describe, expect, it, vi } from "vitest";
import { Hub } from "./hub.js";

describe("Hub", () => {
  it("doručí zprávu všem odběratelům jedné akce", () => {
    const hub = new Hub();
    const a = vi.fn();
    const b = vi.fn();
    hub.subscribe(1, a);
    hub.subscribe(1, b);

    hub.publish(1, { ahoj: true });

    expect(a).toHaveBeenCalledWith({ ahoj: true });
    expect(b).toHaveBeenCalledWith({ ahoj: true });
  });

  it("nedoručí zprávu odběratelům jiné akce", () => {
    const hub = new Hub();
    const jina = vi.fn();
    hub.subscribe(2, jina);
    hub.publish(1, { ahoj: true });
    expect(jina).not.toHaveBeenCalled();
  });

  it("odhlášení odběratele ho přestane obsluhovat", () => {
    const hub = new Hub();
    const prijemce = vi.fn();
    const odhlas = hub.subscribe(1, prijemce);
    odhlas();
    hub.publish(1, { ahoj: true });
    expect(prijemce).not.toHaveBeenCalled();
    expect(hub.subscriberCount(1)).toBe(0);
  });

  it("pád jednoho odběratele nezabrání doručení ostatním", () => {
    const hub = new Hub();
    const rozbity = vi.fn(() => {
      throw new Error("spojení je pryč");
    });
    const zdravy = vi.fn();
    hub.subscribe(1, rozbity);
    hub.subscribe(1, zdravy);

    expect(() => hub.publish(1, { ahoj: true })).not.toThrow();
    expect(zdravy).toHaveBeenCalled();
  });

  it("publikování bez odběratelů nevadí", () => {
    expect(() => new Hub().publish(99, {})).not.toThrow();
  });
});
