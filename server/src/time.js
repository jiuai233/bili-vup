const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

function formatDateInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getShanghaiDateString(offsetDays = 0) {
  const date = new Date();
  if (offsetDays !== 0) {
    date.setUTCDate(date.getUTCDate() + offsetDays);
  }
  return formatDateInTimeZone(date, SHANGHAI_TIME_ZONE);
}

export function getShanghaiTodayAndYesterday() {
  return {
    today: getShanghaiDateString(0),
    yesterday: getShanghaiDateString(-1),
  };
}

export function getCurrentUnixTimestamp() {
  return Math.floor(Date.now() / 1000);
}

export function getShanghaiMonthUnixRange(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error("month must be in YYYY-MM format");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error("month must be in YYYY-MM format");
  }

  // Asia/Shanghai is UTC+8, so local midnight maps to previous-day 16:00 UTC.
  const startUnix = Math.floor(Date.UTC(year, monthIndex, 1, -8, 0, 0) / 1000);
  const endUnix = Math.floor(Date.UTC(year, monthIndex + 1, 1, -8, 0, 0) / 1000);

  return { startUnix, endUnix };
}

export function getShanghaiDayUnixRange(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) {
    throw new Error("date must be in YYYY-MM-DD format");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) {
    throw new Error("date must be in YYYY-MM-DD format");
  }

  const startUnix = Math.floor(Date.UTC(year, monthIndex, day, -8, 0, 0) / 1000);
  const endUnix = Math.floor(Date.UTC(year, monthIndex, day + 1, -8, 0, 0) / 1000);

  return { startUnix, endUnix };
}
