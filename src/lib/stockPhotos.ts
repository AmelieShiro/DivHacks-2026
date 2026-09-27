/**
 * Real photos of children doing each kind of activity, from Wikimedia
 * Commons, shown when a provider's own site has no photo that is clearly of
 * children or an activity. They illustrate the subject, not this program or
 * place; each carries a credit linking to its source.
 *
 * Files live in public/stock/. Every one is public domain or CC BY / CC BY-SA
 * (credit required, given below). None is from a military setting: see
 * scripts/lib/stock-filters.mjs.
 */
export type StockPhoto = { src: string; alt: string; credit: string; source: string };

const COMMONS = "https://commons.wikimedia.org/wiki/File:";

export const STOCK_PHOTOS = {
  robotics: {
    src: "/stock/robotics.jpg",
    alt: "A boy wiring up a LEGO robot with his teacher",
    credit: "Jannua · CC BY-SA 4.0",
    source: `${COMMONS}Kids_Constructing_Robotics_7.jpg`,
  },
  coding: {
    src: "/stock/coding.jpg",
    alt: "Elementary students working on computers in a classroom",
    credit: "Virginia Department of Education · CC BY 2.0",
    source: `${COMMONS}Alexandria_City_Public_Schools_(32502364774).jpg`,
  },
  chess: {
    src: "/stock/chess.jpg",
    alt: "Young children playing chess at outdoor tables with a coach",
    credit: "Bbosa Kevin · CC BY-SA 4.0",
    source: `${COMMONS}HBA_BASKETBALL_YOUNG_STARS_PLAYING_CHESS_07.jpg`,
  },
  engineering: {
    src: "/stock/engineering.jpg",
    alt: "Young children with the towers they built from building blocks",
    credit: "Pigbook163 · CC BY-SA 4.0",
    source: `${COMMONS}%E4%BC%98%E4%BC%98%E4%B8%8A%E4%B9%90%E9%AB%98%E8%AF%BE%E5%90%8E%E7%9A%84%E7%85%A7%E7%89%87_02.jpg`,
  },
  science: {
    src: "/stock/science.jpg",
    alt: "Children looking into a microscope with their teacher",
    credit: "Blue Plover · CC BY-SA 3.0",
    source: `${COMMONS}Students_use_microscope_LPB_Laos.jpg`,
  },
  gardening: {
    src: "/stock/gardening.jpg",
    alt: "Elementary students in their school garden",
    credit: "Virginia Department of Education · CC BY 2.0",
    source: `${COMMONS}JON_8-31-garden-3_(32648258574).jpg`,
  },
  math: {
    src: "/stock/math.jpg",
    alt: "Elementary students working at their desks",
    credit: "USDA · Public domain",
    source: `${COMMONS}FNS-Northwest_Elementary_School-Pennsylvania-lunch_(20241017-USDA-FNS-CDP-0302).jpg`,
  },
  cooking: {
    src: "/stock/cooking.jpg",
    alt: "Two children with the dish they are cooking and a cookbook",
    credit: "woodley wonderworks · CC BY 2.0",
    source: `${COMMONS}HomeschooledChildrenCooking.jpg`,
  },
  art: {
    src: "/stock/art.jpg",
    alt: "Two children painting at a table",
    credit: "U.S. National Archives · Public domain",
    source: `${COMMONS}Class_at_the_Lynchburg_Art_Gallery_in_Lynchburg,_Virginia_-_NARA_-_196005.tif`,
  },
  music: {
    src: "/stock/music.jpg",
    alt: "A smiling boy playing a drum",
    credit: "Sir Amugi · CC BY-SA 4.0",
    source: `${COMMONS}Children_learning_to_play_the_local_drum_in_northern_Region_of_Ghana_03.jpg`,
  },
  dance: {
    src: "/stock/dance.jpg",
    alt: "Young girls in a ballet class",
    credit: "Tommy Wong · CC BY 2.0",
    source: `${COMMONS}Girls_in_a_ballet_class;_November_2006_(02).jpg`,
  },
  reading: {
    src: "/stock/reading.jpg",
    alt: "Children reading books at a table",
    credit: "Shixart1985 · CC BY 2.0",
    source: `${COMMONS}Children_engaged_in_reading_and_photography_activities_indoors_in_a_warm.jpg`,
  },
  sports: {
    src: "/stock/sports.jpg",
    alt: "Boys playing basketball on an outdoor court",
    credit: "Kikaputv · CC BY-SA 4.0",
    source: `${COMMONS}Basketball_at_Simiyu_Tanzania_50.jpg`,
  },
  default: {
    src: "/stock/default.jpg",
    alt: "Children raising their hands during an outdoor lesson",
    credit: "Joshua Tree National Park · Public domain",
    source: `${COMMONS}Students_raise_hands_(25564212661).jpg`,
  },
} satisfies Record<string, StockPhoto>;

type StockKey = keyof typeof STOCK_PHOTOS;

/**
 * Most specific first, STEM before everything else: a program that teaches
 * robotics and sports is shown as robotics.
 */
