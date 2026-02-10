/**
 * Astrology and BaZi (八字) calculation utilities.
 * Computes Western zodiac sign, Chinese zodiac, heavenly stems/earthly branches,
 * five elements, and BaZi four pillars based on birth date and time.
 */

// 天干 (Heavenly Stems)
const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
// 地支 (Earthly Branches)
const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
// 生肖 (Chinese Zodiac)
const CHINESE_ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
// 五行 for heavenly stems
const STEM_ELEMENTS = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
// 五行 for earthly branches
const BRANCH_ELEMENTS = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];

// 时辰 mapping: hour (0-23) to earthly branch index
const HOUR_TO_BRANCH: number[] = [
  0, 0,   // 23:00-00:59 子
  1, 1,   // 01:00-02:59 丑
  2, 2,   // 03:00-04:59 寅
  3, 3,   // 05:00-06:59 卯
  4, 4,   // 07:00-08:59 辰
  5, 5,   // 09:00-10:59 巳
  6, 6,   // 11:00-12:59 午
  7, 7,   // 13:00-14:59 未
  8, 8,   // 15:00-16:59 申
  9, 9,   // 17:00-18:59 酉
  10, 10, // 19:00-20:59 戌
  11, 11, // 21:00-22:59 亥
];

// Western zodiac signs with date boundaries
const WESTERN_ZODIAC = [
  { sign: '摩羯座', signEn: 'Capricorn', startMonth: 12, startDay: 22, endMonth: 1, endDay: 19 },
  { sign: '水瓶座', signEn: 'Aquarius', startMonth: 1, startDay: 20, endMonth: 2, endDay: 18 },
  { sign: '双鱼座', signEn: 'Pisces', startMonth: 2, startDay: 19, endMonth: 3, endDay: 20 },
  { sign: '白羊座', signEn: 'Aries', startMonth: 3, startDay: 21, endMonth: 4, endDay: 19 },
  { sign: '金牛座', signEn: 'Taurus', startMonth: 4, startDay: 20, endMonth: 5, endDay: 20 },
  { sign: '双子座', signEn: 'Gemini', startMonth: 5, startDay: 21, endMonth: 6, endDay: 21 },
  { sign: '巨蟹座', signEn: 'Cancer', startMonth: 6, startDay: 22, endMonth: 7, endDay: 22 },
  { sign: '狮子座', signEn: 'Leo', startMonth: 7, startDay: 23, endMonth: 8, endDay: 22 },
  { sign: '处女座', signEn: 'Virgo', startMonth: 8, startDay: 23, endMonth: 9, endDay: 22 },
  { sign: '天秤座', signEn: 'Libra', startMonth: 9, startDay: 23, endMonth: 10, endDay: 23 },
  { sign: '天蝎座', signEn: 'Scorpio', startMonth: 10, startDay: 24, endMonth: 11, endDay: 22 },
  { sign: '射手座', signEn: 'Sagittarius', startMonth: 11, startDay: 23, endMonth: 12, endDay: 21 },
];

/**
 * Get Western zodiac sign from month and day.
 */
export const getWesternZodiac = (month: number, day: number): { sign: string; signEn: string } => {
  for (const z of WESTERN_ZODIAC) {
    if (z.startMonth === z.endMonth) {
      if (month === z.startMonth && day >= z.startDay && day <= z.endDay) {
        return { sign: z.sign, signEn: z.signEn };
      }
    } else if (z.startMonth > z.endMonth) {
      // Capricorn wraps around year end
      if ((month === z.startMonth && day >= z.startDay) || (month === z.endMonth && day <= z.endDay)) {
        return { sign: z.sign, signEn: z.signEn };
      }
    } else {
      if ((month === z.startMonth && day >= z.startDay) || (month === z.endMonth && day <= z.endDay)) {
        return { sign: z.sign, signEn: z.signEn };
      }
    }
  }
  return { sign: '未知', signEn: 'Unknown' };
};

/**
 * Get Chinese zodiac animal from year.
 */
export const getChineseZodiac = (year: number): string => {
  // 1900 is 庚子年 (Rat year), index 0
  return CHINESE_ZODIAC[(year - 4) % 12];
};

