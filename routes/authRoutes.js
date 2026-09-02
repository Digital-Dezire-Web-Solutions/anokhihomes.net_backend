const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { login, register } = require("../controllers/authController");
const fetchuser = require("../middleware/fetchUser");
const User = require("../models/User");
const StaffRole = require("../models/StaffRole");
const distributeLevelIncome = require("../mlmController/distributeLevelIncome");
const IncomeHistory = require("../models/IncomeHistory");
const getTeamTree = require("../utils/getTeamTree");
const { sendOtp } = require("../controllers/sendOtp");
const { verifyOtp } = require("../controllers/verifyOtp");
const RankSlab = require("../models/RankSlab");
const Lead = require("../models/Lead");
const SiteVisit = require("../models/SiteVisit");
const Booking = require("../models/Booking");

/* AUTH */
router.post("/login", login);
router.post("/register", register);

router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/create-user", fetchuser, async (req, res) => {
  try {
    const loggedUser = await User.findById(req.user.id);

    if (!["admin", "agent"].includes(loggedUser.role)) {
      return res.status(403).json({
        msg: "You are not authorized to create users",
      });
    }

    const {
      name,
      email,
      phone,
      dob,
      password,
      role,
      staffRole,

      // MLM
      referralId,
      position,

      // EXTRA
      address,
      panNumber,
      panVerified,
      panPhoto,
      aadharNumber,
      aadharPhoto,

      bankName,
      accountNumber,
      ifsc,

      nomineeName,
      nomineeRelation,
      nomineeAadharNumber,
      nomineeAadharPhoto,
    } = req.body;

    if (loggedUser.role === "agent" && role !== "user") {
      return res.status(403).json({
        msg: "Agents can only create customers.",
      });
    }

    // let existingUser = await User.findOne({
    //   email,
    // });

    // if (existingUser) {
    //   return res.status(400).json({
    //     msg: "User already exists",
    //   });
    // }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
      role: role,
    });

    if (existingUser) {
      return res.status(400).json({
        msg: `This email is already registered as ${role}`,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email: normalizedEmail,
      phone,
      dob,
      password: hashedPassword,
      role,
      staffRole,
      status: role === "user" ? "active" : "approval",
      createdBy: loggedUser._id,

      address,

      panNumber,
      panPhoto,
      panVerified,

      aadharNumber,
      aadharPhoto,

      bankName,
      accountNumber,
      ifsc,

      nomineeName,
      nomineeRelation,
      nomineeAadharNumber,
      nomineeAadharPhoto,

      designation:
        role === "admin"
          ? "Executive Director"
          : role === "agent"
            ? "Sales Executive"
            : "",
      level: role === "admin" ? 16 : role === "agent" ? 1 : "",
      directIncomePercent: role === "admin" ? 20 : role === "agent" ? 5 : "",

      // designation:
      //   role === "admin"
      //     ? "Executive Director"
      //     : role === "staff"
      //       ? ""
      //       : "Sales Executive",
      // level: role === "admin" ? 16 : role === "staff" ? "" : 1,
      // directIncomePercent: role === "admin" ? 20 : role === "staff" ? "" : 5,
    });

    if (role === "agent") {
      // referralId required for agent
      if (!referralId) {
        return res.status(400).json({
          msg: "Referral ID is required",
        });
      }

      // position required
      if (position !== "left" && position !== "right") {
        return res.status(400).json({
          msg: "Position must be left or right",
        });
      }

      // find parent
      const parentUser = await User.findOne({
        referralId,
      });

      if (!parentUser) {
        return res.status(400).json({
          msg: "Invalid referral ID",
        });
      }

      // assign hierarchy
      user.parent = parentUser._id;
      user.referredBy = parentUser._id;
      user.position = position;
      user.level = 1;

      // max 16 level
      if (user.level > 16) {
        return res.status(400).json({
          msg: "Maximum level reached",
        });
      }
    }

    await user.save();

    if (role === "agent") {
      const parentUser = await User.findById(user.parent);

      if (user.position === "left") {
        parentUser.leftChildren.push(user._id);
      }

      if (user.position === "right") {
        parentUser.rightChildren.push(user._id);
      }
      parentUser.directTeam += 1;
      parentUser.totalTeam += 1;
      await parentUser.save();
    }

    const finalUser = await User.findById(user._id).select("-password");

    res.json({
      msg: "User created successfully",
      user: finalUser,
    });
  } catch (error) {
    console.error(error);

    res.status(500).send("Internal Server Error");
  }
});

