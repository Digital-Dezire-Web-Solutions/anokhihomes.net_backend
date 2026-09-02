const User = require("../models/User");
const IncomeHistory = require("../models/IncomeHistory");
const WalletTransaction = require("../models/WalletTransaction");
const getPayoutCycle = require("../utils/getPayoutCycle");

const distributeBestPerformanceIncome = async (referenceDate = new Date()) => {
  try {
    const day = referenceDate.getDate();
    // day 1 settles cycle2Business (16th–end of prior month)
    // day 16 settles cycle1Business (1st–15th of this month)
    const cycle = day === 16 ? 1 : 2;
    const sortField = cycle === 1 ? "cycle1Business" : "cycle2Business";

    const winner = await User.findOne({
      role: "agent",
      status: "active",
    }).sort({ [sortField]: -1 });

    if (!winner) return null;

    const business = winner[sortField];
    if (business <= 0) return null;

    //-----------------------------------
    // Duplicate guard: has this agent already been paid
    // best-performer for this exact cycle window?
    //-----------------------------------

    const { cycleStart, cycleEnd } = getPayoutCycle(referenceDate);

    const alreadyPaid = await IncomeHistory.findOne({
      user: winner._id,
      type: "best_performance_income",
      creditedAt: { $gte: cycleStart, $lte: cycleEnd },
    });
    if (alreadyPaid) {
      // still reset the counter so it doesn't carry into the next cycle
      winner[sortField] = 0;
      await winner.save();
      return null;
    }

    const amount = business * 0.01;

    // winner.wallet += amount;
    winner.totalIncome += amount;
    winner[sortField] = 0;
    await winner.save();

    await WalletTransaction.create({
      user: winner._id,
      amount,
      type: "credit",
      source: "best_performance_income",
      remark: "Best Performance Income",
      cycleStart,
      cycleEnd,
      isSettled: false,
    });

    const history = await IncomeHistory.create({
      user: winner._id,
      type: "best_performance_income",
      businessAmount: business,
      percentage: 1,
      amount,
      status: "credited",
      creditedAt: new Date(),
    });

    console.log(`${winner.name} got best performance income ₹${amount}`);
    return history;
  } catch (error) {
    console.log(error);
    return null;
  }
};

module.exports = distributeBestPerformanceIncome;
