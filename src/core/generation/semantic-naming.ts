/**
 * Semantic naming module for content pattern detection
 *
 * Detects meaningful patterns in text content to generate semantic prop names
 * instead of generic auto-generated names like "style3000"
 */

/**
 * Pattern definition with priority and semantic name
 */
interface ContentPattern {
  /** Pattern priority (higher = checked first) */
  priority: number;
  /** Semantic name to return when pattern matches */
  name: string;
  /** Test function that checks if text matches pattern */
  test: (text: string) => boolean;
}

/**
 * Currency symbols for price detection
 */
const CURRENCY_SYMBOLS = ['₽', '$', '€', '£', '¥', '₴', '₸', '₿'];

/**
 * Payment brand names (Cyrillic and Latin)
 */
const PAYMENT_BRANDS = [
  'МИР', 'MIR',
  'MasterCard', 'Mastercard', 'MASTERCARD',
  'Visa', 'VISA',
  'СБП', 'SBP',
  'Maestro', 'MAESTRO',
  'UnionPay', 'UNIONPAY',
  'AmEx', 'AMEX', 'American Express',
  'JCB',
];

/**
 * Cyrillic month names (nominative and genitive cases)
 */
const CYRILLIC_MONTHS = [
  'январ', 'феврал', 'март', 'апрел', 'ма', 'июн',
  'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр',
];

/**
 * Latin month names (full and abbreviated)
 */
const LATIN_MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
];

/**
 * Generic Figma auto-generated name patterns
 */
const GENERIC_FIGMA_PATTERNS = [
  /^Frame\s*\d*$/i,
  /^Rectangle\s*\d*$/i,
  /^Ellipse\s*\d*$/i,
  /^Group\s*\d*$/i,
  /^Vector\s*\d*$/i,
  /^Line\s*\d*$/i,
  /^Polygon\s*\d*$/i,
  /^Star\s*\d*$/i,
  /^Text\s*\d*$/i,
  /^Component\s*\d*$/i,
  /^Instance\s*\d*$/i,
  /^Slice\s*\d*$/i,
  /^Union\s*\d*$/i,
  /^Subtract\s*\d*$/i,
  /^Intersect\s*\d*$/i,
  /^Exclude\s*\d*$/i,
  /^Image\s*\d*$/i,
  /^Shape\s*\d*$/i,
  /^Layer\s*\d*$/i,
];

/**
 * Ordered content patterns by priority (highest first)
 */
const CONTENT_PATTERNS: ContentPattern[] = [
  // Priority 10: Currency with symbol
  {
    priority: 10,
    name: 'price',
    test: (text: string): boolean => {
      const normalized = text.trim();
      const hasCurrencySymbol = CURRENCY_SYMBOLS.some(symbol => normalized.includes(symbol));
      if (!hasCurrencySymbol) return false;
      return /\d/.test(normalized);
    },
  },

  // Priority 9: Signed amount (+30, - 3 000, +1 300)
  {
    priority: 9,
    name: 'amount',
    test: (text: string): boolean => {
      const normalized = text.trim();
      if (!/^[+\-−]\s*[\d\s\u00A0]+$/.test(normalized)) return false;
      if (!/\d/.test(normalized)) return false;
      const digits = normalized.replace(/\D/g, '');
      // For amounts without separators, limit to 4 digits (e.g., +30, -100, +9999)
      // For amounts with separators (spaces), allow up to 7 digits (e.g., +1 300 000)
      const hasThousandSeparator = /\d[\s\u00A0]\d/.test(normalized);
      if (hasThousandSeparator) {
        return digits.length <= 7;
      }
      return digits.length <= 4;
    },
  },

  // Priority 9: Payment brands
  {
    priority: 9,
    name: 'cardBrand',
    test: (text: string): boolean => {
      const normalized = text.trim();
      return PAYMENT_BRANDS.some(brand =>
        normalized.toLowerCase() === brand.toLowerCase()
      );
    },
  },

  // Priority 8: Card last 4 digits
  {
    priority: 8,
    name: 'cardLastDigits',
    test: (text: string): boolean => {
      const normalized = text.trim();
      return /^[•·*\s]*\d{4}$/.test(normalized);
    },
  },

  // Priority 7: Date (Cyrillic)
  {
    priority: 7,
    name: 'date',
    test: (text: string): boolean => {
      const normalized = text.trim().toLowerCase();
      const hasMonth = CYRILLIC_MONTHS.some(month => normalized.includes(month));
      const hasDay = /\d{1,2}/.test(normalized);
      return hasMonth && hasDay;
    },
  },

  // Priority 7: Date (Latin)
  {
    priority: 7,
    name: 'date',
    test: (text: string): boolean => {
      const normalized = text.trim().toLowerCase();
      const hasMonth = LATIN_MONTHS.some(month => normalized.includes(month));
      const hasDay = /\d{1,2}/.test(normalized);
      return hasMonth && hasDay;
    },
  },

  // Priority 6: Phone number
  {
    priority: 6,
    name: 'phone',
    test: (text: string): boolean => {
      const normalized = text.trim();
      const phonePattern = /^\+\d[\d\s\-().]{7,}$/;
      if (!phonePattern.test(normalized)) return false;
      const digits = normalized.replace(/\D/g, '');
      return digits.length >= 7;
    },
  },

  // Priority 5: Percentage
  {
    priority: 5,
    name: 'percentage',
    test: (text: string): boolean => {
      const normalized = text.trim();
      return /^[\d\s,.]+%$/.test(normalized) && /\d/.test(normalized);
    },
  },
];

export function detectContentPattern(text: string): string | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  for (const pattern of CONTENT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return pattern.name;
    }
  }

  return null;
}

export function isGenericFigmaName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return true;
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return true;
  }

  return GENERIC_FIGMA_PATTERNS.some(pattern => pattern.test(trimmed));
}
