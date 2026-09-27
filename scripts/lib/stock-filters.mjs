/**
 * Which Commons photos may illustrate an NYC after-school card.
 *
 * Commons' largest free source of "children doing activities" is the US
 * military's public-domain press photography: DoD schools abroad, base youth
 * centres, service members visiting classrooms, and older war-zone images
 * (one reviewed candidate was "US soldier with children at Hoc Mon
 * Orphanage"). None of it belongs on a card for a Brooklyn COMPASS program,
 * so any sign of a military setting in the title, credit or file name
 * excludes the photo, even if a reviewer accepted it.
 */
export const MILITARY =
  /\b(army|navy|naval|marines?|marine corps|usmc|air ?force|airm[ae]n|soldiers?|sailors?|seabees?|military|dodea|dod|defen[cs]e|corps of engineers|cerdec|national guard|troops?|petty officer|sgt|spc|cpl|pfc|seaman|veterans?|base|garrison|fort [a-z]+|mwr|morale,? welfare|uso|coast guard|orphanage|war|refugees?)\b|\b\d{6}-[A-Z]-[A-Z0-9]{2,6}-\d{2,4}\b|US_Navy|USMC-|USAF/i;

/** Title, credit and decoded source page: everything a photo says about itself. */
export const describe = (photo) =>
  `${photo.title ?? ""} ${photo.credit ?? ""} ${decodeURIComponent(photo.source ?? "")}`;

export const isMilitary = (photo) => MILITARY.test(describe(photo));
