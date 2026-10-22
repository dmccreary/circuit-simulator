// lz-string's decompressFromEncodedURIComponent, used only to read Falstad
// `ctz=` links. CircuitJS1 calls the same function:
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/CirSim.java
// (lz-string by Pieroxy, MIT license: https://github.com/pieroxy/lz-string)

const URI_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
const VALUE = new Map<string, number>([...URI_SAFE].map((c, i) => [c, i]));

/** Returns null when the input is not a valid lz-string stream. */
export function decompressLz(input: string): string | null {
  if (input === "") return null;
  // A "+" in a query string arrives as a space.
  const s = input.replace(/ /g, "+");
  const charValue = (i: number): number => VALUE.get(s.charAt(i)) ?? 0;

  const resetValue = 32; // 6 bits per character
  let val = charValue(0);
  let position = resetValue;
  let index = 1;
  const readBits = (n: number): number => {
    let bits = 0;
    for (let power = 1, k = 0; k < n; k++, power <<= 1) {
      const bit = val & position;
      position >>= 1;
      if (position === 0) {
        position = resetValue;
        val = charValue(index++);
      }
      if (bit) bits |= power;
    }
    return bits;
  };

  const dictionary: string[] = ["", "", ""];
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  const result: string[] = [];

  let c: string;
  switch (readBits(2)) {
    case 0:
      c = String.fromCharCode(readBits(8));
      break;
    case 1:
      c = String.fromCharCode(readBits(16));
      break;
    default:
      return "";
  }
  dictionary[3] = c;
  let w = c;
  result.push(c);

  for (;;) {
    if (index > s.length) return "";
    let code = readBits(numBits);
    if (code === 0 || code === 1) {
      dictionary[dictSize++] = String.fromCharCode(readBits(code === 0 ? 8 : 16));
      code = dictSize - 1;
      enlargeIn--;
    } else if (code === 2) {
      return result.join("");
    }
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
    let entry: string;
    if (code < dictSize && dictionary[code] !== undefined && code > 2) entry = dictionary[code];
    else if (code === dictSize) entry = w + w.charAt(0);
    else return null;
    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
  }
}
