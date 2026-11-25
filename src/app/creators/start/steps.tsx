"use client";

import { startTransition, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  consentAndScreen,
  pendingFix,
  recheckStory,
  episodeOpenings,
  levelPrices,
  makePlanAction,
  moveEpisode,
  nextFollowUps,
  priceRangeAction,
  proposeEpisodes,
  removePicture,
  saveCharacters,
  savePronunciation,
  setStoryLanguage,
  submitStory,
  suggestLooksAction,
  transcribe,
  discussPlan,
  approvePlan,
  type ClientDraft,

} from "./flow-actions";
import { uploadPicture } from "./flow-actions";
import ConsentTicks, { allTicked, type Ticks } from "./consent-ticks";
import PayButton from "./pay-button";
import { SpamCheckBox, sendLabel, useSpamCheck } from "../../spam-check";
import { COLOUR_LABELS, LEVEL_PRESETS, STYLE_LABELS, UI, VOICE_TYPES, isCustom, narrationMinutes, t, type Answers, type L, type Lang } from "@/lib/creators/questions";
import type { Character } from "@/lib/creators/files";
import h from "../../home.module.css";
import c from "../creators.module.css";

// Words on the special screens (Gujarati and Hindi: drafts for Jaydeep to check).
const W: Record<string, L> = {
  paste: { en: "Paste your story here", gu: "તમારી વાર્તા અહીં પેસ્ટ કરો", hi: "अपनी कहानी यहाँ पेस्ट करें" },
  orUpload: { en: "Or upload a Word (.docx), text (.txt) or PDF file", gu: "અથવા Word (.docx), ટેક્સ્ટ (.txt) કે PDF ફાઇલ અપલોડ કરો", hi: "या Word (.docx), टेक्स्ट (.txt) या PDF फ़ाइल अपलोड करें" },
  pdfNote: { en: "Please copy from Word or Google Docs rather than a PDF when you can: Gujarati and Hindi often come out broken from PDFs.", gu: "શક્ય હોય તો PDF નહીં, Word કે Google Docsમાંથી કૉપી કરો: PDFમાંથી ગુજરાતી-હિન્દી ઘણી વાર તૂટી જાય છે.", hi: "हो सके तो PDF नहीं, Word या Google Docs से कॉपी करें: PDF से गुजराती-हिन्दी अक्सर टूट जाती है।" },
  chars: { en: "{n} characters", gu: "{n} અક્ષરો", hi: "{n} अक्षर" },
  episodesNote: { en: "Over 20,000 characters: we’ll make this as a series of episodes. You’ll see the proposed breaks later.", gu: "20,000 અક્ષરથી વધુ: આને એપિસોડની શ્રેણી તરીકે બનાવીશું. સૂચવેલા ભાગ પછી જોશો.", hi: "20,000 अक्षरों से अधिक: इसे एपिसोड की शृंखला के रूप में बनाएँगे। सुझाए गए भाग बाद में देखेंगे।" },
  saveStory: { en: "Save my story", gu: "મારી વાર્તા સાચવો", hi: "मेरी कहानी सहेजें" },
  saving: { en: "Saving…", gu: "સાચવીએ છીએ…", hi: "सहेज रहे हैं…" },
  detected: { en: "We see your story is in {l}. Is that right?", gu: "તમારી વાર્તા {l}માં છે એવું લાગે છે. બરાબર?", hi: "आपकी कहानी {l} में लगती है। सही है?" },
  yes: { en: "Yes", gu: "હા", hi: "हाँ" },
  replace: { en: "Use a different text", gu: "બીજું લખાણ વાપરો", hi: "दूसरा पाठ इस्तेमाल करें" },
  locked: { en: "Your story has been read and is saved. To use a different story, start a new request.", gu: "તમારી વાર્તા વંચાઈ ગઈ છે અને સચવાયેલી છે. બીજી વાર્તા માટે નવી વિનંતી શરૂ કરો.", hi: "आपकी कहानी पढ़ी जा चुकी है और सहेजी है। दूसरी कहानी के लिए नया अनुरोध शुरू करें।" },
  readStory: { en: "Read my story", gu: "મારી વાર્તા વાંચો", hi: "मेरी कहानी पढ़ें" },
  screenNote: {
    en: "Your story is now checked by an automatic reader against our content guidelines (a few seconds). It is sent to an AI service for this and for the questions that follow; it stays yours.",
    gu: "હવે તમારી વાર્તા અમારા નિયમો સામે એક સ્વચાલિત વાચક ચકાસશે (થોડી સેકન્ડ). આ માટે અને પછીના પ્રશ્નો માટે તે AI સેવાને મોકલાય છે; વાર્તા તમારી જ રહે છે.",
    hi: "अब आपकी कहानी हमारे नियमों के अनुसार एक स्वचालित पाठक जाँचेगा (कुछ सेकंड)। इसके लिए और आगे के सवालों के लिए यह AI सेवा को भेजी जाती है; कहानी आपकी ही रहती है।",
  },
  allThree: { en: "Please tick all three boxes to continue.", gu: "આગળ વધવા માટે ત્રણેય ખાનાં પર ટીક કરો.", hi: "आगे बढ़ने के लिए तीनों बॉक्स पर टिक करें।" },
  levelBasic: { en: "Sharing a story simply: audio or one picture, plain reading", gu: "વાર્તા સાદી રીતે: ઑડિયો કે એક ચિત્ર, સાદું વાચન", hi: "कहानी सरल रूप में: ऑडियो या एक चित्र, सादा वाचन" },
  levelStandard: { en: "YouTube-ready: a painting about every 50 seconds, up to 3 character voices, sound effects", gu: "YouTube માટે તૈયાર: દર ~50 સેકન્ડે ચિત્ર, 3 સુધી પાત્ર-અવાજો, ધ્વનિ અસરો", hi: "YouTube के लिए तैयार: हर ~50 सेकंड एक चित्र, 3 तक पात्र-आवाज़ें, ध्वनि प्रभाव" },
  levelPremium: { en: "A showpiece: more pictures and close-ups, up to 6 voices, 3 Shorts; always with Jaydeep", gu: "ખાસ રચના: વધુ ચિત્રો, 6 સુધી અવાજો, 3 Shorts; હંમેશાં જયદીપ સાથે", hi: "ख़ास रचना: अधिक चित्र, 6 तक आवाज़ें, 3 Shorts; हमेशा जयदीप के साथ" },
  forYourStory: { en: "for your story", gu: "તમારી વાર્તા માટે", hi: "आपकी कहानी के लिए" },
  assistedFull: { en: "Assisted is full this week; the next start date is {d}.", gu: "આ અઠવાડિયે સહાયિત સેવા ભરાઈ ગઈ છે; આગલી શરૂઆત {d}.", hi: "इस सप्ताह सहायता सहित सेवा भरी है; अगली शुरुआत {d}।" },
  lengthIs: {
    en: "Your text will take about {m} minutes to narrate. You chose {t} minutes. What should we do?",
    gu: "તમારું લખાણ વાંચતાં આશરે {m} મિનિટ લાગશે. તમે {t} મિનિટ પસંદ કરી છે. શું કરીએ?",
    hi: "आपका पाठ पढ़ने में लगभग {m} मिनट लगेंगे। आपने {t} मिनट चुने हैं। क्या करें?",
  },
  lenAll: { en: "Narrate it all (about {m} minutes)", gu: "આખું વાંચો (આશરે {m} મિનિટ)", hi: "पूरा पढ़ें (लगभग {m} मिनट)" },
  lenShorten: { en: "Shorten it to about {t} minutes", gu: "આશરે {t} મિનિટ સુધી ટૂંકું કરો", hi: "लगभग {t} मिनट तक छोटा करें" },
  lenEpisodes: { en: "Make it as {e} episodes", gu: "{e} એપિસોડમાં બનાવો", hi: "{e} एपिसोड में बनाएँ" },
  chooseMyself: { en: "Choose myself", gu: "હું જાતે પસંદ કરીશ", hi: "मैं खुद चुनूँगा/चुनूँगी" },
  style: { en: "Painting style", gu: "ચિત્રશૈલી", hi: "चित्र शैली" },
  colour: { en: "Colour", gu: "રંગ", hi: "रंग" },
  thinking: { en: "Thinking about your story…", gu: "તમારી વાર્તા વિશે વિચારીએ છીએ…", hi: "आपकी कहानी पर सोच रहे हैं…" },
  name: { en: "Name", gu: "નામ", hi: "नाम" },
  role: { en: "Role", gu: "ભૂમિકા", hi: "भूमिका" },
  main: { en: "Main", gu: "મુખ્ય", hi: "मुख्य" },
  minor: { en: "Minor", gu: "ગૌણ", hi: "गौण" },
  age: { en: "Approximate age", gu: "આશરે ઉંમર", hi: "लगभग उम्र" },
  look: { en: "Look and clothing (optional)", gu: "દેખાવ અને પોશાક (વૈકલ્પિક)", hi: "रूप और पोशाक (वैकल्पिक)" },
  voice: { en: "Voice", gu: "અવાજ", hi: "आवाज़" },
  realQ: { en: "Is this a real person?", gu: "શું આ વાસ્તવિક વ્યક્તિ છે?", hi: "क्या यह वास्तविक व्यक्ति है?" },
  realNo: { en: "No", gu: "ના", hi: "नहीं" },
  realHist: { en: "Yes, from history", gu: "હા, ઇતિહાસમાંથી", hi: "हाँ, इतिहास से" },
  realAliveOk: { en: "Yes, alive, and I have their permission", gu: "હા, જીવંત, અને તેમની પરવાનગી છે", hi: "हाँ, जीवित, और उनकी अनुमति है" },
  realAliveNo: { en: "Yes, alive, without their permission", gu: "હા, જીવંત, પરવાનગી વિના", hi: "हाँ, जीवित, अनुमति के बिना" },
  realNote: { en: "A living person without permission appears only in the narration, never as a picture.", gu: "પરવાનગી વિનાની જીવંત વ્યક્તિ ફક્ત વાચનમાં આવે, ચિત્રમાં ક્યારેય નહીં.", hi: "बिना अनुमति जीवित व्यक्ति केवल वाचन में आएगा, चित्र में कभी नहीं।" },
  sacredQ: { en: "A deity or sacred figure: show their face, or only symbols?", gu: "દેવતા કે પવિત્ર પાત્ર: ચહેરો બતાવીએ કે ફક્ત પ્રતીકો?", hi: "देवता या पवित्र पात्र: चेहरा दिखाएँ या केवल प्रतीक?" },
  notSacred: { en: "Not a sacred figure", gu: "પવિત્ર પાત્ર નથી", hi: "पवित्र पात्र नहीं" },
  showFace: { en: "Show as my tradition allows", gu: "મારી પરંપરા પ્રમાણે બતાવો", hi: "मेरी परंपरा के अनुसार दिखाएँ" },
  symbols: { en: "Only symbols (feet, hands, light, objects)", gu: "ફક્ત પ્રતીકો (ચરણ, હાથ, પ્રકાશ, વસ્તુઓ)", hi: "केवल प्रतीक (चरण, हाथ, प्रकाश, वस्तुएँ)" },
  addChar: { en: "Add a character", gu: "પાત્ર ઉમેરો", hi: "पात्र जोड़ें" },
  remove: { en: "Remove", gu: "દૂર કરો", hi: "हटाएँ" },
  voicesLimit: { en: "Your level gives up to {n} character voices; other characters are read by the narrator.", gu: "તમારા સ્તરમાં {n} સુધી પાત્ર-અવાજો છે; બાકીનાં પાત્રો વાચક વાંચશે.", hi: "आपके स्तर में {n} तक पात्र-आवाज़ें हैं; बाकी पात्र वाचक पढ़ेगा।" },
  picHelp: {
    en: "Up to 5 of your own photos or sketches as guidance (the real village, a family photo for the general look). Never film stills, other artists’ work or celebrity photos. We never copy a real person’s exact face.",
    gu: "માર્ગદર્શન માટે તમારા પોતાના 5 સુધી ફોટા કે સ્કેચ (સાચું ગામ, સામાન્ય દેખાવ માટે કૌટુંબિક ફોટો). ફિલ્મનાં દૃશ્યો, બીજા કલાકારોનું કામ કે જાણીતી વ્યક્તિઓના ફોટા નહીં. અમે કોઈ વ્યક્તિનો ચહેરો હૂબહૂ નકલ કરતા નથી.",
    hi: "मार्गदर्शन के लिए अपने 5 तक फ़ोटो या स्केच (असली गाँव, सामान्य रूप के लिए पारिवारिक फ़ोटो)। फ़िल्म के दृश्य, दूसरे कलाकारों का काम या मशहूर लोगों की फ़ोटो नहीं। हम किसी का चेहरा हूबहू नकल नहीं करते।",
  },
  picTick: { en: "These are my own photos or drawings, or I have permission.", gu: "આ મારા પોતાના ફોટા કે ચિત્રો છે, અથવા મારી પાસે પરવાનગી છે.", hi: "ये मेरी अपनी फ़ोटो या चित्र हैं, या मेरे पास अनुमति है।" },
  upload: { en: "Upload", gu: "અપલોડ", hi: "अपलोड" },
  episodesHelp: { en: "We split your story at natural breaks, about 20,000 characters each. Move a break if a better place is near. Each episode is quoted and paid separately.", gu: "અમે વાર્તાને કુદરતી વિરામે, આશરે 20,000 અક્ષરના ભાગમાં વહેંચી છે. વધુ સારી જગ્યા નજીક હોય તો વિરામ ખસેડો. દરેક એપિસોડની કિંમત અને ચુકવણી અલગ.", hi: "हमने कहानी को प्राकृतिक विराम पर, लगभग 20,000 अक्षरों के भागों में बाँटा है। बेहतर जगह पास हो तो विराम खिसकाएँ। हर एपिसोड की कीमत और भुगतान अलग।" },
  earlier: { en: "← Earlier", gu: "← પહેલાં", hi: "← पहले" },
  later: { en: "Later →", gu: "પછી →", hi: "बाद →" },
  startsWith: { en: "Starts: “{s}…”", gu: "શરૂઆત: “{s}…”", hi: "शुरुआत: “{s}…”" },
  ownWords: { en: "Or in your own words (optional)", gu: "અથવા તમારા શબ્દોમાં (વૈકલ્પિક)", hi: "या अपने शब्दों में (वैकल्पिक)" },
  noMoreQ: { en: "No more questions: we have what we need.", gu: "વધુ પ્રશ્નો નથી: જરૂરી બધું મળી ગયું.", hi: "और सवाल नहीं: ज़रूरी सब मिल गया।" },
  pron: { en: "How do you say these names and words?", gu: "આ નામો અને શબ્દો કેવી રીતે બોલાય છે?", hi: "ये नाम और शब्द कैसे बोले जाते हैं?" },
  pronHelp: { en: "Correct any guide that is wrong; leave it empty if you’re unsure. This list goes into your script.", gu: "ખોટું માર્ગદર્શન સુધારો; ખાતરી ન હોય તો ખાલી રાખો. આ યાદી સ્ક્રિપ્ટમાં જશે.", hi: "गलत मार्गदर्शन सुधारें; पक्का न हो तो खाली छोड़ें। यह सूची स्क्रिप्ट में जाएगी।" },
  writingPlan: { en: "Writing your creative plan… (up to a minute)", gu: "તમારો ક્રિએટિવ પ્લાન લખીએ છીએ… (એક મિનિટ સુધી)", hi: "आपकी क्रिएटिव योजना लिख रहे हैं… (एक मिनट तक)" },
  price: { en: "Your fixed price", gu: "તમારી નક્કી કિંમત", hi: "आपकी तय कीमत" },
  advance: { en: "{s} now for your sample. If you go ahead after it: {a} in advance (your {s} already counted), then {f} before the final download.", gu: "હમણાં નમૂના માટે {s}. તે પછી આગળ વધો તો: {a} એડવાન્સ (તમારા {s} ગણાઈ ગયા છે), પછી અંતિમ ડાઉનલોડ પહેલાં {f}.", hi: "अभी नमूने के लिए {s}। उसके बाद आगे बढ़ें तो: {a} अग्रिम (आपके {s} गिने जा चुके हैं), फिर अंतिम डाउनलोड से पहले {f}।" },
  episodesPrice: { en: "For {e} episodes, each paid separately.", gu: "{e} એપિસોડ માટે, દરેકની ચુકવણી અલગ.", hi: "{e} एपिसोड के लिए, हर एक का भुगतान अलग।" },
  delivery: { en: "About {m} minutes. Delivery within {d} days of the advance (at the latest).", gu: "આશરે {m} મિનિટ. એડવાન્સ પછી વધુમાં વધુ {d} દિવસમાં ડિલિવરી.", hi: "लगभग {m} मिनट। अग्रिम के बाद अधिकतम {d} दिनों में डिलीवरी।" },
  freeSample: { en: "Your 30–60 second sample is made automatically once the {s} is paid, and checked before it reaches you. If you stop after the sample, the {s} is not refunded.", gu: "{s} ચૂકવાય પછી તમારો 30–60 સેકન્ડનો નમૂનો આપમેળે બને છે, અને તમને મળે તે પહેલાં ચકાસાય છે. નમૂના પછી અટકો તો {s} પાછા મળતા નથી.", hi: "{s} चुकाने के बाद आपका 30–60 सेकंड का नमूना अपने आप बनता है, और आप तक पहुँचने से पहले जाँचा जाता है। नमूने के बाद रुकें तो {s} वापस नहीं मिलते।" },
  changeAsk: { en: "Would you like anything changed? ({n} changes left)", gu: "કંઈ બદલવું છે? ({n} ફેરફાર બાકી)", hi: "कुछ बदलना है? ({n} बदलाव बाकी)" },
  changeBtn: { en: "Change the plan", gu: "પ્લાન બદલો", hi: "योजना बदलें" },
  discuss: { en: "Let’s discuss", gu: "ચાલો વાત કરીએ", hi: "चलिए बात करें" },
  approve: { en: "Approve the plan", gu: "પ્લાન મંજૂર કરો", hi: "योजना स्वीकार करें" },
  approved: { en: "Thank you. Your plan is approved. Pay {s} for your sample below; it is made and checked automatically, and we email you when it is ready.", gu: "આભાર. તમારો પ્લાન મંજૂર થયો. નીચે તમારા નમૂના માટે {s} ચૂકવો; તે આપમેળે બને અને ચકાસાય છે, અને તૈયાર થાય ત્યારે ઇમેલ કરીશું.", hi: "धन्यवाद। आपकी योजना स्वीकृत है। नीचे अपने नमूने के लिए {s} चुकाएँ; यह अपने आप बनता और जाँचा जाता है, और तैयार होने पर हम ईमेल करेंगे।" },
  payLater: { en: "Online payment opens soon. We’ll email you as soon as you can pay for your sample.", gu: "ઑનલાઇન ચુકવણી ટૂંક સમયમાં શરૂ થશે. નમૂના માટે ચૂકવી શકો ત્યારે અમે ઇમેલ કરીશું.", hi: "ऑनलाइन भुगतान जल्द शुरू होगा। नमूने के लिए भुगतान कर सकें तब हम ईमेल करेंगे।" },
  discussed: { en: "Thank you. Jaydeep will write to you to talk the plan through.", gu: "આભાર. પ્લાન વિશે વાત કરવા જયદીપ તમને લખશે.", hi: "धन्यवाद। योजना पर बात करने के लिए जयदीप आपको लिखेंगे।" },
  recording: { en: "Recording… speak now", gu: "રેકોર્ડિંગ… હવે બોલો", hi: "रिकॉर्डिंग… अब बोलिए" },
  tryAgain: { en: "Try again", gu: "ફરી પ્રયત્ન કરો", hi: "फिर कोशिश करें" },
};
const w = (k: string, lang: Lang, vars: Record<string, string | number> = {}) => t(W[k], lang).replace(/\{(\w+)\}/g, (_, x) => String(vars[x] ?? ""));
const LANG_NAME: Record<string, L> = {
  gu: { en: "Gujarati", gu: "ગુજરાતી", hi: "गुजराती" },
  hi: { en: "Hindi", gu: "હિન્દી", hi: "हिन्दी" },
  en: { en: "English", gu: "અંગ્રેજી", hi: "अंग्रेज़ी" },
};
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export type StepProps = {
  id: string | null;
  lang: Lang;
  answers: Answers;
  cd: ClientDraft;
  setCd: (d: ClientDraft) => void;
  onDone: (patch?: Answers) => void;
  onAnswers: (patch: Answers) => void;
  onFinal?: (kind: "approved" | "needs_human" | "refused", message: string) => void;
};