const BY_SUBJECT: [StockKey, RegExp][] = [
  ["robotics", /^robotics$/],
  ["coding", /^(coding|computer science|game design|technology & digital media)$/],
  ["chess", /^chess$/],
  ["engineering", /^(engineering|maker & building|electronics|3d design & printing)$/],
  ["science", /^(biology|chemistry|physics|general science|earth & environmental science)$/],
  ["gardening", /^gardening$/],
  ["math", /^(mathematics|financial literacy)$/],
  ["cooking", /^cooking$/],
  ["art", /^(visual arts|crafts & sewing|animation|filmmaking & video)$/],
  ["music", /^music$/],
  ["dance", /^dance & theater$/],
  ["reading", /^(literacy & writing|languages|social studies)$/],
  ["sports", /^(sports & fitness|health & nutrition)$/],
];

export function subjectKey(subjects: string[]): StockKey {
  const lower = subjects.map((s) => s.toLowerCase());
  return BY_SUBJECT.find(([, re]) => lower.some((s) => re.test(s)))?.[0] ?? "default";
}

export function stockFor(subjects: string[]): StockPhoto {
  return STOCK_PHOTOS[subjectKey(subjects)];
}

type ProviderPhoto = {
  url: string;
  caption: string | null;
  sourcePage: string;
  width: number;
  height: number;
  judged: boolean;
  kind: string | null;
};

/** Words tying a photo to children or an activity. */
const ABOUT_KIDS =
  /\b(kids?|child|children|students?|youth|camp|after ?school|compass|sonyc|classroom|stem|steam|robot(ics)?|chess|lego|art|painting|science|gardening|summer|elementary|play(ing)?|learn(ing)?)\b/i;
/**
 * Words tying a photo to a provider's adult services or fundraising. These
 * agencies also run senior centres, housing, clinics and job training, and a
 * picture from those pages is not what a parent should see on a K-5 card.
 * Layout words ("banner", "hero", "slider") are deliberately NOT here: a
 * homepage hero is often the provider's best photo of kids.
 */
const ADULT_OR_FUNDRAISING =
  /\b(seniors?|older|elderly|adults?|staff|board|gala|donate|donation|homeless(ness)?|housing|clinic|health|food|pantry|ceo|director|volunteers?|jobs?|careers?|workforce|employment|tenants?|rent|legal|immigration|scholarship|podcast|justice|rally)\b/i;
/** Graphics rather than photographs, often written as one run-together word. */
const GRAPHIC =
  /logo|icon|circle|bubble|ellipse|shape|blob|wave|pattern|texture|background|\bbg\b|vector|illustration|graphic|placeholder|badge|avatar|sprite|arrow|divider|overlay|mockup|screenshot|rectangle|button|\bcta\b|\bmap\b|quote|flyer|howtoapply|register|enroll|give|\bgroup[-_ ]?\d+|linkedin|youtube|facebook|instagram|twitter|tiktok|newsletter|save[-_+ ]?the[-_+ ]?date|\bstd\b|campaign|category|popup|signup|contact|emptystate|slider[-_ ]?art|social[-_+ ]?post/i;

function photoText(photo: ProviderPhoto): { file: string; text: string } {
  const caption = photo.caption && photo.caption !== "og:image" ? photo.caption : "";
  const file = decodeURIComponent(photo.url.split(/[?#]/)[0].split("/").pop() ?? "");
  const page = photo.sourcePage.replace(/^https?:\/\/[^/]+/, "");
  return { file, text: `${caption} ${file} ${page}`.replace(/[_\-./]+/g, " ") };
}

/** A photograph rather than a web graphic: JPEG/WebP, or a large PNG, of a normal shape. */
function looksLikePhotograph(photo: ProviderPhoto, file: string): boolean {
  const ext = file.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
  const aspect = photo.width / Math.max(photo.height, 1);
  const format = ["jpg", "jpeg", "webp"].includes(ext) || (ext === "png" && photo.width >= 900);
  return format && aspect >= 0.75 && aspect <= 2.6;
}

/**
 * How good a provider photo is for a program card, best first, or null to
 * never use it:
 *   0  Gemini looked at it and judged it a real program photo
 *   1  its caption, file name or page points to children or an activity
 *   2  it is a photograph with nothing pointing to adults, fundraising or graphics
 * Without a vision model, 1 and 2 rest on text alone, so anything pointing at
 * adult services or graphics is out even if it also mentions kids.
 */
export function providerPhotoRank(photo: ProviderPhoto): 0 | 1 | 2 | null {
  if (photo.judged) return photo.kind === "program-photo" ? 0 : null;
  const { file, text } = photoText(photo);
  if (ADULT_OR_FUNDRAISING.test(text) || GRAPHIC.test(file) || GRAPHIC.test(photo.caption ?? "")) return null;
  if (ABOUT_KIDS.test(text)) return 1;
  return looksLikePhotograph(photo, file) ? 2 : null;
}
