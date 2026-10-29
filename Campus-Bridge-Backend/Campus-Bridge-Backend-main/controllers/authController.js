const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const db = require("../db");
const { initializeSignupStreak, recordLoginStreak } = require("../utils/streakService");

const RESET_WINDOW_MS = 10 * 60 * 1000;

// Helper for Promisified Queries
const query = (sql, params) => {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
};

const isMailConfigured = () => {
    const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];
    return required.every((key) => typeof process.env[key] === "string" && process.env[key].trim().length > 0);
};

const assertMailConfiguration = () => {
    const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];
    const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim());
    if (missing.length) {
        const error = new Error(`Missing required mail configuration: ${missing.join(", ")}`);
        error.code = "SMTP_CONFIG_MISSING";
        throw error;
    }

    const port = Number(process.env.SMTP_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        const error = new Error("SMTP_PORT must be a valid port number");
        error.code = "SMTP_CONFIG_INVALID";
        throw error;
    }
};

const getExpiryTime = (value) => {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();

    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const ensurePasswordResetVerificationTable = async () => {
    await query(`
        CREATE TABLE IF NOT EXISTS password_reset_verifications (
            email VARCHAR(255) PRIMARY KEY,
            verified_until BIGINT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
};

const ensureUserStatusSupportsPending = async () => {
    const rows = await query(`
        SELECT COLUMN_TYPE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'status'
    `);

    if (rows.length === 0) {
        await query("ALTER TABLE users ADD COLUMN status ENUM('active','inactive','pending') DEFAULT 'active'");
        return;
    }

    const columnType = String(rows[0].COLUMN_TYPE || "").toLowerCase();
    if (!columnType.includes("'pending'")) {
        await query("ALTER TABLE users MODIFY status ENUM('active','inactive','pending') DEFAULT 'active'");
    }
};

const clearPasswordResetVerification = async (email) => {
    await ensurePasswordResetVerificationTable();
    await query("DELETE FROM password_reset_verifications WHERE email = ?", [email]);
};

const markPasswordResetVerified = async (email) => {
    await ensurePasswordResetVerificationTable();
    const verifiedUntil = Date.now() + RESET_WINDOW_MS;
    await query(`
        INSERT INTO password_reset_verifications (email, verified_until)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE verified_until = VALUES(verified_until)
    `, [email, verifiedUntil]);
};

const hasPasswordResetVerification = async (email) => {
    await ensurePasswordResetVerificationTable();
    const rows = await query(
        "SELECT verified_until FROM password_reset_verifications WHERE email = ?",
        [email]
    );

    if (rows.length === 0) return false;

    if (Date.now() > getExpiryTime(rows[0].verified_until)) {
        await clearPasswordResetVerification(email);
        return false;
    }

    return true;
};

/* =====================================================
   SMTP TRANSPORTER (BREVO/GMAIL)
===================================================== */
const createMailTransporter = () => {
    assertMailConfiguration();
    const port = Number(process.env.SMTP_PORT);

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST.trim(),
        port,
        secure: port === 465,
        requireTLS: port === 587,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

const sendPasswordResetOtp = async ({ email, name, otp }) => {
    const transporter = createMailTransporter();
    const from = process.env.EMAIL_FROM.trim();
    const match = from.match(/<([^<>]+)>$/);
    const senderAddress = (match ? match[1] : from).trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderAddress)) {
        const error = new Error("EMAIL_FROM must be a valid sender email address");
        error.code = "SMTP_SENDER_INVALID";
        throw error;
    }

    await transporter.verify();

    return transporter.sendMail({
        from: from.includes("<") ? from : { name: "Campus Bridge", address: senderAddress },
        to: email,
        subject: "Campus Bridge password reset OTP",
        text: `Hi ${name || "there"}, your Campus Bridge password reset OTP is ${otp}. It is valid for 10 minutes.`,
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
                <h2 style="color:#0f766e">Campus Bridge Password Reset</h2>
                <p>Hi ${name || "there"},</p>
                <p>Use this OTP to reset your password:</p>
                <div style="font-size:32px;font-weight:700;letter-spacing:6px;background:#ecfeff;border:1px solid #99f6e4;border-radius:12px;padding:16px 20px;display:inline-block;color:#0f172a">${otp}</div>
                <p>This OTP is valid for 10 minutes. If you did not request this, you can ignore this email.</p>
            </div>
        `
    });
};

/* =====================================================
   1. SIGN UP (With Approval Workflow)
===================================================== */
exports.registerUser = async (req, res) => {
    try {
        let { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ msg: "All fields are required" });
        }

        email = email.trim().toLowerCase();
        role = ["student", "faculty", "admin"].includes(role) ? role : "student";

        await ensureUserStatusSupportsPending();

        // Check if user exists
        const existingUsers = await query("SELECT id FROM users WHERE email = ?", [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ msg: "Email already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Security Check: Set status based on role
        const status = (role === "admin" || role === "faculty") ? "pending" : "active";

        // Insert new user
        const insertResult = await query(
            "INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)",
            [name, email, hashedPassword, role, status]
        );

        if (role === "student") {
            try {
                await initializeSignupStreak(insertResult.insertId);
            } catch (streakErr) {
                console.warn("Signup streak initialization skipped:", streakErr.message);
            }
        }

        // If it requires approval, alert the admins and notify the user
        if (status === "pending") {
            try {
                await query(
                    "INSERT INTO notifications (message) VALUES (?)",
                    [`New ${role} registration requires approval: ${name} (${email})`]
                );
            } catch (notifErr) {
                console.warn("Notification insert failed. Check your notifications table schema.");
            }
            return res.status(201).json({ msg: `Registration successful! Your ${role} account is pending Admin approval.` });
        }

        // Standard student registration
        res.status(201).json({ msg: "Registration successful! You can now log in." });

    } catch (err) {
        console.error("REGISTER ERROR:", err);
        res.status(500).json({ msg: "Server error" });
    }
};

