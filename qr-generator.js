(() => {
  "use strict";

  const QR_DEFAULTS = {
    version: "auto",
    errorCorrection: "M",
    mask: "auto",
    scale: 8,
    margin: 4,
    foreground: "#000000",
    background: "#ffffff"
  };

  const ECC_LEVELS = {
    L: { code: 1, rsOffset: 0 },
    M: { code: 0, rsOffset: 1 },
    Q: { code: 3, rsOffset: 2 },
    H: { code: 2, rsOffset: 3 }
  };

  const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
  const G18 =
    (1 << 12) |
    (1 << 11) |
    (1 << 10) |
    (1 << 9) |
    (1 << 8) |
    (1 << 5) |
    (1 << 2) |
    (1 << 0);
  const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

  const PAD0 = 0xec;
  const PAD1 = 0x11;

  const RS_POLY_LUT = {
    7: [1, 127, 122, 154, 164, 11, 68, 117],
    10: [1, 216, 194, 159, 111, 199, 94, 95, 113, 157, 193],
    13: [1, 137, 73, 227, 17, 177, 17, 52, 13, 46, 43, 83, 132, 120],
    15: [1, 29, 196, 111, 163, 112, 74, 10, 105, 105, 139, 132, 151, 32, 134, 26],
    16: [1, 59, 13, 104, 189, 68, 209, 30, 8, 163, 65, 41, 229, 98, 50, 36, 59],
    17: [1, 119, 66, 83, 120, 119, 22, 197, 83, 249, 41, 143, 134, 85, 53, 125, 99, 79],
    18: [
      1,
      239,
      251,
      183,
      113,
      149,
      175,
      199,
      215,
      240,
      220,
      73,
      82,
      173,
      75,
      32,
      67,
      217,
      146
    ],
    20: [1, 152, 185, 240, 5, 111, 99, 6, 220, 112, 150, 69, 36, 187, 22, 228, 198, 121, 121, 165, 174],
    22: [1, 89, 179, 131, 176, 182, 244, 19, 189, 69, 40, 28, 137, 29, 123, 67, 253, 86, 218, 230, 26, 145, 245],
    24: [
      1,
      122,
      118,
      169,
      70,
      178,
      237,
      216,
      102,
      115,
      150,
      229,
      73,
      130,
      72,
      61,
      43,
      206,
      1,
      237,
      247,
      127,
      217,
      144,
      117
    ],
    26: [
      1,
      246,
      51,
      183,
      4,
      136,
      98,
      199,
      152,
      77,
      56,
      206,
      24,
      145,
      40,
      209,
      117,
      233,
      42,
      135,
      68,
      70,
      144,
      146,
      77,
      43,
      94
    ],
    28: [
      1,
      252,
      9,
      28,
      13,
      18,
      251,
      208,
      150,
      103,
      174,
      100,
      41,
      167,
      12,
      247,
      56,
      117,
      119,
      233,
      127,
      181,
      100,
      121,
      147,
      176,
      74,
      58,
      197
    ],
    30: [
      1,
      212,
      246,
      77,
      73,
      195,
      192,
      75,
      98,
      5,
      70,
      103,
      177,
      22,
      217,
      138,
      51,
      181,
      246,
      72,
      25,
      18,
      46,
      228,
      74,
      216,
      195,
      11,
      106,
      130,
      150
    ]
  };

  const RS_BLOCK_TABLE = [
    [1, 26, 19],
    [1, 26, 16],
    [1, 26, 13],
    [1, 26, 9],
    [1, 44, 34],
    [1, 44, 28],
    [1, 44, 22],
    [1, 44, 16],
    [1, 70, 55],
    [1, 70, 44],
    [2, 35, 17],
    [2, 35, 13],
    [1, 100, 80],
    [2, 50, 32],
    [2, 50, 24],
    [4, 25, 9],
    [1, 134, 108],
    [2, 67, 43],
    [2, 33, 15, 2, 34, 16],
    [2, 33, 11, 2, 34, 12],
    [2, 86, 68],
    [4, 43, 27],
    [4, 43, 19],
    [4, 43, 15],
    [2, 98, 78],
    [4, 49, 31],
    [2, 32, 14, 4, 33, 15],
    [4, 39, 13, 1, 40, 14],
    [2, 121, 97],
    [2, 60, 38, 2, 61, 39],
    [4, 40, 18, 2, 41, 19],
    [4, 40, 14, 2, 41, 15],
    [2, 146, 116],
    [3, 58, 36, 2, 59, 37],
    [4, 36, 16, 4, 37, 17],
    [4, 36, 12, 4, 37, 13],
    [2, 86, 68, 2, 87, 69],
    [4, 69, 43, 1, 70, 44],
    [6, 43, 19, 2, 44, 20],
    [6, 43, 15, 2, 44, 16],
    [4, 101, 81],
    [1, 80, 50, 4, 81, 51],
    [4, 50, 22, 4, 51, 23],
    [3, 36, 12, 8, 37, 13],
    [2, 116, 92, 2, 117, 93],
    [6, 58, 36, 2, 59, 37],
    [4, 46, 20, 6, 47, 21],
    [7, 42, 14, 4, 43, 15],
    [4, 133, 107],
    [8, 59, 37, 1, 60, 38],
    [8, 44, 20, 4, 45, 21],
    [12, 33, 11, 4, 34, 12],
    [3, 145, 115, 1, 146, 116],
    [4, 64, 40, 5, 65, 41],
    [11, 36, 16, 5, 37, 17],
    [11, 36, 12, 5, 37, 13],
    [5, 109, 87, 1, 110, 88],
    [5, 65, 41, 5, 66, 42],
    [5, 54, 24, 7, 55, 25],
    [11, 36, 12, 7, 37, 13],
    [5, 122, 98, 1, 123, 99],
    [7, 73, 45, 3, 74, 46],
    [15, 43, 19, 2, 44, 20],
    [3, 45, 15, 13, 46, 16],
    [1, 135, 107, 5, 136, 108],
    [10, 74, 46, 1, 75, 47],
    [1, 50, 22, 15, 51, 23],
    [2, 42, 14, 17, 43, 15],
    [5, 150, 120, 1, 151, 121],
    [9, 69, 43, 4, 70, 44],
    [17, 50, 22, 1, 51, 23],
    [2, 42, 14, 19, 43, 15],
    [3, 141, 113, 4, 142, 114],
    [3, 70, 44, 11, 71, 45],
    [17, 47, 21, 4, 48, 22],
    [9, 39, 13, 16, 40, 14],
    [3, 135, 107, 5, 136, 108],
    [3, 67, 41, 13, 68, 42],
    [15, 54, 24, 5, 55, 25],
    [15, 43, 15, 10, 44, 16],
    [4, 144, 116, 4, 145, 117],
    [17, 68, 42],
    [17, 50, 22, 6, 51, 23],
    [19, 46, 16, 6, 47, 17],
    [2, 139, 111, 7, 140, 112],
    [17, 74, 46],
    [7, 54, 24, 16, 55, 25],
    [34, 37, 13],
    [4, 151, 121, 5, 152, 122],
    [4, 75, 47, 14, 76, 48],
    [11, 54, 24, 14, 55, 25],
    [16, 45, 15, 14, 46, 16],
    [6, 147, 117, 4, 148, 118],
    [6, 73, 45, 14, 74, 46],
    [11, 54, 24, 16, 55, 25],
    [30, 46, 16, 2, 47, 17],
    [8, 132, 106, 4, 133, 107],
    [8, 75, 47, 13, 76, 48],
    [7, 54, 24, 22, 55, 25],
    [22, 45, 15, 13, 46, 16],
    [10, 142, 114, 2, 143, 115],
    [19, 74, 46, 4, 75, 47],
    [28, 50, 22, 6, 51, 23],
    [33, 46, 16, 4, 47, 17],
    [8, 152, 122, 4, 153, 123],
    [22, 73, 45, 3, 74, 46],
    [8, 53, 23, 26, 54, 24],
    [12, 45, 15, 28, 46, 16],
    [3, 147, 117, 10, 148, 118],
    [3, 73, 45, 23, 74, 46],
    [4, 54, 24, 31, 55, 25],
    [11, 45, 15, 31, 46, 16],
    [7, 146, 116, 7, 147, 117],
    [21, 73, 45, 7, 74, 46],
    [1, 53, 23, 37, 54, 24],
    [19, 45, 15, 26, 46, 16],
    [5, 145, 115, 10, 146, 116],
    [19, 75, 47, 10, 76, 48],
    [15, 54, 24, 25, 55, 25],
    [23, 45, 15, 25, 46, 16],
    [13, 145, 115, 3, 146, 116],
    [2, 74, 46, 29, 75, 47],
    [42, 54, 24, 1, 55, 25],
    [23, 45, 15, 28, 46, 16],
    [17, 145, 115],
    [10, 74, 46, 23, 75, 47],
    [10, 54, 24, 35, 55, 25],
    [19, 45, 15, 35, 46, 16],
    [17, 145, 115, 1, 146, 116],
    [14, 74, 46, 21, 75, 47],
    [29, 54, 24, 19, 55, 25],
    [11, 45, 15, 46, 46, 16],
    [13, 145, 115, 6, 146, 116],
    [14, 74, 46, 23, 75, 47],
    [44, 54, 24, 7, 55, 25],
    [59, 46, 16, 1, 47, 17],
    [12, 151, 121, 7, 152, 122],
    [12, 75, 47, 26, 76, 48],
    [39, 54, 24, 14, 55, 25],
    [22, 45, 15, 41, 46, 16],
    [6, 151, 121, 14, 152, 122],
    [6, 75, 47, 34, 76, 48],
    [46, 54, 24, 10, 55, 25],
    [2, 45, 15, 64, 46, 16],
    [17, 152, 122, 4, 153, 123],
    [29, 74, 46, 14, 75, 47],
    [49, 54, 24, 10, 55, 25],
    [24, 45, 15, 46, 46, 16],
    [4, 152, 122, 18, 153, 123],
    [13, 74, 46, 32, 75, 47],
    [48, 54, 24, 14, 55, 25],
    [42, 45, 15, 32, 46, 16],
    [20, 147, 117, 4, 148, 118],
    [40, 75, 47, 7, 76, 48],
    [43, 54, 24, 22, 55, 25],
    [10, 45, 15, 67, 46, 16],
    [19, 148, 118, 6, 149, 119],
    [18, 75, 47, 31, 76, 48],
    [34, 54, 24, 34, 55, 25],
    [20, 45, 15, 61, 46, 16]
  ];

  const PATTERN_POSITION_TABLE = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
    [6, 30, 54],
    [6, 32, 58],
    [6, 34, 62],
    [6, 26, 46, 66],
    [6, 26, 48, 70],
    [6, 26, 50, 74],
    [6, 30, 54, 78],
    [6, 30, 56, 82],
    [6, 30, 58, 86],
    [6, 34, 62, 90],
    [6, 28, 50, 72, 94],
    [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102],
    [6, 28, 54, 80, 106],
    [6, 32, 58, 84, 110],
    [6, 30, 58, 86, 114],
    [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122],
    [6, 30, 54, 78, 102, 126],
    [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134],
    [6, 34, 60, 86, 112, 138],
    [6, 30, 58, 86, 114, 142],
    [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150],
    [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158],
    [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166],
    [6, 30, 58, 86, 114, 142, 170]
  ];

  const EXP_TABLE = new Array(256);
  const LOG_TABLE = new Array(256);

  // Prepare Galois field lookup tables for Reed-Solomon math.
  function initGaloisTables() {
    for (let i = 0; i < 8; i++) {
      EXP_TABLE[i] = 1 << i;
    }
    for (let i = 8; i < 256; i++) {
      EXP_TABLE[i] =
        EXP_TABLE[i - 4] ^
        EXP_TABLE[i - 5] ^
        EXP_TABLE[i - 6] ^
        EXP_TABLE[i - 8];
    }
    for (let i = 0; i < 255; i++) {
      LOG_TABLE[EXP_TABLE[i]] = i;
    }
  }

  function glog(n) {
    if (n < 1) {
      throw new Error("glog(" + n + ")");
    }
    return LOG_TABLE[n];
  }

  function gexp(n) {
    return EXP_TABLE[n % 255];
  }

  function polyMultiply(a, b) {
    const result = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        result[i + j] ^= gexp(glog(a[i]) + glog(b[j]));
      }
    }
    return result;
  }

  function getGeneratorPoly(ecCount) {
    if (RS_POLY_LUT[ecCount]) {
      return RS_POLY_LUT[ecCount];
    }
    let poly = [1];
    for (let i = 0; i < ecCount; i++) {
      poly = polyMultiply(poly, [1, gexp(i)]);
    }
    RS_POLY_LUT[ecCount] = poly;
    return poly;
  }

  // Compute RS error correction bytes for a data block.
  function rsEncode(data, ecCount) {
    const gen = getGeneratorPoly(ecCount);
    const mod = data.slice();
    for (let i = 0; i < ecCount; i++) {
      mod.push(0);
    }
    for (let i = 0; i < data.length; i++) {
      const coef = mod[i];
      if (coef === 0) continue;
      for (let j = 1; j < gen.length; j++) {
        mod[i + j] ^= gexp(glog(coef) + glog(gen[j]));
      }
    }
    return mod.slice(mod.length - ecCount);
  }

  // Minimal bit buffer for assembling QR payloads.
  class BitBuffer {
    constructor() {
      this.buffer = [];
      this.length = 0;
    }

    get(index) {
      const bufIndex = Math.floor(index / 8);
      return ((this.buffer[bufIndex] >> (7 - (index % 8))) & 1) === 1;
    }

    put(num, length) {
      for (let i = 0; i < length; i++) {
        this.putBit(((num >> (length - i - 1)) & 1) === 1);
      }
    }

    putBit(bit) {
      const bufIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= bufIndex) {
        this.buffer.push(0);
      }
      if (bit) {
        this.buffer[bufIndex] |= 0x80 >> (this.length % 8);
      }
      this.length += 1;
    }
  }

  // Returns the RS block layout for a given version and ECC level.
  function rsBlocks(version, eccOffset) {
    const entry = RS_BLOCK_TABLE[(version - 1) * 4 + eccOffset];
    const blocks = [];
    for (let i = 0; i < entry.length; i += 3) {
      const count = entry[i];
      const totalCount = entry[i + 1];
      const dataCount = entry[i + 2];
      for (let j = 0; j < count; j++) {
        blocks.push({ totalCount, dataCount });
      }
    }
    return blocks;
  }

  function bitLimitFor(version, eccOffset) {
    const blocks = rsBlocks(version, eccOffset);
    return blocks.reduce((sum, block) => sum + block.dataCount * 8, 0);
  }

  function lengthBitsFor(version) {
    return version < 10 ? 8 : 16;
  }

  // Find the smallest version that fits the data for the selected ECC.
  function chooseVersion(dataBytes, eccOffset) {
    for (let version = 1; version <= 40; version++) {
      const needed = 4 + lengthBitsFor(version) + dataBytes.length * 8;
      if (needed <= bitLimitFor(version, eccOffset)) {
        return version;
      }
    }
    return null;
  }

  // Build payload bytes (data + RS error correction) for the QR matrix.
  function createData(version, eccOffset, dataBytes) {
    const buffer = new BitBuffer();
    buffer.put(0x4, 4);
    buffer.put(dataBytes.length, lengthBitsFor(version));
    for (const byte of dataBytes) {
      buffer.put(byte, 8);
    }

    const bitLimit = bitLimitFor(version, eccOffset);
    if (buffer.length > bitLimit) {
      throw new Error("Data too long for this version.");
    }

    const terminator = Math.min(4, bitLimit - buffer.length);
    for (let i = 0; i < terminator; i++) {
      buffer.putBit(false);
    }

    while (buffer.length % 8 !== 0) {
      buffer.putBit(false);
    }

    let padFlag = true;
    while (buffer.length < bitLimit) {
      buffer.put(padFlag ? PAD0 : PAD1, 8);
      padFlag = !padFlag;
    }

    const blocks = rsBlocks(version, eccOffset);
    return createBytes(buffer.buffer, blocks);
  }

  function createBytes(bufferBytes, blocks) {
    let offset = 0;
    let maxDc = 0;
    let maxEc = 0;
    const dcData = [];
    const ecData = [];

    for (const block of blocks) {
      const dcCount = block.dataCount;
      const ecCount = block.totalCount - dcCount;
      maxDc = Math.max(maxDc, dcCount);
      maxEc = Math.max(maxEc, ecCount);
      const dc = bufferBytes.slice(offset, offset + dcCount);
      offset += dcCount;
      const ec = rsEncode(dc, ecCount);
      dcData.push(dc);
      ecData.push(ec);
    }

    const data = [];
    for (let i = 0; i < maxDc; i++) {
      for (const dc of dcData) {
        if (i < dc.length) data.push(dc[i]);
      }
    }
    for (let i = 0; i < maxEc; i++) {
      for (const ec of ecData) {
        if (i < ec.length) data.push(ec[i]);
      }
    }
    return data;
  }

  function BCHDigit(data) {
    let digit = 0;
    while (data !== 0) {
      digit += 1;
      data >>= 1;
    }
    return digit;
  }

  function BCHTypeInfo(data) {
    let d = data << 10;
    while (BCHDigit(d) - BCHDigit(G15) >= 0) {
      d ^= G15 << (BCHDigit(d) - BCHDigit(G15));
    }
    return ((data << 10) | d) ^ G15_MASK;
  }

  function BCHTypeNumber(data) {
    let d = data << 12;
    while (BCHDigit(d) - BCHDigit(G18) >= 0) {
      d ^= G18 << (BCHDigit(d) - BCHDigit(G18));
    }
    return (data << 12) | d;
  }

  // Finder patterns in three corners.
  function setupPositionProbePattern(modules, row, col) {
    const count = modules.length;
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || count <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || count <= col + c) continue;
        if (
          ((0 <= r && r <= 6) && (c === 0 || c === 6)) ||
          ((0 <= c && c <= 6) && (r === 0 || r === 6)) ||
          ((2 <= r && r <= 4) && (2 <= c && c <= 4))
        ) {
          modules[row + r][col + c] = true;
        } else {
          modules[row + r][col + c] = false;
        }
      }
    }
  }

  // Timing pattern along row/column 6.
  function setupTimingPattern(modules) {
    const count = modules.length;
    for (let r = 8; r < count - 8; r++) {
      if (modules[r][6] !== null) continue;
      modules[r][6] = r % 2 === 0;
    }
    for (let c = 8; c < count - 8; c++) {
      if (modules[6][c] !== null) continue;
      modules[6][c] = c % 2 === 0;
    }
  }

  // Alignment patterns for higher versions.
  function setupPositionAdjustPattern(modules, version) {
    const pos = PATTERN_POSITION_TABLE[version - 1];
    for (let i = 0; i < pos.length; i++) {
      const row = pos[i];
      for (let j = 0; j < pos.length; j++) {
        const col = pos[j];
        if (modules[row][col] !== null) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) {
              modules[row + r][col + c] = true;
            } else {
              modules[row + r][col + c] = false;
            }
          }
        }
      }
    }
  }

  function setupTypeNumber(modules, version, test) {
    const bits = BCHTypeNumber(version);
    const count = modules.length;
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      modules[Math.floor(i / 3)][(i % 3) + count - 8 - 3] = mod;
    }
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      modules[(i % 3) + count - 8 - 3][Math.floor(i / 3)] = mod;
    }
  }

  // Format bits (ECC + mask).
  function setupTypeInfo(modules, eccCode, maskPattern, test) {
    const data = (eccCode << 3) | maskPattern;
    const bits = BCHTypeInfo(data);
    const count = modules.length;

    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      if (i < 6) {
        modules[i][8] = mod;
      } else if (i < 8) {
        modules[i + 1][8] = mod;
      } else {
        modules[count - 15 + i][8] = mod;
      }
    }

    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      if (i < 8) {
        modules[8][count - i - 1] = mod;
      } else if (i < 9) {
        modules[8][15 - i - 1 + 1] = mod;
      } else {
        modules[8][15 - i - 1] = mod;
      }
    }

    modules[count - 8][8] = !test;
  }

  function maskFunc(pattern, i, j) {
    switch (pattern) {
      case 0:
        return (i + j) % 2 === 0;
      case 1:
        return i % 2 === 0;
      case 2:
        return j % 3 === 0;
      case 3:
        return (i + j) % 3 === 0;
      case 4:
        return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5:
        return ((i * j) % 2) + ((i * j) % 3) === 0;
      case 6:
        return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
      case 7:
        return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
      default:
        return false;
    }
  }

  // Map payload bits into the QR module grid.
  function mapData(modules, data, maskPattern) {
    const count = modules.length;
    let inc = -1;
    let row = count - 1;
    let bitIndex = 7;
    let byteIndex = 0;

    for (let col = count - 1; col > 0; col -= 2) {
      if (col <= 6) col -= 1;
      const colRange = [col, col - 1];
      while (true) {
        for (const c of colRange) {
          if (modules[row][c] === null) {
            let dark = false;
            if (byteIndex < data.length) {
              dark = ((data[byteIndex] >> bitIndex) & 1) === 1;
            }
            if (maskFunc(maskPattern, row, c)) {
              dark = !dark;
            }
            modules[row][c] = dark;
            bitIndex -= 1;
            if (bitIndex === -1) {
              byteIndex += 1;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || count <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }

  // Penalty scoring for mask selection.
  function lostPoint(modules) {
    const count = modules.length;
    let lostPoint = 0;
    const container = new Array(count + 1).fill(0);

    for (let row = 0; row < count; row++) {
      let previousColor = modules[row][0];
      let length = 0;
      for (let col = 0; col < count; col++) {
        if (modules[row][col] === previousColor) {
          length += 1;
        } else {
          if (length >= 5) {
            container[length] += 1;
          }
          length = 1;
          previousColor = modules[row][col];
        }
      }
      if (length >= 5) {
        container[length] += 1;
      }
    }

    for (let col = 0; col < count; col++) {
      let previousColor = modules[0][col];
      let length = 0;
      for (let row = 0; row < count; row++) {
        if (modules[row][col] === previousColor) {
          length += 1;
        } else {
          if (length >= 5) {
            container[length] += 1;
          }
          length = 1;
          previousColor = modules[row][col];
        }
      }
      if (length >= 5) {
        container[length] += 1;
      }
    }

    for (let length = 5; length <= count; length++) {
      lostPoint += container[length] * (length - 2);
    }

    for (let row = 0; row < count - 1; row++) {
      for (let col = 0; col < count - 1; col++) {
        const color = modules[row][col];
        if (
          color === modules[row + 1][col] &&
          color === modules[row][col + 1] &&
          color === modules[row + 1][col + 1]
        ) {
          lostPoint += 3;
        }
      }
    }

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count - 10; col++) {
        if (
          !modules[row][col + 1] &&
          modules[row][col + 4] &&
          !modules[row][col + 5] &&
          modules[row][col + 6] &&
          !modules[row][col + 9] &&
          ((modules[row][col] &&
            modules[row][col + 2] &&
            modules[row][col + 3] &&
            !modules[row][col + 7] &&
            !modules[row][col + 8] &&
            !modules[row][col + 10]) ||
            (!modules[row][col] &&
              !modules[row][col + 2] &&
              !modules[row][col + 3] &&
              modules[row][col + 7] &&
              modules[row][col + 8] &&
              modules[row][col + 10]))
        ) {
          lostPoint += 40;
        }
      }
    }

    for (let col = 0; col < count; col++) {
      for (let row = 0; row < count - 10; row++) {
        if (
          !modules[row + 1][col] &&
          modules[row + 4][col] &&
          !modules[row + 5][col] &&
          modules[row + 6][col] &&
          !modules[row + 9][col] &&
          ((modules[row][col] &&
            modules[row + 2][col] &&
            modules[row + 3][col] &&
            !modules[row + 7][col] &&
            !modules[row + 8][col] &&
            !modules[row + 10][col]) ||
            (!modules[row][col] &&
              !modules[row + 2][col] &&
              !modules[row + 3][col] &&
              modules[row + 7][col] &&
              modules[row + 8][col] &&
              modules[row + 10][col]))
        ) {
          lostPoint += 40;
        }
      }
    }

    let darkCount = 0;
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (modules[row][col]) darkCount += 1;
      }
    }
    const percent = darkCount / (count * count);
    const rating = Math.floor(Math.abs(percent * 100 - 50) / 5);
    lostPoint += rating * 10;

    return lostPoint;
  }

  function buildMatrix(version, eccCode, eccOffset, dataBytes, maskPattern) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => Array(size).fill(null));
    setupPositionProbePattern(modules, 0, 0);
    setupPositionProbePattern(modules, size - 7, 0);
    setupPositionProbePattern(modules, 0, size - 7);
    setupPositionAdjustPattern(modules, version);
    setupTimingPattern(modules);
    setupTypeInfo(modules, eccCode, maskPattern, false);
    if (version >= 7) {
      setupTypeNumber(modules, version, false);
    }
    mapData(modules, dataBytes, maskPattern);
    return modules;
  }

  // Generate the QR matrix with the chosen configuration.
  function makeQr(dataBytes, eccLevel, version, maskChoice) {
    const ecc = ECC_LEVELS[eccLevel] || ECC_LEVELS.M;
    const eccOffset = ecc.rsOffset;
    const eccCode = ecc.code;
    const actualVersion = version === "auto" ? chooseVersion(dataBytes, eccOffset) : version;
    if (!actualVersion) {
      throw new Error("Data too long for the available versions.");
    }
    const data = createData(actualVersion, eccOffset, dataBytes);
    let maskPattern = 0;
    if (maskChoice === "auto") {
      let minLost = 0;
      for (let i = 0; i < 8; i++) {
        const testModules = buildMatrix(actualVersion, eccCode, eccOffset, data, i);
        const score = lostPoint(testModules);
        if (i === 0 || score < minLost) {
          minLost = score;
          maskPattern = i;
        }
      }
    } else {
      maskPattern = maskChoice;
    }
    const modules = buildMatrix(actualVersion, eccCode, eccOffset, data, maskPattern);
    return { modules, version: actualVersion, maskPattern };
  }

  // Render matrix to a black canvas with white modules.
  function renderQr(canvas, modules, scale, margin, foreground, background) {
    const size = modules.length;
    const dpr = window.devicePixelRatio || 1;
    const canvasSize = (size + margin * 2) * scale;
    canvas.width = Math.round(canvasSize * dpr);
    canvas.height = Math.round(canvasSize * dpr);
    canvas.style.width = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    ctx.fillStyle = foreground;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (modules[row][col]) {
          ctx.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
        }
      }
    }
  }

  // Wire up UI and generate previews.
  function init() {
    initGaloisTables();

    const textInput = document.getElementById("qrText");
    const versionSelect = document.getElementById("qrVersion");
    const eccSelect = document.getElementById("qrEcc");
    const maskSelect = document.getElementById("qrMask");
    const scaleInput = document.getElementById("qrScale");
    const marginInput = document.getElementById("qrMargin");
    const foregroundInput = document.getElementById("qrForeground");
    const backgroundInput = document.getElementById("qrBackground");
    const generateButton = document.getElementById("qrGenerate");
    const canvas = document.getElementById("qrCanvas");
    const status = document.getElementById("qrStatus");
    const encoder = new TextEncoder();

    if (
      !textInput ||
      !versionSelect ||
      !eccSelect ||
      !maskSelect ||
      !scaleInput ||
      !marginInput ||
      !foregroundInput ||
      !backgroundInput ||
      !canvas
    ) {
      return;
    }

    versionSelect.innerHTML = "";
    const autoOption = document.createElement("option");
    autoOption.value = "auto";
    autoOption.textContent = "Auto";
    versionSelect.appendChild(autoOption);
    for (let i = 1; i <= 40; i++) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = String(i);
      versionSelect.appendChild(option);
    }

    versionSelect.value = QR_DEFAULTS.version;
    eccSelect.value = QR_DEFAULTS.errorCorrection;
    maskSelect.value = QR_DEFAULTS.mask;
    scaleInput.value = String(QR_DEFAULTS.scale);
    marginInput.value = String(QR_DEFAULTS.margin);
    foregroundInput.value = QR_DEFAULTS.foreground;
    backgroundInput.value = QR_DEFAULTS.background;
    textInput.value = "ToolSuite";

    function updateStatus(message, isError) {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle("status-text--error", Boolean(isError));
    }

    function clearCanvas() {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function generate() {
      const text = textInput.value;
      if (!text.length) {
        clearCanvas();
        updateStatus("Enter text or a URL to generate a QR code.", false);
        return;
      }
      const dataBytes = Array.from(encoder.encode(text));
      const eccLevel = eccSelect.value;
      const versionValue = versionSelect.value === "auto" ? "auto" : parseInt(versionSelect.value, 10);
      const maskValue = maskSelect.value === "auto" ? "auto" : parseInt(maskSelect.value, 10);
      const scale = Math.max(2, Math.min(20, parseInt(scaleInput.value, 10) || QR_DEFAULTS.scale));
      const margin = Math.max(0, Math.min(10, parseInt(marginInput.value, 10) || QR_DEFAULTS.margin));
      const foreground = foregroundInput.value || QR_DEFAULTS.foreground;
      const background = backgroundInput.value || QR_DEFAULTS.background;
      scaleInput.value = String(scale);
      marginInput.value = String(margin);
      try {
        const qr = makeQr(dataBytes, eccLevel, versionValue, maskValue);
        renderQr(canvas, qr.modules, scale, margin, foreground, background);
        updateStatus(`Version ${qr.version} • Mask ${qr.maskPattern} • ${dataBytes.length} bytes`, false);
      } catch (error) {
        clearCanvas();
        updateStatus(error.message || "Unable to generate QR code.", true);
      }
    }

    function scheduleGenerate() {
      window.requestAnimationFrame(generate);
    }

    const form = document.getElementById("qrForm");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        generate();
      });
    }

    generateButton?.addEventListener("click", generate);
    textInput.addEventListener("input", scheduleGenerate);
    versionSelect.addEventListener("change", generate);
    eccSelect.addEventListener("change", generate);
    maskSelect.addEventListener("change", generate);
    scaleInput.addEventListener("input", generate);
    marginInput.addEventListener("input", generate);
    foregroundInput.addEventListener("input", generate);
    backgroundInput.addEventListener("input", generate);

    generate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
