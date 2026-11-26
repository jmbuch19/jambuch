// Creator's Space question flow (docs/CREATORS_QUESTION_FLOW.md): every question in one
// place. The admin can change any wording here without touching the logic.
// Voice (owner's decision, 26 Nov 2026): writer-facing text says "we / our / us" (Gujarati
// અમે / અમારું, Hindi हम / हमारा), never "I", "me" or a person's name.
//
//   id        the answer's key (choices are stored in creator_requests.answers)
//   stage     0–8, as in the spec; stage 0 runs before sign-in (no Claude, no cost)
//   kind      single · multi · text (free text: stored privately in R2, never in a table)
//             · special (a screen with its own component: story, consent, plan…)
//   showIf    the cascade: the question appears only when this is true
//   stop      an answer that ends the flow, with the message shown
//
// The sample is PAID: ₹499 after the plan is approved, deducted from the full price if the
// writer goes ahead (owner's decision, 25 Nov 2026, superseding the free sample); ₹999 with
// Varta Vishva Directors (26 Nov 2026). Never "free sample".
// Gujarati and Hindi are first drafts: the admin checks every line before launch.

import { VOCABULARY } from "./vocabulary";

export type Lang = "en" | "gu" | "hi";
export type L = Record<Lang, string>;
export type Answer = string | string[];
export type Answers = Record<string, Answer>;

export type Option = { id: string; label: L; hint?: L };
export type Stop = { kind: "end" | "needs_human"; message: L };

export type Special =
  | "price_range"
  | "signin"
  | "you"
  | "story"
  | "consent"
  | "level"
  | "length_check"
  | "look"
  | "characters"
  | "pictures"
  | "episodes"
  | "followups"
  | "plan";

export type Question = {
  id: string;
  stage: number;
  kind: "single" | "multi" | "text" | "special";
  special?: Special;
  label: L;
  help?: L;
  options?: Option[];
  max?: number; // multi: most choices allowed
  default?: Answer;
  optional?: boolean; // "Skip if unsure" is shown
  rows?: number; // text: size of the box
  maxLength?: number; // text
  showIf?: (a: Answers, ctx: Ctx) => boolean;
  stop?: (a: Answers) => Stop | null;
};

// Facts the flow knows besides the answers (from the server).
export type Ctx = { storyChars: number; storyLang: string | null; characters: number };

export const STAGE_NAMES: Record<number, L> = {
  0: { en: "Getting started", gu: "શરૂઆત", hi: "शुरुआत" },
  1: { en: "Your story", gu: "તમારી વાર્તા", hi: "आपकी कहानी" },
  2: { en: "Purpose and audience", gu: "હેતુ અને પ્રેક્ષકો", hi: "उद्देश्य और दर्शक" },
  3: { en: "The creation", gu: "રચના", hi: "रचना" },
  4: { en: "Your text", gu: "તમારું લખાણ", hi: "आपका पाठ" },
  5: { en: "Feel and look", gu: "લાગણી અને દેખાવ", hi: "भाव और रूप" },
  6: { en: "Characters and details", gu: "પાત્રો અને વિગતો", hi: "पात्र और विवरण" },
  7: { en: "A few questions about your story", gu: "તમારી વાર્તા વિશે થોડા પ્રશ્નો", hi: "आपकी कहानी पर कुछ सवाल" },
  8: { en: "Your plan and price", gu: "તમારો પ્લાન અને કિંમત", hi: "आपकी योजना और कीमत" },
};

const has = (a: Answers, id: string, v: string) => {
  const x = a[id];
  return Array.isArray(x) ? x.includes(v) : x === v;
};
export const isVideo = (a: Answers) => a.make !== "audio" && a.visual !== "audio_only";
const hasMusic = (a: Answers) => a.sound === "music" || a.sound === "music_sfx";
const hasSfx = (a: Answers) => a.sound === "music_sfx";

const LONG = 20_000;

// Mood words come straight from the vocabulary (each maps to a mood tag, no free text).
const MOOD_LABELS: Record<string, L> = {
  warm: { en: "Warm", gu: "હૂંફાળી", hi: "गर्मजोशी भरी" },
  devotional: { en: "Devotional", gu: "ભક્તિમય", hi: "भक्तिमय" },
  suspenseful: { en: "Suspenseful", gu: "રોમાંચક", hi: "रोमांचक" },
  funny: { en: "Funny", gu: "રમૂજી", hi: "मज़ेदार" },
  sad: { en: "Sad", gu: "દુઃખદ", hi: "उदास" },
  inspiring: { en: "Inspiring", gu: "પ્રેરણાદાયી", hi: "प्रेरक" },
  nostalgic: { en: "Nostalgic", gu: "જૂની યાદો જેવી", hi: "पुरानी यादों जैसी" },
  mysterious: { en: "Mysterious", gu: "રહસ્યમય", hi: "रहस्यमय" },
  calm: { en: "Calm", gu: "શાંત", hi: "शांत" },
  dramatic: { en: "Dramatic", gu: "નાટ્યાત્મક", hi: "नाटकीय" },
};

