// Evidence-based halal classification for a restaurant/place. Never
// claims a restaurant IS halal unless real evidence supports it — see
// README "Restaurant halal verification limitations" before changing any
// of this logic or its wording.
//
// Two modes:
//  - List mode (deep: false, the default): classifies from OpenStreetMap
//    tags only (diet:halal=*, cuisine=*) — cheap, no outbound web
//    requests, safe to run for every restaurant in a results list.
//  - Deep mode (deep: true, used by GET /api/restaurants/:id/verify-halal):
//    additionally fetches the restaurant's own official website/menu URL
//    (only ever a URL that came from OSM data — never a URL discovered by
//    searching/scraping) if ENABLE_WEB_MENU_CHECK=true, and scans its text
//    for halal/pork mentions as supplementary evidence.

export const HALAL_CLASSIFICATION = {
  HALAL_CONFIRMED: 'halal_confirmed',
  LIKELY_HALAL: 'likely_halal',
  MIXED_NEEDS_VERIFICATION: 'mixed_needs_verification',
  NON_HALAL: 'non_halal',
  UNKNOWN: 'unknown',
};

const PORK_TERMS = [
  'pork', 'bacon', 'ham', 'pepperoni', 'pork sausage', 'pork ribs',
  'pulled pork', 'prosciutto', 'lard', 'pork gelatin',
];

const HALAL_CERTIFIED_PATTERN = /halal[- ]?certified|100%\s*halal|fully halal|certified halal/;
const HALAL_OPTIONS_PATTERN = /halal (chicken|beef|lamb|meat|options|menu|dishes)/;

// Crude heuristic: if the cuisine tag lists multiple distinct cuisines
// alongside "halal" (e.g. "halal;pizza;italian"), treat that as a
// mixed-menu signal rather than a fully-halal restaurant.
function cuisineLooksMixed(cuisine) {
  return cuisine.split(/[;,]/).map((s) => s.trim()).filter(Boolean).length > 1;
}

// Cuisines where halal food is the strong cultural/religious norm across
// most of the world — NOT a guarantee for any single restaurant (a
// Turkish or Lebanese restaurant outside its home region could still be
// run non-halal), which is why this is only ever used as a low-confidence
// LAST-RESORT signal when no stronger tag/text evidence exists at all,
// and pork evidence or an explicit diet:halal=no tag always overrides it
// (both are checked earlier). This is a deliberate, narrow exception to
// "don't infer from cuisine alone" — not an abandonment of that
// principle — added because leaving these consistently as "Unknown" was
// unhelpful when the cuisine itself is a genuine (if imperfect) signal.
const HALAL_LIKELY_CUISINE_KEYWORDS = [
  'turkish', 'lebanese', 'syrian', 'yemeni', 'iranian', 'persian', 'afghan',
  'pakistani', 'bangladeshi', 'moroccan', 'tunisian', 'algerian', 'egyptian',
  'saudi', 'emirati', 'kurdish', 'arab', 'kebab', 'shawarma', 'indonesian',
  'malaysian', 'somali', 'sudanese', 'middle_eastern', 'middle eastern',
];

function cuisineSuggestsLikelyHalal(cuisine) {
  return HALAL_LIKELY_CUISINE_KEYWORDS.some((kw) => cuisine.includes(kw));
}

export class RestaurantHalalVerifier {
  constructor({ webMenuChecker, enableWebMenuCheck, certificationDirectoryService }) {
    this.webMenuChecker = webMenuChecker;
    this.enableWebMenuCheck = enableWebMenuCheck;
    this.certificationDirectoryService = certificationDirectoryService;
  }

