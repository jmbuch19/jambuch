// The writers' FAQ (/creators/faq), from docs/CREATORS_FAQ.md with the owner's corrections of
// 26 Nov 2026. Rules:
//  - The FAQ only promises what is live: every answer about a feature (voice notes, level
//    examples, voice previews, Studio Saathi, deletion certificates, Series Storage, directors'
//    approval steps, GST) appears only when that feature's switch is on (creators.flow).
//  - Every price, time and limit comes from settings or the code's own constants (the same
//    numbers the quote and the terms use), never typed here.
//  - Voice: "we / our / us"; no person's name. Gujarati and Hindi are drafts for the admin to
//    check. Refund answers match the live terms (/creators/terms §3).

export type FaqLang = "en" | "gu" | "hi";
export type T = Record<FaqLang, string>;
export type Block = { p: T; link?: { href: string; label: T } } | { ul: T[] } | { ol: T[] };
export type FaqItem = { id: string; q: T; a: Block[] };
export type FaqSection = { id: string; title: T; items: FaqItem[] };

type Level = "basic" | "standard" | "premium";
export type FaqCtx = {
  minimum: number; // ₹, pricing minimum_inr
  sampleStudio: number; // ₹, sample_fee_inr
  sampleDirected: number; // ₹, directed_sample_fee_inr
  episodeChars: number; // characters per episode
  days: { studio: Record<Level, number>; directed: Record<Level, number>; extra_episode: { studio: number; directed: number } };
  deleteDays: number; // files deleted this many days after delivery
  sampleRefundDays: number; // sample fee refunded automatically if not delivered within
  unfinishedReminderDay: number; // reminder for an unfinished request
  unfinishedDeleteDays: number; // unfinished request deleted after
  freeChangePercent: number; // content changes free up to this share, one round
  newOrderPercent: number; // a change beyond this share is a new order
  rechecks: number; // how many times a story can be checked again after a fix
  replyDays: number; // working days to reply
  directedOpen: boolean; // Varta Vishva Directors has opened
  opensOn: Record<FaqLang, string>; // its opening date, written per language
  voiceNotes: boolean;
  features: {
    level_examples: boolean;
    voice_previews: boolean;
    studio_saathi: boolean;
    deletion_certificates: boolean;
    series_storage: boolean;
    directed_approvals: boolean;
    gst: boolean;
  };
  styles: T[]; // picture styles, from the style picker
  colours: T[]; // colour treatments, from the style picker
  contact: string | null; // the studio's email
};

const rs = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const t = (en: string, gu: string, hi: string): T => ({ en, gu, hi });
const list = (xs: T[], lang: FaqLang, sep = ", ") => xs.map((x) => x[lang]).join(sep);
const all = (f: (l: FaqLang) => string): T => ({ en: f("en"), gu: f("gu"), hi: f("hi") });