export const QUESTIONS: Question[] = [
  // ------------------------------------------------------------ stage 0 (before sign-in)
  {
    id: "lang",
    stage: 0,
    kind: "single",
    label: { en: "In which language should we talk?", gu: "આપણે કઈ ભાષામાં વાત કરીએ?", hi: "हम किस भाषा में बात करें?" },
    options: [
      { id: "gu", label: { en: "ગુજરાતી", gu: "ગુજરાતી", hi: "ગુજરાતી" } },
      { id: "hi", label: { en: "हिन्दी", gu: "हिन्दी", hi: "हिन्दी" } },
      { id: "en", label: { en: "English", gu: "English", hi: "English" } },
    ],
    default: "gu",
  },
  {
    id: "ready",
    stage: 0,
    kind: "single",
    label: { en: "Is your story ready?", gu: "તમારી વાર્તા તૈયાર છે?", hi: "क्या आपकी कहानी तैयार है?" },
    options: [
      { id: "yes", label: { en: "Yes, it’s written", gu: "હા, લખાયેલી છે", hi: "हाँ, लिखी हुई है" } },
      { id: "writing", label: { en: "I’m still writing it", gu: "હજી લખી રહ્યો/રહી છું", hi: "अभी लिख रहा/रही हूँ" } },
      { id: "idea", label: { en: "I have an idea, not a written story", gu: "મારી પાસે વિચાર છે, લખેલી વાર્તા નથી", hi: "मेरे पास विचार है, लिखी कहानी नहीं" } },
    ],
    stop: (a) =>
      a.ready === "writing"
        ? {
            kind: "end",
            message: {
              en: "Come back when it’s ready. Save this page: your answers so far are kept on this device.",
              gu: "વાર્તા તૈયાર થાય ત્યારે પાછા આવજો. આ પાનું સાચવી રાખો: અત્યાર સુધીના જવાબો આ ઉપકરણ પર સચવાયેલા છે.",
              hi: "कहानी तैयार हो जाए तब लौट आइए। यह पेज सहेज लें: अब तक के जवाब इसी डिवाइस पर रखे हैं।",
            },
          }
        : a.ready === "idea"
          ? {
              kind: "end",
              message: {
                en: "We work from finished text. If you’d like help writing it, choose Varta Vishva Directors later: a 30-minute talk with our director is part of it.",
                gu: "અમે પૂરી લખાયેલી વાર્તા પરથી કામ કરીએ છીએ. લખવામાં મદદ જોઈતી હોય તો પછી ‘વાર્તા વિશ્વ દિગ્દર્શકો દ્વારા’ પસંદ કરજો: તેમાં અમારા દિગ્દર્શક સાથે 30 મિનિટની વાત સામેલ છે.",
                hi: "हम पूरी लिखी कहानी से काम करते हैं। लिखने में मदद चाहिए तो बाद में ‘वार्ता विश्व के निर्देशकों द्वारा’ चुनें: उसमें हमारे निर्देशक के साथ 30 मिनट की बात शामिल है।",
              },
            }
          : null,
  },
  {
    id: "make",
    stage: 0,
    kind: "single",
    label: { en: "What would you like to make?", gu: "તમે શું બનાવવા માંગો છો?", hi: "आप क्या बनाना चाहते हैं?" },
    options: [
      {
        id: "audio",
        label: { en: "Audio story", gu: "ઑડિયો વાર્તા", hi: "ऑडियो कहानी" },
        hint: { en: "Narration, with music and sounds if you like", gu: "વાચન, ઇચ્છો તો સંગીત અને અવાજો સાથે", hi: "वाचन, चाहें तो संगीत और ध्वनियों के साथ" },
      },
      {
        id: "stills",
        label: { en: "Video with paintings", gu: "ચિત્રો સાથે વીડિયો", hi: "चित्रों के साथ वीडियो" },
        hint: { en: "A painting for each part of the story, gently moving", gu: "વાર્તાના દરેક ભાગ માટે ચિત્ર, ધીમી ગતિ સાથે", hi: "कहानी के हर हिस्से के लिए चित्र, हल्की गति के साथ" },
      },
      {
        id: "single",
        label: { en: "Video with one picture", gu: "એક ચિત્ર સાથે વીડિયો", hi: "एक चित्र के साथ वीडियो" },
        hint: { en: "One cover picture for the whole story", gu: "આખી વાર્તા માટે એક ચિત્ર", hi: "पूरी कहानी के लिए एक चित्र" },
      },
      {
        id: "unsure",
        label: { en: "Not sure: show me the levels", gu: "ખાતરી નથી: સ્તરો બતાવો", hi: "पक्का नहीं: स्तर दिखाइए" },
        hint: { en: "You’ll see Basic, Standard and Premium side by side later", gu: "પછી સરળ, સુંદર અને શ્રેષ્ઠ સાથે સાથે જોશો", hi: "बाद में सरल, सुंदर और श्रेष्ठ साथ-साथ देखेंगे" },
      },
    ],
  },
  {
    id: "length",
    stage: 0,
    kind: "single",
    label: { en: "About how long is your story?", gu: "તમારી વાર્તા આશરે કેટલી લાંબી છે?", hi: "आपकी कहानी लगभग कितनी लंबी है?" },
    options: [
      { id: "short", label: { en: "A short piece (up to 1 page)", gu: "ટૂંકી (1 પાના સુધી)", hi: "छोटी (1 पेज तक)" } },
      { id: "pages_2_5", label: { en: "2–5 pages", gu: "2–5 પાનાં", hi: "2–5 पेज" } },
      { id: "pages_6_10", label: { en: "6–10 pages", gu: "6–10 પાનાં", hi: "6–10 पेज" } },
      { id: "longer", label: { en: "Longer (we’ll make it as episodes)", gu: "વધુ લાંબી (એપિસોડમાં બનાવીશું)", hi: "और लंबी (एपिसोड में बनाएँगे)" } },
    ],
  },
  {
    id: "price_range",
    stage: 0,
    kind: "special",
    special: "price_range",
    label: { en: "Typical price for this", gu: "આ માટે સામાન્ય કિંમત", hi: "इसके लिए सामान्य कीमत" },
  },
  {
    id: "signin",
    stage: 0,
    kind: "special",
    special: "signin",
    label: { en: "Sign in to continue", gu: "આગળ વધવા સાઇન ઇન કરો", hi: "आगे बढ़ने के लिए साइन इन करें" },
  },

  // ------------------------------------------------------------ stage 1: the story
  {
    id: "you",
    stage: 1,
    kind: "special",
    special: "you",
    label: { en: "About you", gu: "તમારા વિશે", hi: "आपके बारे में" },
  },
  {
    id: "story",
    stage: 1,
    kind: "special",
    special: "story",
    label: { en: "Add your story", gu: "તમારી વાર્તા ઉમેરો", hi: "अपनी कहानी जोड़ें" },
  },
  {
    id: "origin",
    stage: 1,
    kind: "single",
    label: { en: "Where does this story come from?", gu: "આ વાર્તા ક્યાંથી આવી છે?", hi: "यह कहानी कहाँ से आई है?" },
    options: [
      { id: "own", label: { en: "I wrote it myself", gu: "મેં પોતે લખી છે", hi: "मैंने खुद लिखी है" } },
      { id: "translation", label: { en: "It’s my translation of someone else’s work", gu: "બીજાની રચનાનો મારો અનુવાદ છે", hi: "किसी और की रचना का मेरा अनुवाद है" } },
      { id: "adaptation", label: { en: "It’s adapted or retold from another work", gu: "બીજી રચના પરથી રૂપાંતર કે પુનઃકથન છે", hi: "किसी और रचना से रूपांतर या पुनर्कथन है" } },
      { id: "traditional", label: { en: "A traditional or folk story, or a scripture retelling", gu: "પરંપરાગત કે લોકકથા, અથવા શાસ્ત્રનું પુનઃકથન", hi: "पारंपरिक या लोककथा, या शास्त्र का पुनर्कथन" } },
      { id: "permission", label: { en: "Someone else wrote it and gave me permission", gu: "બીજાએ લખી છે અને મને પરવાનગી આપી છે", hi: "किसी और ने लिखी है और मुझे अनुमति दी है" } },
      { id: "joint", label: { en: "We wrote it together", gu: "અમે સાથે મળીને લખી છે", hi: "हमने साथ मिलकर लिखी है" } },
    ],
  },
  {
    id: "original_work",
    stage: 1,
    kind: "text",
    label: { en: "The original work", gu: "મૂળ રચના", hi: "मूल रचना" },
    help: {
      en: "Title, author, translator (if any), publisher and year, as much as you know.",
      gu: "શીર્ષક, લેખક, અનુવાદક (હોય તો), પ્રકાશક અને વર્ષ, જેટલું ખબર હોય તેટલું.",
      hi: "शीर्षक, लेखक, अनुवादक (हो तो), प्रकाशक और वर्ष, जितना पता हो।",
    },
    rows: 3,
    maxLength: 600,
    showIf: (a) => ["translation", "adaptation", "permission"].includes(String(a.origin)),
  },
  {
    id: "permission",
    stage: 1,
    kind: "single",
    label: { en: "Do you have permission from the rights holder?", gu: "હક ધરાવનારની પરવાનગી તમારી પાસે છે?", hi: "क्या आपके पास अधिकार-धारक की अनुमति है?" },
    options: [
      { id: "written", label: { en: "Yes, in writing", gu: "હા, લેખિતમાં", hi: "हाँ, लिखित में" } },
      { id: "public_domain", label: { en: "The author died more than 60 years ago (public domain)", gu: "લેખકના અવસાનને 60 વર્ષથી વધુ થયાં છે (સાર્વજનિક)", hi: "लेखक के निधन को 60 वर्ष से अधिक हो गए हैं (सार्वजनिक)" } },
      { id: "no", label: { en: "No", gu: "ના", hi: "नहीं" } },
    ],
    showIf: (a) => ["translation", "adaptation", "permission"].includes(String(a.origin)),
    stop: (a) =>
      a.permission === "no"
        ? {
            kind: "end",
            message: {
              en: "We can only make works you have the right to use. When you have the rights holder’s permission in writing, start again.",
              gu: "તમને જેના ઉપયોગનો હક હોય તેવી રચનાઓ જ અમે બનાવી શકીએ. હક ધરાવનારની લેખિત પરવાનગી મળે ત્યારે ફરી શરૂ કરજો.",
              hi: "हम केवल वही रचनाएँ बना सकते हैं जिनके उपयोग का आपको अधिकार हो। अधिकार-धारक की लिखित अनुमति मिलने पर फिर से शुरू करें।",
            },
          }
        : null,
  },
  {
    id: "tradition",
    stage: 1,
    kind: "text",
    label: { en: "Which tradition or text?", gu: "કઈ પરંપરા કે ગ્રંથ?", hi: "कौन सी परंपरा या ग्रंथ?" },
    help: {
      en: "For example: Panchatantra, a folk tale from Kutch. If it is a modern published retelling, tell us its title and author too.",
      gu: "ઉદાહરણ: પંચતંત્ર, કચ્છની લોકકથા. જો આધુનિક પ્રકાશિત પુનઃકથન હોય, તો તેનું શીર્ષક અને લેખક પણ લખો.",
      hi: "उदाहरण: पंचतंत्र, कच्छ की लोककथा। अगर यह आधुनिक प्रकाशित पुनर्कथन है, तो उसका शीर्षक और लेखक भी लिखें।",
    },
    rows: 2,
    maxLength: 400,
    showIf: (a) => a.origin === "traditional",
  },
  {
    id: "cowriters",
    stage: 1,
    kind: "text",
    label: { en: "Your co-writers’ names", gu: "સહ-લેખકોનાં નામ", hi: "सह-लेखकों के नाम" },
    help: {
      en: "They will appear in the credits. By continuing you confirm your co-writers agree to this.",
      gu: "તેમનાં નામ શ્રેયમાં આવશે. આગળ વધીને તમે ખાતરી આપો છો કે સહ-લેખકો આ માટે સંમત છે.",
      hi: "उनके नाम श्रेय में आएँगे। आगे बढ़कर आप पुष्टि करते हैं कि सह-लेखक इसके लिए सहमत हैं।",
    },
    rows: 2,
    maxLength: 400,
    showIf: (a) => a.origin === "joint",
  },
  {
    id: "consent",
    stage: 1,
    kind: "special",
    special: "consent",
    label: { en: "Before we read your story", gu: "તમારી વાર્તા વાંચતાં પહેલાં", hi: "आपकी कहानी पढ़ने से पहले" },
  },

  // ------------------------------------------------------------ stage 2: purpose and audience
  {
    id: "purpose",
    stage: 2,
    kind: "multi",
    max: 2,
    label: { en: "What is it for? (up to 2)", gu: "આ શેના માટે છે? (2 સુધી)", hi: "यह किसलिए है? (2 तक)" },
    options: [
      { id: "youtube", label: { en: "YouTube video", gu: "YouTube વીડિયો", hi: "YouTube वीडियो" } },
      { id: "shorts", label: { en: "Shorts / Reels / WhatsApp status", gu: "Shorts / Reels / WhatsApp સ્ટેટસ", hi: "Shorts / Reels / WhatsApp स्टेटस" } },
      { id: "whatsapp", label: { en: "WhatsApp sharing with family and friends", gu: "પરિવાર-મિત્રો સાથે WhatsApp પર", hi: "परिवार-मित्रों के साथ WhatsApp पर" } },
      { id: "podcast", label: { en: "Podcast / Spotify", gu: "પૉડકાસ્ટ / Spotify", hi: "पॉडकास्ट / Spotify" } },
      { id: "classroom", label: { en: "Classroom or children", gu: "વર્ગખંડ કે બાળકો", hi: "कक्षा या बच्चे" } },
      { id: "gathering", label: { en: "Family or community gathering", gu: "પરિવાર કે સમાજનો મેળાવડો", hi: "परिवार या समुदाय का मिलन" } },
      { id: "festival", label: { en: "Festival, event or screening", gu: "ઉત્સવ, કાર્યક્રમ કે પ્રદર્શન", hi: "उत्सव, कार्यक्रम या प्रदर्शन" } },
      { id: "keepsake", label: { en: "Personal keepsake, or in memory of someone", gu: "અંગત યાદગીરી, કે કોઈની સ્મૃતિમાં", hi: "निजी यादगार, या किसी की स्मृति में" } },
    ],
  },
  {
    id: "monetise",
    stage: 2,
    kind: "single",
    label: { en: "Will you earn money from it on YouTube?", gu: "YouTube પર તેનાથી કમાણી કરશો?", hi: "क्या आप YouTube पर इससे कमाई करेंगे?" },
    help: { en: "This changes nothing in the price; it goes into the licence note.", gu: "કિંમતમાં કોઈ ફેર નથી; લાઇસન્સ નોંધમાં જાય છે.", hi: "कीमत में कोई फ़र्क नहीं; यह लाइसेंस नोट में जाता है।" },
    options: [
      { id: "yes", label: { en: "Yes", gu: "હા", hi: "हाँ" } },
      { id: "no", label: { en: "No", gu: "ના", hi: "नहीं" } },
      { id: "unsure", label: { en: "Not sure", gu: "ખાતરી નથી", hi: "पक्का नहीं" } },
    ],
    showIf: (a) => has(a, "purpose", "youtube"),
  },
  {
    id: "age_group",
    stage: 2,
    kind: "single",
    label: { en: "Which age group?", gu: "કયા વયજૂથ માટે?", hi: "किस आयु वर्ग के लिए?" },
    help: { en: "We keep it gentle for younger children: no frightening pictures, no violence shown.", gu: "નાનાં બાળકો માટે કોમળ રાખીએ: ડરામણાં ચિત્રો નહીં, હિંસા બતાવીએ નહીં.", hi: "छोटे बच्चों के लिए कोमल रखते हैं: डरावने चित्र नहीं, हिंसा नहीं दिखाते।" },
    options: [
      { id: "under8", label: { en: "Under 8", gu: "8 વર્ષથી નાનાં", hi: "8 वर्ष से कम" } },
      { id: "8to12", label: { en: "8–12", gu: "8–12", hi: "8–12" } },
      { id: "teens", label: { en: "Teenagers", gu: "કિશોરો", hi: "किशोर" } },
    ],
    showIf: (a) => has(a, "purpose", "classroom"),
  },
  {
    id: "big_screen",
    stage: 2,
    kind: "single",
    label: { en: "Will it be shown at a film festival, on TV or in a cinema?", gu: "શું તે ફિલ્મ ઉત્સવમાં, ટીવી પર કે સિનેમામાં બતાવાશે?", hi: "क्या यह फ़िल्म उत्सव में, टीवी पर या सिनेमा में दिखाया जाएगा?" },
    help: {
      en: "Choose Yes for a game or an app too. Our music licence covers online and offline publishing, not film festivals, TV or cinema; for those we replace the music first (a paid add-on).",
      gu: "ગેમ કે ઍપ માટે પણ ‘હા’ પસંદ કરો. અમારું સંગીત લાઇસન્સ ઑનલાઇન અને ઑફલાઇન પ્રકાશન માટે છે, ફિલ્મ ઉત્સવ, ટીવી કે સિનેમા માટે નહીં; તે માટે પહેલાં સંગીત બદલીએ છીએ (પેઇડ ઍડ-ઑન).",
      hi: "गेम या ऐप के लिए भी ‘हाँ’ चुनें। हमारा संगीत लाइसेंस ऑनलाइन और ऑफ़लाइन प्रकाशन के लिए है, फ़िल्म उत्सव, टीवी या सिनेमा के लिए नहीं; उनके लिए पहले संगीत बदलते हैं (सशुल्क ऐड-ऑन)।",
    },
    options: [
      { id: "no", label: { en: "No", gu: "ના", hi: "नहीं" } },
      { id: "yes", label: { en: "Yes", gu: "હા", hi: "हाँ" } },
    ],
    showIf: (a) => has(a, "purpose", "festival"),
    // Owner's decision, 25 Nov 2026: Yes stops here and waits for the reviewer (no automatic
    // sample). When the reviewer lets the writer continue (admin), big_screen_cleared is set.
    stop: (a) =>
      a.big_screen === "yes" && a.big_screen_cleared !== "yes"
        ? {
            kind: "needs_human",
            message: {
              en: "Thank you. Because this is for a festival, TV or cinema, the music has to be replaced with a broadcast-licensed track. Our team will look at your request and write to you, usually within two working days.",
              gu: "આભાર. આ ઉત્સવ, ટીવી કે સિનેમા માટે હોવાથી સંગીત પ્રસારણ-લાઇસન્સવાળા સંગીતથી બદલવું પડે. અમારી ટીમ તમારી વિનંતી જોઈને તમને લખશે, સામાન્ય રીતે બે કામકાજી દિવસમાં.",
              hi: "धन्यवाद। यह उत्सव, टीवी या सिनेमा के लिए है, इसलिए संगीत प्रसारण-लाइसेंस वाले संगीत से बदलना होगा। हमारी टीम आपका अनुरोध देखकर आपको लिखेगी, आमतौर पर दो कार्य-दिवसों में।",
            },
          }
        : null,
  },
  {
    id: "dedication",
    stage: 2,
    kind: "text",
    optional: true,
    label: { en: "A dedication for the ending card", gu: "અંતિમ પાના માટે અર્પણ", hi: "अंतिम पृष्ठ के लिए समर्पण" },
    help: { en: "For example: “In memory of my grandmother”.", gu: "ઉદાહરણ: “મારાં દાદીમાની સ્મૃતિમાં”.", hi: "उदाहरण: “मेरी दादी की स्मृति में”।" },
    rows: 2,
    maxLength: 200,
    showIf: (a) => has(a, "purpose", "keepsake"),
  },
  {
    id: "audience",
    stage: 2,
    kind: "single",
    label: { en: "Who will watch or listen?", gu: "કોણ જોશે કે સાંભળશે?", hi: "कौन देखेगा या सुनेगा?" },
    options: [
      { id: "children", label: { en: "Children", gu: "બાળકો", hi: "बच्चे" } },
      { id: "young", label: { en: "Young people", gu: "યુવાનો", hi: "युवा" } },
      { id: "adults", label: { en: "Adults", gu: "પુખ્ત વયના", hi: "वयस्क" } },
      {
        id: "elders",
        label: { en: "Elders", gu: "વડીલો", hi: "बुज़ुर्ग" },
        hint: { en: "Larger captions, slightly slower narration", gu: "મોટાં કૅપ્શન, થોડું ધીમું વાચન", hi: "बड़े कैप्शन, थोड़ा धीमा वाचन" },
      },
    ],
    default: "adults",
  },
  {
    id: "community",
    stage: 2,
    kind: "text",
    optional: true,
    label: { en: "A particular community?", gu: "કોઈ ખાસ સમાજ?", hi: "कोई ख़ास समुदाय?" },
    help: { en: "Optional.", gu: "વૈકલ્પિક.", hi: "वैकल्पिक।" },
    rows: 1,
    maxLength: 200,
  },

  // ------------------------------------------------------------ stage 3: the creation
  {
    id: "level",
    stage: 3,
    kind: "special",
    special: "level",
    label: { en: "Finish level", gu: "ગુણવત્તા સ્તર", hi: "गुणवत्ता स्तर" },
    options: [
      { id: "basic", label: { en: "Basic", gu: "સરળ", hi: "सरल" } },
      { id: "standard", label: { en: "Standard", gu: "સુંદર", hi: "सुंदर" } },
      { id: "premium", label: { en: "Premium", gu: "શ્રેષ્ઠ", hi: "श्रेष्ठ" } },
    ],
    default: "standard",
  },
  {
    id: "service",
    stage: 3,
    kind: "single",
    label: { en: "Service", gu: "સેવા", hi: "सेवा" },
    options: [
      {
        id: "self_serve",
        label: { en: "Studio-made", gu: "સ્ટુડિયો-નિર્મિત", hi: "स्टूडियो-निर्मित" },
        hint: {
          en: "Made by our automatic studio and checked by our team",
          gu: "અમારો સ્વચાલિત સ્ટુડિયો બનાવે, અમારી ટીમ ચકાસે",
          hi: "हमारा स्वचालित स्टूडियो बनाए, हमारी टीम जाँचे",
        },
      },
      {
        id: "directed",
        label: { en: "Varta Vishva Directors", gu: "વાર્તા વિશ્વ દિગ્દર્શકો દ્વારા", hi: "वार्ता विश्व के निर्देशकों द्वारा" },
        hint: {
          en: "Our director calls you within 2 days, then directs your story scene by scene. The sample is ₹999.",
          gu: "અમારા દિગ્દર્શક 2 દિવસમાં તમને ફોન કરશે, પછી તમારી વાર્તાને દૃશ્યે દૃશ્યે દિગ્દર્શિત કરશે. નમૂનાના ₹999.",
          hi: "हमारे निर्देशक 2 दिनों में आपको फ़ोन करेंगे, फिर आपकी कहानी को दृश्य-दर-दृश्य निर्देशित करेंगे। नमूने के ₹999।",
        },
      },
    ],
    default: "self_serve",
    // Premium is always Varta Vishva Directors (brief §3A).
    showIf: (a) => a.level !== "premium",
  },
  {
    id: "visual",
    stage: 3,
    kind: "single",
    label: { en: "What they see", gu: "શું દેખાશે", hi: "क्या दिखेगा" },
    options: [
      { id: "moving_stills", label: { en: "Moving paintings", gu: "હલતાં ચિત્રો", hi: "चलते चित्र" } },
      { id: "single_image", label: { en: "One picture", gu: "એક ચિત્ર", hi: "एक चित्र" } },
      { id: "audio_only", label: { en: "Audio only", gu: "ફક્ત ઑડિયો", hi: "केवल ऑडियो" } },
    ],
    showIf: (a) => a.make !== "audio",
  },
  {
    id: "shorts",
    stage: 3,
    kind: "single",
    label: { en: "Add a Shorts pack?", gu: "Shorts પૅક ઉમેરવું છે?", hi: "Shorts पैक जोड़ें?" },
    help: { en: "Vertical clips of 45–60 seconds, made from your video’s pictures.", gu: "તમારા વીડિયોનાં ચિત્રોમાંથી 45–60 સેકન્ડની ઊભી ક્લિપ.", hi: "आपके वीडियो के चित्रों से 45–60 सेकंड की खड़ी क्लिप।" },
    options: [
      { id: "0", label: { en: "No", gu: "ના", hi: "नहीं" } },
      { id: "3", label: { en: "3 Shorts", gu: "3 Shorts", hi: "3 Shorts" } },
      { id: "5", label: { en: "5 Shorts", gu: "5 Shorts", hi: "5 Shorts" } },
    ],
    showIf: (a) => isVideo(a),
  },
  {
    id: "sound",
    stage: 3,
    kind: "single",
    label: { en: "What they hear", gu: "શું સંભળાશે", hi: "क्या सुनाई देगा" },
    options: [
      { id: "narration", label: { en: "Narration only", gu: "ફક્ત વાચન", hi: "केवल वाचन" } },
      { id: "music", label: { en: "Narration + background music", gu: "વાચન + પાર્શ્વ સંગીત", hi: "वाचन + पृष्ठभूमि संगीत" } },
      { id: "music_sfx", label: { en: "Narration + music + sound effects", gu: "વાચન + સંગીત + ધ્વનિ અસરો", hi: "वाचन + संगीत + ध्वनि प्रभाव" } },
    ],
  },
  {
    id: "voices",
    stage: 3,
    kind: "single",
    label: { en: "Who speaks", gu: "કોણ બોલશે", hi: "कौन बोलेगा" },
    options: [
      { id: "narrator", label: { en: "One narrator reads everything", gu: "એક વાચક બધું વાંચે", hi: "एक वाचक सब पढ़े" } },
      {
        id: "characters",
        label: { en: "A narrator, and separate voices for the characters", gu: "વાચક, અને પાત્રો માટે અલગ અવાજો", hi: "वाचक, और पात्रों के लिए अलग आवाज़ें" },
        hint: { en: "You choose the voices after we list your characters", gu: "પાત્રોની યાદી પછી તમે અવાજો પસંદ કરશો", hi: "पात्रों की सूची के बाद आप आवाज़ें चुनेंगे" },
      },
    ],
  },
  {
    id: "voice_addons",
    stage: 3,
    kind: "multi",
    optional: true,
    label: { en: "Voice add-ons (optional)", gu: "અવાજ ઍડ-ઑન (વૈકલ્પિક)", hi: "आवाज़ ऐड-ऑन (वैकल्पिक)" },
    options: [
      { id: "exclusive_voice", label: { en: "A narrator voice made only for you", gu: "ફક્ત તમારા માટે બનાવેલો વાચક-અવાજ", hi: "केवल आपके लिए बनी वाचक-आवाज़" } },
      {
        id: "own_voice",
        label: { en: "My own voice", gu: "મારો પોતાનો અવાજ", hi: "मेरी अपनी आवाज़" },
        hint: { en: "We ask for a recording and your consent after the sample", gu: "નમૂના પછી રેકોર્ડિંગ અને તમારી સંમતિ માંગીશું", hi: "नमूने के बाद रिकॉर्डिंग और आपकी सहमति माँगेंगे" },
      },
    ],
  },
  {
    id: "delivery",
    stage: 3,
    kind: "single",
    label: { en: "How it’s spoken", gu: "કેવી રીતે બોલાશે", hi: "कैसे बोला जाएगा" },
    options: [
      { id: "plain", label: { en: "Plain reading (clear and steady)", gu: "સાદું વાચન (સ્પષ્ટ અને સ્થિર)", hi: "सादा वाचन (स्पष्ट और स्थिर)" } },
      {
        id: "dramatised",
        label: { en: "Dramatised (emotion, pauses, whispers)", gu: "નાટ્યાત્મક (લાગણી, વિરામ, ધીમા સ્વર)", hi: "नाटकीय (भाव, विराम, फुसफुसाहट)" },
        hint: { en: "You approve the directed script first", gu: "પહેલાં તમે નિર્દેશિત સ્ક્રિપ્ટ મંજૂર કરો", hi: "पहले आप निर्देशित स्क्रिप्ट स्वीकार करें" },
      },
    ],
  },
  {
    id: "second_language",
    stage: 3,
    kind: "single",
    label: { en: "Also in a second language?", gu: "બીજી ભાષામાં પણ?", hi: "दूसरी भाषा में भी?" },
    help: { en: "You approve the translation before it is narrated.", gu: "વાચન પહેલાં તમે અનુવાદ મંજૂર કરો.", hi: "वाचन से पहले आप अनुवाद स्वीकार करें।" },
    options: [
      { id: "none", label: { en: "No", gu: "ના", hi: "नहीं" } },
      { id: "gu", label: { en: "Gujarati", gu: "ગુજરાતી", hi: "गुजराती" } },
      { id: "hi", label: { en: "Hindi", gu: "હિન્દી", hi: "हिन्दी" } },
      { id: "en", label: { en: "English", gu: "અંગ્રેજી", hi: "अंग्रेज़ी" } },
    ],
    default: "none",
  },

  // ------------------------------------------------------------ stage 4: text handling
  {
    id: "text_mode",
    stage: 4,
    kind: "single",
    label: { en: "Should we narrate your text exactly as written?", gu: "લખાણ જેમ છે તેમ જ વાંચીએ?", hi: "क्या आपका पाठ जैसा लिखा है वैसा ही पढ़ें?" },
    options: [
      { id: "exact", label: { en: "Yes, exactly as written", gu: "હા, જેમ લખ્યું છે તેમ જ", hi: "हाँ, जैसा लिखा है वैसा ही" } },
      { id: "shape", label: { en: "You may shorten or adapt it for video", gu: "વીડિયો માટે ટૂંકું કે ફેરફાર કરી શકો", hi: "वीडियो के लिए छोटा या बदल सकते हैं" } },
    ],
    default: "exact",
  },
  {
    id: "target_minutes",
    stage: 4,
    kind: "single",
    label: { en: "Target length", gu: "લક્ષ્ય લંબાઈ", hi: "लक्ष्य लंबाई" },
    help: {
      en: "Any change to your words is shown to you in the script for approval. Nothing changes without your OK.",
      gu: "તમારા શબ્દોમાં કોઈ પણ ફેરફાર મંજૂરી માટે સ્ક્રિપ્ટમાં બતાવાશે. તમારી હા વિના કંઈ બદલાશે નહીં.",
      hi: "आपके शब्दों में कोई भी बदलाव स्वीकृति के लिए स्क्रिप्ट में दिखाया जाएगा। आपकी हाँ के बिना कुछ नहीं बदलेगा।",
    },
    options: [
      { id: "3", label: { en: "3 minutes", gu: "3 મિનિટ", hi: "3 मिनट" } },
      { id: "5", label: { en: "5 minutes", gu: "5 મિનિટ", hi: "5 मिनट" } },
      { id: "10", label: { en: "10 minutes", gu: "10 મિનિટ", hi: "10 मिनट" } },
      { id: "15", label: { en: "15 minutes", gu: "15 મિનિટ", hi: "15 मिनट" } },
      { id: "story", label: { en: "Let the story decide", gu: "વાર્તા પ્રમાણે", hi: "कहानी के अनुसार" } },
    ],
    showIf: (a) => a.text_mode === "shape",
  },
  {
    id: "length_check",
    stage: 4,
    kind: "special",
    special: "length_check",
    label: { en: "Length check", gu: "લંબાઈ ચકાસણી", hi: "लंबाई जाँच" },
    // Shown only when the estimated narration and the target disagree (see flow logic).
  },

  // ------------------------------------------------------------ stage 5: feel and look
  {
    id: "feel",
    stage: 5,
    kind: "multi",
    max: 3,
    label: { en: "How should it feel? (up to 3)", gu: "કેવી લાગણી જોઈએ? (3 સુધી)", hi: "कैसा भाव चाहिए? (3 तक)" },
    options: VOCABULARY.mood.map((m) => ({ id: m, label: MOOD_LABELS[m] })),
  },
  {
    id: "look",
    stage: 5,
    kind: "special",
    special: "look",
    label: { en: "Look and colour", gu: "દેખાવ અને રંગ", hi: "रूप और रंग" },
    showIf: (a) => isVideo(a),
  },
  {
    id: "setting",
    stage: 5,
    kind: "text",
    optional: true,
    label: { en: "Where and when does your story happen?", gu: "વાર્તા ક્યાં અને ક્યારે બને છે?", hi: "कहानी कहाँ और कब घटती है?" },
    help: { en: "We filled this in from your story. Correct it if needed.", gu: "તમારી વાર્તા પરથી અમે ભર્યું છે. જરૂર હોય તો સુધારો.", hi: "आपकी कहानी से हमने भरा है। ज़रूरत हो तो सुधारें।" },
    rows: 2,
    maxLength: 300,
  },

  // ------------------------------------------------------------ stage 6: characters and details
  {
    id: "characters",
    stage: 6,
    kind: "special",
    special: "characters",
    label: { en: "Your characters", gu: "તમારાં પાત્રો", hi: "आपके पात्र" },
  },
  {
    id: "music_wish",
    stage: 6,
    kind: "multi",
    optional: true,
    label: { en: "What kind of music?", gu: "કેવું સંગીત?", hi: "कैसा संगीत?" },
    options: [
      { id: "music:bansuri", label: { en: "Flute (bansuri)", gu: "વાંસળી", hi: "बाँसुरी" } },
      { id: "music:sitar", label: { en: "Sitar", gu: "સિતાર", hi: "सितार" } },
      { id: "music:santoor", label: { en: "Santoor", gu: "સંતૂર", hi: "संतूर" } },
      { id: "music:folk-gujarati", label: { en: "Folk", gu: "લોકસંગીત", hi: "लोकसंगीत" } },
      { id: "music:devotional-bhajan", label: { en: "Devotional", gu: "ભક્તિ સંગીત", hi: "भक्ति संगीत" } },
      { id: "music:piano", label: { en: "Soft piano", gu: "હળવો પિયાનો", hi: "हल्का पियानो" } },
      { id: "music:strings", label: { en: "Soft strings", gu: "હળવાં તંતુવાદ્યો", hi: "हल्के तार वाद्य" } },
      { id: "music:sparse", label: { en: "Minimal", gu: "ઓછામાં ઓછું", hi: "न्यूनतम" } },
      { id: "music:no-music-in-sad-parts", label: { en: "No music in sad parts", gu: "દુઃખદ ભાગમાં સંગીત નહીં", hi: "उदास हिस्सों में संगीत नहीं" } },
    ],
    showIf: (a) => hasMusic(a),
  },
  {
    id: "sfx_wish",
    stage: 6,
    kind: "multi",
    optional: true,
    label: { en: "What kind of sounds?", gu: "કેવા અવાજો?", hi: "कैसी ध्वनियाँ?" },
    options: [
      { id: "sound:rain", label: { en: "Rain", gu: "વરસાદ", hi: "बारिश" } },
      { id: "sound:birds-morning", label: { en: "Birds", gu: "પક્ષીઓ", hi: "पक्षी" } },
      { id: "sound:wind", label: { en: "Wind", gu: "પવન", hi: "हवा" } },
      { id: "sound:village-crowd", label: { en: "Village life", gu: "ગામડાનું જીવન", hi: "गाँव का जीवन" } },
      { id: "sound:market", label: { en: "City and market", gu: "શહેર અને બજાર", hi: "शहर और बाज़ार" } },
      { id: "sound:temple-bells", label: { en: "Temple", gu: "મંદિર", hi: "मंदिर" } },
      { id: "sound:few-effects", label: { en: "Only a few", gu: "થોડા જ", hi: "बस कुछ" } },
    ],
    showIf: (a) => hasSfx(a),
  },
  {
    id: "sound_note",
    stage: 6,
    kind: "text",
    optional: true,
    label: { en: "Anything else about music and sound?", gu: "સંગીત અને અવાજ વિશે બીજું કંઈ?", hi: "संगीत और ध्वनि के बारे में कुछ और?" },
    help: {
      en: "We can’t copy a specific artist’s or film’s style, but we’ll match the feel.",
      gu: "કોઈ ખાસ કલાકાર કે ફિલ્મની શૈલીની નકલ ન કરી શકીએ, પણ એવી જ લાગણી લાવીશું.",
      hi: "किसी ख़ास कलाकार या फ़िल्म की शैली की नकल नहीं कर सकते, पर वैसा ही भाव लाएँगे।",
    },
    rows: 2,
    maxLength: 400,
    showIf: (a) => hasMusic(a),
  },
  {
    id: "avoid",
    stage: 6,
    kind: "multi",
    optional: true,
    label: { en: "Anything to avoid?", gu: "શું ટાળવું?", hi: "क्या टालना है?" },
    options: [
      { id: "avoid:no-blood", label: { en: "No blood", gu: "લોહી નહીં", hi: "खून नहीं" } },
      { id: "avoid:no-scary-sounds", label: { en: "No frightening images or sounds", gu: "ડરામણાં ચિત્રો કે અવાજ નહીં", hi: "डरावने चित्र या ध्वनि नहीं" } },
      { id: "avoid:no-deity-face", label: { en: "Don’t show god’s face", gu: "ભગવાનનો ચહેરો ન બતાવો", hi: "भगवान का चेहरा न दिखाएँ" } },
      { id: "avoid:no-mixed-language", label: { en: "No words from other languages in the narration", gu: "વાચનમાં બીજી ભાષાના શબ્દો નહીં", hi: "वाचन में दूसरी भाषा के शब्द नहीं" } },
      { id: "avoid:no-violence-shown", label: { en: "No violence shown", gu: "હિંસા ન બતાવો", hi: "हिंसा न दिखाएँ" } },
    ],
  },
  {
    id: "avoid_note",
    stage: 6,
    kind: "text",
    optional: true,
    label: { en: "Anything else to avoid?", gu: "બીજું કંઈ ટાળવું છે?", hi: "और कुछ टालना है?" },
    rows: 2,
    maxLength: 400,
  },
  {
    id: "ending",
    stage: 6,
    kind: "text",
    optional: true,
    label: { en: "The ending card", gu: "અંતિમ પાનું", hi: "अंतिम पृष्ठ" },
    help: {
      en: "A closing line, a dedication, or your name and contact for the end.",
      gu: "અંતિમ પંક્તિ, અર્પણ, અથવા અંતે તમારું નામ અને સંપર્ક.",
      hi: "अंतिम पंक्ति, समर्पण, या अंत में आपका नाम और संपर्क।",
    },
    rows: 2,
    maxLength: 300,
  },
  {
    id: "pictures",
    stage: 6,
    kind: "special",
    special: "pictures",
    optional: true,
    label: { en: "Your own pictures (optional)", gu: "તમારાં પોતાનાં ચિત્રો (વૈકલ્પિક)", hi: "आपके अपने चित्र (वैकल्पिक)" },
    showIf: (a) => isVideo(a),
  },
  {
    id: "episodes",
    stage: 6,
    kind: "special",
    special: "episodes",
    label: { en: "Episodes", gu: "એપિસોડ", hi: "एपिसोड" },
    showIf: (_a, ctx) => ctx.storyChars > LONG,
  },
  {
    id: "anything_else",
    stage: 6,
    kind: "text",
    optional: true,
    label: { en: "Anything else you’d like us to know?", gu: "બીજું કંઈ જણાવવું છે?", hi: "और कुछ बताना चाहेंगे?" },
    rows: 3,
    maxLength: 1000,
  },

  // ------------------------------------------------------------ stages 7–8
  {
    id: "followups",
    stage: 7,
    kind: "special",
    special: "followups",
    label: STAGE_NAMES[7],
  },
  {
    id: "plan",
    stage: 8,
    kind: "special",
    special: "plan",
    label: STAGE_NAMES[8],
  },
];

