// Test-only port of lz-string's compressToEncodedURIComponent (MIT, Pieroxy),
// used to produce `ctz=` payloads for decompressLz round trips.

const URI_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";

export function compressLz(input: string): string {
  const bitsPerChar = 6;
  const dict = new Map<string, number>();
  const toCreate = new Set<string>();
  let w = "";
  let enlargeIn = 2;
  let dictSize = 3;
  let numBits = 2;
  const out: string[] = [];
  let val = 0;
  let pos = 0;
  const writeBit = (b: number) => {
    val = (val << 1) | b;
    if (pos === bitsPerChar - 1) {
      pos = 0;
      out.push(URI_SAFE.charAt(val));
      val = 0;
    } else pos++;
  };
  const writeValue = (v: number, n: number) => {
    for (let i = 0; i < n; i++) {
      writeBit(v & 1);
      v >>= 1;
    }
  };
  const enlarge = () => {
    enlargeIn--;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
  };
  const emit = (s: string) => {
    if (toCreate.has(s)) {
      const code = s.charCodeAt(0);
      if (code < 256) {
        writeValue(0, numBits);
        writeValue(code, 8);
      } else {
        writeValue(1, numBits);
        writeValue(code, 16);
      }
      enlarge();
      toCreate.delete(s);
    } else {
      writeValue(dict.get(s)!, numBits);
    }
    enlarge();
  };
  for (let i = 0; i < input.length; i++) {
    const c = input.charAt(i);
    if (!dict.has(c)) {
      dict.set(c, dictSize++);
      toCreate.add(c);
    }
    const wc = w + c;
    if (dict.has(wc)) w = wc;
    else {
      emit(w);
      dict.set(wc, dictSize++);
      w = c;
    }
  }
  if (w !== "") emit(w);
  writeValue(2, numBits);
  for (;;) {
    val <<= 1;
    if (pos === bitsPerChar - 1) {
      out.push(URI_SAFE.charAt(val));
      break;
    }
    pos++;
  }
  return out.join("");
}