export function faqSections(c: FaqCtx): FaqSection[] {
  const f = c.features;
  const sections: FaqSection[] = [
    // ------------------------------------------------------------ about
    {
      id: "about",
      title: t("About the studio", "સ્ટુડિયો વિશે", "स्टूडियो के बारे में"),
      items: [
        {
          id: "what",
          q: t("What is Varta Vishva Studio?", "વાર્તા વિશ્વ સ્ટુડિયો શું છે?", "वार्ता विश्व स्टूडियो क्या है?"),
          a: [
            {
              p: t(
                "We turn your written stories into narrated audio stories and illustrated videos, in Gujarati, Hindi or English. You write; we give your story a voice, pictures, music and sound.",
                "અમે તમારી લખેલી વાર્તાઓને વાચન સાથેની ઓડિયો વાર્તાઓ અને ચિત્રો સાથેના વીડિયોમાં ફેરવીએ છીએ, ગુજરાતી, હિન્દી કે અંગ્રેજીમાં. તમે લખો; અમે તમારી વાર્તાને અવાજ, ચિત્રો, સંગીત અને ધ્વનિ આપીએ છીએ.",
                "हम आपकी लिखी कहानियों को वाचन वाली ऑडियो कहानियों और चित्रों वाले वीडियो में बदलते हैं, गुजराती, हिन्दी या अंग्रेज़ी में। आप लिखें; हम आपकी कहानी को आवाज़, चित्र, संगीत और ध्वनि देते हैं।",
              ),
            },
          ],
        },
        {
          id: "who",
          q: t("Who is behind it?", "આની પાછળ કોણ છે?", "इसके पीछे कौन है?"),
          a: [
            {
              p: t(
                "We are the team behind the YouTube channel વાર્તા વિશ્વ – Story Tube, where we publish the Gujarati Ramayana and world classics, chapter by chapter. The same studio and the same care go into your story.",
                "અમે YouTube ચેનલ વાર્તા વિશ્વ – Story Tube પાછળની ટીમ છીએ, જ્યાં અમે ગુજરાતી રામાયણ અને વિશ્વ સાહિત્યની ઉત્તમ કૃતિઓ પ્રકરણે પ્રકરણે પ્રકાશિત કરીએ છીએ. એ જ સ્ટુડિયો અને એ જ કાળજી તમારી વાર્તામાં.",
                "हम YouTube चैनल वार्ता विश्व – Story Tube के पीछे की टीम हैं, जहाँ हम गुजराती रामायण और विश्व साहित्य की श्रेष्ठ कृतियाँ अध्याय दर अध्याय प्रकाशित करते हैं। वही स्टूडियो और वही लगन आपकी कहानी में।",
              ),
            },
          ],
        },
        {
          id: "for-whom",
          q: t("Who is it for?", "આ કોના માટે છે?", "यह किसके लिए है?"),
          a: [
            {
              p: t(
                "Writers, poets, teachers, families keeping memories, community groups: anyone with a finished story they'd like people to hear and see. You must be 18 or older to order.",
                "લેખકો, કવિઓ, શિક્ષકો, યાદો સાચવતા પરિવારો, સમાજના જૂથો: જેમની પાસે પૂરી થયેલી વાર્તા છે અને જે ઇચ્છે છે કે લોકો તેને સાંભળે અને જુએ. ઓર્ડર આપવા માટે તમારી ઉંમર 18 વર્ષ કે વધુ હોવી જોઈએ.",
                "लेखक, कवि, शिक्षक, यादें सँजोते परिवार, समुदाय के समूह: जिनके पास पूरी कहानी है और जो चाहते हैं कि लोग उसे सुनें और देखें। ऑर्डर करने के लिए आपकी उम्र 18 वर्ष या अधिक होनी चाहिए।",
              ),
            },
          ],
        },
        {
          id: "courtyard",
          q: t("Is this the same as the free Courtyard?", "શું આ મફત Courtyard જેવું જ છે?", "क्या यह मुफ़्त Courtyard जैसा ही है?"),
          a: [
            {
              p: t(
                "No. The Courtyard on jambuch.in is a free space for sharing writing. The studio is a paid service that produces finished audio and video.",
                "ના. jambuch.in પરનું Courtyard લખાણ વહેંચવાની મફત જગ્યા છે. સ્ટુડિયો એક પેઇડ સેવા છે, જે તૈયાર ઓડિયો અને વીડિયો બનાવે છે.",
                "नहीं। jambuch.in पर Courtyard लेखन साझा करने की मुफ़्त जगह है। स्टूडियो एक सशुल्क सेवा है, जो तैयार ऑडियो और वीडियो बनाती है।",
              ),
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------------ what we make
    {
      id: "make",
      title: t("What we make", "અમે શું બનાવીએ છીએ", "हम क्या बनाते हैं"),
      items: [
        {
          id: "order",
          q: t("What can I order?", "હું શું ઓર્ડર કરી શકું?", "मैं क्या ऑर्डर कर सकता/सकती हूँ?"),
          a: [
            {
              ul: [
                t("Audio story: narration, with or without music and sound effects.", "ઓડિયો વાર્તા: વાચન, સંગીત અને ધ્વનિ-અસરો સાથે કે વગર.", "ऑडियो कहानी: वाचन, संगीत और ध्वनि-प्रभावों के साथ या बिना।"),
                t("Video with one picture: your narration over a single illustration.", "એક ચિત્રવાળો વીડિયો: એક જ ચિત્ર પર તમારી વાર્તાનું વાચન.", "एक चित्र वाला वीडियो: एक ही चित्र पर आपकी कहानी का वाचन।"),
                t(
                  "Video with moving paintings: a series of illustrations with gentle camera movement, music, sound and captions.",
                  "ચાલતાં ચિત્રોવાળો વીડિયો: હળવી કૅમેરા-ગતિ, સંગીત, ધ્વનિ અને કૅપ્શન સાથે ચિત્રોની શ્રેણી.",
                  "चलते चित्रों वाला वीडियो: हल्की कैमरा-गति, संगीत, ध्वनि और कैप्शन के साथ चित्रों की श्रृंखला।",
                ),
                t(
                  "Shorts pack: 3 or 5 vertical clips for YouTube Shorts, Reels or WhatsApp status (with any video).",
                  "Shorts પૅક: YouTube Shorts, Reels કે WhatsApp સ્ટેટસ માટે 3 કે 5 ઊભી ક્લિપ (કોઈ પણ વીડિયો સાથે).",
                  "Shorts पैक: YouTube Shorts, Reels या WhatsApp स्टेटस के लिए 3 या 5 खड़ी क्लिप (किसी भी वीडियो के साथ)।",
                ),
              ],
            },
          ],
        },
        {
          id: "levels",
          q: t("What are the finish levels?", "ફિનિશ લેવલ શું છે?", "फ़िनिश लेवल क्या हैं?"),
          a: [
            {
              p: t(
                `Basic (સરળ), Standard (સુંદર) and Premium (શ્રેષ્ઠ). Each level sets how many pictures, voices and extras you get.${f.level_examples ? " You can see the same short story at all three levels on our page before choosing." : ""}`,
                `સરળ, સુંદર અને શ્રેષ્ઠ. દરેક લેવલ નક્કી કરે છે કે તમને કેટલાં ચિત્રો, અવાજો અને વધારાનું મળે.${f.level_examples ? " પસંદ કરતાં પહેલાં અમારા પેજ પર એક જ નાની વાર્તા ત્રણેય લેવલમાં જોઈ શકો છો." : ""}`,
                `सरल, सुंदर और श्रेष्ठ। हर लेवल तय करता है कि आपको कितने चित्र, आवाज़ें और अतिरिक्त चीज़ें मिलें।${f.level_examples ? " चुनने से पहले हमारे पेज पर एक ही छोटी कहानी तीनों लेवल में देख सकते हैं।" : ""}`,
              ),
            },
          ],
        },
        {
          id: "service",
          q: t(
            "What is “Studio-made” and what is “Varta Vishva Directors”?",
            "“સ્ટુડિયો-નિર્મિત” અને “વાર્તા વિશ્વ દિગ્દર્શકો દ્વારા” શું છે?",
            "“स्टूडियो-निर्मित” और “वार्ता विश्व के निर्देशकों द्वारा” क्या है?",
          ),
          a: [
            {
              ul: [
                t(
                  "Studio-made: our studio produces your story following your brief, and our team checks its quality.",
                  "સ્ટુડિયો-નિર્મિત: અમારો સ્ટુડિયો તમારી માહિતી પ્રમાણે વાર્તા બનાવે છે, અને અમારી ટીમ ગુણવત્તા ચકાસે છે.",
                  "स्टूडियो-निर्मित: हमारा स्टूडियो आपकी जानकारी के अनुसार कहानी बनाता है, और हमारी टीम गुणवत्ता जाँचती है।",
                ),
                f.directed_approvals
                  ? t(
                      "Varta Vishva Directors: a director from our team works on your story personally: a call within 2 days, a mood plan for you to approve, voiced excerpts for you to approve, and a sheet of the pictures before the final, with up to 2 rounds of changes at each step. It takes longer and costs more. Premium is always made by our directors.",
                      "વાર્તા વિશ્વ દિગ્દર્શકો દ્વારા: અમારી ટીમના દિગ્દર્શક તમારી વાર્તા પર જાતે કામ કરે છે: 2 દિવસમાં ફોન, તમારી મંજૂરી માટે ભાવ-યોજના, મંજૂરી માટે વાચનના અંશો, અને અંતિમ પહેલાં ચિત્રોની શીટ; દરેક પગલે 2 વખત સુધી ફેરફાર. વધુ સમય અને વધુ કિંમત. શ્રેષ્ઠ (Premium) હંમેશાં અમારા દિગ્દર્શકો બનાવે છે.",
                      "वार्ता विश्व के निर्देशकों द्वारा: हमारी टीम के निर्देशक आपकी कहानी पर खुद काम करते हैं: 2 दिन में फ़ोन, आपकी मंज़ूरी के लिए भाव-योजना, मंज़ूरी के लिए वाचन के अंश, और अंतिम से पहले चित्रों की शीट; हर चरण पर 2 बार तक बदलाव। ज़्यादा समय और ज़्यादा कीमत। श्रेष्ठ (Premium) हमेशा हमारे निर्देशक बनाते हैं।",
                    )
                  : t(
                      "Varta Vishva Directors: our director calls you within 2 days, then directs your story scene by scene: voices, sound, pauses and pictures. It takes longer and costs more. Premium is always made by our directors.",
                      "વાર્તા વિશ્વ દિગ્દર્શકો દ્વારા: અમારા દિગ્દર્શક 2 દિવસમાં તમને ફોન કરે છે, પછી તમારી વાર્તાને દૃશ્યે દૃશ્યે દિગ્દર્શિત કરે છે: અવાજો, ધ્વનિ, વિરામ અને ચિત્રો. વધુ સમય અને વધુ કિંમત. શ્રેષ્ઠ (Premium) હંમેશાં અમારા દિગ્દર્શકો બનાવે છે.",
                      "वार्ता विश्व के निर्देशकों द्वारा: हमारे निर्देशक 2 दिन में आपको फ़ोन करते हैं, फिर आपकी कहानी को दृश्य-दर-दृश्य निर्देशित करते हैं: आवाज़ें, ध्वनि, विराम और चित्र। ज़्यादा समय और ज़्यादा कीमत। श्रेष्ठ (Premium) हमेशा हमारे निर्देशक बनाते हैं।",
                    ),
              ],
            },
            ...(c.directedOpen
              ? []
              : [
                  {
                    p: all((l) =>
                      ({
                        en: `Our directors start new stories from ${c.opensOn.en}. Studio-made can start now.`,
                        gu: `અમારા દિગ્દર્શકો ${c.opensOn.gu}થી નવી વાર્તાઓ શરૂ કરશે. સ્ટુડિયો-નિર્મિત હમણાં શરૂ થઈ શકે.`,
                        hi: `हमारे निर्देशक ${c.opensOn.hi} से नई कहानियाँ शुरू करेंगे। स्टूडियो-निर्मित अभी शुरू हो सकता है।`,
                      })[l],
                    ),
                  },
                ]),
          ],
        },
        {
          id: "animation",
          q: t(
            "Can you make a fully animated film with moving characters?",
            "શું તમે હાલતાં-ચાલતાં પાત્રોવાળી સંપૂર્ણ એનિમેટેડ ફિલ્મ બનાવી શકો?",
            "क्या आप चलते-फिरते पात्रों वाली पूरी एनिमेटेड फ़िल्म बना सकते हैं?",
          ),
          a: [
            {
              p: t(
                "Not as a standard order. Our videos use illustrated paintings with camera movement. For real animation, write to us for a separate quote.",
                "સામાન્ય ઓર્ડરમાં નહીં. અમારા વીડિયોમાં કૅમેરા-ગતિ સાથેનાં ચિત્રો હોય છે. સાચા એનિમેશન માટે અલગ ભાવ માટે અમને લખો.",
                "सामान्य ऑर्डर में नहीं। हमारे वीडियो में कैमरा-गति वाले चित्र होते हैं। असली एनिमेशन के लिए अलग कीमत हेतु हमें लिखें।",
              ),
            },
          ],
        },
        {
          id: "cant",
          q: t("What can't you do?", "તમે શું નથી કરી શકતા?", "आप क्या नहीं कर सकते?"),
          a: [
            { p: t("We tell you up front, so there are no surprises:", "અમે પહેલેથી કહી દઈએ છીએ, જેથી પછી કોઈ આશ્ચર્ય ન થાય:", "हम पहले ही बता देते हैं, ताकि बाद में कोई हैरानी न हो:") },
            {
              ul: [
                t("lip-synced talking faces;", "બોલતા ચહેરા સાથે હોઠનું મેળવણું;", "बोलते चेहरों के साथ होंठों का मेल;"),
                t("an exact likeness of a real person;", "કોઈ સાચી વ્યક્તિનો હૂબહૂ ચહેરો;", "किसी असली व्यक्ति का हूबहू चेहरा;"),
                t(
                  "readable text drawn inside paintings (we add text separately, clearly);",
                  "ચિત્રની અંદર વાંચી શકાય એવું લખાણ (લખાણ અમે અલગથી, સ્પષ્ટ ઉમેરીએ છીએ);",
                  "चित्र के अंदर पढ़ने लायक लिखावट (लिखावट हम अलग से, साफ़ जोड़ते हैं);",
                ),
                t("fast fight or action choreography;", "ઝડપી લડાઈ કે ઍક્શન દૃશ્યો;", "तेज़ लड़ाई या एक्शन दृश्य;"),
                t("copyrighted characters (film, cartoon or brand characters);", "કૉપિરાઇટવાળાં પાત્રો (ફિલ્મ, કાર્ટૂન કે બ્રાન્ડનાં);", "कॉपीराइट वाले पात्र (फ़िल्म, कार्टून या ब्रांड के);"),
                t(
                  "perfect pronunciation of rare dialect words without your help, so we ask you for a pronunciation list.",
                  "તમારી મદદ વગર દુર્લભ બોલીના શબ્દોના સાચા ઉચ્ચાર; તેથી અમે તમારી પાસે ઉચ્ચારની યાદી માંગીએ છીએ.",
                  "आपकी मदद के बिना दुर्लभ बोली के शब्दों का सही उच्चारण; इसलिए हम आपसे उच्चारण की सूची माँगते हैं।",
                ),
              ],
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------------ how it works
    {
      id: "how",
      title: t("How it works", "કેવી રીતે થાય છે", "कैसे होता है"),
      items: [
        {
          id: "steps",
          q: t("What are the steps?", "પગલાં કયાં છે?", "कदम क्या हैं?"),
          a: [
            {
              ol: [
                t(
                  "Tell us about your story: sign in, add your story and answer a few simple questions (about 10 minutes).",
                  "તમારી વાર્તા વિશે કહો: સાઇન ઇન કરો, વાર્તા ઉમેરો અને થોડા સરળ પ્રશ્નોના જવાબ આપો (આશરે 10 મિનિટ).",
                  "अपनी कहानी के बारे में बताएँ: साइन इन करें, कहानी जोड़ें और कुछ सरल प्रश्नों के उत्तर दें (लगभग 10 मिनट)।",
                ),
                t("We prepare a one-page creative plan and a fixed price.", "અમે એક પાનાની સર્જનાત્મક યોજના અને નક્કી કિંમત તૈયાર કરીએ છીએ.", "हम एक पन्ने की रचनात्मक योजना और तय कीमत तैयार करते हैं।"),
                all((l) =>
                  ({
                    en: `You approve the plan and pay for a sample (${rs(c.sampleStudio)}; ${rs(c.sampleDirected)} with Varta Vishva Directors).`,
                    gu: `તમે યોજના મંજૂર કરો અને નમૂનાની ફી ચૂકવો (${rs(c.sampleStudio)}; વાર્તા વિશ્વ દિગ્દર્શકો સાથે ${rs(c.sampleDirected)}).`,
                    hi: `आप योजना स्वीकार करें और नमूने का शुल्क दें (${rs(c.sampleStudio)}; वार्ता विश्व के निर्देशकों के साथ ${rs(c.sampleDirected)})।`,
                  })[l],
                ),
                t("You hear or watch your sample.", "તમે તમારો નમૂનો સાંભળો કે જુઓ.", "आप अपना नमूना सुनें या देखें।"),
                t(
                  "If you like it, pay the rest of the first half (your sample fee is already counted), and we make the full piece.",
                  "ગમે તો પહેલા અડધા ભાગની બાકી રકમ ચૂકવો (તમારી નમૂનાની ફી ગણાઈ ગઈ છે), અને અમે આખી રચના બનાવીએ છીએ.",
                  "पसंद आए तो पहले आधे हिस्से की बाकी रकम दें (आपका नमूना शुल्क गिना जा चुका है), और हम पूरी रचना बनाते हैं।",
                ),
                t(
                  "You preview it and tell us about any errors; we fix our mistakes free.",
                  "તમે પૂર્વાવલોકન જુઓ અને ભૂલો જણાવો; અમારી ભૂલો અમે મફત સુધારીએ છીએ.",
                  "आप पूर्वावलोकन देखें और गलतियाँ बताएँ; हमारी गलतियाँ हम मुफ़्त सुधारते हैं।",
                ),
                t("Pay the second half and download your files.", "બીજો અડધો ભાગ ચૂકવો અને તમારી ફાઇલો ડાઉનલોડ કરો.", "दूसरा आधा हिस्सा दें और अपनी फ़ाइलें डाउनलोड करें।"),
              ],
            },
          ],
        },
        {
          id: "account",
          q: t("Do I need an account?", "શું મારે એકાઉન્ટ જોઈએ?", "क्या मुझे खाता चाहिए?"),
          a: [
            {
              p: t(
                "Yes, a simple one. You sign in with your email and a one-time code: no password to remember. Your page shows every step of your order.",
                "હા, એક સરળ. તમે તમારા ઇમેઇલ અને એક વખતના કોડથી સાઇન ઇન કરો છો: યાદ રાખવાનો કોઈ પાસવર્ડ નહીં. તમારું પેજ ઓર્ડરનું દરેક પગલું બતાવે છે.",
                "हाँ, एक सरल। आप अपने ईमेल और एक बार के कोड से साइन इन करते हैं: याद रखने को कोई पासवर्ड नहीं। आपका पेज ऑर्डर का हर कदम दिखाता है।",
              ),
            },
          ],
        },
        {
          id: "ready",
          q: t("What do I need to have ready?", "મારે શું તૈયાર રાખવું?", "मुझे क्या तैयार रखना है?"),
          a: [
            {
              p: t(
                "Your finished story as typed text (paste it, or upload a Word, text or PDF file with real text, not a scanned image), its title, and the author's name.",
                "તમારી પૂરી વાર્તા ટાઇપ કરેલા લખાણમાં (પેસ્ટ કરો, કે સાચા લખાણવાળી Word, text કે PDF ફાઇલ અપલોડ કરો, સ્કૅન કરેલી છબી નહીં), તેનું શીર્ષક અને લેખકનું નામ.",
                "आपकी पूरी कहानी टाइप किए लेख में (पेस्ट करें, या असली लेख वाली Word, text या PDF फ़ाइल अपलोड करें, स्कैन की हुई छवि नहीं), उसका शीर्षक और लेखक का नाम।",
              ),
            },
          ],
        },
        {
          id: "ask",
          q: t("What will you ask me?", "તમે મને શું પૂછશો?", "आप मुझसे क्या पूछेंगे?"),
          a: [
            {
              p: t(
                `What the piece is for and who will watch, how it should feel, the look and colour you like (or “suggest for me”), your characters, music wishes, anything to avoid, and an ending line or dedication. Most questions have a “you decide for me” choice.${c.voiceNotes ? " You can type or record a voice note." : ""}`,
                `રચના શા માટે છે અને કોણ જોશે, તેમાં કેવો ભાવ જોઈએ, તમને ગમતો દેખાવ અને રંગ (કે “મારા માટે સૂચવો”), તમારાં પાત્રો, સંગીતની ઇચ્છા, શું ટાળવું, અને અંતની પંક્તિ કે અર્પણ. મોટા ભાગના પ્રશ્નોમાં “તમે જ નક્કી કરો” વિકલ્પ છે.${c.voiceNotes ? " તમે લખી શકો કે વૉઇસ નોટ રેકૉર્ડ કરી શકો." : ""}`,
                `रचना किसलिए है और कौन देखेगा, उसमें कैसा भाव हो, आपको पसंद रूप और रंग (या “मेरे लिए सुझाएँ”), आपके पात्र, संगीत की इच्छा, किससे बचना है, और अंत की पंक्ति या समर्पण। अधिकतर प्रश्नों में “आप ही तय करें” विकल्प है।${c.voiceNotes ? " आप लिख सकते हैं या वॉइस नोट रिकॉर्ड कर सकते हैं।" : ""}`,
              ),
            },
          ],
        },
        {
          id: "words",
          q: t("Will you change my words?", "શું તમે મારા શબ્દો બદલશો?", "क्या आप मेरे शब्द बदलेंगे?"),
          a: [
            {
              p: t(
                "Only if you allow it. By default we narrate your text exactly as written. If you let us shorten or adapt it for video, every change is shown to you in the script, and nothing is narrated until you approve it.",
                "તમે મંજૂરી આપો તો જ. સામાન્ય રીતે અમે તમારું લખાણ જેવું લખ્યું છે તેવું જ વાંચીએ છીએ. વીડિયો માટે ટૂંકું કે ફેરફાર કરવાની છૂટ આપો તો દરેક ફેરફાર સ્ક્રિપ્ટમાં તમને બતાવાય છે, અને તમે મંજૂર કરો ત્યાં સુધી કંઈ વંચાતું નથી.",
                "आप अनुमति दें तभी। सामान्यतः हम आपका लेख जैसा लिखा है वैसा ही पढ़ते हैं। वीडियो के लिए छोटा या बदलने की छूट दें तो हर बदलाव स्क्रिप्ट में आपको दिखाया जाता है, और आपकी मंज़ूरी तक कुछ नहीं पढ़ा जाता।",
              ),
            },
          ],
        },
        {
          id: "long",
          q: t("My story is long. Can you still make it?", "મારી વાર્તા લાંબી છે. શું તમે બનાવી શકો?", "मेरी कहानी लंबी है। क्या आप बना सकते हैं?"),
          a: [
            {
              p: all((l) =>
                ({
                  en: `Yes. Stories over ${c.episodeChars.toLocaleString("en-IN")} characters are made as a series of episodes. We suggest where to split; you decide.`,
                  gu: `હા. ${c.episodeChars.toLocaleString("en-IN")}થી વધુ અક્ષરોની વાર્તાઓ હપ્તાઓની શ્રેણી તરીકે બને છે. ક્યાં ભાગ પાડવા તે અમે સૂચવીએ; નક્કી તમે કરો.`,
                  hi: `हाँ। ${c.episodeChars.toLocaleString("en-IN")} से अधिक अक्षरों की कहानियाँ कड़ियों की श्रृंखला के रूप में बनती हैं। कहाँ बाँटना है हम सुझाते हैं; तय आप करते हैं।`,
                })[l],
              ),
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------------ price
    {
      id: "price",
      title: t("Price and payment", "કિંમત અને ચુકવણી", "कीमत और भुगतान"),
      items: [
        {
          id: "cost",
          q: t("How much does it cost?", "કેટલો ખર્ચ થાય?", "कितना खर्च होता है?"),
          a: [
            {
              p: all((l) =>
                ({
                  en: `Orders start at ${rs(c.minimum)}. Your exact price depends on length, format, finish level and extras, and you see a fixed quote before paying anything. The quote doesn't change unless you change your order.`,
                  gu: `ઓર્ડર ${rs(c.minimum)}થી શરૂ થાય છે. ચોક્કસ કિંમત લંબાઈ, પ્રકાર, ફિનિશ લેવલ અને વધારાની પસંદગી પર આધાર રાખે છે, અને કંઈ ચૂકવતાં પહેલાં તમે નક્કી ભાવ જુઓ છો. તમે ઓર્ડર ન બદલો ત્યાં સુધી ભાવ બદલાતો નથી.`,
                  hi: `ऑर्डर ${rs(c.minimum)} से शुरू होते हैं। सही कीमत लंबाई, प्रकार, फ़िनिश लेवल और अतिरिक्त चुनाव पर निर्भर है, और कुछ भी देने से पहले आप तय कीमत देखते हैं। आप ऑर्डर न बदलें तो कीमत नहीं बदलती।`,
                })[l],
              ),
            },
          ],
        },
        {
          id: "why-cost",
          q: t("Why does it cost what it costs?", "આટલી કિંમત કેમ?", "इतनी कीमत क्यों?"),
          a: [
            {
              p: t(
                "Every order uses paid voice, illustration and AI services, plus our team's time to check and finish your work. Our price covers those costs fairly; the quote shows what's included.",
                "દરેક ઓર્ડરમાં પેઇડ અવાજ, ચિત્ર અને AI સેવાઓ વપરાય છે, ઉપરાંત તમારું કામ ચકાસવા અને પૂરું કરવા અમારી ટીમનો સમય. અમારી કિંમત આ ખર્ચ વાજબી રીતે આવરે છે; ભાવમાં શું સામેલ છે તે દેખાય છે.",
                "हर ऑर्डर में सशुल्क आवाज़, चित्र और AI सेवाएँ लगती हैं, साथ ही आपका काम जाँचने और पूरा करने में हमारी टीम का समय। हमारी कीमत ये खर्च उचित रूप से पूरे करती है; कीमत में क्या शामिल है यह दिखता है।",
              ),
            },
          ],
        },
        {
          id: "sample",
          q: t("What is the sample, and what does it cost?", "નમૂનો શું છે, અને તેની કિંમત શું?", "नमूना क्या है, और उसकी कीमत क्या?"),
          a: [
            {
              p: all((l) =>
                ({
                  en: `A short piece of your own story, so you can hear or see our work before committing. Studio-made sample: ${rs(c.sampleStudio)}. Varta Vishva Directors sample: ${rs(c.sampleDirected)}. The sample fee is deducted from your full price if you continue.`,
                  gu: `તમારી પોતાની વાર્તાનો નાનો અંશ, જેથી આગળ વધતાં પહેલાં તમે અમારું કામ સાંભળી કે જોઈ શકો. સ્ટુડિયો-નિર્મિત નમૂનો: ${rs(c.sampleStudio)}. વાર્તા વિશ્વ દિગ્દર્શકોનો નમૂનો: ${rs(c.sampleDirected)}. આગળ વધો તો નમૂનાની ફી પૂરી કિંમતમાંથી બાદ થાય છે.`,
                  hi: `आपकी अपनी कहानी का छोटा अंश, ताकि आगे बढ़ने से पहले आप हमारा काम सुन या देख सकें। स्टूडियो-निर्मित नमूना: ${rs(c.sampleStudio)}। वार्ता विश्व के निर्देशकों का नमूना: ${rs(c.sampleDirected)}। आगे बढ़ें तो नमूना शुल्क पूरी कीमत में से घटता है।`,
                })[l],
              ),
            },
          ],
        },
        {
          id: "pay",
          q: t("How do I pay?", "હું કેવી રીતે ચૂકવું?", "मैं कैसे भुगतान करूँ?"),
          a: [
            {
              p: t(
                "After the sample, in two parts: the rest of the first half to start full production (your sample fee is already counted), and the second half before you download the final files. We accept UPI, cards and net banking through Razorpay.",
                "નમૂના પછી, બે ભાગમાં: આખું કામ શરૂ કરવા પહેલા અડધા ભાગની બાકી રકમ (તમારી નમૂનાની ફી ગણાઈ ગઈ છે), અને અંતિમ ફાઇલો ડાઉનલોડ કરતાં પહેલાં બીજો અડધો ભાગ. Razorpay દ્વારા UPI, કાર્ડ અને નેટ બૅન્કિંગ ચાલે છે.",
                "नमूने के बाद, दो हिस्सों में: पूरा काम शुरू करने के लिए पहले आधे हिस्से की बाकी रकम (आपका नमूना शुल्क गिना जा चुका है), और अंतिम फ़ाइलें डाउनलोड करने से पहले दूसरा आधा हिस्सा। Razorpay से UPI, कार्ड और नेट बैंकिंग चलते हैं।",
              ),
            },
          ],
        },
        ...(f.gst
          ? [
              {
                id: "gst",
                q: t("Is GST included?", "શું GST સામેલ છે?", "क्या GST शामिल है?"),
                a: [
                  {
                    p: t(
                      "GST at 18% is added to the price as shown in your quote, and you receive a proper GST invoice.",
                      "તમારા ભાવમાં બતાવ્યા પ્રમાણે કિંમત પર 18% GST ઉમેરાય છે, અને તમને યોગ્ય GST ઇન્વૉઇસ મળે છે.",
                      "आपकी कीमत में दिखाए अनुसार 18% GST जोड़ा जाता है, और आपको सही GST इनवॉइस मिलता है।",
                    ),
                  },
                ],
              },
            ]
          : []),
        {
          id: "hidden",
          q: t("Are there hidden charges?", "શું કોઈ છૂપા ચાર્જ છે?", "क्या कोई छिपे शुल्क हैं?"),
          a: [
            {
              p: f.series_storage
                ? t(
                    "No. Extras (more voices, Shorts, a second language, Series Storage) are chosen by you and shown in the quote.",
                    "ના. વધારાનું (વધુ અવાજો, Shorts, બીજી ભાષા, Series Storage) તમે પસંદ કરો છો અને ભાવમાં બતાવાય છે.",
                    "नहीं। अतिरिक्त चीज़ें (और आवाज़ें, Shorts, दूसरी भाषा, Series Storage) आप चुनते हैं और कीमत में दिखती हैं।",
                  )
                : t(
                    "No. Extras (more voices, Shorts, a second language) are chosen by you and shown in the quote.",
                    "ના. વધારાનું (વધુ અવાજો, Shorts, બીજી ભાષા) તમે પસંદ કરો છો અને ભાવમાં બતાવાય છે.",
                    "नहीं। अतिरिक्त चीज़ें (और आवाज़ें, Shorts, दूसरी भाषा) आप चुनते हैं और कीमत में दिखती हैं।",
                  ),
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------------ timing
    {
      id: "timing",
      title: t("Timing", "સમય", "समय"),
      items: [
        {
          id: "how-long",
          q: t("How long does it take?", "કેટલો સમય લાગે?", "कितना समय लगता है?"),
          a: [
            { p: t("Counted from your advance payment, at the most:", "તમારી એડવાન્સ ચુકવણીથી ગણતાં, વધુમાં વધુ:", "आपके अग्रिम भुगतान से गिनकर, अधिक से अधिक:") },
            {
              ul: [
                all((l) =>
                  ({
                    en: `Studio-made: Basic ${c.days.studio.basic} days, Standard ${c.days.studio.standard} days.`,
                    gu: `સ્ટુડિયો-નિર્મિત: સરળ ${c.days.studio.basic} દિવસ, સુંદર ${c.days.studio.standard} દિવસ.`,
                    hi: `स्टूडियो-निर्मित: सरल ${c.days.studio.basic} दिन, सुंदर ${c.days.studio.standard} दिन।`,
                  })[l],
                ),
                all((l) =>
                  ({
                    en: `Varta Vishva Directors: Basic ${c.days.directed.basic} days, Standard ${c.days.directed.standard} days, Premium ${c.days.directed.premium} days.`,
                    gu: `વાર્તા વિશ્વ દિગ્દર્શકો: સરળ ${c.days.directed.basic} દિવસ, સુંદર ${c.days.directed.standard} દિવસ, શ્રેષ્ઠ ${c.days.directed.premium} દિવસ.`,
                    hi: `वार्ता विश्व के निर्देशक: सरल ${c.days.directed.basic} दिन, सुंदर ${c.days.directed.standard} दिन, श्रेष्ठ ${c.days.directed.premium} दिन।`,
                  })[l],
                ),
                all((l) =>
                  ({
                    en: `Each extra episode of a series adds ${c.days.extra_episode.studio} days (${c.days.extra_episode.directed} with our directors).`,
                    gu: `શ્રેણીનો દરેક વધારાનો હપ્તો ${c.days.extra_episode.studio} દિવસ ઉમેરે છે (અમારા દિગ્દર્શકો સાથે ${c.days.extra_episode.directed}).`,
                    hi: `श्रृंखला की हर अतिरिक्त कड़ी ${c.days.extra_episode.studio} दिन जोड़ती है (हमारे निर्देशकों के साथ ${c.days.extra_episode.directed})।`,
                  })[l],
                ),
              ],
            },
            { p: t("Your plan shows the expected time for your own order.", "તમારી યોજનામાં તમારા ઓર્ડરનો અપેક્ષિત સમય દેખાય છે.", "आपकी योजना में आपके ऑर्डर का अनुमानित समय दिखता है।") },
          ],
        },
        {
          id: "directed-wait",
          q: t("Why can't I order a directed piece right now?", "હું હમણાં દિગ્દર્શિત રચના કેમ ઓર્ડર ન કરી શકું?", "मैं अभी निर्देशित रचना क्यों ऑर्डर नहीं कर सकता/सकती?"),
          a: [
            {
              p: t(
                "Our directors take only a few new stories each week so every story gets real attention. When the week is full, the page shows the next start date.",
                "અમારા દિગ્દર્શકો દર અઠવાડિયે થોડીક જ નવી વાર્તાઓ લે છે, જેથી દરેક વાર્તાને પૂરું ધ્યાન મળે. અઠવાડિયું ભરાઈ જાય ત્યારે પેજ આગલી શરૂઆતની તારીખ બતાવે છે.",
                "हमारे निर्देशक हर हफ़्ते कुछ ही नई कहानियाँ लेते हैं, ताकि हर कहानी को पूरा ध्यान मिले। हफ़्ता भर जाए तो पेज अगली शुरुआत की तारीख दिखाता है।",
              ),
            },
          ],
        },
        {
          id: "unfinished",
          q: t("What if I leave my request unfinished?", "હું મારી વિનંતી અધૂરી છોડું તો?", "अगर मैं अपना अनुरोध अधूरा छोड़ दूँ तो?"),
          a: [
            {
              p: all((l) =>
                ({
                  en: `Before you pay anything, an unfinished request waits for you: we send a reminder after ${c.unfinishedReminderDay} days, and the request and your story are deleted ${c.unfinishedDeleteDays} days after your last change. Nothing is charged.`,
                  gu: `કંઈ ચૂકવો તે પહેલાં, અધૂરી વિનંતી તમારી રાહ જુએ છે: ${c.unfinishedReminderDay} દિવસ પછી અમે યાદ અપાવીએ છીએ, અને તમારા છેલ્લા ફેરફારના ${c.unfinishedDeleteDays} દિવસ પછી વિનંતી અને તમારી વાર્તા ડિલીટ થાય છે. કોઈ ચાર્જ નથી.`,
                  hi: `कुछ भी देने से पहले, अधूरा अनुरोध आपकी राह देखता है: ${c.unfinishedReminderDay} दिन बाद हम याद दिलाते हैं, और आपके अंतिम बदलाव के ${c.unfinishedDeleteDays} दिन बाद अनुरोध और आपकी कहानी मिटा दी जाती है। कोई शुल्क नहीं।`,
                })[l],
              ),
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------------ voices and look
    {
      id: "voices",
      title: t("Voices, languages and look", "અવાજો, ભાષાઓ અને દેખાવ", "आवाज़ें, भाषाएँ और रूप"),
      items: [
        {
          id: "languages",
          q: t("Which languages?", "કઈ ભાષાઓ?", "कौन-सी भाषाएँ?"),
          a: [
            {
              p: t(
                "Gujarati, Hindi and English. You can add the same piece in a second language; we translate, and you approve the translation before narration.",
                "ગુજરાતી, હિન્દી અને અંગ્રેજી. એ જ રચના બીજી ભાષામાં પણ ઉમેરી શકો; અમે અનુવાદ કરીએ છીએ, અને વાચન પહેલાં તમે અનુવાદ મંજૂર કરો છો.",
                "गुजराती, हिन्दी और अंग्रेज़ी। वही रचना दूसरी भाषा में भी जोड़ सकते हैं; हम अनुवाद करते हैं, और वाचन से पहले आप अनुवाद स्वीकार करते हैं।",
              ),
            },
          ],
        },
        {
          id: "delivery-style",
          q: t("Plain or dramatised narration?", "સાદું કે નાટ્યાત્મક વાચન?", "सादा या नाटकीय वाचन?"),
          a: [
            {
              ul: [
                t("Plain: clear, steady reading, like an audiobook.", "સાદું: સ્પષ્ટ, સ્થિર વાચન, ઑડિયોબુક જેવું.", "सादा: साफ़, स्थिर वाचन, ऑडियोबुक जैसा।"),
                t(
                  "Dramatised: emotion, pauses, whispers, characters acting their lines. You approve the directed script first.",
                  "નાટ્યાત્મક: ભાવ, વિરામ, ધીમો અવાજ, પાત્રો પોતાના સંવાદ ભજવે. પહેલાં તમે દિગ્દર્શિત સ્ક્રિપ્ટ મંજૂર કરો છો.",
                  "नाटकीय: भाव, विराम, धीमी आवाज़, पात्र अपने संवाद निभाते हैं। पहले आप निर्देशित स्क्रिप्ट स्वीकार करते हैं।",
                ),
              ],
            },
          ],
        },
        {
          id: "character-voices",
          q: t("Can characters have different voices?", "શું પાત્રોના અવાજ અલગ હોઈ શકે?", "क्या पात्रों की आवाज़ें अलग हो सकती हैं?"),
          a: [
            {
              p: f.voice_previews
                ? t(
                    "Yes. Depending on the level, your main characters can each have their own voice; you choose from voice previews.",
                    "હા. લેવલ પ્રમાણે તમારાં મુખ્ય પાત્રોનો દરેકનો પોતાનો અવાજ હોઈ શકે; તમે અવાજના નમૂનામાંથી પસંદ કરો છો.",
                    "हाँ। लेवल के अनुसार आपके मुख्य पात्रों की अपनी-अपनी आवाज़ हो सकती है; आप आवाज़ के नमूनों में से चुनते हैं।",
                  )
                : t(
                    "Yes. Depending on the level, your main characters can each have their own voice; we choose voices that suit them.",
                    "હા. લેવલ પ્રમાણે તમારાં મુખ્ય પાત્રોનો દરેકનો પોતાનો અવાજ હોઈ શકે; તેમને અનુરૂપ અવાજ અમે પસંદ કરીએ છીએ.",
                    "हाँ। लेवल के अनुसार आपके मुख्य पात्रों की अपनी-अपनी आवाज़ हो सकती है; उनके अनुरूप आवाज़ें हम चुनते हैं।",
                  ),
            },
          ],
        },
        {
          id: "own-voice",
          q: t("Can my own voice narrate it?", "શું મારો પોતાનો અવાજ વાચન કરી શકે?", "क्या मेरी अपनी आवाज़ वाचन कर सकती है?"),
          a: [
            {
              p: t(
                "Yes, as an add-on. You upload a recording of your own voice and give consent. We never copy anyone else's voice: no celebrities, no other people, no one who has passed away.",
                "હા, વધારાની સેવા તરીકે. તમે તમારા અવાજનું રેકૉર્ડિંગ અપલોડ કરો અને સંમતિ આપો. અમે બીજા કોઈનો અવાજ ક્યારેય નકલ કરતા નથી: કોઈ જાણીતી વ્યક્તિ, બીજી કોઈ વ્યક્તિ કે દિવંગત વ્યક્તિ નહીં.",
                "हाँ, अतिरिक्त सेवा के रूप में। आप अपनी आवाज़ की रिकॉर्डिंग अपलोड करें और सहमति दें। हम किसी और की आवाज़ कभी नकल नहीं करते: कोई मशहूर व्यक्ति, कोई और व्यक्ति या दिवंगत व्यक्ति नहीं।",
              ),
            },
          ],
        },
        {
          id: "same-voice",
          q: t(
            "Will another writer get the same voice or music as me?",
            "શું બીજા લેખકને મારા જેવો જ અવાજ કે સંગીત મળશે?",
            "क्या किसी और लेखक को मेरी जैसी ही आवाज़ या संगीत मिलेगा?",
          ),
          a: [
            {
              p: t(
                "Our voices and music come from a library, and we vary them between orders so your piece feels your own. Library voices and music are not exclusive, though. If you want a voice used only for you, choose the exclusive narrator voice add-on.",
                "અમારા અવાજો અને સંગીત એક સંગ્રહમાંથી આવે છે, અને દરેક ઓર્ડરમાં અમે તેમાં ફેરફાર રાખીએ છીએ જેથી તમારી રચના તમારી જ લાગે. છતાં સંગ્રહના અવાજો અને સંગીત ફક્ત તમારા માટે નથી. ફક્ત તમારા માટેનો અવાજ જોઈએ તો “ખાસ વાચક-અવાજ” વધારાની સેવા પસંદ કરો.",
                "हमारी आवाज़ें और संगीत एक संग्रह से आते हैं, और हर ऑर्डर में हम उन्हें बदलते रहते हैं ताकि आपकी रचना आपकी अपनी लगे। फिर भी संग्रह की आवाज़ें और संगीत केवल आपके लिए नहीं हैं। केवल आपके लिए आवाज़ चाहिए तो “विशेष वाचक-आवाज़” अतिरिक्त सेवा चुनें।",
              ),
            },
          ],
        },
        {
          id: "styles",
          q: t("Which picture styles can I choose?", "કયી ચિત્ર-શૈલીઓ પસંદ કરી શકું?", "कौन-सी चित्र-शैलियाँ चुन सकता/सकती हूँ?"),
          a: [
            {
              p: all((l) =>
                ({
                  en: `${list(c.styles, "en")}, each with examples, and colour treatments such as ${list(c.colours, "en", "; ").toLowerCase()}. Not sure? Choose “suggest for me”.`,
                  gu: `${list(c.styles, "gu")}, દરેક ઉદાહરણો સાથે, અને રંગની રીતો જેમ કે ${list(c.colours, "gu", "; ")}. નક્કી ન હોય? “મારા માટે સૂચવો” પસંદ કરો.`,
                  hi: `${list(c.styles, "hi")}, हर एक उदाहरणों के साथ, और रंग के ढंग जैसे ${list(c.colours, "hi", "; ")}। तय न हो? “मेरे लिए सुझाएँ” चुनें।`,
                })[l],
              ),
            },
          ],
        },
        {
          id: "photos",
          q: t("Can I send my own photos as reference?", "શું હું સંદર્ભ માટે મારા ફોટા મોકલી શકું?", "क्या मैं संदर्भ के लिए अपनी तस्वीरें भेज सकता/सकती हूँ?"),
          a: [
            {
              p: t(
                "Yes: your own photos or drawings only, for example your village or your grandmother's photo for the general look. Not film stills or other artists' work. We don't recreate a real person's exact face.",
                "હા: ફક્ત તમારા પોતાના ફોટા કે ચિત્રો, જેમ કે સામાન્ય દેખાવ માટે તમારું ગામ કે તમારાં દાદીનો ફોટો. ફિલ્મનાં દૃશ્યો કે બીજા કલાકારોનું કામ નહીં. કોઈ સાચી વ્યક્તિનો હૂબહૂ ચહેરો અમે ફરી બનાવતા નથી.",
                "हाँ: केवल आपकी अपनी तस्वीरें या चित्र, जैसे सामान्य रूप के लिए आपका गाँव या आपकी दादी की तस्वीर। फ़िल्म के दृश्य या दूसरे कलाकारों का काम नहीं। किसी असली व्यक्ति का हूबहू चेहरा हम नहीं बनाते।",
              ),
            },
          ],
        },
        {
          id: "deities",
          q: t("Can you show gods and goddesses?", "શું તમે દેવી-દેવતાઓ બતાવી શકો?", "क्या आप देवी-देवताओं को दिखा सकते हैं?"),
          a: [
            {
              p: t(
                "Yes, respectfully. You decide whether a deity's face is shown or only symbols (feet, hands, light, objects).",
                "હા, આદરપૂર્વક. દેવતાનો ચહેરો બતાવવો કે ફક્ત પ્રતીકો (ચરણ, હાથ, પ્રકાશ, વસ્તુઓ), તે તમે નક્કી કરો છો.",
                "हाँ, आदर के साथ। देवता का चेहरा दिखाना है या केवल प्रतीक (चरण, हाथ, प्रकाश, वस्तुएँ), यह आप तय करते हैं।",
              ),
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------------ rights
    {
      id: "rights",
      title: t("Your rights and credits", "તમારા હક અને શ્રેય", "आपके अधिकार और श्रेय"),
      items: [
        {
          id: "own",
          q: t("Who owns the finished work?", "તૈયાર રચના કોની?", "तैयार रचना किसकी?"),
          a: [
            {
              p: t(
                "You keep all rights to your story. You receive the finished files to publish and use as described below. We never sell, license or alter your work.",
                "તમારી વાર્તાના બધા હક તમારા જ રહે છે. નીચે જણાવ્યા પ્રમાણે પ્રકાશિત કરવા અને વાપરવા તમને તૈયાર ફાઇલો મળે છે. અમે તમારું કામ ક્યારેય વેચતા, લાઇસન્સ આપતા કે બદલતા નથી.",
                "आपकी कहानी के सारे अधिकार आपके ही रहते हैं। नीचे बताए अनुसार प्रकाशित करने और उपयोग के लिए आपको तैयार फ़ाइलें मिलती हैं। हम आपका काम कभी बेचते, लाइसेंस देते या बदलते नहीं।",
              ),
            },
          ],
        },
        {
          id: "where",
          q: t("Where may I publish it?", "હું તેને ક્યાં પ્રકાશિત કરી શકું?", "मैं इसे कहाँ प्रकाशित कर सकता/सकती हूँ?"),
          a: [
            {
              p: t(
                "Online and offline: YouTube (including monetised channels), Spotify, Instagram, Facebook, WhatsApp, your website, family and community events. Not included: film festivals, TV broadcast, cinema or games. For those, we need to replace the music first: ask for the music replacement add-on.",
                "ઑનલાઇન અને ઑફલાઇન: YouTube (કમાણીવાળી ચેનલો સહિત), Spotify, Instagram, Facebook, WhatsApp, તમારી વેબસાઇટ, પરિવાર અને સમાજના કાર્યક્રમો. સામેલ નથી: ફિલ્મ ઉત્સવો, ટીવી પ્રસારણ, સિનેમા કે ગેમ્સ. તે માટે પહેલાં સંગીત બદલવું પડે: સંગીત-બદલાવની વધારાની સેવા માટે પૂછો.",
                "ऑनलाइन और ऑफ़लाइन: YouTube (कमाई वाले चैनलों सहित), Spotify, Instagram, Facebook, WhatsApp, आपकी वेबसाइट, परिवार और समुदाय के कार्यक्रम। शामिल नहीं: फ़िल्म उत्सव, टीवी प्रसारण, सिनेमा या गेम्स। उनके लिए पहले संगीत बदलना होगा: संगीत-बदलाव की अतिरिक्त सेवा के लिए पूछें।",
              ),
            },
          ],
        },
        {
          id: "claims",
          q: t("Will I get copyright claims on YouTube?", "શું મને YouTube પર કૉપિરાઇટ દાવા આવશે?", "क्या मुझे YouTube पर कॉपीराइट दावे आएँगे?"),
          a: [
            {
              p: t(
                "Our music and sounds are licensed for publishing on your own channels. If you ever receive a claim on music we supplied, write to us and we'll help resolve it.",
                "અમારું સંગીત અને ધ્વનિ તમારી પોતાની ચેનલો પર પ્રકાશિત કરવા લાઇસન્સવાળાં છે. અમે આપેલા સંગીત પર ક્યારેય દાવો આવે તો અમને લખો, અમે ઉકેલવામાં મદદ કરીશું.",
                "हमारा संगीत और ध्वनियाँ आपके अपने चैनलों पर प्रकाशित करने के लिए लाइसेंस वाली हैं। हमारे दिए संगीत पर कभी दावा आए तो हमें लिखें, हम सुलझाने में मदद करेंगे।",
              ),
            },
          ],
        },
        {
          id: "translated",
          q: t("Can I order a story I translated or adapted?", "શું મેં અનુવાદિત કે રૂપાંતરિત કરેલી વાર્તા ઓર્ડર કરી શકું?", "क्या मैं अपनी अनूदित या रूपांतरित कहानी ऑर्डर कर सकता/सकती हूँ?"),
          a: [
            {
              p: t(
                "Yes, if you have permission from the rights holder, or if the original is in the public domain (in India, generally when the author died more than 60 years ago). You tell us where the story comes from, and the credits name the original author and you.",
                "હા, જો હકધારકની પરવાનગી હોય, કે મૂળ કૃતિ પબ્લિક ડોમેનમાં હોય (ભારતમાં સામાન્ય રીતે લેખકના અવસાનને 60 વર્ષથી વધુ થયાં હોય). વાર્તા ક્યાંથી આવી તે તમે જણાવો, અને શ્રેયમાં મૂળ લેખક અને તમારું નામ આવે છે.",
                "हाँ, यदि अधिकारधारक की अनुमति हो, या मूल कृति पब्लिक डोमेन में हो (भारत में सामान्यतः लेखक की मृत्यु को 60 वर्ष से अधिक हुए हों)। कहानी कहाँ से आई यह आप बताएँ, और श्रेय में मूल लेखक और आपका नाम आता है।",
              ),
            },
          ],
        },
        {
          id: "credits",
          q: t("How are credits shown?", "શ્રેય કેવી રીતે દેખાય છે?", "श्रेय कैसे दिखाया जाता है?"),
          a: [
            {
              p: t(
                "Credits are generated from what you declare (author, translator, original work) and locked, so they're always correct. Every video carries a short note that voices and illustrations are AI-assisted.",
                "તમે જે જાહેર કરો (લેખક, અનુવાદક, મૂળ કૃતિ) તેના પરથી શ્રેય બને છે અને લૉક થાય છે, જેથી હંમેશાં સાચું રહે. દરેક વીડિયોમાં ટૂંકી નોંધ હોય છે કે અવાજો અને ચિત્રો AI-સહાયિત છે.",
                "आप जो घोषित करें (लेखक, अनुवादक, मूल कृति) उससे श्रेय बनता है और लॉक होता है, ताकि हमेशा सही रहे। हर वीडियो में छोटी टिप्पणी होती है कि आवाज़ें और चित्र AI-सहायता से बने हैं।",
              ),
            },
          ],
        },
        {
          id: "ai",
          q: t("Is it really AI?", "શું આ ખરેખર AI છે?", "क्या यह सच में AI है?"),
          a: [
            {
              p: t(
                "Yes. The voices and pictures are created with AI tools; our team directs, checks and finishes them. We say so openly in the credits, as the platforms expect.",
                "હા. અવાજો અને ચિત્રો AI સાધનોથી બને છે; અમારી ટીમ તેનું દિગ્દર્શન કરે છે, ચકાસે છે અને પૂરું કરે છે. પ્લેટફૉર્મની અપેક્ષા પ્રમાણે અમે શ્રેયમાં ખુલ્લેઆમ જણાવીએ છીએ.",
                "हाँ। आवाज़ें और चित्र AI टूल से बनते हैं; हमारी टीम उनका निर्देशन करती है, जाँचती है और पूरा करती है। प्लेटफ़ॉर्म की अपेक्षा के अनुसार हम श्रेय में खुलकर बताते हैं।",
              ),
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------------ privacy
    {
      id: "privacy",
      title: t("Privacy and deletion", "ગોપનીયતા અને ડિલીટ", "गोपनीयता और मिटाना"),
      items: [
        {
          id: "after",
          q: t("What happens to my story after the work is done?", "કામ પૂરું થયા પછી મારી વાર્તાનું શું થાય?", "काम पूरा होने के बाद मेरी कहानी का क्या होता है?"),
          a: [
            {
              p: all((l) =>
                ({
                  en: `We delete your story and all files from our storage ${c.deleteDays} days after delivery, including your brief, drafts, scripts, previews and pictures.${f.deletion_certificates ? " We then send you a deletion certificate." : ""} Download and keep your files safely before then.`,
                  gu: `ડિલિવરીના ${c.deleteDays} દિવસ પછી અમે તમારી વાર્તા અને બધી ફાઇલો અમારા સંગ્રહમાંથી ડિલીટ કરીએ છીએ, તમારી માહિતી, ડ્રાફ્ટ, સ્ક્રિપ્ટ, પૂર્વાવલોકન અને ચિત્રો સહિત.${f.deletion_certificates ? " પછી અમે તમને ડિલીટનું પ્રમાણપત્ર મોકલીએ છીએ." : ""} તે પહેલાં તમારી ફાઇલો ડાઉનલોડ કરીને સાચવી લો.`,
                  hi: `डिलीवरी के ${c.deleteDays} दिन बाद हम आपकी कहानी और सभी फ़ाइलें अपने संग्रह से मिटा देते हैं, आपकी जानकारी, ड्राफ़्ट, स्क्रिप्ट, पूर्वावलोकन और चित्रों सहित।${f.deletion_certificates ? " फिर हम आपको मिटाने का प्रमाणपत्र भेजते हैं।" : ""} उससे पहले अपनी फ़ाइलें डाउनलोड करके सँभाल लें।`,
                })[l],
              ),
            },
          ],
        },
        {
          id: "providers",
          q: t("Do the AI services keep my story?", "શું AI સેવાઓ મારી વાર્તા રાખે છે?", "क्या AI सेवाएँ मेरी कहानी रखती हैं?"),
          a: [
            {
              p: t(
                "Your story is processed by Anthropic (Claude) and ElevenLabs to make your order. Anthropic deletes what we send within 30 days (content its safety systems flag may be kept up to 2 years) and may not train its models on our content. ElevenLabs keeps the text and audio in our account until we delete it: we delete your order's history when your order closes, and we keep its data-use setting off.",
                "તમારો ઓર્ડર બનાવવા તમારી વાર્તા Anthropic (Claude) અને ElevenLabs પ્રોસેસ કરે છે. Anthropic અમે મોકલેલું 30 દિવસમાં ડિલીટ કરે છે (તેની સુરક્ષા-વ્યવસ્થા જેને ચિહ્નિત કરે તે 2 વર્ષ સુધી રહી શકે) અને અમારી સામગ્રી પર તેના મૉડલ તાલીમ ન આપી શકે. ElevenLabs લખાણ અને ઓડિયો અમે ડિલીટ ન કરીએ ત્યાં સુધી અમારા એકાઉન્ટમાં રાખે છે: ઓર્ડર બંધ થાય ત્યારે અમે તમારા ઓર્ડરનો ઇતિહાસ ડિલીટ કરીએ છીએ, અને તેનું ડેટા-ઉપયોગ સેટિંગ બંધ રાખીએ છીએ.",
                "आपका ऑर्डर बनाने के लिए आपकी कहानी Anthropic (Claude) और ElevenLabs प्रोसेस करते हैं। Anthropic हमारा भेजा 30 दिनों में मिटा देता है (उसकी सुरक्षा-व्यवस्था जिसे चिह्नित करे वह 2 वर्ष तक रह सकता है) और हमारी सामग्री पर अपने मॉडल को प्रशिक्षित नहीं कर सकता। ElevenLabs लेख और ऑडियो हमारे मिटाने तक हमारे खाते में रखता है: ऑर्डर बंद होने पर हम आपके ऑर्डर का इतिहास मिटाते हैं, और उसकी डेटा-उपयोग सेटिंग बंद रखते हैं।",
              ),
              link: { href: "/creators/privacy", label: t("Full details in our privacy policy", "પૂરી વિગત અમારી ગોપનીયતા નીતિમાં", "पूरी जानकारी हमारी गोपनीयता नीति में") },
            },
          ],
        },
        {
          id: "kept",
          q: t("What do you keep after deletion?", "ડિલીટ પછી તમે શું રાખો છો?", "मिटाने के बाद आप क्या रखते हैं?"),
          a: [
            {
              p: t(
                "Only what we must: your account details, order history, invoices and payment records (tax law requires us to keep these for several years). No creative content.",
                "ફક્ત જરૂરી: તમારા એકાઉન્ટની વિગત, ઓર્ડરનો ઇતિહાસ, ઇન્વૉઇસ અને ચુકવણીના રેકૉર્ડ (કર-કાયદા પ્રમાણે થોડાં વર્ષ રાખવા પડે). કોઈ સર્જનાત્મક સામગ્રી નહીં.",
                "केवल ज़रूरी: आपके खाते की जानकारी, ऑर्डर का इतिहास, इनवॉइस और भुगतान के रिकॉर्ड (कर-कानून के अनुसार कुछ वर्ष रखने होते हैं)। कोई रचनात्मक सामग्री नहीं।",
              ),
            },
          ],
        },
        {
          id: "reuse",
          q: t("Do you reuse anything from my order?", "શું તમે મારા ઓર્ડરમાંથી કંઈ ફરી વાપરો છો?", "क्या आप मेरे ऑर्डर से कुछ दोबारा उपयोग करते हैं?"),
          a: [
            {
              p: t(
                "Only general sounds or music we created (such as rain or temple bells), which may be reused in other works. Your story, narration, pictures and anything made only for you are never reused.",
                "ફક્ત અમે બનાવેલા સામાન્ય ધ્વનિ કે સંગીત (જેમ કે વરસાદ કે મંદિરના ઘંટ), જે બીજી રચનાઓમાં વપરાઈ શકે. તમારી વાર્તા, વાચન, ચિત્રો અને ફક્ત તમારા માટે બનેલું કંઈ પણ ક્યારેય ફરી વપરાતું નથી.",
                "केवल हमारी बनाई सामान्य ध्वनियाँ या संगीत (जैसे बारिश या मंदिर की घंटियाँ), जो दूसरी रचनाओं में उपयोग हो सकते हैं। आपकी कहानी, वाचन, चित्र और केवल आपके लिए बना कुछ भी कभी दोबारा उपयोग नहीं होता।",
              ),
            },
          ],
        },
        ...(f.series_storage
          ? [
              {
                id: "series",
                q: t("My story is a series. Do you delete each episode?", "મારી વાર્તા શ્રેણી છે. શું તમે દરેક હપ્તો ડિલીટ કરો છો?", "मेरी कहानी श्रृंखला है। क्या आप हर कड़ी मिटाते हैं?"),
                a: [
                  {
                    p: t(
                      "For continuing stories you can choose Series Storage (paid), so we keep your characters and style consistent across episodes. Your files are kept until the date shown, with reminders before deletion.",
                      "ચાલુ વાર્તાઓ માટે તમે Series Storage (પેઇડ) પસંદ કરી શકો, જેથી હપ્તાઓમાં તમારાં પાત્રો અને શૈલી એકસરખાં રહે. બતાવેલી તારીખ સુધી ફાઇલો રહે છે, ડિલીટ પહેલાં યાદ અપાવાય છે.",
                      "चलती कहानियों के लिए आप Series Storage (सशुल्क) चुन सकते हैं, ताकि कड़ियों में आपके पात्र और शैली एक जैसे रहें। दिखाई तारीख तक फ़ाइलें रहती हैं, मिटाने से पहले याद दिलाया जाता है।",
                    ),
                  },
                ],
              },
            ]
          : []),
        {
          id: "team",
          q: t("Who on your team sees my story?", "તમારી ટીમમાં મારી વાર્તા કોણ જુએ છે?", "आपकी टीम में मेरी कहानी कौन देखता है?"),
          a: [
            {
              p: t(
                "Only the people working on your order. Everyone on our team signs a confidentiality agreement, and every time someone opens your story it is logged. With Varta Vishva Directors, your director works on an encrypted computer, in a folder for your order only, deleted with everything else.",
                "ફક્ત તમારા ઓર્ડર પર કામ કરતા લોકો. અમારી ટીમમાં દરેક ગુપ્તતા-કરાર પર સહી કરે છે, અને કોઈ તમારી વાર્તા ખોલે ત્યારે દર વખતે તેની નોંધ થાય છે. વાર્તા વિશ્વ દિગ્દર્શકો સાથે, તમારા દિગ્દર્શક એન્ક્રિપ્ટેડ કમ્પ્યુટર પર, ફક્ત તમારા ઓર્ડરના ફોલ્ડરમાં કામ કરે છે, જે બાકી બધા સાથે ડિલીટ થાય છે.",
                "केवल आपके ऑर्डर पर काम करने वाले लोग। हमारी टीम में हर कोई गोपनीयता-अनुबंध पर हस्ताक्षर करता है, और कोई आपकी कहानी खोले तो हर बार उसका रिकॉर्ड होता है। वार्ता विश्व के निर्देशकों के साथ, आपके निर्देशक एन्क्रिप्टेड कंप्यूटर पर, केवल आपके ऑर्डर के फ़ोल्डर में काम करते हैं, जो बाकी सब के साथ मिटाया जाता है।",
              ),
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------------ publishing with us
    {
      id: "publishing",
      title: t("Publishing with us", "અમારી સાથે પ્રકાશન", "हमारे साथ प्रकाशन"),
      items: [
        {
          id: "our-channel",
          q: t("Will you publish my story on your channel?", "શું તમે મારી વાર્તા તમારી ચેનલ પર પ્રકાશિત કરશો?", "क्या आप मेरी कहानी अपने चैनल पर प्रकाशित करेंगे?"),
          a: [
            { p: t("Only if you say so. Each order has one choice:", "તમે કહો તો જ. દરેક ઓર્ડરમાં એક પસંદગી હોય છે:", "आप कहें तभी। हर ऑर्डर में एक विकल्प होता है:") },
            {
              ul: [
                t("(A) Download only: we publish nothing.", "(A) ફક્ત ડાઉનલોડ: અમે કંઈ પ્રકાશિત કરતા નથી.", "(A) केवल डाउनलोड: हम कुछ प्रकाशित नहीं करते।"),
                t(
                  "(B) Download and allow us to publish: on Story Tube, jambuch.in and Spotify, credited to you.",
                  "(B) ડાઉનલોડ અને અમને પ્રકાશનની છૂટ: Story Tube, jambuch.in અને Spotify પર, તમારા નામના શ્રેય સાથે.",
                  "(B) डाउनलोड और हमें प्रकाशन की अनुमति: Story Tube, jambuch.in और Spotify पर, आपके नाम के श्रेय के साथ।",
                ),
              ],
            },
          ],
        },
        {
          id: "earn",
          q: t("Do you earn money from my published work?", "શું તમે મારી પ્રકાશિત રચનામાંથી કમાઓ છો?", "क्या आप मेरी प्रकाशित रचना से कमाते हैं?"),
          a: [
            {
              p: t(
                "No. If you choose (B), we switch off monetisation on your video. You can withdraw permission at any time, and we take it down within 7 days.",
                "ના. તમે (B) પસંદ કરો તો તમારા વીડિયો પર કમાણી બંધ રાખીએ છીએ. તમે ક્યારેય પણ પરવાનગી પાછી ખેંચી શકો, અને અમે 7 દિવસમાં તે હટાવી દઈએ છીએ.",
                "नहीं। आप (B) चुनें तो आपके वीडियो पर कमाई बंद रखते हैं। आप कभी भी अनुमति वापस ले सकते हैं, और हम 7 दिनों में उसे हटा देते हैं।",
              ),
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------------ corrections and refunds
    {
      id: "refunds",
      title: t("Corrections and refunds", "સુધારા અને રિફંડ", "सुधार और रिफ़ंड"),
      items: [
        {
          id: "wrong",
          q: t("What if something is wrong in the result?", "પરિણામમાં કંઈ ખોટું હોય તો?", "परिणाम में कुछ गलत हो तो?"),
          a: [
            {
              p: t(
                "Flag it on the preview: mark the moment and say what's wrong. We check it against your approved plan and script:",
                "પૂર્વાવલોકન પર ચિહ્નિત કરો: ક્ષણ પસંદ કરો અને શું ખોટું છે તે કહો. અમે તેને તમારી મંજૂર યોજના અને સ્ક્રિપ્ટ સાથે ચકાસીએ છીએ:",
                "पूर्वावलोकन पर चिह्नित करें: पल चुनें और बताएँ क्या गलत है। हम उसे आपकी स्वीकृत योजना और स्क्रिप्ट से जाँचते हैं:",
              ),
            },
            {
              ul: [
                t(
                  "Our mistake (a wrong word, a mispronounced name you listed, a picture that contradicts the plan): fixed free.",
                  "અમારી ભૂલ (ખોટો શબ્દ, તમે યાદીમાં આપેલા નામનો ખોટો ઉચ્ચાર, યોજનાથી વિરુદ્ધ ચિત્ર): મફત સુધારાય છે.",
                  "हमारी गलती (गलत शब्द, आपकी सूची के नाम का गलत उच्चारण, योजना से उलटा चित्र): मुफ़्त सुधारी जाती है।",
                ),
                all((l) =>
                  ({
                    en: `A new wish that wasn't in the plan is a content change: up to ${c.freeChangePercent}% of the piece is included once; larger changes are quoted; a change to more than ${c.newOrderPercent}% of the story is a new order.`,
                    gu: `યોજનામાં ન હોય એવી નવી ઇચ્છા સામગ્રીમાં ફેરફાર છે: રચનાના ${c.freeChangePercent}% સુધી એક વખત સામેલ છે; મોટા ફેરફારનો ભાવ અપાય છે; વાર્તાના ${c.newOrderPercent}%થી વધુ ફેરફાર નવો ઓર્ડર છે.`,
                    hi: `योजना में न हो ऐसी नई इच्छा सामग्री में बदलाव है: रचना के ${c.freeChangePercent}% तक एक बार शामिल है; बड़े बदलाव की कीमत दी जाती है; कहानी के ${c.newOrderPercent}% से अधिक बदलाव नया ऑर्डर है।`,
                  })[l],
                ),
              ],
            },
          ],
        },
        {
          id: "refund",
          q: t("Can I get a refund?", "શું મને રિફંડ મળી શકે?", "क्या मुझे रिफ़ंड मिल सकता है?"),
          a: [
            {
              ul: [
                t(
                  "If we can't make your story at all (for example, it can't pass our content guidelines), nothing is charged: payment starts only after you approve the plan.",
                  "જો અમે તમારી વાર્તા બનાવી જ ન શકીએ (જેમ કે અમારી સામગ્રી-માર્ગદર્શિકા પાર ન કરે), તો કોઈ ચાર્જ નથી: ચુકવણી યોજના મંજૂર કર્યા પછી જ શરૂ થાય છે.",
                  "अगर हम आपकी कहानी बना ही न सकें (जैसे हमारी सामग्री-दिशानिर्देश पार न करे), तो कोई शुल्क नहीं: भुगतान योजना स्वीकार करने के बाद ही शुरू होता है।",
                ),
                t(
                  "The sample fee is not refunded if you decide to stop after the sample: it paid for the sample.",
                  "નમૂના પછી તમે અટકવાનું નક્કી કરો તો નમૂનાની ફી પાછી મળતી નથી: તે નમૂના માટે હતી.",
                  "नमूने के बाद आप रुकने का तय करें तो नमूना शुल्क वापस नहीं मिलता: वह नमूने के लिए था।",
                ),
                all((l) =>
                  ({
                    en: `If your sample isn't delivered within ${c.sampleRefundDays} days of paying for it, the sample fee is refunded in full, automatically.`,
                    gu: `ચૂકવણીના ${c.sampleRefundDays} દિવસમાં તમારો નમૂનો ન મળે તો નમૂનાની પૂરી ફી આપમેળે પાછી મળે છે.`,
                    hi: `भुगतान के ${c.sampleRefundDays} दिनों में आपका नमूना न मिले तो पूरा नमूना शुल्क अपने आप वापस मिलता है।`,
                  })[l],
                ),
                t(
                  "If your sample doesn't follow your approved plan, we make it again once, free. A new wish that isn't in the plan is a change, not a mistake.",
                  "તમારો નમૂનો મંજૂર યોજના પ્રમાણે ન હોય તો અમે તેને એક વખત મફત ફરી બનાવીએ છીએ. યોજનામાં ન હોય એવી નવી ઇચ્છા ફેરફાર છે, ભૂલ નહીં.",
                  "आपका नमूना स्वीकृत योजना के अनुसार न हो तो हम उसे एक बार मुफ़्त दोबारा बनाते हैं। योजना में न हो ऐसी नई इच्छा बदलाव है, गलती नहीं।",
                ),
                t(
                  "If you are charged twice for the same thing, the extra payment is refunded automatically.",
                  "એક જ વસ્તુ માટે બે વાર ચાર્જ થાય તો વધારાની ચુકવણી આપમેળે પાછી મળે છે.",
                  "एक ही चीज़ के लिए दो बार शुल्क लगे तो अतिरिक्त भुगतान अपने आप वापस मिलता है।",
                ),
                ...(c.directedOpen
                  ? [
                      t(
                        "With Varta Vishva Directors: if your director hasn't started your order by the start date we promised, everything you paid for it is refunded in full.",
                        "વાર્તા વિશ્વ દિગ્દર્શકો સાથે: અમે આપેલી શરૂઆતની તારીખ સુધી તમારા દિગ્દર્શકે ઓર્ડર શરૂ ન કર્યો હોય તો તેના માટે ચૂકવેલું બધું પૂરું પાછું મળે છે.",
                        "वार्ता विश्व के निर्देशकों के साथ: हमारी दी शुरुआत की तारीख तक आपके निर्देशक ने ऑर्डर शुरू न किया हो तो उसके लिए दिया सब कुछ पूरा वापस मिलता है।",
                      ),
                    ]
                  : []),
                t(
                  "The advance is not refundable once production has started, unless we cannot deliver; then it is refunded in full.",
                  "કામ શરૂ થયા પછી એડવાન્સ પાછું મળતું નથી, સિવાય કે અમે ડિલિવર ન કરી શકીએ; ત્યારે પૂરું પાછું મળે છે.",
                  "काम शुरू होने के बाद अग्रिम वापस नहीं मिलता, सिवाय इसके कि हम डिलीवर न कर सकें; तब पूरा वापस मिलता है।",
                ),
                t(
                  "After you download the final files, the order is complete and can't be refunded.",
                  "અંતિમ ફાઇલો ડાઉનલોડ કર્યા પછી ઓર્ડર પૂરો થાય છે અને રિફંડ મળતું નથી.",
                  "अंतिम फ़ाइलें डाउनलोड करने के बाद ऑर्डर पूरा होता है और रिफ़ंड नहीं मिलता।",
                ),
                t(
                  "Refunds go back to the card, UPI or bank account you paid with, through Razorpay.",
                  "રિફંડ Razorpay દ્વારા તમે જે કાર્ડ, UPI કે બૅન્ક ખાતાથી ચૂકવ્યું હતું તેમાં પાછું જાય છે.",
                  "रिफ़ंड Razorpay से उसी कार्ड, UPI या बैंक खाते में वापस जाता है जिससे आपने भुगतान किया था।",
                ),
              ],
            },
            { p: t("", "", ""), link: { href: "/creators/terms#refund", label: t("The full refund policy", "પૂરી રિફંડ નીતિ", "पूरी रिफ़ंड नीति") } },
          ],
        },
      ],
    },

    // ------------------------------------------------------------ content guidelines
    {
      id: "guidelines",
      title: t("Content guidelines", "સામગ્રીની માર્ગદર્શિકા", "सामग्री के दिशानिर्देश"),
      items: [
        {
          id: "wont",
          q: t("Is there anything you won't make?", "શું એવું કંઈ છે જે તમે નહીં બનાવો?", "क्या ऐसा कुछ है जो आप नहीं बनाएँगे?"),
          a: [
            {
              p: t(
                "We don't make content that is hateful, sexual, promotes violence or harm, mocks a community or faith, defames a real person, or copies someone else's copyrighted work (including film song lyrics).",
                "અમે દ્વેષપૂર્ણ, જાતીય, હિંસા કે નુકસાનને ઉત્તેજન આપતી, કોઈ સમાજ કે શ્રદ્ધાની મજાક ઉડાવતી, કોઈ સાચી વ્યક્તિની બદનામી કરતી, કે બીજાના કૉપિરાઇટવાળા કામ (ફિલ્મી ગીતોના શબ્દો સહિત)ની નકલ કરતી સામગ્રી બનાવતા નથી.",
                "हम घृणा भरी, यौन, हिंसा या नुकसान को बढ़ावा देने वाली, किसी समुदाय या आस्था का मज़ाक उड़ाने वाली, किसी असली व्यक्ति की बदनामी करने वाली, या किसी और के कॉपीराइट वाले काम (फ़िल्मी गीतों के बोल सहित) की नकल करने वाली सामग्री नहीं बनाते।",
              ),
              link: { href: "/creators#guidelines", label: t("The full list", "પૂરી યાદી", "पूरी सूची") },
            },
          ],
        },
        {
          id: "not-allowed",
          q: t("What if part of my story isn't allowed?", "મારી વાર્તાનો કોઈ ભાગ માન્ય ન હોય તો?", "मेरी कहानी का कोई हिस्सा मान्य न हो तो?"),
          a: [
            {
              p: all((l) =>
                ({
                  en: `We tell you plainly what the problem is and suggest a change, for example replacing quoted song lyrics with your own lines. You edit and we check again, free (up to ${c.rechecks} times).`,
                  gu: `સમસ્યા શું છે તે અમે સ્પષ્ટ કહીએ છીએ અને ફેરફાર સૂચવીએ છીએ, જેમ કે ટાંકેલા ગીતના શબ્દોને બદલે તમારી પોતાની પંક્તિઓ. તમે સુધારો અને અમે ફરી ચકાસીએ છીએ, મફત (${c.rechecks} વખત સુધી).`,
                  hi: `समस्या क्या है यह हम साफ़ बताते हैं और बदलाव सुझाते हैं, जैसे उद्धृत गीत के बोलों की जगह आपकी अपनी पंक्तियाँ। आप सुधारें और हम फिर जाँचते हैं, मुफ़्त (${c.rechecks} बार तक)।`,
                })[l],
              ),
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------------ files
    {
      id: "files",
      title: t("Files and delivery", "ફાઇલો અને ડિલિવરી", "फ़ाइलें और डिलीवरी"),
      items: [
        {
          id: "what-files",
          q: t("What files do I get?", "મને કઈ ફાઇલો મળે?", "मुझे कौन-सी फ़ाइलें मिलती हैं?"),
          a: [
            {
              p: t(
                "Video: MP4 (1920×1080; Shorts 1080×1920). Audio: MP3 (WAV on request). Also captions (SRT), a thumbnail, a credits file, and for YouTube a ready title, description and tags if you chose that extra.",
                "વીડિયો: MP4 (1920×1080; Shorts 1080×1920). ઓડિયો: MP3 (માંગો તો WAV). ઉપરાંત કૅપ્શન (SRT), થંબનેલ, શ્રેયની ફાઇલ, અને તે વધારાનું પસંદ કર્યું હોય તો YouTube માટે તૈયાર શીર્ષક, વર્ણન અને ટૅગ.",
                "वीडियो: MP4 (1920×1080; Shorts 1080×1920)। ऑडियो: MP3 (माँगने पर WAV)। साथ में कैप्शन (SRT), थंबनेल, श्रेय की फ़ाइल, और वह अतिरिक्त चुना हो तो YouTube के लिए तैयार शीर्षक, विवरण और टैग।",
              ),
            },
          ],
        },
        {
          id: "how-long-download",
          q: t("For how long can I download?", "હું કેટલા સમય સુધી ડાઉનલોડ કરી શકું?", "मैं कितने समय तक डाउनलोड कर सकता/सकती हूँ?"),
          a: [
            {
              p: all((l) =>
                ({
                  en: `Until your files are deleted, ${c.deleteDays} days after delivery. Your order page shows the exact date.`,
                  gu: `તમારી ફાઇલો ડિલીટ થાય ત્યાં સુધી, ડિલિવરીના ${c.deleteDays} દિવસ પછી. તમારું ઓર્ડર પેજ ચોક્કસ તારીખ બતાવે છે.`,
                  hi: `आपकी फ़ाइलें मिटने तक, डिलीवरी के ${c.deleteDays} दिन बाद। आपका ऑर्डर पेज सही तारीख दिखाता है।`,
                })[l],
              ),
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------------ contact
    {
      id: "contact",
      title: t("Still have a question?", "હજી પ્રશ્ન છે?", "अब भी कोई प्रश्न है?"),
      items: [
        {
          id: "write",
          q: t("How do I reach you?", "તમારો સંપર્ક કેવી રીતે કરું?", "आपसे संपर्क कैसे करूँ?"),
          a: [
            {
              p: all((l) => {
                const saathi = f.studio_saathi;
                const mail = c.contact;
                return {
                  en: `${saathi ? "Ask Studio Saathi, our assistant on the page, or w" : "W"}rite to us${mail ? ` at ${mail}` : " through the contact address on our home page"}. We reply within ${c.replyDays} working days.`,
                  gu: `${saathi ? "પેજ પરના અમારા સહાયક સ્ટુડિયો સાથીને પૂછો, અથવા " : ""}અમને લખો${mail ? ` (${mail})` : " (અમારા હોમ પેજ પરના સંપર્ક સરનામે)"}. અમે ${c.replyDays} કામકાજી દિવસમાં જવાબ આપીએ છીએ.`,
                  hi: `${saathi ? "पेज पर हमारे सहायक स्टूडियो साथी से पूछें, या " : ""}हमें लिखें${mail ? ` (${mail})` : " (हमारे होम पेज पर दिए संपर्क पते पर)"}। हम ${c.replyDays} कार्य-दिवसों में उत्तर देते हैं।`,
                }[l];
              }),
            },
          ],
        },
      ],
    },
  ];
  return sections;
}
