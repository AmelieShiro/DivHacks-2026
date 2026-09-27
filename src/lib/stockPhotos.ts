/**
 * Real photos of children doing each kind of activity, from Wikimedia
 * Commons, shown when a provider's own site has no photo that is clearly of
 * children or an activity. They illustrate the subject, not this program or
 * place; each carries a credit linking to its source.
 *
 * Files live in public/stock/, resized to 1200x800. Every one is public
 * domain, CC BY 2.0 or CC BY-SA 4.0; the latter two require the credit below.
 */
export type StockPhoto = { src: string; alt: string; credit: string; source: string };

const COMMONS = "https://commons.wikimedia.org/wiki/File:";

export const STOCK_PHOTOS = {
  robotics: {
    src: "/stock/robotics.jpg",
    alt: "Children testing a LEGO robot on a competition mat",
    credit: "Cpl. Joey Holeman, USMC · Public domain",
    source: `${COMMONS}DoDEA_Okinawa_schools_compete_at_robotics_competition_141206-M-PU373-025.jpg`,
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
    alt: "A girl doing a hands-on science experiment",
    credit: "U.S. Marine Corps · Public domain",
    source: `${COMMONS}USMC-100522-M-1298M-021.jpg`,
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
    alt: "Children in chef hats learning to cook with a chef",
    credit: "Petty Officer 2nd Class Kegan Kay, U.S. Navy · Public domain",
    source: `${COMMONS}Cooking_contest_140418-N-OX321-101.jpg`,
  },
  art: {
    src: "/stock/art.jpg",
    alt: "Two children painting at a table",
    credit: "U.S. National Archives · Public domain",
    source: `${COMMONS}Class_at_the_Lynchburg_Art_Gallery_in_Lynchburg,_Virginia_-_NARA_-_196005.tif`,
  },
  music: {
    src: "/stock/music.jpg",
    alt: "A teacher leading an elementary music class",
    credit: "Spc. Paul Durrance, U.S. Army · Public domain",
    source: `${COMMONS}Music_class_140210-A-FV345-241.jpg`,
  },
  dance: {
    src: "/stock/dance.jpg",
    alt: "Children dancing together in a school gym",
    credit: "Airman 1st Class Justin Veazie, U.S. Air Force · Public domain",
    source: `${COMMONS}Children_dancing_to_Gangnam_Style.jpg`,
  },
  reading: {
    src: "/stock/reading.jpg",
    alt: "Children reading books at a table",
    credit: "Shixart1985 · CC BY 2.0",
    source: `${COMMONS}Children_engaged_in_reading_and_photography_activities_indoors_in_a_warm.jpg`,
  },
  sports: {
    src: "/stock/sports.jpg",
    alt: "Young children at basketball practice with a coach",
    credit: "U.S. Navy · Public domain",
    source: `${COMMONS}US_Navy_091206-N-2013O-017_Lade_Majic,_Harlem_Ambassadors_basketball_team_coach_and_player,_demonstrates_proper_passing_techniques_to_children_during_a_basketball_camp_sponsored_by_Yokosuka_Morale,_Welfare_and_Recreation_Youth.jpg`,
  },
  default: {
    src: "/stock/default.jpg",
    alt: "A class of children raising their hands",
    credit: "Petty Officer 2nd Class Samuel Weldin, U.S. Navy · Public domain",
    source: `${COMMONS}Misawa_Sailors_Visit_Japanese_After_School_Program_for_the_Holidays_161219-N-OK605-167.jpg`,
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

export function stockFor(subjects: string[]): StockPhoto {
  const lower = subjects.map((s) => s.toLowerCase());
  const hit = BY_SUBJECT.find(([, re]) => lower.some((s) => re.test(s)));
  return STOCK_PHOTOS[hit?.[0] ?? "default"];
}

/**
 * Provider photos were never looked at by a person or a model, and most are
 * site banners: "Donate", housing, senior services, staff. Without a vision
 * model the only evidence is the caption, file name and page, so a photo is
 * used only when those point to children or an activity and nothing points
 * elsewhere.
 */
const ABOUT_KIDS =
  /\b(kids?|child|children|students?|youth|camp|after ?school|compass|sonyc|classroom|stem|steam|robot(ics)?|chess|lego|art|painting|science|gardening|summer|elementary|play(ing)?|learn(ing)?)\b/i;
const NOT_KIDS =
  /\b(seniors?|older|adults?|staff|board|gala|donate|donation|give|homeless(ness)?|housing|clinic|health|food|pantry|logo|banner|contact|help|office|building|ceo|director|team|volunteers?|jobs?|careers?|tenants?|rent|legal|scholarship|award|calendar|flyer|map|hero|slides?|slider|header|quote|apply|how ?to|history|mother|father|podcast|justice|leaders|category|rally)\b/i;
/** File names written as one run-together word ("HOWTOAPPLYFORAFTERSCHOOL..."). */
const NOT_KIDS_ANYWHERE = /howtoapply|register|enroll|flyer|logo/i;

export function looksLikeKidsPhoto(photo: { url: string; caption: string | null; sourcePage: string }): boolean {
  const caption = photo.caption && photo.caption !== "og:image" ? photo.caption : "";
  const file = decodeURIComponent(photo.url.split(/[?#]/)[0].split("/").pop() ?? "");
  const page = photo.sourcePage.replace(/^https?:\/\/[^/]+/, "");
  const text = `${caption} ${file} ${page}`.replace(/[_\-./]+/g, " ");
  return ABOUT_KIDS.test(text) && !NOT_KIDS.test(text) && !NOT_KIDS_ANYWHERE.test(file);
}