router.put("/change-password", fetchuser, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id);

  const matched = await bcrypt.compare(currentPassword, user.password);

  if (!matched) {
    return res.status(400).json({
      message: "Current password is incorrect",
    });
  }

  const salt = await bcrypt.genSalt(10);

  user.password = await bcrypt.hash(newPassword, salt);

  await user.save();

  res.json({
    success: true,
    message: "Password updated",
  });
});

/* =========================================
   GET CONNECTED CUSTOMERS FOR AGENT
========================================= */

router.get("/my-connected-users", fetchuser, async (req, res) => {
  try {
    const agentId = req.user.id;

    // =========================================
    // CHECK LOGGED-IN USER
    // =========================================

    const agent = await User.findById(agentId).select(
      "_id name role referralId",
    );

    if (!agent) {
      return res.status(404).json({
        msg: "User not found",
      });
    }

    // Only agent can use this route
    if (agent.role !== "agent") {
      return res.status(403).json({
        msg: "Only agents can access connected customers",
      });
    }

    // =========================================
    // GET CUSTOMERS CREATED BY THIS AGENT
    // =========================================

    const createdUsers = await User.find({
      role: "user",
      createdBy: agentId,
    }).select("_id");

    // =========================================
    // GET CUSTOMERS FROM LEADS
    // Lead.agent -> Lead.customer
    // =========================================

    const leads = await Lead.find({
      agent: agentId,
      customer: { $ne: null },
    }).select("customer");

    // =========================================
    // GET CUSTOMERS FROM SITE VISITS
    // SiteVisit.agent -> SiteVisit.customer
    // =========================================

    const siteVisits = await SiteVisit.find({
      agent: agentId,
      customer: { $ne: null },
    }).select("customer");

    // =========================================
    // GET CUSTOMERS FROM BOOKINGS
    // Booking.agent -> Booking.customer
    // =========================================

    const bookings = await Booking.find({
      agent: agentId,
      customer: { $ne: null },
    }).select("customer");

    // =========================================
    // COMBINE CUSTOMER IDS
    // =========================================

    const customerIds = [
      ...createdUsers.map((user) => user._id),

      ...leads.map((lead) => lead.customer),

      ...siteVisits.map((visit) => visit.customer),

      ...bookings.map((booking) => booking.customer),
    ];

    // =========================================
    // REMOVE DUPLICATES
    // =========================================

    const uniqueCustomerIds = [
      ...new Set(customerIds.map((id) => id.toString())),
    ];

    // =========================================
    // GET ONLY USERS
    // =========================================

    const users = await User.find({
      _id: {
        $in: uniqueCustomerIds,
      },
      role: "user",
    })
      .select("-password")
      .populate("createdBy", "name referralId designation");

    // =========================================
    // RESPONSE
    // =========================================

    return res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Get connected customers error:", error);

    return res.status(500).json({
      msg: "Internal Server Error",
      error: error.message,
    });
  }
});

// router.get("/check-email/:email", async (req, res) => {
//   try {
//     const email = req.params.email.toLowerCase().trim();

//     const user = await User.findOne({ email });

