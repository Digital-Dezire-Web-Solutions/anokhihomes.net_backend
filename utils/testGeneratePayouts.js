// // scripts/testGeneratePayouts.js
// require("dotenv").config();
// const mongoose = require("mongoose");
// const generatePayouts = require("../mlmController/generatePayouts");

// (async () => {
//   await mongoose.connect(process.env.MONGO_URI);

//   const now = new Date();
//   console.log("Running for:", now.toString()); // local-readable, e.g. "Tue Sep 01 2026 ..."

//   const results = await generatePayouts(now);

//   console.log(`Generated ${results.length} payout(s)`);
//   results.forEach((p) =>
//     console.log(
//       p.user.toString(),
//       "gross:", p.grossAmount,
//       "tds:", p.tdsAmount,
//       "admin:", p.adminChargeAmount,
//       "net:", p.netAmount,
//     ),
//   );

//   await mongoose.disconnect();
//   process.exit(0);
// })();

// scripts/testGeneratePayouts.js
require("dotenv").config();
const mongoose = require("mongoose");
const generatePayouts = require("../mlmController/generatePayouts");

// One cycle: 16/09/2026 00:00:00 to 15/10/2026 23:59:59.999 (month is 0-based)
const CYCLE = {
  cycleStart: new Date(2026, 8, 16, 0, 0, 0, 0),
  cycleEnd: new Date(2026, 9, 15, 23, 59, 59, 999),
};
const REFERENCE_DATE = new Date(2026, 9, 16, 12, 0, 0);

const fmt = (d) => d.toLocaleDateString("en-GB");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  console.log(`Cycle ${fmt(CYCLE.cycleStart)} to ${fmt(CYCLE.cycleEnd)}`);
  const results = await generatePayouts(REFERENCE_DATE, CYCLE);

  console.log(`Generated ${results.length} payout(s)`);
  results.forEach((p) =>
    console.log(
      p.user.toString(),
      "invoice:", p.invoiceNo,
      "gross:", p.grossAmount,
      "tds:", p.tdsAmount,
      "admin:", p.adminChargeAmount,
      "net:", p.netAmount,
    ),
  );

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});