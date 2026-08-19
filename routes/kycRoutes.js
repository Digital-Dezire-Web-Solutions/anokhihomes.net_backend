const express = require("express");
const axios = require("axios");
const router = express.Router();
const APITXT_AUTHKEY = process.env.APITXT_AUTHKEY;

const APITXT_HEADERS = {
  "Content-Type": "application/json",
};

/* =========================================
   PAN VERIFY
========================================= */

router.post("/panverify", async (req, res) => {
  try {
    const { pan, name, dob } = req.body;

    if (!pan) {
      return res.status(400).json({
        success: false,
        message: "PAN number is required",
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    if (!dob) {
      return res.status(400).json({
        success: false,
        message: "Date of birth is required",
      });
    }

    const response = await axios.post(
      "https://apitxt.com/api/panVerify",
      {
        authkey: APITXT_AUTHKEY,
        pan: pan.toUpperCase().trim(),
        name: name.trim(),
        dob,
      },
      {
        headers: APITXT_HEADERS,
      },
    );

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error(
      "PAN verification error:",
      error.response?.data || error.message,
    );

    res.status(error.response?.status || 500).json({
      success: false,
      message:
        error.response?.data?.message ||
        "PAN verification failed",
      data: error.response?.data || null,
    });
  }
});


/* =========================================
   AADHAAR SEND OTP
========================================= */

// router.post("/aadhaar/send-otp", async (req, res) => {
//   try {
//     const { aadhaar_number } = req.body;

//     if (!aadhaar_number) {
//       return res.status(400).json({
//         success: false,
//         message: "Aadhaar number is required",
//       });
//     }

//     if (!/^\d{12}$/.test(aadhaar_number)) {
//       return res.status(400).json({
//         success: false,
//         message: "Aadhaar number must contain 12 digits",
//       });
//     }

//     const response = await axios.post(
//       "https://apitxt.com/api/aadhaarSendOTP",
//       {
//         authkey: APITXT_AUTHKEY,
//         aadhaar_number,
//       },
//       {
//         headers: APITXT_HEADERS,
//       },
//     );

//     res.json({
//       success: true,
//       data: response.data,
//     });
//   } catch (error) {
//     console.log(error)
//     console.error(
//       "Aadhaar OTP error:",
//       error.response?.data || error.message,
//     );

//     res.status(error.response?.status || 500).json({
//       success: false,
//       message:
//         error.response?.data?.message ||
//         "Failed to send Aadhaar OTP",
//       data: error.response?.data || null,
//     });
//   }
// });


/* =========================================
   AADHAAR VERIFY OTP
========================================= */

// router.post("/aadhaar/verify-otp", async (req, res) => {
//   try {
//     const { reference_id, otp } = req.body;

//     if (!reference_id) {
//       return res.status(400).json({
//         success: false,
//         message: "Reference ID is required",
//       });
//     }

//     if (!otp) {
//       return res.status(400).json({
//         success: false,
//         message: "OTP is required",
//       });
//     }

//     const response = await axios.post(
//       "https://apitxt.com/api/aadhaarVerifyOTP",
//       {
//         authkey: APITXT_AUTHKEY,
//         reference_id,
//         otp,
//       },
//       {
//         headers: APITXT_HEADERS,
//       },
//     );

//     res.json({
//       success: true,
//       data: response.data,
//     });
//   } catch (error) {
//     console.log(error)
//     console.error(
//       "Aadhaar OTP verification error:",
//       error.response?.data || error.message,
//     );

//     res.status(error.response?.status || 500).json({
//       success: false,
//       message:
//         error.response?.data?.message ||
//         "Aadhaar OTP verification failed",
//       data: error.response?.data || null,
//     });
//   }
// });


module.exports = router;