// Voice types a writer may pick for a character (6.1).
export const VOICE_TYPES = ["warm", "deep", "young", "old", "gentle", "sharp"] as const;

export const BY_ID: Record<string, Question> = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

// Free-text questions: their answers live in R2 (notes.json), never in a table.
export const TEXT_IDS = QUESTIONS.filter((q) => q.kind === "text").map((q) => q.id);

// Choice questions whose answers are stored in creator_requests.answers.
export const CHOICE_IDS = QUESTIONS.filter((q) => q.kind === "single" || q.kind === "multi").map((q) => q.id);

// Level presets (brief §3A): picking a level pre-fills these; changing them later shows "Custom".
export const LEVEL_PRESETS: Record<string, Answers> = {
  basic: { visual: "single_image", sound: "music", voices: "narrator", delivery: "plain", shorts: "0" },
  standard: { visual: "moving_stills", sound: "music_sfx", voices: "characters", delivery: "dramatised", shorts: "0" },
  premium: { visual: "moving_stills", sound: "music_sfx", voices: "characters", delivery: "dramatised", shorts: "3", service: "directed" },
};
export const LEVEL_LIMITS: Record<string, { characters: number }> = {
  basic: { characters: 0 },
  standard: { characters: 3 },
  premium: { characters: 6 },
};

