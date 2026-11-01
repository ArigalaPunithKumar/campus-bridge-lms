import React, { useEffect, useState } from "react";
import "./Auth.css";
import axios from "axios";
import { API_BASE_URL } from "../apiConfig";
import {
    FaArrowLeft,
    FaEnvelope,
    FaEye,
    FaEyeSlash,
    FaGraduationCap,
    FaLock,
    FaShieldAlt,
    FaUser,
    FaUserCheck
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";

const OTP_DURATION_SECONDS = 600;

const AuthPage = () => {
    const navigate = useNavigate();

    const [isRightPanelActive, setIsRightPanelActive] = useState(false);
    const [isForgot, setIsForgot] = useState(false);
    const [isOtpStage, setIsOtpStage] = useState(false);
    const [isResetStage, setIsResetStage] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [forgotEmail, setForgotEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmResetPassword, setConfirmResetPassword] = useState("");
    const [devOtp, setDevOtp] = useState("");

    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [showRegisterPassword, setShowRegisterPassword] = useState(false);
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [showConfirmResetPassword, setShowConfirmResetPassword] = useState(false);

    const [otpTimer, setOtpTimer] = useState(OTP_DURATION_SECONDS);
    const [isOtpExpired, setIsOtpExpired] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });

    const [registerData, setRegisterData] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
        role: "student",
    });

    const [loginData, setLoginData] = useState({
        email: "",
        password: "",
    });

    useEffect(() => {
        let interval;
        if (isOtpStage && !isResetStage && !isOtpExpired) {
            interval = setInterval(() => {
                setOtpTimer((prev) => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        setIsOtpExpired(true);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isOtpStage, isResetStage, isOtpExpired]);

    const showMessage = (type, text) => setMessage({ type, text });

    const formatTimer = (seconds) => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
        const secs = (seconds % 60).toString().padStart(2, "0");
        return `${mins}:${secs}`;
    };

    const resetForgotFlow = () => {
        setIsForgot(false);
        setIsOtpStage(false);
        setIsResetStage(false);
        setOtp("");
        setNewPassword("");
        setConfirmResetPassword("");
        setDevOtp("");
        setOtpTimer(OTP_DURATION_SECONDS);
        setIsOtpExpired(false);
    };

    const handleRegisterChange = (e) => {
        setRegisterData({ ...registerData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        if (registerData.password.length < 6) {
            showMessage("error", "Password must be at least 6 characters.");
            return;
        }

        if (registerData.password !== registerData.confirmPassword) {
            showMessage("error", "Passwords do not match.");
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                name: registerData.name,
                email: registerData.email,
                password: registerData.password,
                role: registerData.role,
            };
            const res = await axios.post(`${API_BASE_URL}/auth/register`, payload);
            showMessage("success", res.data.msg || "Registration successful.");
            setIsRightPanelActive(false);
            setRegisterData({
                name: "",
                email: "",
                password: "",
                confirmPassword: "",
                role: "student",
            });
        } catch (error) {
            showMessage("error", error.response?.data?.msg || "Error registering user.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLoginChange = (e) => {
        setLoginData({ ...loginData, [e.target.name]: e.target.value });
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const res = await axios.post(`${API_BASE_URL}/auth/login`, loginData);
            const { user } = res.data;
            showMessage("success", `Welcome back, ${user.name}.`);

            if (user.role === "student") navigate("/student/dashboard", { replace: true, state: { user } });
            else if (user.role === "faculty") navigate("/faculty/dashboard", { replace: true, state: { user } });
            else if (user.role === "admin") navigate("/admin/dashboard", { replace: true, state: { user } });
            else navigate("/auth");
        } catch (error) {
            showMessage("error", error.response?.data?.msg || "Invalid email or password.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!forgotEmail) {
            showMessage("error", "Enter your registered email first.");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await axios.post(`${API_BASE_URL}/auth/forgot-password`, { email: forgotEmail });
            setDevOtp(res.data.otpPreview || "");
            showMessage("success", res.data.msg || `OTP generated for ${forgotEmail}.`);
            setOtpTimer(OTP_DURATION_SECONDS);
            setIsOtpExpired(false);
            setIsOtpStage(true);
        } catch (err) {
            showMessage("error", err.response?.data?.msg || "Error generating OTP.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResendOtp = async () => {
        setIsSubmitting(true);
        try {
            const res = await axios.post(`${API_BASE_URL}/auth/forgot-password`, { email: forgotEmail });
            setDevOtp(res.data.otpPreview || "");
            showMessage("success", res.data.msg || `OTP refreshed for ${forgotEmail}.`);
            setOtpTimer(OTP_DURATION_SECONDS);
            setIsOtpExpired(false);
        } catch (err) {
            showMessage("error", err.response?.data?.msg || "Error resending OTP.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOtpVerify = async () => {
        if (otp.length < 6) {
            showMessage("error", "Enter the 6-digit verification code.");
            return;
        }

        setIsSubmitting(true);
        try {
            await axios.post(`${API_BASE_URL}/auth/verify-otp`, { email: forgotEmail, otp });
            showMessage("success", "OTP verified! Please create your new password.");
            setIsResetStage(true);
        } catch (err) {
            showMessage("error", err.response?.data?.msg || "Invalid or expired OTP.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResetPassword = async () => {
        if (newPassword.length < 6) {
            showMessage("error", "New password must be at least 6 characters.");
            return;
        }

        if (confirmResetPassword && newPassword !== confirmResetPassword) {
            showMessage("error", "Passwords do not match.");
            return;
        }

        setIsSubmitting(true);
        try {
            await axios.post(`${API_BASE_URL}/auth/reset-password`, { email: forgotEmail, newPassword });
            showMessage("success", "Password reset successful! Please login with your new password.");
            setForgotEmail("");
            resetForgotFlow();
        } catch (err) {
            showMessage("error", err.response?.data?.msg || "Reset failed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePanelSwitch = (status) => {
        setIsRightPanelActive(status);
        resetForgotFlow();
        setMessage({ type: "", text: "" });
    };

    const startForgotFlow = () => {
        setIsForgot(true);
        setMessage({ type: "", text: "" });
    };

    return (
        <div className="auth-container">
            {/* Animated background ambient lighting */}
            <div className="animated-bg">
                <span className="shape shape-one"></span>
                <span className="shape shape-two"></span>
                <span className="shape shape-three"></span>
            </div>

            {/* University Brand Header */}
            <header className="brand-header">
                <div className="brand-mark"><FaGraduationCap /></div>
                <div className="brand-text">
                    <h2>Campus Bridge</h2>
                    <span>LMS Portal</span>
                </div>
            </header>

            {/* Central Auth Card */}
            <div className={`auth-wrapper ${isRightPanelActive ? "right-panel-active" : ""} ${isForgot ? "forgot-active" : ""}`}>
                {!isForgot && (
                    <div className="auth-tab-switch">
                        <button
                            type="button"
                            className={`auth-tab-btn ${!isRightPanelActive ? "active" : ""}`}
                            onClick={() => handlePanelSwitch(false)}
                        >
                            Sign In
                        </button>
                        <button
                            type="button"
                            className={`auth-tab-btn ${isRightPanelActive ? "active" : ""}`}
                            onClick={() => handlePanelSwitch(true)}
                        >
                            Create Account
                        </button>
                    </div>
                )}

                {/* SIGN IN FORM */}
                {!isForgot && (
                    <div className="form-container sign-in-container">
                        <form className="auth-form" onSubmit={handleLogin}>
                            <div className="form-kicker"><FaShieldAlt /> Secure access</div>
                            <h1>Welcome Back</h1>
                            <span className="subtitle">Sign in to access courses, attendance, and campus tools.</span>

                            {message.text && !isRightPanelActive && (
                                <div className={`auth-message ${message.type}`}>{message.text}</div>
                            )}

                            <div className="input-group">
                                <FaEnvelope className="input-icon" />
                                <input
                                    type="email"
                                    name="email"
                                    placeholder="Registered email address"
                                    value={loginData.email}
                                    onChange={handleLoginChange}
                                    required
                                />
                            </div>

                            <div className="input-group">
                                <FaLock className="input-icon" />
                                <input
                                    type={showLoginPassword ? "text" : "password"}
                                    name="password"
                                    placeholder="Account password"
                                    value={loginData.password}
                                    onChange={handleLoginChange}
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowLoginPassword(prev => !prev)}
                                    aria-label="Toggle password visibility"
                                >
                                    {showLoginPassword ? <FaEyeSlash /> : <FaEye />}
                                </button>
                            </div>

                            <button type="button" className="forgot-password-link" onClick={startForgotFlow}>
                                Forgot Password?
                            </button>

                            <button type="submit" className="primary-btn" disabled={isSubmitting}>
                                {isSubmitting ? "Signing in..." : "Sign In"}
                            </button>

                            <button type="button" className="mobile-switch" onClick={() => handlePanelSwitch(true)}>
                                Don't have an account? <strong>Sign Up</strong>
                            </button>
                        </form>
                    </div>
                )}

                {/* SIGN UP FORM */}
                {!isForgot && (
                    <div className="form-container sign-up-container">
                        <form className="auth-form" onSubmit={handleRegister}>
                            <div className="form-kicker"><FaUserCheck /> Registration</div>
                            <h1>Create Account</h1>
                            <span className="subtitle">Join as a student, faculty member, or campus admin.</span>

                            {message.text && isRightPanelActive && (
                                <div className={`auth-message ${message.type}`}>{message.text}</div>
                            )}

                            <div className="input-group">
                                <FaUser className="input-icon" />
                                <input
                                    type="text"
                                    name="name"
                                    placeholder="Full name"
                                    required
                                    value={registerData.name}
                                    onChange={handleRegisterChange}
                                />
                            </div>

                            <div className="input-group">
                                <FaEnvelope className="input-icon" />
                                <input
                                    type="email"
                                    name="email"
                                    placeholder="Email address"
                                    required
                                    value={registerData.email}
                                    onChange={handleRegisterChange}
                                />
                            </div>

                            <div className="input-group">
                                <FaLock className="input-icon" />
                                <input
                                    type={showRegisterPassword ? "text" : "password"}
                                    name="password"
                                    placeholder="Create password (min 6 characters)"
                                    required
                                    value={registerData.password}
                                    onChange={handleRegisterChange}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowRegisterPassword(prev => !prev)}
                                    aria-label="Toggle password visibility"
                                >
                                    {showRegisterPassword ? <FaEyeSlash /> : <FaEye />}
                                </button>
                            </div>

                            <div className="input-group">
                                <FaLock className="input-icon" />
                                <input
                                    type={showRegisterPassword ? "text" : "password"}
                                    name="confirmPassword"
                                    placeholder="Confirm your password"
                                    required
                                    value={registerData.confirmPassword}
                                    onChange={handleRegisterChange}
                                />
                            </div>

                            <div className="role-select-container">
                                <FaGraduationCap className="input-icon" />
                                <select name="role" value={registerData.role} onChange={handleRegisterChange}>
                                    <option value="student">Student Account</option>
                                    <option value="faculty">Faculty Account</option>
                                    <option value="admin">Administrator</option>
                                </select>
                            </div>

                            <button type="submit" className="primary-btn" disabled={isSubmitting}>
                                {isSubmitting ? "Creating Account..." : "Create Account"}
                            </button>

                            <button type="button" className="mobile-switch" onClick={() => handlePanelSwitch(false)}>
                                Already have an account? <strong>Sign In</strong>
                            </button>
                        </form>
                    </div>
                )}

                {/* FORGOT & RESET PASSWORD FLOW */}
                {isForgot && (
                    <div className="form-container reset-container forgot-mode">
                        <form className="auth-form reset-form" onSubmit={(e) => e.preventDefault()}>
                            <div className="reset-steps" aria-label="Password recovery steps">
                                <span className={!isOtpStage ? "active" : "done"}>1. Email</span>
                                <span className={isOtpStage && !isResetStage ? "active" : isResetStage ? "done" : ""}>2. OTP</span>
                                <span className={isResetStage ? "active" : ""}>3. New Password</span>
                            </div>

                            {message.text && (
                                <div className={`auth-message ${message.type}`}>{message.text}</div>
                            )}

                            {/* STEP 1: ENTER EMAIL */}
                            {!isOtpStage && !isResetStage && (
                                <>
                                    <h1>Reset Password</h1>
                                    <span className="subtitle">Enter your registered email and we will generate a secure verification OTP.</span>
                                    <div className="input-group">
                                        <FaEnvelope className="input-icon" />
                                        <input
                                            type="email"
                                            placeholder="Registered email address"
                                            value={forgotEmail}
                                            onChange={(e) => setForgotEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <button type="button" className="primary-btn" onClick={handleForgotPassword} disabled={isSubmitting}>
                                        {isSubmitting ? "Generating OTP..." : "Send Verification OTP"}
                                    </button>
                                </>
                            )}

                            {/* STEP 2: VERIFY OTP */}
                            {isOtpStage && !isResetStage && (
                                <>
                                    <h1>Verify OTP</h1>
                                    <span className="subtitle">Enter the 6-digit verification code for {forgotEmail}.</span>

                                    {devOtp && (
                                        <div className="otp-preview-banner">
                                            <div className="otp-preview-text">
                                                <span className="otp-badge-title">Verification Code</span>
                                                <div className="otp-code-highlight">{devOtp}</div>
                                            </div>
                                            <button
                                                type="button"
                                                className="otp-autofill-btn"
                                                onClick={() => setOtp(String(devOtp))}
                                                title="Click to auto-fill code"
                                            >
                                                Auto-fill
                                            </button>
                                        </div>
                                    )}

                                    <div className="timer-text">
                                        {isOtpExpired ? (
                                            <button type="button" className="expired-link" onClick={handleResendOtp} disabled={isSubmitting}>
                                                Code expired. Click to Resend
                                            </button>
                                        ) : (
                                            <span>Code expires in <strong>{formatTimer(otpTimer)}</strong></span>
                                        )}
                                    </div>

                                    <div className="input-group">
                                        <FaLock className="input-icon" />
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength="6"
                                            placeholder="Enter 6-digit OTP"
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                                        />
                                    </div>

                                    <button type="button" className="primary-btn" onClick={handleOtpVerify} disabled={isSubmitting || isOtpExpired}>
                                        {isSubmitting ? "Verifying..." : "Verify & Continue"}
                                    </button>
                                </>
                            )}

                            {/* STEP 3: NEW PASSWORD */}
                            {isResetStage && (
                                <>
                                    <h1>Set New Password</h1>
                                    <span className="subtitle">Choose a new, secure password (at least 6 characters).</span>
                                    
                                    <div className="input-group">
                                        <FaLock className="input-icon" />
                                        <input
                                            type={showResetPassword ? "text" : "password"}
                                            placeholder="Enter new password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            className="password-toggle"
                                            onClick={() => setShowResetPassword(prev => !prev)}
                                            aria-label="Toggle password visibility"
                                        >
                                            {showResetPassword ? <FaEyeSlash /> : <FaEye />}
                                        </button>
                                    </div>

                                    <div className="input-group">
                                        <FaLock className="input-icon" />
                                        <input
                                            type={showConfirmResetPassword ? "text" : "password"}
                                            placeholder="Confirm new password"
                                            value={confirmResetPassword}
                                            onChange={(e) => setConfirmResetPassword(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            className="password-toggle"
                                            onClick={() => setShowConfirmResetPassword(prev => !prev)}
                                            aria-label="Toggle confirm password visibility"
                                        >
                                            {showConfirmResetPassword ? <FaEyeSlash /> : <FaEye />}
                                        </button>
                                    </div>

                                    <button type="button" className="primary-btn" onClick={handleResetPassword} disabled={isSubmitting}>
                                        {isSubmitting ? "Updating Password..." : "Update Password"}
                                    </button>
                                </>
                            )}

                            <button
                                type="button"
                                className="back-to-login-link"
                                onClick={() => { resetForgotFlow(); setMessage({ type: "", text: "" }); }}
                            >
                                <FaArrowLeft /> Back to Login
                            </button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuthPage;
