const express = require("express");
const router = express.Router();

const Payout = require("../models/Payout");
const User = require("../models/User");
const fetchuser = require("../middleware/fetchUser");
const generatePayouts = require("../mlmController/generatePayouts");
const { notifyUser } = require("../utils/notify");

router.post("/generate", fetchuser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.role !== "admin") return res.status(403).json({ message: "Admin only" });

    const referenceDate = req.body.date ? new Date(req.body.date) : new Date();
    const payouts = await generatePayouts(referenceDate);
    res.json({ message: `${payouts.length} payout(s) generated`, payouts });
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
});

router.get("/", fetchuser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const query = user.role === "admin" ? {} : { user: user._id };
    const payouts = await Payout.find(query)
      .populate("user", "name email referralId")
      .sort({ cycleStart: -1 });
    res.json(payouts);
  } catch (error) {
    res.status(500).send("Server Error");
  }
});

router.get("/:id", fetchuser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const payout = await Payout.findById(req.params.id).populate("user", "name email referralId");
    if (!payout) return res.status(404).json({ message: "Payout not found" });
    if (user.role !== "admin" && payout.user._id.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.json(payout);
  } catch (error) {
    res.status(500).send("Server Error");
  }
});

router.put("/pay/:id", fetchuser, async (req, res) => {
  try {
    const admin = await User.findById(req.user.id);
    if (admin.role !== "admin") return res.status(403).json({ message: "Admin only" });

    const payout = await Payout.findById(req.params.id);
    if (!payout) return res.status(404).json({ message: "Payout not found" });
    if (payout.status === "paid") return res.status(400).json({ message: "Already paid" });

    const agent = await User.findById(payout.user);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    // money leaves walletHold and is recorded as withdrawn — adjust to match
    // how you actually want wallet/walletAvailable/walletWithdrawn to behave
    agent.wallet -= payout.netAmount;
    agent.totalWithdraw += payout.netAmount;
    await agent.save();

    payout.status = "paid";
    payout.paidAt = new Date();
    payout.paidBy = admin._id;
    await payout.save();

    await notifyUser({
      user: agent._id,
      sender: admin._id,
      title: "Payout released",
      message: `Your payout of ₹${payout.netAmount} for ${payout.cycleStart.toDateString()} - ${payout.cycleEnd.toDateString()} has been paid.`,
      type: "payout",
      referenceId: payout._id,
      referenceModel: "Payout",
    });

    res.json(payout);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
});

module.exports = router;