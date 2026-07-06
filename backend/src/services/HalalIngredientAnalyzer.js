// Keyword-based ingredient screening — deliberately NOT a certification:
// it flags possibilities for the user to verify, and callers must never
// render its output as an absolute claim (see README "Known limitations").
//
// This runs server-side so both the barcode path and the OCR path share
// exactly one classification implementation (a single source of truth,
// rather than duplicating the rule set in the frontend). The frontend is
// expected to have already translated the text to English (OCR + MyMemory
// happen client-side) before POSTing here — this analyzer's word lists
// are English, with a small multilingual safety net for the highest-risk
// terms in case untranslated text slips through.

const NON_HALAL_KEYWORDS = [
  'pork', 'lard', 'bacon', 'ham', 'pancetta', 'prosciutto', 'pepperoni',
  'pork gelatin', 'gelatin (pork)', 'non-halal gelatin',
  'ethanol', 'alcohol', 'wine', 'beer', 'rum', 'sherry', 'brandy',
];

// Small safety net for a few of the highest-risk terms in their most
// common source languages, in case text reaches this analyzer without
// having gone through translation first. Not exhaustive — translation
// upstream is still the primary path to multilingual support.
const MULTILINGUAL_NON_HALAL_KEYWORDS = [
  'خنزير',       // Arabic: pork/pig
  'لحم خنزير',   // Arabic: pork meat
  'babi',        // Indonesian/Malay: pig/pork
  'cerdo',       // Spanish: pig/pork
  'porc',        // French: pork
  'schwein',     // German: pig/pork
];

const AMBIGUOUS_KEYWORDS = [
  { key: 'gelatin', reason: 'animal source not specified — could be pork, beef, or fish' },
  { key: 'mono- and diglycerides', reason: 'can be derived from either plant or animal fat' },
  { key: 'monoglycerides', reason: 'can be derived from either plant or animal fat' },
  { key: 'diglycerides', reason: 'can be derived from either plant or animal fat' },
  { key: 'whey', reason: 'production may involve animal-derived rennet' },
  { key: 'rennet', reason: 'often derived from animal enzymes' },
  { key: 'enzymes', reason: 'processing aid source is often undisclosed' },
  { key: 'l-cysteine', reason: 'can be derived from animal hair/feathers, or made synthetically' },
  { key: 'natural flavor', reason: 'the ingredients behind "natural flavor" are rarely disclosed' },
  { key: 'natural flavour', reason: 'the ingredients behind "natural flavour" are rarely disclosed' },
  { key: 'carmine', reason: 'insect-derived colorant; permissibility is debated among scholars' },
  { key: 'cochineal', reason: 'insect-derived colorant; permissibility is debated among scholars' },
  { key: 'vanilla extract', reason: 'often uses alcohol as a solvent/carrier' },
];

// Meat-type detection is a required, unconditional step — halal status
// for these depends on slaughter method (zabiha), which text alone can
// never confirm. Pork/ham/bacon are NOT listed here since they're already
// covered, more severely, by NON_HALAL_KEYWORDS.
const MEAT_VERIFICATION_REASON =
  'meat ingredient — halal slaughter (zabiha) method cannot be confirmed from ingredient text alone; look for a halal certification mark';
const MEAT_KEYWORDS = [
  'beef', 'chicken', 'poultry', 'turkey', 'duck', 'lamb', 'mutton', 'veal', 'goat', 'venison', 'meat',
].map((key) => ({ key, reason: MEAT_VERIFICATION_REASON }));

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary matching instead of plain substring matching, so a short
// keyword like "ham" doesn't false-positive inside an unrelated word like
// "chamomile". \b is Latin-script-only, so this falls back to a plain
// substring check for non-Latin scripts (e.g. Arabic), where \b doesn't
// apply meaningfully anyway.
function containsKeyword(lowerText, keyword) {
  if (/^[\x00-\x7F]*$/.test(keyword)) {
    return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(lowerText);
  }
  return lowerText.includes(keyword.toLowerCase());
}

// Drop matches that are pure substrings of a longer match already found
// (e.g. "pork" is contained in "pork gelatin") — only show the more
// specific/complete phrase once.
function dedupSubstringMatches(matches, keyOf) {
  return matches.filter(
    (match, i) =>
      !matches.some(
        (other, j) => i !== j && keyOf(other).length > keyOf(match).length && keyOf(other).includes(keyOf(match))
      )
  );
}

export class HalalIngredientAnalyzer {
  analyze(text) {
    const lower = (text || '').toLowerCase();

    const rawNonHalalMatches = NON_HALAL_KEYWORDS.filter((kw) => containsKeyword(lower, kw));
    const rawMultilingualMatches = MULTILINGUAL_NON_HALAL_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
    const nonHalalMatches = dedupSubstringMatches([...rawNonHalalMatches, ...rawMultilingualMatches], (kw) => kw);

    // Don't double-flag generic "gelatin" as ambiguous if a more specific
    // non-halal gelatin phrase already matched it above.
    const hasSpecificNonHalalGelatin = nonHalalMatches.some((kw) => kw.includes('gelatin'));
    const rawAmbiguousMatches = AMBIGUOUS_KEYWORDS.filter(({ key }) => {
      if (key === 'gelatin' && hasSpecificNonHalalGelatin) return false;
      return containsKeyword(lower, key);
    });
    const ambiguousMatches = dedupSubstringMatches(rawAmbiguousMatches, ({ key }) => key);

    // Required step: detect any meat type present. Runs unconditionally —
    // never skipped, so meat presence can never slip through as a silent pass.
    const rawMeatMatches = MEAT_KEYWORDS.filter(({ key }) => containsKeyword(lower, key));
    const meatMatches = dedupSubstringMatches(rawMeatMatches, ({ key }) => key);

    const hasRisk = nonHalalMatches.length > 0 || ambiguousMatches.length > 0 || meatMatches.length > 0;

    return { nonHalalMatches, ambiguousMatches, meatMatches, hasRisk };
  }
}
