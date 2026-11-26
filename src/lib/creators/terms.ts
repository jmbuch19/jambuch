// Creator's Space terms: the version, the plain summary and the consent ticks, in English,
// Gujarati and Hindi (docs/CREATORS_SPACE_BRIEF.md §7). Every tick a writer gives is stored
// in creator_consents with TERMS_VERSION and the time, so change TERMS_VERSION whenever the
// meaning of any text here or on /creators/terms changes. English is the binding version.

// 2026-11-24.2: data-processing tick reworded (what jambuch.in deletes; providers' own
// retention is explained in the privacy policy, not promised in the tick).
// 2026-11-24.3: privacy policy — stories are kept in private storage, never emailed.
// 2026-11-25.1: the sample is paid (₹499, deducted from the full price; not refunded if
// the writer stops after it) — owner's decision, 25 Nov 2026.
// 2026-11-25.2: general (non-story) sounds and music made by the studio may be reused;
// story-derived and exclusive material is never reused and is deleted as promised.
// 2026-11-25.3: sample refunded automatically if not delivered within 3 days; one free remake
// if the sample misses the approved plan; duplicate payments refunded automatically.
// 2026-11-26.1: the legal entity is named ("we" = Varta Vishva); two ways to make a story:
// Studio-made and Varta Vishva Directors (₹999 sample, a director's PC under safeguards,
// limited weekly starts); the team's confidentiality and access logging.
// 2026-11-26.2: full refund if a director hasn't started a directed order by the promised start
// date, effective from the day Varta Vishva Directors opens (creators.flow.directed.opens_on).
export const TERMS_VERSION = "2026-11-26.2";

export const CONSENT_LANGS = { en: "English", gu: "ગુજરાતી", hi: "हिन्दी" } as const;
export type ConsentLang = keyof typeof CONSENT_LANGS;

// The five-line summary shown above the ticks at story submission.
export const SUMMARY: Record<ConsentLang, string[]> = {
  en: [
    "Creator’s Space is a paid studio service. The 30–60 second sample costs ₹499 (₹999 with Varta Vishva Directors), paid after you approve your plan; it is deducted from the full price if you go ahead, and not refunded if you stop after it.",
    "After the sample you pay the rest in two parts: about half in advance, the remainder before the clean download. No refund after the download.",
    "All files are permanently deleted 7 days after delivery. Keep your own copies.",
    "The finished work is licensed for online and offline publishing (YouTube, Spotify, websites, social media, personal use). Not for film, TV broadcast, cinema or games unless the music replacement add-on is delivered before release.",
    "Voices and pictures are made with AI tools. Only errors you flag are corrected; our mistakes are fixed free.",
  ],
  gu: [
    "ક્રિએટર્સ સ્પેસ એક પેઇડ સ્ટુડિયો સેવા છે. 30–60 સેકન્ડના નમૂનાના ₹499 (વાર્તા વિશ્વ દિગ્દર્શકો સાથે ₹999), પ્લાન મંજૂર કર્યા પછી; આગળ વધો તો તે પૂરી કિંમતમાંથી બાદ થાય છે, નમૂના પછી અટકો તો પાછા મળતા નથી.",
    "નમૂના પછી બાકીની રકમ બે ભાગમાં: આશરે અડધી એડવાન્સ, બાકીની અંતિમ ફાઇલો ડાઉનલોડ કરતાં પહેલાં. ડાઉનલોડ પછી રિફંડ નથી.",
    "ડિલિવરીના 7 દિવસ પછી બધી ફાઇલો કાયમ માટે ડિલીટ થાય છે. તમારી નકલ સાચવી રાખજો.",
    "તૈયાર કામ ઑનલાઇન અને ઑફલાઇન પ્રકાશન માટે છે (YouTube, Spotify, વેબસાઇટ, સોશિયલ મીડિયા, અંગત ઉપયોગ). ફિલ્મ, ટીવી પ્રસારણ, સિનેમા કે ગેમ માટે નહીં, સિવાય કે રિલીઝ પહેલાં સંગીત બદલવાનું ઍડ-ઑન મળી ગયું હોય.",
    "અવાજો અને ચિત્રો AI સાધનોથી બને છે. તમે જણાવેલી ભૂલો જ સુધારાય છે; અમારી ભૂલો મફતમાં સુધારાય છે.",
  ],
  hi: [
    "क्रिएटर्स स्पेस एक सशुल्क स्टूडियो सेवा है। 30–60 सेकंड के नमूने के ₹499 (वार्ता विश्व के निर्देशकों के साथ ₹999), योजना स्वीकार करने के बाद; आगे बढ़ें तो यह पूरी कीमत में से घटता है, नमूने के बाद रुकें तो वापस नहीं मिलता।",
    "नमूने के बाद बाकी रकम दो हिस्सों में: लगभग आधी अग्रिम, बाकी अंतिम फ़ाइलें डाउनलोड करने से पहले। डाउनलोड के बाद कोई रिफ़ंड नहीं।",
    "डिलीवरी के 7 दिन बाद सभी फ़ाइलें हमेशा के लिए मिटा दी जाती हैं। अपनी प्रति सँभालकर रखें।",
    "तैयार काम ऑनलाइन और ऑफ़लाइन प्रकाशन के लिए लाइसेंस है (YouTube, Spotify, वेबसाइट, सोशल मीडिया, निजी उपयोग)। फ़िल्म, टीवी प्रसारण, सिनेमा या गेम के लिए नहीं, जब तक रिलीज़ से पहले संगीत बदलने का ऐड-ऑन न मिल जाए।",
    "आवाज़ें और चित्र AI टूल से बनते हैं। केवल आपकी बताई गलतियाँ सुधारी जाती हैं; हमारी गलतियाँ मुफ़्त में सुधारी जाती हैं।",
  ],
};

