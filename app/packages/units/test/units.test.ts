import { formatValue, nearestStandard, parseValue, parseValueDetailed } from "@cs/units";

describe("parseValue", () => {
  it.each([
    ["4700", undefined, 4700],
    ["4.7e3", undefined, 4700],
    ["-1.5", undefined, -1.5],
    ["1e-3", undefined, 0.001],
    ["4.7k", "ohm", 4700],
    ["4k7", "ohm", 4700],
    ["2R2", "ohm", 2.2],
    ["100u", "F", 100e-6],
    ["100µ", "F", 100e-6],
    ["100μF", "F", 100e-6],
    ["1meg", "ohm", 1e6],
    ["1MEG", "ohm", 1e6],
    ["1M", "ohm", 1e6],
    ["1m", "s", 1e-3],
    ["2.2nF", "F", 2.2e-9],
    ["10 kΩ", "ohm", 10000],
    ["10kohm", "ohm", 10000],
    ["5V", "V", 5],
    ["1,5", "V", 1.5],
    ["4,7k", "ohm", 4700],
    ["1.000,5", undefined, 1000.5],
    ["1,000.5", undefined, 1000.5],
    ["60Hz", "Hz", 60],
    ["1kHz", "Hz", 1000],
    ["10fF", "F", 10e-15],
    ["1F", "F", 1],
    ["-4k7", "ohm", -4700],
    [".5", undefined, 0.5],
    ["25°C", "°C", 25],
  ] as const)("%s -> %d", (text, unit, expected) => {
    expect(parseValue(text, unit)).toBeCloseTo(expected, 20);
    expect(parseValue(text, unit)! / expected).toBeCloseTo(1, 12);
  });

  it.each([[""], ["abc"], ["4.7q"], ["1..2"], ["k"], ["4k7x"]])("rejects %j", (text) => {
    expect(parseValue(text, "ohm")).toBeNull();
  });

  it("rejects a unit that does not match the field", () => {
    expect(parseValue("5A", "V")).toBeNull();
    expect(parseValueDetailed("5A", "V")).toEqual({ ok: false, error: "wrong-unit", found: "A" });
    expect(parseValueDetailed("  ", "V")).toEqual({ ok: false, error: "empty" });
  });

  it("accepts any unit when no field unit is given", () => {
    expect(parseValue("5A")).toBe(5);
  });
});

describe("formatValue", () => {
  it.each([
    [4700, "ohm", "4.70 kΩ"],
    [33e-9, "F", "33.0 nF"],
    [100e-6, "F", "100 µF"],
    [1, "V", "1.00 V"],
    [0, "V", "0 V"],
    [-0.0025, "A", "-2.50 mA"],
    [999.7, "ohm", "1.00 kΩ"],
    [1e6, "ohm", "1.00 MΩ"],
    [60, "Hz", "60.0 Hz"],
    [50, "%", "50.0 %"],
  ] as const)("%d %s -> %s", (v, unit, text) => {
    expect(formatValue(v, unit)).toBe(text);
  });

  it("honours digits, trimZeros and locale", () => {
    expect(formatValue(4700, "ohm", { trimZeros: true })).toBe("4.7 kΩ");
    expect(formatValue(4712, "ohm", { digits: 4 })).toBe("4.712 kΩ");
    expect(formatValue(4700, "ohm", { locale: "de-DE" })).toBe("4,70 kΩ");
    expect(formatValue(1e-18, "F")).toBe("1.00e-18 F");
    expect(formatValue(Infinity, "ohm")).toBe("∞ Ω");
  });

  it("round-trips through parseValue", () => {
    for (const v of [4.7e3, 2.2e-9, 1e-12, 330, 0.015, 1.2e9, -5.6e-3]) {
      for (const unit of ["ohm", "F", "V", "A", "Hz"] as const) {
        const text = formatValue(v, unit, { digits: 6 });
        expect(parseValue(text, unit)! / v).toBeCloseTo(1, 9);
        const de = formatValue(v, unit, { digits: 6, locale: "de-DE" });
        expect(parseValue(de, unit)! / v).toBeCloseTo(1, 9);
      }
    }
  });
});

describe("nearestStandard", () => {
  it.each([
    [4600, "E12", 4700],
    [4600, "E24", 4700],
    [4900, "E24", 5100],
    [9.6e-9, "E12", 10e-9],
    [1.25, "E12", 1.2],
    [1.25, "E6", 1.5],
    [-2100, "E12", -2200],
  ] as const)("%d in %s -> %d", (v, s, expected) => {
    expect(nearestStandard(v, s)).toBeCloseTo(expected, 15);
  });
});
