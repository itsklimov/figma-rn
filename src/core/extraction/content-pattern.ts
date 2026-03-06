/**
 * Content pattern detection for semantic prop names.
 */

interface ContentPattern {
  priority: number;
  name: string;
  test: (text: string) => boolean;
}

const CURRENCY_SYMBOLS = ['₽', '$', '€', '£', '¥', '₴', '₸', '₿'];

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

const CYRILLIC_MONTHS = [
  'январ', 'феврал', 'март', 'апрел', 'ма', 'июн',
  'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр',
];

const LATIN_MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
];

const ADDRESS_KEYWORDS = [
  'улица', 'ул.', 'ул ', 'бульвар', 'бул.', 'бул ', 'проспект', 'просп.', 'просп ', 'пр-т',
  'переулок', 'пер.', 'пер ', 'набережная', 'наб.', 'наб ', 'шоссе', 'ш.', 'ш ',
  'площадь', 'пл.', 'пл ', 'street', 'st.', 'st ', 'avenue', 'ave.', 'ave ',
  'boulevard', 'blvd.', 'blvd ', 'road', 'rd.', 'rd ',
];

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

const CONTENT_PATTERNS: ContentPattern[] = [
  {
    priority: 10,
    name: 'price',
    test: (text: string): boolean => {
      const normalized = text.trim();
      const hasCurrencySymbol = CURRENCY_SYMBOLS.some((symbol) => normalized.includes(symbol));
      if (!hasCurrencySymbol) return false;
      return /\d/.test(normalized);
    },
  },
  {
    priority: 9,
    name: 'amount',
    test: (text: string): boolean => {
      const normalized = text.trim();
      if (!/^[+\-−]\s*[\d\s\u00A0]+$/.test(normalized)) return false;
      if (!/\d/.test(normalized)) return false;
      const digits = normalized.replace(/\D/g, '');
      const hasThousandSeparator = /\d[\s\u00A0]\d/.test(normalized);
      if (hasThousandSeparator) {
        return digits.length <= 7;
      }
      return digits.length <= 4;
    },
  },
  {
    priority: 9,
    name: 'cardBrand',
    test: (text: string): boolean => {
      const normalized = text.trim();
      return PAYMENT_BRANDS.some((brand) => normalized.toLowerCase() === brand.toLowerCase());
    },
  },
  {
    priority: 8,
    name: 'cardLastDigits',
    test: (text: string): boolean => {
      const normalized = text.trim();
      return /^[•·*\s]*\d{4}$/.test(normalized);
    },
  },
  {
    priority: 8,
    name: 'time',
    test: (text: string): boolean => {
      const normalized = text.trim();
      return /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(normalized);
    },
  },
  {
    priority: 8,
    name: 'duration',
    test: (text: string): boolean => {
      const normalized = text.trim().toLowerCase();
      return /^\d+\s*(мин|min|minutes?|hrs?|hours?|ч|час|часа|часов)$/.test(normalized);
    },
  },
  {
    priority: 8,
    name: 'reviewCount',
    test: (text: string): boolean => {
      const normalized = text.trim();
      return /^\(\d+\)$/.test(normalized);
    },
  },
  {
    priority: 7,
    name: 'date',
    test: (text: string): boolean => {
      const normalized = text.trim().toLowerCase();
      const hasMonth = CYRILLIC_MONTHS.some((month) => normalized.includes(month));
      const hasDay = /\d{1,2}/.test(normalized);
      return hasMonth && hasDay;
    },
  },
  {
    priority: 7,
    name: 'date',
    test: (text: string): boolean => {
      const normalized = text.trim().toLowerCase();
      const hasMonth = LATIN_MONTHS.some((month) => normalized.includes(month));
      const hasDay = /\d{1,2}/.test(normalized);
      return hasMonth && hasDay;
    },
  },
  {
    priority: 6,
    name: 'rating',
    test: (text: string): boolean => {
      const normalized = text.trim();
      return /^[0-5][.,]\d$/.test(normalized);
    },
  },
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
  {
    priority: 5,
    name: 'address',
    test: (text: string): boolean => {
      const normalized = text.trim().toLowerCase();
      if (!/\d/.test(normalized)) return false;
      return ADDRESS_KEYWORDS.some((keyword) => normalized.includes(keyword));
    },
  },
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

  return GENERIC_FIGMA_PATTERNS.some((pattern) => pattern.test(trimmed));
}
