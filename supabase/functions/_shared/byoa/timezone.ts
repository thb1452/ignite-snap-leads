// Resolve recipient local timezone for TCPA quiet-hours enforcement.
// Strategy: property zip → tz, fallback to area code → tz, final fallback America/New_York.

// Compact zip-prefix → IANA tz lookup (3-digit prefix is enough for state/regional accuracy).
const ZIP3_TZ: Record<string, string> = {
  // Northeast (ET)
  "010": "America/New_York", "011": "America/New_York", "012": "America/New_York",
  "013": "America/New_York", "014": "America/New_York", "015": "America/New_York",
  "016": "America/New_York", "017": "America/New_York", "018": "America/New_York",
  "019": "America/New_York", "020": "America/New_York", "021": "America/New_York",
  "022": "America/New_York", "023": "America/New_York", "024": "America/New_York",
  "025": "America/New_York", "026": "America/New_York", "027": "America/New_York",
  "028": "America/New_York", "029": "America/New_York",
  "030": "America/New_York", "031": "America/New_York", "032": "America/New_York",
  "033": "America/New_York", "034": "America/New_York", "035": "America/New_York",
  "036": "America/New_York", "037": "America/New_York", "038": "America/New_York",
  "039": "America/New_York", "040": "America/New_York", "041": "America/New_York",
  "042": "America/New_York", "043": "America/New_York", "044": "America/New_York",
  "045": "America/New_York", "046": "America/New_York", "047": "America/New_York",
  "048": "America/New_York", "049": "America/New_York", "050": "America/New_York",
  "051": "America/New_York", "052": "America/New_York", "053": "America/New_York",
  "054": "America/New_York", "055": "America/New_York", "056": "America/New_York",
  "057": "America/New_York", "058": "America/New_York", "059": "America/New_York",
  "060": "America/New_York", "061": "America/New_York", "062": "America/New_York",
  "063": "America/New_York", "064": "America/New_York", "065": "America/New_York",
  "066": "America/New_York", "067": "America/New_York", "068": "America/New_York",
  "069": "America/New_York", "070": "America/New_York", "071": "America/New_York",
  "072": "America/New_York", "073": "America/New_York", "074": "America/New_York",
  "075": "America/New_York", "076": "America/New_York", "077": "America/New_York",
  "078": "America/New_York", "079": "America/New_York", "080": "America/New_York",
  "081": "America/New_York", "082": "America/New_York", "083": "America/New_York",
  "084": "America/New_York", "085": "America/New_York", "086": "America/New_York",
  "087": "America/New_York", "088": "America/New_York", "089": "America/New_York",
  // NY/NJ/PA/DE/MD/DC/VA/WV/NC/SC/GA/FL — all ET
  // (100-349 covers NY through FL)
  // Bulk-fill below via helper at module load:
};
for (let i = 100; i <= 349; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/New_York";
// 350-369: AL (CT), 370-385: TN (mostly CT, some ET), 386-399: MS (CT)
for (let i = 350; i <= 369; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Chicago";
for (let i = 370; i <= 385; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Chicago";
for (let i = 386; i <= 399; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Chicago";
// 400-427: KY (mostly ET), 430-459: OH (ET)
for (let i = 400; i <= 427; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/New_York";
for (let i = 430; i <= 459; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/New_York";
// 460-479: IN (mostly ET, some CT) — default ET
for (let i = 460; i <= 479; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/New_York";
// 480-499: MI (ET)
for (let i = 480; i <= 499; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/New_York";
// 500-528: IA (CT), 530-549: WI (CT), 550-567: MN (CT)
for (let i = 500; i <= 567; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Chicago";
// 570-577: SD (mostly CT/MT) — default CT
for (let i = 570; i <= 577; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Chicago";
// 580-588: ND (CT/MT) — default CT
for (let i = 580; i <= 588; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Chicago";
// 590-599: MT (MT)
for (let i = 590; i <= 599; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Denver";
// 600-629: IL (CT), 630-658: MO (CT), 660-679: KS (CT), 680-693: NE (CT)
for (let i = 600; i <= 693; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Chicago";
// 700-714: LA (CT), 716-729: AR (CT)
for (let i = 700; i <= 729; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Chicago";
// 730-749: OK (CT), 750-799: TX (mostly CT, El Paso MT) — default CT
for (let i = 730; i <= 799; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Chicago";
// 800-816: CO (MT), 820-831: WY (MT), 832-838: ID (mostly MT, north PT) — default MT
for (let i = 800; i <= 838; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Denver";
// 840-847: UT (MT), 850-865: AZ (MST no DST — use Phoenix)
for (let i = 840; i <= 847; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Denver";
for (let i = 850; i <= 865; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Phoenix";
// 870-884: NM (MT)
for (let i = 870; i <= 884; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Denver";
// 889-898: NV (PT)
for (let i = 889; i <= 898; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Los_Angeles";
// 900-961: CA (PT), 970-979: OR (PT), 980-994: WA (PT)
for (let i = 900; i <= 961; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Los_Angeles";
for (let i = 970; i <= 994; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Los_Angeles";
// 995-999: AK
for (let i = 995; i <= 999; i++) ZIP3_TZ[String(i).padStart(3, "0")] = "America/Anchorage";
// 967-968: HI
ZIP3_TZ["967"] = "Pacific/Honolulu";
ZIP3_TZ["968"] = "Pacific/Honolulu";

// Area code → tz (best-effort; mobile portability means this is a fallback)
const AREA_CODE_TZ: Record<string, string> = {
  // ET
  "201": "America/New_York", "202": "America/New_York", "203": "America/New_York",
  "212": "America/New_York", "215": "America/New_York", "216": "America/New_York",
  "239": "America/New_York", "240": "America/New_York", "267": "America/New_York",
  "301": "America/New_York", "302": "America/New_York", "305": "America/New_York",
  "315": "America/New_York", "321": "America/New_York", "330": "America/New_York",
  "347": "America/New_York", "352": "America/New_York", "386": "America/New_York",
  "401": "America/New_York", "404": "America/New_York", "407": "America/New_York",
  "410": "America/New_York", "413": "America/New_York", "419": "America/New_York",
  "443": "America/New_York", "470": "America/New_York", "475": "America/New_York",
  "478": "America/New_York", "484": "America/New_York", "516": "America/New_York",
  "551": "America/New_York", "561": "America/New_York", "570": "America/New_York",
  "585": "America/New_York", "603": "America/New_York", "607": "America/New_York",
  "609": "America/New_York", "610": "America/New_York", "631": "America/New_York",
  "646": "America/New_York", "678": "America/New_York", "703": "America/New_York",
  "704": "America/New_York", "716": "America/New_York", "717": "America/New_York",
  "718": "America/New_York", "724": "America/New_York", "727": "America/New_York",
  "732": "America/New_York", "754": "America/New_York", "757": "America/New_York",
  "770": "America/New_York", "772": "America/New_York", "774": "America/New_York",
  "781": "America/New_York", "786": "America/New_York", "802": "America/New_York",
  "803": "America/New_York", "804": "America/New_York", "813": "America/New_York",
  "843": "America/New_York", "845": "America/New_York", "848": "America/New_York",
  "856": "America/New_York", "857": "America/New_York", "860": "America/New_York",
  "862": "America/New_York", "863": "America/New_York", "864": "America/New_York",
  "904": "America/New_York", "908": "America/New_York", "910": "America/New_York",
  "912": "America/New_York", "914": "America/New_York", "917": "America/New_York",
  "919": "America/New_York", "929": "America/New_York", "934": "America/New_York",
  "941": "America/New_York", "954": "America/New_York", "973": "America/New_York",
  "978": "America/New_York", "980": "America/New_York", "984": "America/New_York",
  // CT
  "205": "America/Chicago", "210": "America/Chicago", "214": "America/Chicago",
  "217": "America/Chicago", "218": "America/Chicago", "224": "America/Chicago",
  "225": "America/Chicago", "228": "America/Chicago", "251": "America/Chicago",
  "254": "America/Chicago", "256": "America/Chicago", "262": "America/Chicago",
  "270": "America/Chicago", "281": "America/Chicago", "309": "America/Chicago",
  "312": "America/Chicago", "314": "America/Chicago", "316": "America/Chicago",
  "317": "America/Chicago", "318": "America/Chicago", "319": "America/Chicago",
  "320": "America/Chicago", "337": "America/Chicago", "346": "America/Chicago",
  "361": "America/Chicago", "405": "America/Chicago", "409": "America/Chicago",
  "414": "America/Chicago", "417": "America/Chicago", "430": "America/Chicago",
  "432": "America/Chicago", "469": "America/Chicago", "479": "America/Chicago",
  "501": "America/Chicago", "504": "America/Chicago", "507": "America/Chicago",
  "512": "America/Chicago", "515": "America/Chicago", "563": "America/Chicago",
  "573": "America/Chicago", "601": "America/Chicago", "608": "America/Chicago",
  "612": "America/Chicago", "615": "America/Chicago", "618": "America/Chicago",
  "636": "America/Chicago", "651": "America/Chicago", "660": "America/Chicago",
  "662": "America/Chicago", "682": "America/Chicago", "708": "America/Chicago",
  "713": "America/Chicago", "715": "America/Chicago", "731": "America/Chicago",
  "763": "America/Chicago", "769": "America/Chicago", "773": "America/Chicago",
  "779": "America/Chicago", "785": "America/Chicago", "806": "America/Chicago",
  "815": "America/Chicago", "816": "America/Chicago", "817": "America/Chicago",
  "830": "America/Chicago", "832": "America/Chicago", "847": "America/Chicago",
  "870": "America/Chicago", "872": "America/Chicago", "901": "America/Chicago",
  "913": "America/Chicago", "915": "America/Chicago", "918": "America/Chicago",
  "920": "America/Chicago", "931": "America/Chicago", "936": "America/Chicago",
  "940": "America/Chicago", "952": "America/Chicago", "956": "America/Chicago",
  "972": "America/Chicago", "979": "America/Chicago", "985": "America/Chicago",
  // MT
  "303": "America/Denver", "307": "America/Denver", "385": "America/Denver",
  "406": "America/Denver", "435": "America/Denver", "505": "America/Denver",
  "575": "America/Denver", "719": "America/Denver", "720": "America/Denver",
  "801": "America/Denver", "970": "America/Denver",
  // MST no DST (Arizona)
  "480": "America/Phoenix", "520": "America/Phoenix", "602": "America/Phoenix",
  "623": "America/Phoenix", "928": "America/Phoenix",
  // PT
  "206": "America/Los_Angeles", "209": "America/Los_Angeles", "213": "America/Los_Angeles",
  "253": "America/Los_Angeles", "310": "America/Los_Angeles", "323": "America/Los_Angeles",
  "360": "America/Los_Angeles", "415": "America/Los_Angeles", "424": "America/Los_Angeles",
  "425": "America/Los_Angeles", "442": "America/Los_Angeles", "503": "America/Los_Angeles",
  "509": "America/Los_Angeles", "510": "America/Los_Angeles", "530": "America/Los_Angeles",
  "541": "America/Los_Angeles", "559": "America/Los_Angeles", "562": "America/Los_Angeles",
  "619": "America/Los_Angeles", "626": "America/Los_Angeles", "650": "America/Los_Angeles",
  "657": "America/Los_Angeles", "661": "America/Los_Angeles", "669": "America/Los_Angeles",
  "707": "America/Los_Angeles", "714": "America/Los_Angeles", "747": "America/Los_Angeles",
  "760": "America/Los_Angeles", "775": "America/Los_Angeles", "805": "America/Los_Angeles",
  "818": "America/Los_Angeles", "831": "America/Los_Angeles", "858": "America/Los_Angeles",
  "909": "America/Los_Angeles", "916": "America/Los_Angeles", "925": "America/Los_Angeles",
  "949": "America/Los_Angeles", "951": "America/Los_Angeles", "971": "America/Los_Angeles",
  // AK / HI
  "907": "America/Anchorage",
  "808": "Pacific/Honolulu",
};

const DEFAULT_TZ = "America/New_York";

export function tzFromZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const m = zip.replace(/\s+/g, "").match(/^(\d{3})/);
  if (!m) return null;
  return ZIP3_TZ[m[1]] ?? null;
}

export function tzFromPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  // E.164 US: +1XXXXXXXXXX → area code is digits[1..3]
  // 10-digit: digits[0..2]
  let area: string | null = null;
  if (digits.length === 11 && digits.startsWith("1")) area = digits.slice(1, 4);
  else if (digits.length === 10) area = digits.slice(0, 3);
  if (!area) return null;
  return AREA_CODE_TZ[area] ?? null;
}

// State → default tz (used as 1st-priority fallback when zip3 lookup misses).
const STATE_TZ: Record<string, string> = {
  ME: "America/New_York", NH: "America/New_York", VT: "America/New_York",
  MA: "America/New_York", RI: "America/New_York", CT: "America/New_York",
  NY: "America/New_York", NJ: "America/New_York", PA: "America/New_York",
  DE: "America/New_York", MD: "America/New_York", DC: "America/New_York",
  VA: "America/New_York", WV: "America/New_York", NC: "America/New_York",
  SC: "America/New_York", GA: "America/New_York", FL: "America/New_York",
  OH: "America/New_York", MI: "America/New_York", IN: "America/New_York",
  KY: "America/New_York",
  AL: "America/Chicago", MS: "America/Chicago", TN: "America/Chicago",
  IL: "America/Chicago", WI: "America/Chicago", MN: "America/Chicago",
  IA: "America/Chicago", MO: "America/Chicago", AR: "America/Chicago",
  LA: "America/Chicago", OK: "America/Chicago", TX: "America/Chicago",
  KS: "America/Chicago", NE: "America/Chicago", SD: "America/Chicago",
  ND: "America/Chicago",
  MT: "America/Denver", WY: "America/Denver", CO: "America/Denver",
  NM: "America/Denver", UT: "America/Denver", ID: "America/Denver",
  AZ: "America/Phoenix",
  NV: "America/Los_Angeles", CA: "America/Los_Angeles",
  OR: "America/Los_Angeles", WA: "America/Los_Angeles",
  AK: "America/Anchorage", HI: "Pacific/Honolulu",
};

export function tzFromState(state: string | null | undefined): string | null {
  if (!state) return null;
  return STATE_TZ[state.toUpperCase()] ?? null;
}

export interface TimezoneResolution {
  tz: string;
  source: "state" | "zip" | "area_code" | "default";
}

/**
 * Priority order:
 *  1. property state (most reliable for owners — TCPA cares about recipient location)
 *  2. property zip3
 *  3. phone area code (least reliable due to mobile portability)
 *  4. default America/New_York
 *
 * Returns both tz and source so callers can log fallback usage and improve mapping over time.
 */
export function resolveRecipientTimezoneVerbose(opts: {
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
}): TimezoneResolution {
  const stateTz = tzFromState(opts.state);
  if (stateTz) return { tz: stateTz, source: "state" };
  const zipTz = tzFromZip(opts.zip);
  if (zipTz) return { tz: zipTz, source: "zip" };
  const areaTz = tzFromPhone(opts.phone);
  if (areaTz) return { tz: areaTz, source: "area_code" };
  return { tz: DEFAULT_TZ, source: "default" };
}

export function resolveRecipientTimezone(opts: {
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
}): string {
  return resolveRecipientTimezoneVerbose(opts).tz;
}

/**
 * Get the recipient's local hour (0-23) right now, in their timezone.
 * Uses Intl.DateTimeFormat — no external lib needed.
 */
export function localHourInTz(tz: string, at: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(at);
  const hourPart = parts.find((p) => p.type === "hour");
  const h = hourPart ? parseInt(hourPart.value, 10) : NaN;
  // Intl can return "24" for midnight in some runtimes; normalize.
  return Number.isFinite(h) ? h % 24 : 12;
}
