import React, { useEffect, useState } from "react";
import "./Auth.css";
import axios from "axios";
import "../apiConfig";
import {
    FaArrowLeft,
    FaEnvelope,
    FaEye,
    FaEyeSlash,
    FaGraduationCap,
    FaLock,
    FaRocket,
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

    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [showRegisterPassword, setShowRegisterPassword] = useState(false);
    const [showResetPassword, setShowResetPassword] = useState(false);

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
            const res = await axios.post("https://campus-bridge-lms.onrender.com/api/auth/register", payload);
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
            const res = await axios.post("https://campus-bridge-lms.onrender.com/api/auth/login", loginData);
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
            const res = await axios.post("https://campus-bridge-lms.onrender.com/api/auth/forgot-password", { email: forgotEmail });
            showMessage("success", res.data.msg || `OTP sent to ${forgotEmail}.`);
            setOtpTimer(OTP_DURATION_SECONDS);
            setIsOtpExpired(false);
            setIsOtpStage(true);
        } catch (err) {
            showMessage("error", err.response?.data?.msg || "Error sending OTP.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResendOtp = async () => {
        setIsSubmitting(true);
        try {
            const res = await axios.post("https://campus-bridge-lms.onrender.com/api/auth/forgot-password", { email: forgotEmail });
            showMessage("success", res.data.msg || `OTP resent to ${forgotEmail}.`);
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
            showMessage("error", "Enter the 6-digit OTP.");
            return;
        }

        setIsSubmitting(true);
        try {
            await axios.post("https://campus-bridge-lms.onrender.com/api/auth/verify-otp", { email: forgotEmail, otp });
            showMessage("success", "OTP verified. Create your new password.");
            setIsResetStage(true);
        } catch (err) {
            showMessage("error", err.response?.data?.msg || "Invalid OTP.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResetPassword = async () => {
        if (newPassword.length < 6) {
            showMessage("error", "New password must be at least 6 characters.");
            return;
        }

        setIsSubmitting(true);
        try {
            await axios.post("https://campus-bridge-lms.onrender.com/api/auth/reset-password", { email: forgotEmail, newPassword });
            showMessage("success", "Password reset successful. Please login.");
            setForgotEmail("");
            resetForgotFlow();
        } catch (err) {
            showMessage("error", err.response?.data?.msg || "Reset failed.");
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
            <div className="animated-bg">
                <span className="shape shape-one"></span>
                <span className="shape shape-two"></span>
                <span className="shape shape-three"></span>
            </div>

            <header className="brand-header">
                <div className="brand-mark"><FaGraduationCap /></div>
                <div className="brand-text">
                    <h2>Campus Bridge</h2>
                    <span>Learning Management Portal</span>
                </div>
            </header>

            <div className={`auth-wrapper ${isRightPanelActive ? "right-panel-active" : ""} ${isForgot ? "forgot-active" : ""}`}>
                {!isForgot && (
                    <div className="form-container sign-in-container">
                        <form className="auth-form" onSubmit={handleLogin}>
                            <div className="form-kicker"><FaShieldAlt /> Secure access</div>
                            <h1>Welcome Back</h1>
                            <span className="subtitle">Sign in to continue your campus workflow.</span>

                            {message.text && !isRightPanelActive && (
                                <div className={`auth-message ${message.type}`}>{message.text}</div>
                            )}

                            <div className="input-group">
                                <FaEnvelope className="input-icon" />
                                <input type="email" name="email" placeholder="Email address" value={loginData.email} onChange={handleLoginChange} required />
                            </div>

                            <div className="input-group">
                                <FaLock className="input-icon" />
                                <input
                                    type={showLoginPassword ? "text" : "password"}
                                    name="password"
                                    placeholder="Password"
                                    value={loginData.password}
                                    onChange={handleLoginChange}
                                    required
                                />
                                <button type="button" className="password-toggle" onClick={() => setShowLoginPassword(prev => !prev)} aria-label="Toggle password visibility">
                                    {showLoginPassword ? <FaEyeSlash /> : <FaEye />}
                                </button>
                            </div>

                            <button type="button" className="forgot-password-link" onClick={startForgotFlow}>
                                Forgot Password?
                            </button>

                            <button type="submit" className="primary-btn" disabled={isSubmitting}>
                                {isSubmitting ? "Please wait..." : "Login"}
                            </button>

                            <span className="mobile-switch" onClick={() => handlePanelSwitch(true)}>
                                Don't have an account? <strong>Sign Up</strong>
                            </span>
                        </form>
                    </div>
                )}

                {!isForgot && (
                    <div className="form-container sign-up-container">
                        <form className="auth-form" onSubmit={handleRegister}>
                            <div className="form-kicker"><FaUserCheck /> Complete registration</div>
                            <h1>Create Account</h1>
                            <span className="subtitle">Join as a student, faculty member, or admin.</span>

                            {message.text && isRightPanelActive && (
                                <div className={`auth-message ${message.type}`}>{message.text}</div>
                            )}

                            <div className="input-group">
                                <FaUser className="input-icon" />
                                <input type="text" name="name" placeholder="Full name" required value={registerData.name} onChange={handleRegisterChange} />
                            </div>

                            <div className="input-group">
                                <FaEnvelope className="input-icon" />
                                <input type="email" name="email" placeholder="Email address" required value={registerData.email} onChange={handleRegisterChange} />
                            </div>

                            <div className="input-group">
                                <FaLock className="input-icon" />
                                <input
                                    type={showRegisterPassword ? "text" : "password"}
                                    name="password"
                                    placeholder="Create password"
                                    required
                                    value={registerData.password}
                                    onChange={handleRegisterChange}
                                />
                                <button type="button" className="password-toggle" onClick={() => setShowRegisterPassword(prev => !prev)} aria-label="Toggle password visibility">
                                    {showRegisterPassword ? <FaEyeSlash /> : <FaEye />}
                                </button>
                            </div>

                            <div className="input-group">
                                <FaLock className="input-icon" />
                                <input
                                    type={showRegisterPassword ? "text" : "password"}
                                    name="confirmPassword"
                                    placeholder="Confirm password"
                                    required
                                    value={registerData.confirmPassword}
                                    onChange={handleRegisterChange}
                                />
                            </div>

                            <div className="role-select-container">
                                <FaGraduationCap className="input-icon" />
                                <select name="role" value={registerData.role} onChange={handleRegisterChange}>
                                    <option value="student">Student</option>
                                    <option value="faculty">Faculty</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            <button type="submit" className="primary-btn" disabled={isSubmitting}>
                                {isSubmitting ? "Creating..." : "Register"}
                            </button>

                            <span className="mobile-switch" onClick={() => handlePanelSwitch(false)}>
                                Already have an account? <strong>Sign In</strong>
                            </span>
                        </form>
                    </div>
                )}

                {isForgot && (
                    <div className="form-container reset-container forgot-mode">
                        <form className="auth-form reset-form" onSubmit={(e) => e.preventDefault()}>
                            <div className="form-kicker"><FaShieldAlt /> Password recovery</div>
                            <div className="reset-steps" aria-label="Reset password progress">
                                <span className={!isOtpStage ? "active" : "done"}>Email</span>
                                <span className={isOtpStage && !isResetStage ? "active" : isResetStage ? "done" : ""}>OTP</span>
                                <span className={isResetStage ? "active" : ""}>Password</span>
                            </div>

                            {message.text && (
                                <div className={`auth-message ${message.type}`}>{message.text}</div>
                            )}

                            {!isOtpStage && !isResetStage && (
                                <>
                                    <h1>Reset Password</h1>
                                    <span className="subtitle">Enter your registered email and we will send a secure OTP.</span>
                                    <div className="input-group">
                                        <FaEnvelope className="input-icon" />
                                        <input type="email" placeholder="Email address" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
                                    </div>
                                    <button type="button" className="primary-btn" onClick={handleForgotPassword} disabled={isSubmitting}>
                                        {isSubmitting ? "Sending..." : "Send OTP"}
                                    </button>
                                </>
                            )}

                            {isOtpStage && !isResetStage && (
                                <>
                                    <h1>Verify Identity</h1>
                                    <div className="timer-text">
                                        {isOtpExpired ? (
                                            <button type="button" className="expired-link" onClick={handleResendOtp} disabled={isSubmitting}>Resend Code</button>
                                        ) : (
                                            <span>Code expires in <strong>{formatTimer(otpTimer)}</strong></span>
                                        )}
                                    </div>
                                    <div className="input-group">
                                        <FaLock className="input-icon" />
                                        <input type="text" inputMode="numeric" maxLength="6" placeholder="Enter 6-digit OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
                                    </div>
                                    <button type="button" className="primary-btn" onClick={handleOtpVerify} disabled={isSubmitting || isOtpExpired}>
                                        {isSubmitting ? "Checking..." : "Verify OTP"}
                                    </button>
                                </>
                            )}

                            {isResetStage && (
                                <>
                                    <h1>New Password</h1>
                                    <span className="subtitle">Choose a strong password with at least 6 characters.</span>
                                    <div className="input-group">
                                        <FaLock className="input-icon" />
                                        <input
                                            type={showResetPassword ? "text" : "password"}
                                            placeholder="Enter new password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                        />
                                        <button type="button" className="password-toggle" onClick={() => setShowResetPassword(prev => !prev)} aria-label="Toggle password visibility">
                                            {showResetPassword ? <FaEyeSlash /> : <FaEye />}
                                        </button>
                                    </div>
                                    <button type="button" className="primary-btn" onClick={handleResetPassword} disabled={isSubmitting}>
                                        {isSubmitting ? "Updating..." : "Update Password"}
                                    </button>
                                </>
                            )}

                            <button type="button" className="back-to-login-link" onClick={() => { resetForgotFlow(); setMessage({ type: "", text: "" }); }}>
                                <FaArrowLeft /> Back to Login
                            </button>
                        </form>
                    </div>
                )}

                <div className="overlay-container">
                    <div className="overlay">
                        <div className="overlay-panel overlay-left">
                            <div className="overlay-icon"><FaRocket /></div>
                            <h1>Already registered?</h1>
                            <p>Return to your dashboard, manage classes, review updates, and keep learning moving.</p>
                            <button type="button" className="ghost" onClick={() => handlePanelSwitch(false)}>
                                Sign In
                            </button>
                        </div>

                        <div className="overlay-panel overlay-right">
                            <div className="overlay-icon"><FaGraduationCap /></div>
                            <h1>New to Campus Bridge?</h1>
                            <p>Create your account and unlock one connected place for courses, attendance, coding practice, and updates.</p>
                            <button type="button" className="ghost" onClick={() => handlePanelSwitch(true)}>
                                Sign Up
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;