// The four ticks at story submission. All required, none pre-ticked.
export const SUBMISSION_CONSENTS = ["terms_refund", "rights_origin", "data_processing", "age_18"] as const;

// Ticks asked later, only when they apply (brief §7). Texts are kept here so the
// version that was shown is the one recorded.
export const LATER_CONSENTS = ["own_voice", "publication_choice", "plan_baseline", "deletion_ack"] as const;

export type ConsentKind = (typeof SUBMISSION_CONSENTS)[number] | (typeof LATER_CONSENTS)[number];

export const CONSENT_TEXT: Record<ConsentKind, Record<ConsentLang, string>> = {
  terms_refund: {
    en: "I have read and accept the Terms and the Refund policy.",
    gu: "મેં શરતો અને રિફંડ નીતિ વાંચી છે અને હું તે સ્વીકારું છું.",
    hi: "मैंने शर्तें और रिफ़ंड नीति पढ़ ली हैं और मैं उन्हें स्वीकार करता/करती हूँ।",
  },
  rights_origin: {
    en: "This story is my own work, or I hold the rights to it. What I declare about its origin and credits is true and complete.",
    gu: "આ વાર્તા મારી પોતાની રચના છે, અથવા તેના હક મારી પાસે છે. તેના મૂળ અને શ્રેય વિશે મેં આપેલી માહિતી સાચી અને પૂરી છે.",
    hi: "यह कहानी मेरी अपनी रचना है, या इसके अधिकार मेरे पास हैं। इसके स्रोत और श्रेय के बारे में मेरी दी गई जानकारी सही और पूरी है।",
  },
  data_processing: {
    en: "I agree to my story being processed by AI service providers (Anthropic, ElevenLabs) to make my order. jambuch.in deletes my story and files from its storage 7 days after delivery.",
    gu: "મારો ઓર્ડર બનાવવા માટે મારી વાર્તા AI સેવા પ્રદાતાઓ (Anthropic, ElevenLabs) દ્વારા પ્રોસેસ થાય, તે માટે હું સંમતિ આપું છું. jambuch.in ડિલિવરીના 7 દિવસ પછી મારી વાર્તા અને ફાઇલો પોતાના સ્ટોરેજમાંથી ડિલીટ કરે છે.",
    hi: "मैं सहमति देता/देती हूँ कि मेरा ऑर्डर बनाने के लिए मेरी कहानी AI सेवा प्रदाताओं (Anthropic, ElevenLabs) द्वारा प्रोसेस की जाए। jambuch.in डिलीवरी के 7 दिन बाद मेरी कहानी और फ़ाइलें अपने स्टोरेज से मिटा देता है।",
  },
  age_18: {
    en: "I am 18 or older.",
    gu: "મારી ઉંમર 18 વર્ષ કે તેથી વધુ છે.",
    hi: "मेरी उम्र 18 वर्ष या उससे अधिक है।",
  },
  own_voice: {
    en: "This is my own voice. I consent to it being used to narrate this order only; the voice model is deleted with the order.",
    gu: "આ મારો પોતાનો અવાજ છે. ફક્ત આ ઓર્ડરના વાચન માટે તેના ઉપયોગની હું સંમતિ આપું છું; ઓર્ડર સાથે વૉઇસ મોડેલ ડિલીટ થશે.",
    hi: "यह मेरी अपनी आवाज़ है। मैं केवल इस ऑर्डर के वाचन के लिए इसके उपयोग की सहमति देता/देती हूँ; ऑर्डर के साथ वॉइस मॉडल मिटा दिया जाएगा।",
  },
  publication_choice: {
    en: "I have chosen whether jambuch.in may publish the finished work, and I understand I can withdraw permission at any time.",
    gu: "jambuch.in તૈયાર કામ પ્રકાશિત કરી શકે કે નહીં તે મેં પસંદ કર્યું છે, અને હું ગમે ત્યારે પરવાનગી પાછી ખેંચી શકું છું તે હું સમજું છું.",
    hi: "jambuch.in तैयार काम प्रकाशित कर सकता है या नहीं, यह मैंने चुना है, और मैं समझता/समझती हूँ कि मैं कभी भी अनुमति वापस ले सकता/सकती हूँ।",
  },
  plan_baseline: {
    en: "I approve this creative plan and script. They are the baseline for deciding whether a later error is your mistake (fixed free) or my content change.",
    gu: "હું આ ક્રિએટિવ પ્લાન અને સ્ક્રિપ્ટ મંજૂર કરું છું. પછીની ભૂલ તમારી છે (મફત સુધારો) કે મારો વિષય-ફેરફાર છે, તે આના આધારે નક્કી થશે.",
    hi: "मैं यह क्रिएटिव योजना और स्क्रिप्ट स्वीकार करता/करती हूँ। बाद की कोई गलती आपकी है (मुफ़्त सुधार) या मेरा सामग्री-बदलाव, यह इन्हीं के आधार पर तय होगा।",
  },
  deletion_ack: {
    en: "I understand there is no refund after this download, and that all files are permanently deleted 7 days after delivery and cannot be recovered.",
    gu: "આ ડાઉનલોડ પછી રિફંડ નથી, અને ડિલિવરીના 7 દિવસ પછી બધી ફાઇલો કાયમ માટે ડિલીટ થાય છે અને પાછી મળી શકતી નથી, તે હું સમજું છું.",
    hi: "मैं समझता/समझती हूँ कि इस डाउनलोड के बाद कोई रिफ़ंड नहीं है, और डिलीवरी के 7 दिन बाद सभी फ़ाइलें हमेशा के लिए मिट जाती हैं और वापस नहीं मिल सकतीं।",
  },
};

// Interface words around the ticks.
export const CONSENT_UI: Record<ConsentLang, { heading: string; fullTerms: string; privacy: string; allRequired: string }> = {
  en: { heading: "Before you send", fullTerms: "Read the full terms and refund policy", privacy: "Privacy policy: who handles your story and for how long", allRequired: "Please tick all four boxes to continue." },
  gu: { heading: "મોકલતાં પહેલાં", fullTerms: "પૂરી શરતો અને રિફંડ નીતિ વાંચો", privacy: "ગોપનીયતા નીતિ: તમારી વાર્તા કોણ સંભાળે છે અને કેટલો સમય", allRequired: "આગળ વધવા માટે ચારેય ખાનાં પર ટીક કરો." },
  hi: { heading: "भेजने से पहले", fullTerms: "पूरी शर्तें और रिफ़ंड नीति पढ़ें", privacy: "गोपनीयता नीति: आपकी कहानी कौन संभालता है और कितने समय तक", allRequired: "आगे बढ़ने के लिए चारों बॉक्स पर टिक करें।" },
};
