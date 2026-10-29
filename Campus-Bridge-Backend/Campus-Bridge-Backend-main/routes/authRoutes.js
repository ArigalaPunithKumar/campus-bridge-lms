const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");

/* ================= AUTH ROUTES ================= */

router.post("/register", authController.registerUser);
router.post("/login", authController.loginUser);
router.post("/forgot-password", authController.forgotPassword);
router.post("/verify-otp", authController.verifyOtp);
router.post("/reset-password", authController.resetPassword);
router.post("/change-password", authController.changePassword);

module.exports = router;