/* =====================================================
   2. SIGN IN (With Status Security Check)
===================================================== */
exports.loginUser = async (req, res) => {
    try {
        let { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ msg: "Email and password required" });
        }

        email = email.trim().toLowerCase();

        const users = await query("SELECT * FROM users WHERE email = ?", [email]);
        if (users.length === 0) {
            return res.status(400).json({ msg: "Invalid email or password" });
        }

        const user = users[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: "Invalid email or password" });
        }

        // Prevent pending or suspended users from logging in
        if (user.status === "pending") {
            return res.status(403).json({ msg: "Access Denied: Your account is still pending Admin approval." });
        }
        if (user.status === "inactive") {
            return res.status(403).json({ msg: "Access Denied: Your account has been suspended." });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        try {
            await query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);
        } catch (loginUpdateErr) {
            console.warn("Last login update skipped:", loginUpdateErr.message);
        }

        let streak = null;
        if (user.role === "student") {
            try {
                streak = await recordLoginStreak(user.id);
            } catch (streakErr) {
                console.warn("Login streak update skipped:", streakErr.message);
            }
        }

        res.status(200).json({
            msg: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                streak: streak ? streak.currentStreak : undefined
            }
        });

    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ msg: "Server error" });
    }
};

/* =====================================================
   3. FORGOT PASSWORD (SEND OTP)
===================================================== */
exports.forgotPassword = async (req, res) => {
    try {
        let { email } = req.body;

        if (!email) return res.status(400).json({ msg: "Email is required" });

        email = email.trim().toLowerCase();

        const user = await User.findByEmail(email);
        if (!user) return res.status(400).json({ msg: "Email not registered" });

        const otp = Math.floor(100000 + Math.random() * 900000);
        const hashedOtp = await bcrypt.hash(otp.toString(), 10);

        await User.saveResetToken(email, hashedOtp, Date.now() + RESET_WINDOW_MS);
        await clearPasswordResetVerification(email);

        // Production password recovery requires SMTP delivery; never expose an OTP in the API response.
        await sendPasswordResetOtp({ email, name: user.name, otp });

        res.json({
            msg: "OTP sent to registered email",
            email
        });

    } catch (err) {
        // Keep error diagnostics useful without logging credentials, OTPs, or message contents.
        console.error("FORGOT PASSWORD ERROR:", {
            message: err.message,
            code: err.code,
            command: err.command,
            responseCode: err.responseCode
        });
        res.status(500).json({
            msg: "OTP could not be sent. Please check the email address and SMTP sender configuration."
        });
    }
};

/* =====================================================
   4. VERIFY OTP
===================================================== */
exports.verifyOtp = async (req, res) => {
    try {
        let { email, otp } = req.body;

        if (!email || !otp) return res.status(400).json({ msg: "Email and OTP are required" });

        email = email.trim().toLowerCase();
        const user = await User.findByEmail(email);

        if (!user || !user.reset_token) return res.status(400).json({ msg: "Invalid OTP Request" });

        if (Date.now() > getExpiryTime(user.reset_token_expiry)) {
            return res.status(400).json({ msg: "OTP expired" });
        }

        const isValid = await bcrypt.compare(otp.toString(), user.reset_token);

        if (!isValid) return res.status(400).json({ msg: "Incorrect OTP" });

        await markPasswordResetVerified(email);

        res.json({ msg: "OTP verified successfully" });

    } catch (err) {
        console.error("VERIFY OTP ERROR:", err);
        res.status(500).json({ msg: "Server error" });
    }
};

/* =====================================================
   5. RESET PASSWORD (FORGOT FLOW)
===================================================== */
exports.resetPassword = async (req, res) => {
    try {
        let { email, newPassword } = req.body;

        if (!email || !newPassword) return res.status(400).json({ msg: "All fields required" });
        if (newPassword.length < 6) return res.status(400).json({ msg: "Password must be at least 6 characters" });

        email = email.trim().toLowerCase();
        const user = await User.findByEmail(email);

        if (!user || !user.reset_token) {
            return res.status(400).json({ msg: "Please request a password reset OTP first" });
        }

        if (Date.now() > getExpiryTime(user.reset_token_expiry)) {
            await User.clearResetToken(email);
            await clearPasswordResetVerification(email);
            return res.status(400).json({ msg: "OTP expired. Please request a new one." });
        }

        const isVerified = await hasPasswordResetVerification(email);
        if (!isVerified) {
            return res.status(403).json({ msg: "OTP verification required before resetting password" });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await User.updatePassword(email, hashed);
        await User.clearResetToken(email);
        await clearPasswordResetVerification(email);

        res.json({ msg: "Password reset successful" });

    } catch (err) {
        res.status(500).json({ msg: "Server error" });
    }
};

/* =====================================================
   6. CHANGE PASSWORD (SETTINGS FLOW)
===================================================== */
exports.changePassword = async (req, res) => {
    try {
        const { userId, currentPassword, newPassword } = req.body;

        if (!userId || !currentPassword || !newPassword) {
            return res.status(400).json({ msg: "All fields are required" });
        }

        const users = await query("SELECT password FROM users WHERE id = ?", [userId]);
        if (users.length === 0) return res.status(404).json({ msg: "User not found" });

        const user = users[0];

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ msg: "Incorrect current password" });

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await query("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId]);

        res.json({ msg: "Password updated successfully" });

    } catch (err) {
        console.error("Change Password Error:", err);
        res.status(500).json({ msg: "Server Error" });
    }
};