// Is a level's preset still intact? (Otherwise the level shows as "Custom".)
export function isCustom(a: Answers) {
  const p = LEVEL_PRESETS[String(a.level ?? "")];
  if (!p) return false;
  return Object.entries(p).some(([k, v]) => k !== "service" && a[k] !== undefined && a[k] !== v && !(k === "visual" && a.make === "audio"));
}

// Words a writer sees around the questions.
export const UI: Record<string, L> = {
  next: { en: "Next", gu: "આગળ", hi: "आगे" },
  back: { en: "Back", gu: "પાછળ", hi: "पीछे" },
  skip: { en: "Skip if unsure", gu: "ખાતરી ન હોય તો છોડો", hi: "पक्का न हो तो छोड़ें" },
  step: { en: "Step {n} of {t}", gu: "પગલું {n} / {t}", hi: "चरण {n} / {t}" },
  saved: { en: "Saved", gu: "સચવાયું", hi: "सहेजा गया" },
  speak: { en: "Speak instead", gu: "બોલીને લખાવો", hi: "बोलकर लिखवाएँ" },
  stopRec: { en: "Stop", gu: "રોકો", hi: "रोकें" },
  suggest: { en: "Suggest for me", gu: "મારા માટે સૂચવો", hi: "मेरे लिए सुझाइए" },
  decide: { en: "You decide for me", gu: "તમે નક્કી કરો", hi: "आप तय करें" },
  custom: { en: "Custom", gu: "કસ્ટમ", hi: "कस्टम" },
  working: { en: "Reading your story…", gu: "તમારી વાર્તા વાંચીએ છીએ…", hi: "आपकी कहानी पढ़ रहे हैं…" },
  startOver: { en: "Start again", gu: "ફરી શરૂ કરો", hi: "फिर से शुरू करें" },
  typicalPrice: { en: "Typical price", gu: "સામાન્ય કિંમત", hi: "सामान्य कीमत" },
  rangeNote: {
    en: "A range only, not a quote. Your fixed price comes with your plan, before anything is made. The 30–60 second sample of your story costs ₹499 (₹999 with Varta Vishva Directors), taken off the full price if you go ahead.",
    gu: "ફક્ત અંદાજ, ભાવપત્રક નહીં. તમારી નક્કી કિંમત પ્લાન સાથે આવશે, કંઈ પણ બને તે પહેલાં. તમારી વાર્તાના 30–60 સેકન્ડના નમૂનાના ₹499 (વાર્તા વિશ્વ દિગ્દર્શકો સાથે ₹999); આગળ વધો તો પૂરી કિંમતમાંથી બાદ થાય છે.",
    hi: "केवल अनुमान, कोटेशन नहीं। आपकी तय कीमत योजना के साथ आएगी, कुछ भी बनने से पहले। आपकी कहानी के 30–60 सेकंड के नमूने के ₹499 (वार्ता विश्व के निर्देशकों के साथ ₹999); आगे बढ़ें तो पूरी कीमत में से घटते हैं।",
  },
};