//     res.json({
//       exists: !!user,
//       message: user ? "Email already registered" : "Email available",
//     });
//   } catch (error) {
//     res.status(500).json({
//       message: "Internal Server Error",
//     });
//   }
// });
router.get("/check-email/:email", async (req, res) => {
  try {
    const email = req.params.email.toLowerCase().trim();
    const { role } = req.query;

    const user = await User.findOne({
      email,
      role,
    });

    res.json({
      exists: !!user,
      message: user ? `Email already registered as ${role}` : "Email available",
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

router.get("/check-phone/:phone", async (req, res) => {
  try {
    const phone = req.params.phone.trim();

    const user = await User.findOne({ phone });

    res.json({
      exists: !!user,
      message: user
        ? "Phone number already registered"
        : "Phone number available",
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

router.get("/referral/:referralId", async (req, res) => {
  try {
    const user = await User.findOne({
      referralId: req.params.referralId,
      role: {
        $in: ["admin", "agent"],
      },
    }).select("-password");

    if (!user) {
      return res.status(404).json({
        msg: "Agent not found",
      });
    }

    res.json(user);
  } catch (error) {
    console.log(error);

    res.status(500).send("Internal Server Error");
  }
});

router.put("/approval/:id", fetchuser, async (req, res) => {
  try {
    const loggedUser = await User.findById(req.user.id);

    if (loggedUser.role !== "admin") {
      return res.status(403).json({
        msg: "Only admin can approve users",
      });
    }

    const { status } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        msg: "User not found",
      });
    }

    // PREVIOUS STATUS
    const oldStatus = user.status;

    // UPDATE STATUS
    user.status = status;

    await user.save();

    // ONLY WHEN AGENT BECOMES ACTIVE
    if (
      oldStatus !== "active" &&
      status === "active" &&
      user.role === "agent"
    ) {
      await distributeLevelIncome(user._id);
    }

    res.json({
      msg: "Status updated successfully",
      user,
    });
  } catch (error) {
    console.log(error);

    res.status(500).send("Internal server error");
  }
});

router.put("/status/:id", fetchuser, async (req, res) => {
  try {
    const loggedUser = await User.findById(req.user.id);

    // ONLY ADMIN OR STAFF
    if (loggedUser.role !== "admin" && loggedUser.role !== "staff") {
      return res.status(403).json({
        msg: "Only admin or staff can change status",
      });
    }

    const { status } = req.body;

    // ALLOW ONLY active / inactive
    if (status !== "active" && status !== "inactive") {
      return res.status(400).json({
        msg: "Status must be active or inactive",
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        msg: "User not found",
      });
    }

    // DO NOT ALLOW approval HERE
    if (user.status === "approval") {
      return res.status(400).json({
        msg: "User is pending approval. Use approval route first.",
      });
    }

    user.status = status;

    await user.save();

    res.json({
      msg: `User ${status} successfully`,
      user,
    });
  } catch (error) {
    console.log(error);

    res.status(500).send("Internal server error");
  }
});

/* GET LOGGED IN USER */
router.post("/getuser", fetchuser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .select("-password")
      .populate(
        "referredBy",
        "name phone email referralId designation directIncomePercent level wallet totalIncome",
      )
      .populate(
        "parent",
        "name phone email referralId designation directIncomePercent level wallet totalIncome",
      )
      .populate(
        "leftChildren",
        "name phone email referralId designation directIncomePercent level wallet totalIncome",
      )
      .populate(
        "rightChildren",
        "name phone email referralId designation directIncomePercent level wallet totalIncome",
      )
      .populate("staffRole", "name ");

    res.send(user);
  } catch (error) {
    console.error(error.message);

    res.status(500).send("Internal server Error");
  }
});

/* ===========================
   GET ALL USERS
=========================== */

router.get("/all-users", fetchuser, async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .populate("referredBy", "name phone email referralId designation")
      .populate("parent", "name phone email referralId designation")
      .populate("staffRole", "name ");

    res.json(users);
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal server error");
  }
});

// admin shift agents

router.put("/shift-position/:id", fetchuser, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // ==============================
    // 1. CHECK LOGGED-IN USER
    // ==============================
    const loggedUser = await User.findById(req.user.id).session(session);

    if (!loggedUser) {
      await session.abortTransaction();

      return res.status(404).json({
        msg: "Logged in user not found",
      });
    }

    // ONLY ADMIN CAN SHIFT
    if (loggedUser.role !== "admin") {
      await session.abortTransaction();

      return res.status(403).json({
        msg: "Only admin can shift agent position",
      });
    }

    // ==============================
    // 2. GET NEW POSITION
    // ==============================
    const { position } = req.body;

    if (!["left", "right"].includes(position)) {
      await session.abortTransaction();

      return res.status(400).json({
        msg: "Position must be left or right",
      });
    }

    // ==============================
    // 3. FIND AGENT
    // ==============================
    const agent = await User.findById(req.params.id).session(session);

    if (!agent) {
      await session.abortTransaction();

      return res.status(404).json({
        msg: "Agent not found",
      });
    }

    if (agent.role !== "agent") {
      await session.abortTransaction();

      return res.status(400).json({
        msg: "Only agents can be shifted",
      });
    }

    // ==============================
    // 4. CHECK CURRENT POSITION
    // ==============================
    if (agent.position === position) {
      await session.abortTransaction();

      return res.status(400).json({
        msg: `Agent is already on ${position}`,
      });
    }

    // ==============================
    // 5. BUSINESS LOCK
    // ==============================
    const hasBusiness = Number(agent.selfBusiness || 0) > 0;

    if (hasBusiness) {
      await session.abortTransaction();

      return res.status(400).json({
        msg: "Agent position cannot be changed after business has started",
        business: {
          selfBusiness: agent.selfBusiness,
        },
      });
    }

    // ==============================
    // 6. FIND PARENT
    // ==============================
    if (!agent.parent) {
      await session.abortTransaction();

      return res.status(400).json({
        msg: "Agent does not have a parent",
      });
    }

    const parent = await User.findById(agent.parent).session(session);

    if (!parent) {
      await session.abortTransaction();

      return res.status(404).json({
        msg: "Parent user not found",
      });
    }

    // ==============================
    // 7. REMOVE FROM OLD SIDE
    // ==============================
    if (agent.position === "left") {
      await User.updateOne(
        { _id: parent._id },
        {
          $pull: {
            leftChildren: agent._id,
          },
        },
        { session },
      );
    }

    if (agent.position === "right") {
      await User.updateOne(
        { _id: parent._id },
        {
          $pull: {
            rightChildren: agent._id,
          },
        },
        { session },
      );
    }

    // ==============================
    // 8. ADD TO NEW SIDE
    // ==============================
    if (position === "left") {
      await User.updateOne(
        { _id: parent._id },
        {
          $addToSet: {
            leftChildren: agent._id,
          },
        },
        { session },
      );
    }

    if (position === "right") {
      await User.updateOne(
        { _id: parent._id },
        {
          $addToSet: {
            rightChildren: agent._id,
          },
        },
        { session },
      );
    }

    // ==============================
    // 9. UPDATE AGENT POSITION
    // ==============================
    agent.position = position;

    await agent.save({ session });

    // ==============================
    // 10. COMMIT
    // ==============================
    await session.commitTransaction();

    const updatedAgent = await User.findById(agent._id)
      .select("-password")
      .populate("parent", "name referralId position");

    return res.json({
      success: true,
      msg: `Agent shifted to ${position} successfully`,
      agent: updatedAgent,
    });
  } catch (error) {
    await session.abortTransaction();

    console.error("Shift position error:", error);

    return res.status(500).json({
      msg: "Failed to shift agent position",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
});

/* ===========================
   GET USER BY ID
=========================== */

router.get("/user/:id", fetchuser, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate(
        "referredBy",
        "name phone email referralId designation directIncomePercent level wallet totalIncome",
      )
      .populate(
        "parent",
        "name phone email referralId designation directIncomePercent level wallet totalIncome",
      )
      .populate(
        "leftChildren",
        "name phone email referralId designation directIncomePercent level wallet totalIncome",
      )
      .populate(
        "rightChildren",
        "name phone email referralId designation directIncomePercent level wallet totalIncome",
      )
      .populate("staffRole");

    if (!user) {
      return res.status(404).json({
        msg: "User not found",
      });
    }

    res.json(user);
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
});

/* ===========================
   GET user by role
=========================== */

router.get("/role/:role", fetchuser, async (req, res) => {
  try {
    const users = await User.find({ role: req.params.role }).select(
      "-password",
    );

    res.json(users);
  } catch (error) {
    res.status(500).send("Internal server error");
  }
});

router.put("/update/:id", fetchuser, async (req, res) => {
  try {
    const loggedUser = await User.findById(req.user.id);

    const targetUserId = req.params.id;

    // allow if self OR admin/staff
    if (
      loggedUser._id.toString() !== targetUserId &&
      loggedUser.role !== "admin" &&
      loggedUser.role !== "staff"
    ) {
      return res.status(403).json({
        msg: "Not allowed to update other users",
      });
    }

    const updateFields = {};

    Object.keys(req.body).forEach((key) => {
      if (req.body[key] !== undefined) {
        updateFields[key] = req.body[key];
      }
    });

    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      updateFields,
      {
        new: true,
        runValidators: true,
      },
    ).select("-password");

    res.json(updatedUser);
  } catch (error) {
    res.status(500).send("Internal server error");
  }
});

router.delete("/delete/:id", fetchuser, async (req, res) => {
  try {
    const loggedUser = await User.findById(req.user.id);

    if (loggedUser.role !== "admin" && loggedUser.role !== "staff") {
      return res.status(403).json({
        msg: "Only admin or staff can delete users",
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      msg: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).send("Internal server error");
  }
});

router.put("/status/:id", fetchuser, async (req, res) => {
  try {
    const { status } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );

    res.json(user);
  } catch (error) {
    res.status(500).send("Internal server error");
  }
});

router.put("/roles/permissions/:roleName", fetchuser, async (req, res) => {
  try {
    const admin = await User.findById(req.user.id);

    if (admin.role !== "admin") {
      return res.status(403).json({
        msg: "Only admin allowed",
      });
    }

    const { permissions } = req.body;

    const role = await StaffRole.findOneAndUpdate(
      { roleName: req.params.roleName },
      { permissions },
      { new: true, upsert: true },
    );

    res.json({
      msg: "Permissions updated successfully",
      role,
    });
  } catch (error) {
    res.status(500).send("Server error");
  }
});

router.get("/income-history", fetchuser, async (req, res) => {
  try {
    const loggedUser = await User.findById(req.user.id);

    let query = {};

    // ADMIN CAN SEE ALL
    if (loggedUser.role !== "admin") {
      query.user = req.user.id;
    }

    const histories = await IncomeHistory.find(query)
      .populate("user", "name email phone referralId designation")
      .populate("fromUser", "name email phone referralId designation")
      .populate({
        path: "from",
        select: "colony plot",
        populate: [{ path: "colony", select: "name" }],
      })
      .populate({
        path: "payment",
        select: "customer approvedBy paymentDate amount paymentType",
        populate: [
          {
            path: "customer",
            select: "name phone email",
          },
          {
            path: "approvedBy",
            select: "name phone email",
          },
          { path: "paymentMode", select: "name" },
          { path: "paymentType", select: "name" },
          { path: "paymentDate", select: "name" },
        ],
      })
      .sort({
        createdAt: -1,
      });

    res.json(histories);
  } catch (error) {
    console.log(error);

    res.status(500).send("Internal server error");
  }
});

router.get("/team-tree/:referralId", fetchuser, async (req, res) => {
  try {
    const rootUser = await User.findOne({
      referralId: req.params.referralId,
    });

    if (!rootUser) {
      return res.status(404).json({
        msg: "User not found",
      });
    }

    const tree = await getTeamTree(rootUser._id);

    res.json(tree);
  } catch (error) {
    console.log(error);

    res.status(500).send("Internal Server Error");
  }
});

router.get("/my-team-tree", fetchuser, async (req, res) => {
  try {
    const tree = await getTeamTree(req.user.id);

    res.json(tree);
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
});

router.get("/ranks", fetchuser, async (req, res) => {
  try {
    const ranks = await RankSlab.find().sort({ level: 1 });

    res.json(ranks);
  } catch (err) {
    console.log(err);

    res.status(500).json({
      msg: "Internal Server Error",
    });
  }
});

router.put("/update-rank/:id", fetchuser, async (req, res) => {
  try {
    const loggedUser = await User.findById(req.user.id);

    if (!loggedUser) {
      return res.status(404).json({
        msg: "Admin not found",
      });
    }

    if (loggedUser.role !== "admin") {
      return res.status(403).json({
        msg: "Only admin can update designation",
      });
    }

    const { level } = req.body;

    // Find rank slab from MongoDB
    const rank = await RankSlab.findOne({
      level: Number(level),
    });

    // console.log("Selected Rank:", rank);

    if (!rank) {
      return res.status(400).json({
        msg: "Invalid level",
      });
    }

    // Find agent
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        msg: "User not found",
      });
    }

    if (user.role !== "agent") {
      return res.status(400).json({
        msg: "Only agents have ranks",
      });
    }

    // Update agent according to RankSlab
    user.level = rank.level;
    user.designation = rank.designation;
    user.directIncomePercent = rank.directIncome;

    // Admin manually assigned this rank
    user.rankType = "manual";

    await user.save();

    return res.json({
      success: true,
      msg: "Rank updated successfully",
      user,
    });
  } catch (err) {
    console.error("Update agent rank error:", err);

    return res.status(500).json({
      msg: "Internal Server Error",
      error: err.message,
    });
  }
});

router.put("/update-rank-slab/:level", fetchuser, async (req, res) => {
  try {
    const admin = await User.findById(req.user.id);

    if (!admin) {
      return res.status(404).json({
        msg: "Admin not found",
      });
    }

    if (admin.role !== "admin") {
      return res.status(403).json({
        msg: "Only admin can update rank slabs",
      });
    }

    const level = Number(req.params.level);

    const { min, max, directIncome, designation } = req.body;

    const rank = await RankSlab.findOne({ level });

    if (!rank) {
      return res.status(404).json({
        msg: "Rank slab not found",
      });
    }

    // =========================
    // VALIDATION
    // =========================

    if (min === undefined || min === null || Number(min) < 0) {
      return res.status(400).json({
        msg: "Valid minimum business is required",
      });
    }

    if (!designation || !designation.trim()) {
      return res.status(400).json({
        msg: "Designation is required",
      });
    }

    if (
      directIncome === undefined ||
      directIncome === null ||
      Number(directIncome) < 0 ||
      Number(directIncome) > 100
    ) {
      return res.status(400).json({
        msg: "Direct income must be between 0 and 100",
      });
    }

    // =========================
    // MAXIMUM
    // =========================

    if (
      max !== undefined &&
      max !== null &&
      max !== "" &&
      max !== "Infinity" &&
      Number(max) <= Number(min)
    ) {
      return res.status(400).json({
        msg: "Maximum business must be greater than minimum business",
      });
    }

    // =========================
    // UPDATE
    // =========================

    rank.min = Number(min);

    if (max === undefined || max === null || max === "" || max === "Infinity") {
      rank.max = Infinity;
    } else {
      rank.max = Number(max);
    }

    rank.directIncome = Number(directIncome);
    rank.designation = designation.trim();

    await rank.save();

    res.json({
      success: true,
      msg: "Rank slab updated successfully",
      rank,
    });
  } catch (error) {
    console.log("Update rank slab error:", error);

    res.status(500).json({
      msg: "Internal Server Error",
    });
  }
});

module.exports = router;