  async verify(place, { deep = false } = {}) {
    const tags = place.tags || {};
    const reasons = [];
    const evidence = [];
    const sourceLinks = [];
    let sourceType = 'not_available';

    const dietHalal = (tags['diet:halal'] || '').toLowerCase();
    const cuisine = (tags.cuisine || '').toLowerCase();

    // Real third-party certification check — cheap once the directories
    // are cached (see HalalCertificationDirectoryService), so this runs
    // in list mode too, not just deep mode.
    let certificationMatch = null;
    if (this.certificationDirectoryService) {
      certificationMatch = await this.certificationDirectoryService.findMatch({
        name: place.name || tags.name,
        lat: place.lat,
        lon: place.lon,
        addrCity: tags['addr:city'] || null,
      });
    }
    if (certificationMatch) {
      evidence.push(`Listed as halal-certified by ${certificationMatch.source} ("${certificationMatch.matchedName}")`);
      sourceLinks.push(certificationMatch.url);
    }

    let lowerWebsiteText = '';
    if (deep && this.enableWebMenuCheck) {
      const menuUrl = place.websiteMenu || place.website;
      if (menuUrl) {
        const websiteText = await this.webMenuChecker.fetchPageText(menuUrl);
        if (websiteText) {
          lowerWebsiteText = websiteText.toLowerCase();
          sourceType = place.websiteMenu ? 'official_menu' : 'official_website';
          sourceLinks.push(menuUrl);
        }
      }
    }

    const tagHalalOnly = dietHalal === 'only';
    const tagHalalYes = dietHalal === 'yes';
    const tagHalalNo = dietHalal === 'no';
    const cuisineMentionsHalal = cuisine.includes('halal');

    const porkMatch = PORK_TERMS.find((t) => lowerWebsiteText.includes(t));
    const salamiMentionsPork = lowerWebsiteText.includes('salami') && !lowerWebsiteText.includes('beef salami');
    const porkDetected = Boolean(porkMatch) || salamiMentionsPork;

    const websiteHalalCertified = HALAL_CERTIFIED_PATTERN.test(lowerWebsiteText);
    const websiteHalalOptions = HALAL_OPTIONS_PATTERN.test(lowerWebsiteText);

    if (tagHalalOnly) evidence.push('OpenStreetMap tag diet:halal=only');
    if (tagHalalYes) evidence.push('OpenStreetMap tag diet:halal=yes');
    if (tagHalalNo) evidence.push('OpenStreetMap tag diet:halal=no');
    if (cuisineMentionsHalal) evidence.push(`OpenStreetMap cuisine tag mentions halal ("${tags.cuisine}")`);
    if (websiteHalalCertified) evidence.push('Official website/menu text mentions halal certification');
    if (websiteHalalOptions) evidence.push('Official website/menu text mentions halal options/dishes');
    if (porkDetected) evidence.push(`Official website/menu text mentions a pork-related term ("${porkMatch || 'salami'}")`);

    // Priority order matters: a real third-party certifier match is the
    // strongest evidence available (an actual audit, not an inferred or
    // self-reported signal) so it's checked first and wins even over a
    // pork-term match in scraped website text — a naive substring scan is
    // more likely to be a false positive (e.g. "no pork used") than a
    // matched, GPS/city-verified certification is to be wrong. Below that,
    // pork evidence overrides halal-leaning evidence unless the source
    // clearly separates a halal-only branch or menu section — which this
    // analyzer has no reliable way to detect from tags/text alone, so that
    // carve-out is never applied automatically.
    let classification;
    let confidence;

    if (certificationMatch) {
      classification = HALAL_CLASSIFICATION.HALAL_CONFIRMED;
      confidence = 'high';
      sourceType = 'third_party_certifier';
      reasons.push(
        `Found in ${certificationMatch.source}'s public directory of halal-certified restaurants — a real third-party halal certification body, not an inferred signal.`
      );
    } else if (porkDetected) {
      classification = HALAL_CLASSIFICATION.NON_HALAL;
      confidence = sourceType !== 'not_available' ? 'high' : 'medium';
      reasons.push(
        'Pork-related item(s) found in official website/menu text. This overrides halal-leaning signals — please verify directly if you believe this is a halal-only branch or section.'
      );
    } else if (tagHalalNo) {
      classification = HALAL_CLASSIFICATION.NON_HALAL;
      confidence = 'medium';
      reasons.push('OpenStreetMap explicitly tags this place as not halal (diet:halal=no).');
    } else if (tagHalalOnly || websiteHalalCertified) {
      classification = HALAL_CLASSIFICATION.HALAL_CONFIRMED;
      confidence = 'high';
      reasons.push('Strong evidence of halal certification / halal-only status.');
    } else if (tagHalalYes || websiteHalalOptions || cuisineMentionsHalal) {
      if (cuisineLooksMixed(cuisine)) {
        classification = HALAL_CLASSIFICATION.MIXED_NEEDS_VERIFICATION;
        confidence = 'medium';
        reasons.push('Halal-related evidence found, but this place may also serve non-halal items — please verify before visiting.');
      } else {
        classification = HALAL_CLASSIFICATION.LIKELY_HALAL;
        confidence = 'medium';
        reasons.push('Evidence suggests halal options are available, but it is not fully confirmed.');
      }
    } else if (cuisineSuggestsLikelyHalal(cuisine)) {
      // Weaker than the block above — no explicit halal tag/text, just a
      // cuisine that's commonly (not universally) halal in practice.
      // Always 'low' confidence and always phrased as unconfirmed.
      evidence.push(`OpenStreetMap cuisine tag ("${tags.cuisine}") is commonly associated with halal food`);
      if (cuisineLooksMixed(cuisine)) {
        classification = HALAL_CLASSIFICATION.MIXED_NEEDS_VERIFICATION;
        confidence = 'low';
        reasons.push(`This cuisine ("${tags.cuisine}") is commonly halal, but the listing also suggests other cuisine types — please verify before visiting.`);
      } else {
        classification = HALAL_CLASSIFICATION.LIKELY_HALAL;
        confidence = 'low';
        reasons.push(`This cuisine type ("${tags.cuisine}") is commonly associated with halal food in much of the world — this is not confirmed for this specific restaurant, please verify.`);
      }
    } else {
      classification = HALAL_CLASSIFICATION.UNKNOWN;
      confidence = 'low';
      reasons.push('No reliable halal or non-halal evidence was found for this place. Halal status is not inferred from cuisine type alone.');
    }

    if (sourceType === 'not_available' && evidence.length > 0) {
      sourceType = 'osm_tag';
    }

    return {
      classification,
      confidence,
      reasons,
      evidence,
      sourceType,
      sourceLinks,
      porkDetected,
      needsManualVerification: classification !== HALAL_CLASSIFICATION.HALAL_CONFIRMED,
    };
  }
}