/**
 * Calculate year pillar (年柱) heavenly stem and earthly branch.
 */
const getYearPillar = (year: number): { stem: string; branch: string } => {
  const stemIndex = (year - 4) % 10;
  const branchIndex = (year - 4) % 12;
  return {
    stem: HEAVENLY_STEMS[stemIndex],
    branch: EARTHLY_BRANCHES[branchIndex],
  };
};

/**
 * Calculate month pillar (月柱).
 * Uses solar month approximation. The month stem depends on the year stem.
 */
const getMonthPillar = (year: number, month: number): { stem: string; branch: string } => {
  // Month branch: 寅(1月/Feb) maps to index 2, and cycles
  // Solar month 1(Jan) -> 丑(index 1), month 2(Feb) -> 寅(index 2), etc.
  const branchIndex = (month + 1) % 12;

  // Month stem is derived from year stem:
  // 甲/己 year -> month starts from 丙寅
  // 乙/庚 year -> month starts from 戊寅
  // 丙/辛 year -> month starts from 庚寅
  // 丁/壬 year -> month starts from 壬寅
  // 戊/癸 year -> month starts from 甲寅
  const yearStemIndex = (year - 4) % 10;
  const baseStems = [2, 4, 6, 8, 0]; // 丙=2, 戊=4, 庚=6, 壬=8, 甲=0
  const baseStem = baseStems[Math.floor(yearStemIndex / 2) % 5];
  const stemIndex = (baseStem + (month - 1)) % 10;

  return {
    stem: HEAVENLY_STEMS[stemIndex],
    branch: EARTHLY_BRANCHES[branchIndex],
  };
};

/**
 * Calculate day pillar (日柱).
 * Uses a reference date method for solar calendar day pillar calculation.
 */
const getDayPillar = (year: number, month: number, day: number): { stem: string; branch: string } => {
  // Reference: Jan 1, 1900 is 甲子日 (stem=0, branch=0) — actually it was 甲戌
  // We use a simplified formula based on Julian Day Number
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;

  // Reference: JDN 2415021 = Jan 1, 1900 = 甲戌日 (stem=0, branch=10)
  const refJdn = 2415021;
  const refStem = 0;  // 甲
  const refBranch = 10; // 戌

  const diff = jdn - refJdn;
  const stemIndex = ((diff % 10) + refStem + 10) % 10;
  const branchIndex = ((diff % 12) + refBranch + 12) % 12;

  return {
    stem: HEAVENLY_STEMS[stemIndex],
    branch: EARTHLY_BRANCHES[branchIndex],
  };
};

/**
 * Calculate hour pillar (时柱).
 * The hour stem depends on the day stem.
 */
const getHourPillar = (year: number, month: number, day: number, hour: number): { stem: string; branch: string } => {
  const adjustedHour = hour === 23 ? 0 : hour;
  const branchIndex = HOUR_TO_BRANCH[adjustedHour];
  const dayPillar = getDayPillar(year, month, day);
  const dayStemIndex = HEAVENLY_STEMS.indexOf(dayPillar.stem);

  // Hour stem is derived from day stem:
  // 甲/己日 -> 子时 from 甲
  // 乙/庚日 -> 子时 from 丙
  // 丙/辛日 -> 子时 from 戊
  // 丁/壬日 -> 子时 from 庚
  // 戊/癸日 -> 子时 from 壬
  const baseStems = [0, 2, 4, 6, 8]; // 甲=0, 丙=2, 戊=4, 庚=6, 壬=8
  const baseStem = baseStems[dayStemIndex % 5];
  const stemIndex = (baseStem + branchIndex) % 10;

  return {
    stem: HEAVENLY_STEMS[stemIndex],
    branch: EARTHLY_BRANCHES[branchIndex],
  };
};

/**
 * Get five elements summary from BaZi pillars.
 */
