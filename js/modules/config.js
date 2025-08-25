export const BUTTON_DEPTH = 0.28;
export const TEXT_Z_OFFSET = 0.08;
export const ITEMS_PER_PAGE = 100;

export const VOWEL_GROUPS = [
  "aa",
  "ee",
  "ii",
  "ie",
  "oo",
  "uu",
  "oe",
  "eu",
  "ui",
  "ij",
  "ei",
  "ai",
  "au",
  "ou",
  "y",
];

export const ONE_LETTER_VOWELS = ["a", "e", "i", "o", "u"];

const defaultAllowedVowels = VOWEL_GROUPS.reduce((acc, vg) => {
  acc[vg] = vg !== "y";
  return acc;
}, {});

export const DEFAULT_SETTINGS = {
  enable3d: false,
  enableValidationHighlight: false,
  language: "nl-NL",
  allowedVowelGroups: { ...defaultAllowedVowels },
  pitch: 1.0,
  rate: 1.0,
  vowelOptionsExpanded: false,
};

const allVowelsOnMask = (1 << VOWEL_GROUPS.length) - 1;
const yIndex = VOWEL_GROUPS.indexOf("y");
export const DEFAULT_VOWEL_MASK = allVowelsOnMask & ~(1 << yIndex);