export const t = (l: L | undefined, lang: Lang) => (l ? l[lang] || l.en : "");
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

// The questions this writer sees, in order (the cascade). Stops at the first answer that
// ends the flow, so nothing after a stop is shown.
export function visibleQuestions(a: Answers, ctx: Ctx): Question[] {
  const out: Question[] = [];
  for (const q of QUESTIONS) {
    if (q.showIf && !q.showIf(a, ctx)) continue;
    if (q.special === "length_check" && !lengthConflict(a, ctx)) continue;
    out.push(q);
    if (q.stop?.(a)) break;
  }
  return out;
}

// Estimated narration minutes from the character count (rates from the pricing settings;
// these defaults match docs/pricing-calibration.md).
export const CHARS_PER_MINUTE: Record<string, number> = { gu: 700, hi: 800, en: 850 };
export function narrationMinutes(chars: number, lang: string | null, rates = CHARS_PER_MINUTE) {
  return chars / (rates[lang ?? "gu"] ?? 700);
}

// Stage 4 conflict: the writer asked for a target length well below the narration length.
export function lengthConflict(a: Answers, ctx: Ctx) {
  if (a.text_mode !== "shape" || !a.target_minutes || a.target_minutes === "story" || !ctx.storyChars) return false;
  return narrationMinutes(ctx.storyChars, ctx.storyLang) > Number(a.target_minutes) * 1.3;
}