const getFiveElementsSummary = (pillars: Array<{ stem: string; branch: string }>): Record<string, number> => {
  const counts: Record<string, number> = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 };
  for (const p of pillars) {
    const stemIdx = HEAVENLY_STEMS.indexOf(p.stem);
    const branchIdx = EARTHLY_BRANCHES.indexOf(p.branch);
    if (stemIdx >= 0) counts[STEM_ELEMENTS[stemIdx]]++;
    if (branchIdx >= 0) counts[BRANCH_ELEMENTS[branchIdx]]++;
  }
  return counts;
};

export interface BaZiResult {
  yearPillar: string;
  monthPillar: string;
  dayPillar: string;
  hourPillar: string | null;
  zodiac: string;
  westernZodiac: string;
  westernZodiacEn: string;
  fiveElements: Record<string, number>;
  fiveElementsSummary: string;
  dayMaster: string;
  dayMasterElement: string;
}

/**
 * Calculate complete BaZi (八字) information.
 * @param birthDate - date string in YYYY-MM-DD format
 * @param birthTime - optional time string in HH:mm format
 */
export const calculateBaZi = (birthDate: string, birthTime?: string): BaZiResult | null => {
  try {
    const parts = birthDate.split('-');
    if (parts.length !== 3) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;

    const yearP = getYearPillar(year);
    const monthP = getMonthPillar(year, month);
    const dayP = getDayPillar(year, month, day);

    let hourP: { stem: string; branch: string } | null = null;
    if (birthTime) {
      const timeParts = birthTime.split(':');
      if (timeParts.length >= 2) {
        const hour = parseInt(timeParts[0], 10);
        if (!isNaN(hour) && hour >= 0 && hour <= 23) {
          hourP = getHourPillar(year, month, day, hour);
        }
      }
    }

    const pillars = [yearP, monthP, dayP];
    if (hourP) pillars.push(hourP);

    const fiveElements = getFiveElementsSummary(pillars);
    const western = getWesternZodiac(month, day);
    const zodiac = getChineseZodiac(year);

    // Day master (日主) is the day pillar's heavenly stem
    const dayMaster = dayP.stem;
    const dayMasterElement = STEM_ELEMENTS[HEAVENLY_STEMS.indexOf(dayMaster)];

    // Five elements summary
    const elementEntries = Object.entries(fiveElements)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a);
    const missing = Object.entries(fiveElements)
      .filter(([, v]) => v === 0)
      .map(([k]) => k);
    let summary = elementEntries.map(([k, v]) => `${k}${v}`).join('、');
    if (missing.length > 0) {
      summary += `；缺${missing.join('、')}`;
    }

    return {
      yearPillar: `${yearP.stem}${yearP.branch}`,
      monthPillar: `${monthP.stem}${monthP.branch}`,
      dayPillar: `${dayP.stem}${dayP.branch}`,
      hourPillar: hourP ? `${hourP.stem}${hourP.branch}` : null,
      zodiac,
      westernZodiac: western.sign,
      westernZodiacEn: western.signEn,
      fiveElements,
      fiveElementsSummary: summary,
      dayMaster,
      dayMasterElement,
    };
  } catch {
    return null;
  }
};

/**
 * Generate a human-readable astrology context string for LLM prompts.
 */
export const generateAstrologyContext = (birthDate: string, birthTime?: string): string => {
  const bazi = calculateBaZi(birthDate, birthTime);
  if (!bazi) return '';

  const parts: string[] = [];
  parts.push(`出生日期：${birthDate}`);
  if (birthTime) parts.push(`出生时辰：${birthTime}`);
  parts.push(`星座：${bazi.westernZodiac}`);
  parts.push(`生肖：${bazi.zodiac}`);

  const fourPillars = birthTime && bazi.hourPillar
    ? `${bazi.yearPillar} ${bazi.monthPillar} ${bazi.dayPillar} ${bazi.hourPillar}`
    : `${bazi.yearPillar} ${bazi.monthPillar} ${bazi.dayPillar}`;
  parts.push(`八字：${fourPillars}`);
  parts.push(`日主：${bazi.dayMaster}（${bazi.dayMasterElement}）`);
  parts.push(`五行分布：${bazi.fiveElementsSummary}`);

  return parts.join('，');
};