function Next({ lang, onClick, disabled, label }: { lang: Lang; onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" className={h.ideaSend} onClick={onClick} disabled={disabled}>
      {label ?? t(UI.next, lang)}
    </button>
  );
}

// ---------------------------------------------------------------- 0.4 price range

export function PriceRange({ lang, answers, onDone }: StepProps) {
  const [range, setRange] = useState<{ from: number; to: number; episodes: boolean } | null>(null);
  useEffect(() => {
    priceRangeAction(answers).then(setRange).catch(() => setRange(null));
  }, [answers]);
  return (
    <>
      <div className={c.priceBox}>
        <p>{t(UI.typicalPrice, lang)}</p>
        <p className={c.bigPrice}>{range ? (range.from === range.to ? money(range.from) : `${money(range.from)} – ${money(range.to)}`) : "…"}</p>
        {range?.episodes && <p className={c.small}>{w("episodesPrice", lang, { e: "2+" })}</p>}
        <p className={c.small}>{t(UI.rangeNote, lang)}</p>
      </div>
      <div className={c.nav}>
        <Next lang={lang} onClick={() => onDone()} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 1.1 the story

export function StoryStep({
  id,
  lang,
  onDone,
  screened,
  initial,
  onSaved,
}: StepProps & { screened: boolean; initial: { chars: number; lang: string | null }; onSaved: (chars: number, lang: string | null) => void }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(initial.chars ? initial : null);
  const [replacing, setReplacing] = useState(false);

  if (screened) {
    return (
      <>
        <p className={c.text}>{w("locked", lang)}</p>
        <p className={c.small}>{w("chars", lang, { n: initial.chars.toLocaleString("en-IN") })}</p>
        <div className={c.nav}>
          <Next lang={lang} onClick={() => onDone()} />
        </div>
      </>
    );
  }

  if (saved && !replacing) {
    return (
      <>
        <p className={c.text}>
          {w("chars", lang, { n: saved.chars.toLocaleString("en-IN") })} ·{" "}
          {w("detected", lang, { l: t(LANG_NAME[saved.lang ?? "gu"], lang) })}
        </p>
        <div className={c.opts} role="group">
          {(["gu", "hi", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              className={`${c.opt} ${saved.lang === l ? c.optOn : ""}`}
              onClick={async () => {
                if (!id) return;
                await setStoryLanguage(id, l);
                setSaved({ ...saved, lang: l });
                onSaved(saved.chars, l);
              }}
            >
              {t(LANG_NAME[l], lang)}
            </button>
          ))}
        </div>
        {saved.chars > 20000 && <p className={c.formNote}>{w("episodesNote", lang)}</p>}
        <div className={c.nav}>
          <Next lang={lang} onClick={() => onDone()} />
          <button type="button" className={c.navBack} onClick={() => setReplacing(true)}>
            {w("replace", lang)}
          </button>
        </div>
      </>
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("story", text);
    if (file) form.set("file", file);
    const res = await submitStory(id, form);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "");
    setSaved({ chars: res.chars ?? 0, lang: res.lang ?? null });
    onSaved(res.chars ?? 0, res.lang ?? null);
    setReplacing(false);
  }

  return (
    <form onSubmit={save} className={`${h.ideaForm} ${c.form}`}>
      <label className={h.field}>
        {w("paste", lang)} ({w("chars", lang, { n: text.length.toLocaleString("en-IN") })})
        <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} lang={lang} />
      </label>
      {text.length > 20000 && <p className={c.formNote}>{w("episodesNote", lang)}</p>}
      <label className={h.field}>
        {w("orUpload", lang)}
        <input type="file" accept=".docx,.txt,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <p className={c.formNote}>{w("pdfNote", lang)}</p>
      {error && (
        <p className={h.ideaError} role="alert">
          {error}
        </p>
      )}
      <div className={c.nav}>
        <button type="submit" className={h.ideaSend} disabled={busy || (!file && text.trim().length < 200)}>
          {busy ? w("saving", lang) : w("saveStory", lang)}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- 1.3 consent + screening

const SCREEN_KINDS = ["terms_refund", "rights_origin", "data_processing"] as const;

export function ConsentStep({ id, lang, setCd, onDone, onFinal }: StepProps) {
  const [fix, setFix] = useState<{ reason: string; suggestions: { where: string; change: string }[]; story: string; left: number } | null>(null);
  const [ticks, setTicks] = useState<Ticks>({});
  const [tickLang, setTickLang] = useState(lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = useSpamCheck("creator");

  // Back after a fix was asked for: straight to the suggestions.
  useEffect(() => {
    if (!id) return;
    pendingFix(id).then((res) => {
      if (res?.status === "fix" && res.fix) setFix({ reason: res.message ?? "", ...res.fix });
    });
  }, [id]);

  async function go(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const res = await consentAndScreen(id, data);
    setBusy(false);
    if (res.status === "clear") {
      if (res.draft) setCd(res.draft);
      onDone();
    } else if (res.status === "fix" && res.fix) {
      setFix({ reason: res.message ?? "", ...res.fix });
    } else if (res.status === "error") {
      setError(res.message ?? "");
      check.reset();
    } else onFinal?.(res.status as "needs_human" | "refused", res.message ?? "");
  }

  if (busy) return <p className={c.working} role="status">{t(UI.working, lang)}</p>;
  if (fix)
    return (
      <FixStory
        id={id!}
        lang={lang}
        fix={fix}
        onClear={(d) => {
          if (d) setCd(d);
          onDone();
        }}
        onFix={setFix}
        onFinal={(k, m) => onFinal?.(k, m)}
      />
    );
  return (
    <form onSubmit={go} className={`${h.ideaForm} ${c.form}`}>
      <ConsentTicks kinds={SCREEN_KINDS} lang={tickLang} setLang={setTickLang} ticks={ticks} setTicks={setTicks} />
      <p className={c.formNote}>{w("screenNote", lang)}</p>
      <SpamCheckBox check={check} noteClass={h.ideaError} />
      {!allTicked(SCREEN_KINDS, ticks) && <p className={c.formNote}>{w("allThree", lang)}</p>}
      {error && (
        <p className={h.ideaError} role="alert">
          {error}
        </p>
      )}
      <div className={c.nav}>
        <button type="submit" className={h.ideaSend} disabled={check.status !== "ready" || !allTicked(SCREEN_KINDS, ticks)}>
          {sendLabel(check, busy, w("readStory", lang))}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- 1.3b fix-it (Jaydeep, 25 Nov 2026)

const FIX_W: Record<string, L> = {
  title: { en: "A small change is needed before we can make your story", gu: "તમારી વાર્તા બનાવતાં પહેલાં નાનો ફેરફાર જરૂરી છે", hi: "आपकी कहानी बनाने से पहले एक छोटा बदलाव ज़रूरी है" },
  intro: {
    en: "Our check found something we can’t include as it is. Here is how to change it; edit your story below, then check it again.",
    gu: "અમારી ચકાસણીમાં એવું કંઈક મળ્યું જે જેમ છે તેમ અમે સામેલ કરી શકતા નથી. તેને કેવી રીતે બદલવું તે નીચે છે; વાર્તા સુધારો, પછી ફરી ચકાસો.",
    hi: "हमारी जाँच में कुछ ऐसा मिला जिसे हम जैसा है वैसा शामिल नहीं कर सकते। उसे कैसे बदलें, यह नीचे है; कहानी सुधारें, फिर दोबारा जाँचें।",
  },
  near: { en: "Near: “{s}…”", gu: "અહીં: “{s}…”", hi: "यहाँ: “{s}…”" },
  story: { en: "Your story (edit it here)", gu: "તમારી વાર્તા (અહીં સુધારો)", hi: "आपकी कहानी (यहाँ सुधारें)" },
  again: { en: "Check my story again ({n} left)", gu: "મારી વાર્તા ફરી ચકાસો ({n} બાકી)", hi: "मेरी कहानी फिर जाँचें ({n} बाकी)" },
  same: { en: "Please make the changes first.", gu: "પહેલાં ફેરફાર કરો.", hi: "पहले बदलाव करें।" },
};
const fw = (k: string, lang: Lang, vars: Record<string, string | number> = {}) => t(FIX_W[k], lang).replace(/\{(\w+)\}/g, (_, x) => String(vars[x] ?? ""));

function FixStory({
  id,
  lang,
  fix,
  onClear,
  onFix,
  onFinal,
}: {
  id: string;
  lang: Lang;
  fix: { reason: string; suggestions: { where: string; change: string }[]; story: string; left: number };
  onClear: (d?: ClientDraft) => void;
  onFix: (f: { reason: string; suggestions: { where: string; change: string }[]; story: string; left: number }) => void;
  onFinal: (kind: "needs_human" | "refused", message: string) => void;
}) {
  const [text, setText] = useState(fix.story);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function again() {
    if (text.trim() === fix.story.trim()) return setError(fw("same", lang));
    setBusy(true);
    setError("");
    const res = await recheckStory(id, text);
    setBusy(false);
    if (res.status === "clear") onClear(res.draft);
    else if (res.status === "fix" && res.fix) {
      onFix({ reason: res.message ?? "", ...res.fix });
      setText(res.fix.story);
    } else if (res.status === "error") setError(res.message ?? "");
    else onFinal(res.status as "needs_human" | "refused", res.message ?? "");
  }

  if (busy) return <p className={c.working} role="status">{t(UI.working, lang)}</p>;
  return (
    <div className={`${h.ideaForm} ${c.form}`} lang={lang}>
      <h3 className={c.q}>{fw("title", lang)}</h3>
      <p className={c.help}>{fw("intro", lang)}</p>
      {fix.reason && <p className={c.text}>{fix.reason}</p>}
      <ol className={c.episodeList}>
        {fix.suggestions.map((x, i) => (
          <li key={i}>
            {x.where && <div className={c.small}>{fw("near", lang, { s: x.where })}</div>}
            {x.change}
          </li>
        ))}
      </ol>
      <label className={h.field}>
        {fw("story", lang)}
        <textarea rows={16} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {error && (
        <p className={h.ideaError} role="alert">
          {error}
        </p>
      )}
      <div className={c.nav}>
        <button type="button" className={h.ideaSend} onClick={again} disabled={fix.left <= 0}>
          {fw("again", lang, { n: fix.left })}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 3.1 finish level

export function LevelStep({ id, lang, answers, onDone }: StepProps) {
  const [prices, setPrices] = useState<Record<string, number> | null>(null);
  const [full, setFull] = useState<string | null>(null);
  useEffect(() => {
    if (id)
      levelPrices(id).then((r) => {
        setPrices(r?.prices ?? null);
        setFull(r?.assistedFrom ?? null);
      });
  }, [id]);
  const desc: Record<string, string> = { basic: "levelBasic", standard: "levelStandard", premium: "levelPremium" };
  const names: Record<string, L> = {
    basic: { en: "Basic", gu: "સરળ", hi: "सरल" },
    standard: { en: "Standard", gu: "સુંદર", hi: "सुंदर" },
    premium: { en: "Premium", gu: "શ્રેષ્ઠ", hi: "श्रेष्ठ" },
  };
  const custom = isCustom(answers);
  return (
    <>
      <div className={c.levelCards}>
        {(["basic", "standard", "premium"] as const).map((l) => (
          <button key={l} type="button" className={`${c.opt} ${answers.level === l ? c.optOn : ""}`} onClick={() => onDone({ level: l, ...LEVEL_PRESETS[l] })}>
            <b>{t(names[l], lang)}</b>
            {answers.level === l && custom && <span className={c.badge}>{t(UI.custom, lang)}</span>}
            <span className={c.optHint}>{w(desc[l], lang)}</span>
            <span className={c.levelPrice}>{prices ? `${money(prices[l])} ${w("forYourStory", lang)}` : "…"}</span>
          </button>
        ))}
      </div>
      {full && <p className={c.formNote}>{w("assistedFull", lang, { d: new Date(full).toLocaleDateString("en-IN", { day: "numeric", month: "long" }) })}</p>}
      <p className={c.formNote}>{t(UI.rangeNote, lang)}</p>
    </>
  );
}

// ---------------------------------------------------------------- 4 length check

export function LengthCheck({ lang, answers, onDone, chars, storyLang }: StepProps & { chars: number; storyLang: string | null }) {
  const m = Math.round(narrationMinutes(chars, storyLang));
  const target = Number(answers.target_minutes);
  const eps = Math.max(2, Math.ceil(m / Math.max(target, 1)));
  const opts: [string, string][] = [
    ["all", w("lenAll", lang, { m })],
    ["shorten", w("lenShorten", lang, { t: target })],
    ["episodes", w("lenEpisodes", lang, { e: eps })],
  ];
  return (
    <>
      <p className={c.text}>{w("lengthIs", lang, { m, t: target })}</p>
      <div className={c.opts}>
        {opts.map(([k, label]) => (
          <button key={k} type="button" className={`${c.opt} ${answers.length_check === k ? c.optOn : ""}`} onClick={() => onDone({ length_check: k })}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 5.2 look and colour

export function LookStep({ id, lang, answers, cd, setCd, onDone }: StepProps) {
  const [mode, setMode] = useState<"suggest" | "choose" | null>(answers.look_style && !cd.looks.length ? "choose" : cd.looks.length ? "suggest" : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [style, setStyle] = useState(String(answers.look_style ?? ""));
  const [colour, setColour] = useState(String(answers.look_colour ?? ""));

  async function suggest() {
    if (!id) return;
    setMode("suggest");
    if (cd.looks.length) return;
    setBusy(true);
    const res = await suggestLooksAction(id);
    setBusy(false);
    if (res.looks) setCd({ ...cd, looks: res.looks });
    else {
      setError(res.error ?? "");
      setMode("choose");
    }
  }

  return (
    <>
      <div className={c.nav}>
        <button type="button" className={`${c.opt} ${mode === "suggest" ? c.optOn : ""}`} style={{ width: "auto" }} onClick={suggest}>
          {t(UI.suggest, lang)}
        </button>
        <button type="button" className={`${c.opt} ${mode === "choose" ? c.optOn : ""}`} style={{ width: "auto" }} onClick={() => setMode("choose")}>
          {w("chooseMyself", lang)}
        </button>
      </div>
      {error && <p className={c.formNote}>{error}</p>}
      {busy && <p className={c.working} role="status">{w("thinking", lang)}</p>}
      {mode === "suggest" && !busy && (
        <div className={c.opts}>
          {cd.looks.map((l) => (
            <button
              key={`${l.style}-${l.colour}`}
              type="button"
              className={`${c.opt} ${style === l.style && colour === l.colour ? c.optOn : ""}`}
              onClick={() => onDone({ look_style: l.style, look_colour: l.colour })}
            >
              <b>
                {t(STYLE_LABELS[l.style], lang)} · {t(COLOUR_LABELS[l.colour], lang)}
              </b>
              <span className={c.optHint}>{l.reason}</span>
            </button>
          ))}
        </div>
      )}
      {mode === "choose" && (
        <>
          <p className={c.stageName}>{w("style", lang)}</p>
          <div className={c.opts}>
            {Object.keys(STYLE_LABELS).map((s) => (
              <button key={s} type="button" className={`${c.opt} ${style === s ? c.optOn : ""}`} onClick={() => setStyle(s)}>
                {t(STYLE_LABELS[s], lang)}
              </button>
            ))}
          </div>
          <p className={c.stageName}>{w("colour", lang)}</p>
          <div className={c.opts}>
            {Object.keys(COLOUR_LABELS).map((s) => (
              <button key={s} type="button" className={`${c.opt} ${colour === s ? c.optOn : ""}`} onClick={() => setColour(s)}>
                {t(COLOUR_LABELS[s], lang)}
              </button>
            ))}
          </div>
          <div className={c.nav}>
            <Next lang={lang} disabled={!style} onClick={() => onDone({ look_style: style, look_colour: colour })} />
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- 6.1 characters

const VOICE_LABEL: Record<string, L> = {
  warm: { en: "Warm", gu: "હૂંફાળો", hi: "गर्म" },
  deep: { en: "Deep", gu: "ઘેરો", hi: "गहरी" },
  young: { en: "Young", gu: "યુવાન", hi: "युवा" },
  old: { en: "Old", gu: "વૃદ્ધ", hi: "वृद्ध" },
  gentle: { en: "Gentle", gu: "કોમળ", hi: "कोमल" },
  sharp: { en: "Sharp", gu: "તીખો", hi: "तीखी" },
};
const BLANK: Character = { name: "", role: "minor", age: "", look: "", voice: "", real_person: "no", sacred: "" };

export function CharactersStep({ id, lang, answers, cd, setCd, onDone }: StepProps) {
  const [list, setList] = useState<Character[]>(cd.characters.length ? cd.characters : [{ ...BLANK, role: "main" }]);
  const [busy, setBusy] = useState(false);
  const withVoices = answers.voices === "characters";
  const limit = answers.level === "premium" ? 6 : answers.level === "basic" ? 0 : 3;
  const set = (i: number, patch: Partial<Character>) => setList(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    if (!id) return;
    setBusy(true);
    const res = await saveCharacters(id, list);
    setBusy(false);
    if (res.ok && res.characters) {
      setCd({ ...cd, characters: res.characters });
      onDone();
    }
  }

  return (
    <>
      {withVoices && <p className={c.formNote}>{w("voicesLimit", lang, { n: limit })}</p>}
      {list.map((ch, i) => (
        <div key={i} className={c.charCard}>
          <label className={h.field}>
            {w("name", lang)}
            <input value={ch.name} maxLength={80} onChange={(e) => set(i, { name: e.target.value })} />
          </label>
          <div className={h.fieldRow}>
            <label className={h.field}>
              {w("role", lang)}
              <select value={ch.role} onChange={(e) => set(i, { role: e.target.value as Character["role"] })}>
                <option value="main">{w("main", lang)}</option>
                <option value="minor">{w("minor", lang)}</option>
              </select>
            </label>
            <label className={h.field}>
              {w("age", lang)}
              <input value={ch.age} maxLength={40} onChange={(e) => set(i, { age: e.target.value })} />
            </label>
          </div>
          <label className={h.field}>
            {w("look", lang)}
            <input value={ch.look} maxLength={200} onChange={(e) => set(i, { look: e.target.value })} />
          </label>
          {withVoices && (
            <label className={h.field}>
              {w("voice", lang)}
              <select value={ch.voice} onChange={(e) => set(i, { voice: e.target.value })}>
                <option value="">{t(UI.decide, lang)}</option>
                {VOICE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(VOICE_LABEL[v], lang)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={h.field}>
            {w("realQ", lang)}
            <select value={ch.real_person} onChange={(e) => set(i, { real_person: e.target.value as Character["real_person"] })}>
              <option value="no">{w("realNo", lang)}</option>
              <option value="historical">{w("realHist", lang)}</option>
              <option value="alive_permission">{w("realAliveOk", lang)}</option>
              <option value="alive_no_permission">{w("realAliveNo", lang)}</option>
            </select>
          </label>
          {ch.real_person === "alive_no_permission" && <p className={c.formNote}>{w("realNote", lang)}</p>}
          <label className={h.field}>
            {w("sacredQ", lang)}
            <select value={ch.sacred} onChange={(e) => set(i, { sacred: e.target.value as Character["sacred"] })}>
              <option value="">{w("notSacred", lang)}</option>
              <option value="show_face">{w("showFace", lang)}</option>
              <option value="symbols_only">{w("symbols", lang)}</option>
            </select>
          </label>
          <button type="button" className={c.linkButton} onClick={() => setList(list.filter((_, j) => j !== i))}>
            {w("remove", lang)}
          </button>
        </div>
      ))}
      {list.length < 8 && (
        <button type="button" className={c.navBack} onClick={() => setList([...list, { ...BLANK }])}>
          + {w("addChar", lang)}
        </button>
      )}
      <div className={c.nav}>
        <Next lang={lang} onClick={save} disabled={busy} label={busy ? w("saving", lang) : undefined} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 6.5 own pictures

export function PicturesStep({ id, lang, cd, setCd, onDone }: StepProps) {
  const [own, setOwn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function add() {
    const f = fileRef.current?.files?.[0];
    if (!id || !f) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", f);
    form.set("own", own ? "yes" : "");
    const res = await uploadPicture(id, form);
    setBusy(false);
    if (res.error) setError(res.error);
    if (res.pictures) setCd({ ...cd, pictures: res.pictures });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <p className={c.help}>{w("picHelp", lang)}</p>
      {!!cd.pictures.length && (
        <div className={c.pictureGrid}>
          {cd.pictures.map((p) => (
            <figure key={p.key}>
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private link */}
              <img src={p.url} alt="" />
              <button
                type="button"
                className={c.linkButton}
                onClick={async () => {
                  if (!id) return;
                  const res = await removePicture(id, p.key);
                  setCd({ ...cd, pictures: res.pictures });
                }}
              >
                {w("remove", lang)}
              </button>
            </figure>
          ))}
        </div>
      )}
      {cd.pictures.length < 5 && (
        <>
          <label className={c.tick}>
            <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />
            <span>{w("picTick", lang)}</span>
          </label>
          <div className={c.nav}>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={!own} />
            <button type="button" className={c.navBack} disabled={!own || busy} onClick={add}>
              {busy ? w("saving", lang) : w("upload", lang)}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className={h.ideaError} role="alert">
          {error}
        </p>
      )}
      <div className={c.nav}>
        <Next lang={lang} onClick={() => onDone()} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 6.6 episodes

export function EpisodesStep({ id, lang, cd, setCd, onDone }: StepProps) {
  const [openings, setOpenings] = useState<string[]>([]);
  const [busy, setBusy] = useState(!cd.episodes.length);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      if (!cd.episodes.length) {
        const res = await proposeEpisodes(id);
        if (res.episodes) setCd({ ...cd, episodes: res.episodes });
        setBusy(false);
      }
      setOpenings(await episodeOpenings(id));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per draft
  }, [id]);

  async function move(i: number, dir: -1 | 1) {
    if (!id) return;
    const res = await moveEpisode(id, i, dir);
    setError(res.error ?? "");
    if (res.episodes) setCd({ ...cd, episodes: res.episodes });
    setOpenings(await episodeOpenings(id));
  }

  if (busy) return <p className={c.working} role="status">{w("thinking", lang)}</p>;
  return (
    <>
      <p className={c.help}>{w("episodesHelp", lang)}</p>
      <ol className={c.episodeList}>
        {cd.episodes.map((e, i) => (
          <li key={i}>
            <b>
              {i + 1}. {e.title}
            </b>
            <div className={c.small}>{w("startsWith", lang, { s: openings[i] ?? "" })}</div>
            {i > 0 && (
              <div className={c.nav}>
                <button type="button" className={c.linkButton} onClick={() => move(i, -1)}>
                  {w("earlier", lang)}
                </button>
                <button type="button" className={c.linkButton} onClick={() => move(i, 1)}>
                  {w("later", lang)}
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {error && <p className={c.formNote}>{error}</p>}
      <div className={c.nav}>
        <Next lang={lang} onClick={() => onDone()} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 7 follow-up questions

export function FollowUpsStep({ id, lang, cd, setCd, onDone, onFinal }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const round = cd.followups[cd.followups.length - 1];
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [own, setOwn] = useState<Record<string, string>>({});
  const [pron, setPron] = useState(cd.pronunciation);
  const started = useRef(false);

  async function next(answers?: Record<string, string>) {
    if (!id) return;
    setBusy(true);
    setError("");
    const res = await nextFollowUps(id, answers);
    setBusy(false);
    if (res.stopped) return onFinal?.("needs_human", res.error ?? "");
    if (res.error) return setError(res.error);
    setCd({ ...cd, followups: res.rounds ?? cd.followups, followups_done: !!res.done, pronunciation: res.pronunciation ?? cd.pronunciation });
    setPron(res.pronunciation ?? cd.pronunciation);
    setPicks({});
    setOwn({});
  }

  useEffect(() => {
    if (started.current || cd.followups_done || cd.followups.length) return;
    started.current = true;
    startTransition(() => {
      next();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first round once
  }, []);

  if (busy) return <p className={c.working} role="status">{w("thinking", lang)}</p>;
  if (error)
    return (
      <>
        <p className={h.ideaError}>{error}</p>
        <Next lang={lang} onClick={() => next()} label={w("tryAgain", lang)} />
      </>
    );

  if (!cd.followups_done && round?.questions.length) {
    const ready = round.questions.every((q) => picks[q.id] || own[q.id]?.trim());
    return (
      <>
        {round.questions.map((q) => (
          <fieldset key={q.id} className={c.consent}>
            <legend>{q.question}</legend>
            <div className={c.opts}>
              {[...q.options, "__decide"].map((o) => (
                <button key={o} type="button" className={`${c.opt} ${picks[q.id] === o ? c.optOn : ""}`} onClick={() => setPicks({ ...picks, [q.id]: o })}>
                  {o === "__decide" ? t(UI.decide, lang) : o}
                </button>
              ))}
            </div>
            <label className={h.field}>
              {w("ownWords", lang)}
              <input value={own[q.id] ?? ""} maxLength={300} onChange={(e) => setOwn({ ...own, [q.id]: e.target.value })} />
            </label>
          </fieldset>
        ))}
        <div className={c.nav}>
          <Next
            lang={lang}
            disabled={!ready}
            onClick={() => next(Object.fromEntries(round.questions.map((q) => [q.id, own[q.id]?.trim() || picks[q.id] || "__decide"])))}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <p className={c.text}>{w("noMoreQ", lang)}</p>
      {!!pron.length && (
        <fieldset className={c.consent}>
          <legend>{w("pron", lang)}</legend>
          <p className={c.formNote}>{w("pronHelp", lang)}</p>
          {pron.map((p, i) => (
            <label key={p.word} className={h.field}>
              {p.word}
              <input value={p.say_as} maxLength={80} onChange={(e) => setPron(pron.map((x, j) => (j === i ? { ...x, say_as: e.target.value } : x)))} />
            </label>
          ))}
        </fieldset>
      )}
      <div className={c.nav}>
        <Next
          lang={lang}
          onClick={async () => {
            if (id && pron.length) await savePronunciation(id, pron);
            setCd({ ...cd, pronunciation: pron });
            onDone();
          }}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 8 plan and quote

export function PlanView({ md }: { md: string }) {
  // A tiny Markdown subset: # title, ## headings, - bullets, paragraphs, **bold**.
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p));
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((x, i) => <li key={i}>{bold(x)}</li>)}</ul>);
    list = [];
  };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (/^[-*•]\s+/.test(line)) {
      list.push(line.replace(/^[-*•]\s+/, ""));
      continue;
    }
    flush();
    if (!line) continue;
    if (line.startsWith("## ")) blocks.push(<h3 key={blocks.length}>{line.slice(3)}</h3>);
    else if (line.startsWith("# ")) blocks.push(<h2 key={blocks.length}>{line.slice(2)}</h2>);
    else blocks.push(<p key={blocks.length}>{bold(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <div className={c.planBox}>{blocks}</div>;
}

// The plan is always fetched on arrival: the server returns the saved plan when nothing has
// changed, and writes a new one when the writer went back and changed an answer.
export function PlanStep({ id, lang, onFinal }: StepProps) {
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof makePlanAction>> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [change, setChange] = useState("");
  const [tick, setTick] = useState(false);
  const [paid, setPaid] = useState<{ amount: number; online: boolean } | null>(null);
  const started = useRef(false);

  async function load(changeText?: string) {
    if (!id) return;
    setBusy(true);
    setError("");
    const res = await makePlanAction(id, changeText);
    setBusy(false);
    if (res.stopped) return onFinal?.("needs_human", res.error ?? "");
    if (res.error) return setError(res.error);
    setPlan(res);
    setChange("");
    setTick(false);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startTransition(() => {
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first plan once
  }, []);

  if (busy) return <p className={c.working} role="status">{w("writingPlan", lang)}</p>;
  if (!plan?.plan)
    return (
      <>
        <p className={h.ideaError}>{error}</p>
        <Next lang={lang} onClick={() => load()} label={w("tryAgain", lang)} />
      </>
    );

  const q = plan.quote!;
  if (paid && id)
    return (
      <div className={h.ideaSent} role="status">
        <p>{w(paid.online ? "approved" : "payLater", lang, { s: money(paid.amount) })}</p>
        {paid.online && <PayButton id={id} kind="sample" amount={paid.amount} />}
      </div>
    );
  return (
    <>
      <PlanView md={plan.plan} />
      <div className={c.priceBox}>
        <p>{w("price", lang)}</p>
        <p className={c.bigPrice}>{money(q.total)}</p>
        <p>{w("advance", lang, { s: money(q.sample), a: money(q.advance), f: money(q.final) })}</p>
        {q.episodes > 1 && <p>{w("episodesPrice", lang, { e: q.episodes })}</p>}
        <p className={c.small}>{w("delivery", lang, { m: q.minutes, d: q.days })}</p>
        <p className={c.small}>{w("freeSample", lang, { s: money(q.sample) })}</p>
      </div>

      {(plan.roundsLeft ?? 0) > 0 ? (
        <form
          className={`${h.ideaForm} ${c.form}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (change.trim()) load(change);
          }}
        >
          <label className={h.field}>
            {w("changeAsk", lang, { n: plan.roundsLeft ?? 0 })}
            <textarea rows={3} maxLength={800} value={change} onChange={(e) => setChange(e.target.value)} />
          </label>
          <button type="submit" className={c.navBack} disabled={!change.trim()}>
            {w("changeBtn", lang)}
          </button>
        </form>
      ) : (
        <button
          type="button"
          className={c.navBack}
          onClick={async () => {
            if (id && (await discussPlan(id)).ok) onFinal?.("needs_human", w("discussed", lang));
          }}
        >
          {w("discuss", lang)}
        </button>
      )}

      <form
        className={`${h.ideaForm} ${c.form}`}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!id) return;
          const data = new FormData(e.currentTarget);
          const res = await approvePlan(id, data);
          if (res.ok) setPaid({ amount: res.pay?.amount ?? q.sample, online: !!res.pay?.online });
          else setError(res.error ?? "");
        }}
      >
        <input type="hidden" name="version" value={plan.version} />
        <ConsentTicks kinds={["plan_baseline"]} lang={lang} ticks={{ plan_baseline: tick }} setTicks={(x) => setTick(!!x.plan_baseline)} summary={false} />
        {error && (
          <p className={h.ideaError} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={h.ideaSend} disabled={!tick}>
          {w("approve", lang)}
        </button>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- voice notes (principle 4)

export function VoiceNote({ id, lang, onText }: { id: string; lang: Lang; onText: (s: string) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => parts.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        setBusy(true);
        const form = new FormData();
        form.set("audio", new File(parts, "note.webm", { type: r.mimeType || "audio/webm" }));
        const res = await transcribe(id, form);
        setBusy(false);
        if (res.text) onText(res.text);
        else setError(res.error ?? "");
      };
      r.start();
      setRec(r);
      setTimeout(() => r.state === "recording" && r.stop(), 180_000);
    } catch {
      setError("The microphone isn’t available. Please type instead.");
    }
  }

  return (
    <>
      {rec?.state === "recording" ? (
        <button
          type="button"
          className={c.recBtn}
          onClick={() => {
            rec.stop();
            setRec(null);
          }}
        >
          ■ {t(UI.stopRec, lang)} · {w("recording", lang)}
        </button>
      ) : (
        <button type="button" className={c.recBtn} onClick={start} disabled={busy}>
          🎙 {busy ? w("saving", lang) : t(UI.speak, lang)}
        </button>
      )}
      {error && <span className={c.formNote}>{error}</span>}
    </>
  );
}
