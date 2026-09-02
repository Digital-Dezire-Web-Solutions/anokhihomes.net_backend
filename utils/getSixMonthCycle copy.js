const getSixMonthCycle = (date = new Date()) => {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0 = Jan ... 11 = Dec

  let cycleStart;
  let cycleEnd;

  if (month < 6) {
    // Jan 1 – Jun 30
    cycleStart = new Date(year, 0, 1, 0, 0, 0, 0);
    cycleEnd = new Date(year, 5, 30, 23, 59, 59, 999);
  } else {
    // Jul 1 – Dec 31
    cycleStart = new Date(year, 6, 1, 0, 0, 0, 0);
    cycleEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  }

  return { cycleStart, cycleEnd };
};

module.exports = getSixMonthCycle;