// Clean a submitted answer against the question's options. Unknown ids are dropped.
export function cleanAnswer(id: string, value: unknown): Answer | undefined {
  const q = BY_ID[id];
  if (!q) return undefined;
  if (id === "length_check") return ["all", "shorten", "episodes"].includes(String(value)) ? String(value) : undefined;
  if (id === "level") return ["basic", "standard", "premium"].includes(String(value)) ? String(value) : undefined;
  const ids = new Set((q.options ?? []).map((o) => o.id));
  if (q.kind === "single") return ids.has(String(value)) ? String(value) : undefined;
  if (q.kind === "multi") {
    const list = (Array.isArray(value) ? value : []).map(String).filter((v) => ids.has(v));
    return [...new Set(list)].slice(0, q.max ?? list.length);
  }
  return undefined;
}

// Look choices (stage 5.2) are vocabulary ids, stored as answers look_style / look_colour.
export function cleanLook(style: unknown, colour: unknown) {
  const s = VOCABULARY.style as readonly string[];
  const c = VOCABULARY.colour as readonly string[];
  return {
    look_style: s.includes(String(style)) ? String(style) : undefined,
    look_colour: c.includes(String(colour)) ? String(colour) : undefined,
  };
}

export const STYLE_LABELS: Record<string, L> = {
  "indian-miniature": { en: "Indian miniature", gu: "ભારતીય લઘુચિત્ર", hi: "भारतीय लघुचित्र" },
  "pahari-miniature": { en: "Pahari miniature", gu: "પહાડી લઘુચિત્ર", hi: "पहाड़ी लघुचित्र" },
  "soft-watercolour": { en: "Soft watercolour", gu: "હળવા જળરંગ", hi: "हल्के जलरंग" },
  storybook: { en: "Storybook", gu: "વાર્તાપુસ્તક", hi: "कहानी की किताब" },
  "ink-and-wash": { en: "Ink and wash", gu: "શાહી અને વૉશ", hi: "स्याही और वॉश" },
  "realistic-period": { en: "Realistic, of the period", gu: "વાસ્તવિક, તે સમયનું", hi: "यथार्थवादी, उस समय का" },
  "classic-cinema": { en: "Classic cinema", gu: "જૂની ફિલ્મ જેવું", hi: "पुरानी फ़िल्म जैसा" },
};
export const COLOUR_LABELS: Record<string, L> = {
  "full-colour-warm": { en: "Full, warm colour", gu: "પૂરા, હૂંફાળા રંગો", hi: "पूरे, गर्म रंग" },
  sepia: { en: "Sepia (old photograph)", gu: "સેપિયા (જૂનો ફોટો)", hi: "सेपिया (पुरानी तस्वीर)" },
  "black-and-white": { en: "Black and white", gu: "શ્વેત-શ્યામ", hi: "श्वेत-श्याम" },
  "colour-journey": { en: "Colour that changes with the story", gu: "વાર્તા સાથે બદલાતા રંગ", hi: "कहानी के साथ बदलते रंग" },
  muted: { en: "Soft, muted colour", gu: "હળવા, મંદ રંગ", hi: "हल्के, मंद रंग" },
  "night-tint": { en: "Night tint", gu: "રાત્રિ છાંયો", hi: "रात्रि छाया" },
};
