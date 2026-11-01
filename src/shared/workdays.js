// Working days in a Vietnamese office, as plain functions of the date (the office and the tests agree on them): Monday
// to Friday, except the public holidays. The law gives these (Bộ luật Lao động 2019, Điều 112): Tết Dương lịch (1/1),
// Tết Âm lịch (5 days), Giỗ Tổ Hùng Vương (10/3 âm lịch), 30/4, 1/5, Quốc khánh (2/9 and a day beside it); and from 2026
// Ngày Văn hóa Việt Nam (24/11: the National Assembly's resolution on developing Vietnamese culture, 24/4/2026, Điều 2).
// A holiday on a Saturday or a Sunday is taken on the next working day (Điều 111.3). Which five days of Tết, and which
// day beside 2/9, the Government announces each year (Bộ Nội vụ's notice, for public servants; most companies follow
// it): the years announced are in ANNOUNCED, with the notice; any other year follows the usual pattern (the last day of
// the lunar year and the first four of the new one; 1/9).

const pad = (n) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' of a date, local time */
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (y, md) => new Date(`${y}-${md}T12:00:00`);
const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekend = (d) => d.getDay() === 0 || d.getDay() === 6;

// the lunar new year's day (mùng 1 Tết) by the Vietnamese calendar (UTC+7: in 2027 it is a day before China's), and
// Giỗ Tổ (10/3 âm lịch)
export const TET = { 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23', 2032: '02-11', 2033: '01-31' };
const HUNG = { 2026: '04-26', 2027: '04-16', 2028: '04-04', 2029: '04-23', 2030: '04-12', 2031: '04-01', 2032: '04-19', 2033: '04-09' };

/* The years the Government has announced: the five days of Tết and the day beside 2/9 (the rest is in the law).
   2026: Tết from 29 tháng Chạp (16/2) to mùng 4 (20/2), nine days off with the weekends (Bộ Nội vụ, Thông báo
         9441/TB-BNV, 16/10/2025); Quốc khánh 1/9 and 2/9 (the same notice).
   2027: Tết 28 and 29 tháng Chạp (4/2, 5/2) and mùng 1–3 (6/2–8/2), two of them on the weekend so taken on 9/2 and
         10/2: seven days, 4/2–10/2; Quốc khánh 2/9 and 3/9, four days with the weekend (Văn phòng Chính phủ, the
         Deputy Prime Minister's approval of 2/10/2026, Bộ Nội vụ's proposals 10033/TTr-BNV and 10137/TTr-BNV).
   To add a year: its Tết days and the day beside 2/9, from that year's notice, with the notice's number. */
export const ANNOUNCED = {
  2026: { tet: ['02-16', '02-17', '02-18', '02-19', '02-20'], national: ['09-01', '09-02'] },
  2027: { tet: ['02-04', '02-05', '02-06', '02-07', '02-08'], national: ['09-02', '09-03'] },
};

// the year's holidays: 'YYYY-MM-DD' -> what for (newYear, tet, hung, reunif, labour, national, culture; comp: taken on
// this working day because the holiday fell on a weekend)
const years = new Map();
function holidays(y) {
  if (years.has(y)) return years.get(y);
  const map = new Map(), add = (d, what) => { if (d && !map.has(dayKey(d))) map.set(dayKey(d), what); };
  const ann = ANNOUNCED[y];
  add(at(y, '01-01'), 'newYear');
  if (ann) for (const md of ann.tet) add(at(y, md), 'tet');
  else if (TET[y]) for (let k = -1; k < 4; k++) add(plus(at(y, TET[y]), k), 'tet');
  if (HUNG[y]) add(at(y, HUNG[y]), 'hung');
  add(at(y, '04-30'), 'reunif'); add(at(y, '05-01'), 'labour');
  for (const md of ann?.national || ['09-01', '09-02']) add(at(y, md), 'national');
  if (y >= 2026) add(at(y, '11-24'), 'culture');
  // a holiday on the weekend: the next working day off instead (in date order, so two in a row give two days)
  for (const [k] of [...map].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const d = new Date(`${k}T12:00:00`); if (!weekend(d)) continue;
    let n = plus(d, 1); while (weekend(n) || map.has(dayKey(n))) n = plus(n, 1);
    map.set(dayKey(n), 'comp');
  }
  if (years.size > 6) years.clear();
  years.set(y, map);
  return map;
}
/** what the day is a holiday for ('' when it isn't one): newYear, tet, hung, reunif, labour, national, culture, comp */
export const holidayOf = (d) => holidays(d.getFullYear()).get(dayKey(d)) || '';
/** 'work', 'weekend' or 'holiday' */
export function dayKind(d) {
  if (holidayOf(d)) return 'holiday';
  return weekend(d) ? 'weekend' : 'work';
}
export const isWorkday = (d) => dayKind(d) === 'work';
/** the first working day of the quarter `d` is in (a Date at noon): 1/1 is a holiday, so the year's is in the first
    days of January (2027: Monday 4/1) */
export function quarterStart(d) {
  let x = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1, 12);
  for (let k = 0; k < 31 && !isWorkday(x); k++) x = plus(x, 1);
  return x;
}
/** the working day before `d` (a Date at noon), looking back at most a month */
export function prevWorkday(d) {
  let x = plus(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12), -1);
  for (let k = 0; k < 31 && !isWorkday(x); k++) x = plus(x, -1);
  return x;
}
