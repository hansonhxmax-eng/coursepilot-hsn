import React, { useEffect, useId, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, Check, Eye, EyeOff, GraduationCap, LockKeyhole, UserRound } from "lucide-react";
import "./auth.css";

const CONTENT = {
  login: {
    eyebrow: "YOUR PERSONAL WORKSPACE",
    title: "Welcome back.",
    description: "Sign in to continue planning your semester.",
    submit: "Sign in",
    pending: "Signing in…",
  },
  signup: {
    eyebrow: "MAKE ROOM FOR A BETTER SEMESTER",
    title: "Create your account.",
    description: "Keep your course choices and preferences together.",
    submit: "Create account",
    pending: "Creating account…",
  },
  forgot: {
    eyebrow: "LET’S GET YOU BACK IN",
    title: "Forgot your password?",
    description: "Enter your email and we’ll send you a link to reset it.",
    submit: "Send reset link",
    pending: "Sending reset link…",
  },
  reset: {
    eyebrow: "A FRESH START",
    title: "Choose a new password.",
    description: "Use a strong password you haven’t used elsewhere.",
    submit: "Update password",
    pending: "Updating password…",
  },
};

export default function AuthScreen({ mode = "login", busy = false, error = "", notice = "", configured = true, onNavigate, onSubmit }) {
  const current = CONTENT[mode] ? mode : "login";
  const copy = CONTENT[current];
  const formId = useId();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [validation, setValidation] = useState("");
  const choosesPassword = current === "signup" || current === "reset";
  const hasPassword = current !== "forgot";
  const message = validation || error;

  useEffect(() => {
    setPassword("");
    setConfirmation("");
    setShowPassword(false);
    setValidation("");
  }, [current]);

  function submit(event) {
    event.preventDefault();
    if (busy || !configured) return;
    if (choosesPassword && password !== confirmation) {
      setValidation("The passwords do not match. Please enter them again.");
      document.getElementById(`${formId}-confirmation`)?.focus();
      return;
    }
    setValidation("");
    onSubmit({ email: email.trim(), password, displayName: displayName.trim() });
  }

  return <main className="auth-screen">
    <div className="auth-layout">
      <section className="auth-introduction" aria-label="About CoursePilot">
        <div className="auth-brand"><span><GraduationCap size={26} aria-hidden="true" /></span>CoursePilot<span className="auth-brand-dot">.</span></div>
        <div className="auth-intro-copy">
          <span className="auth-eyebrow">YOUR COURSES. YOUR WAY.</span>
          <h1>A little clarity.<br />A better semester.</h1>
          <p>Explore your options, learn from other students, and build a course plan that works for you.</p>
        </div>
        <div className="auth-benefits">
          <div><CalendarDays size={22} aria-hidden="true" /><p><strong>Your own course plan</strong><span>Keep your selected courses and planning preferences in one place.</span></p></div>
          <div><BookOpen size={22} aria-hidden="true" /><p><strong>Student perspectives</strong><span>Read course ratings and anonymous reviews before deciding.</span></p></div>
          <div><UserRound size={22} aria-hidden="true" /><p><strong>A workspace of your own</strong><span>Sign in to return to your personal course choices.</span></p></div>
        </div>
        <p className="auth-intro-footer">Plan thoughtfully. Leave room for what matters.</p>
      </section>

      <section className="auth-card" aria-labelledby={`${formId}-title`}>
        <span className="auth-eyebrow">{copy.eyebrow}</span>
        <h2 id={`${formId}-title`}>{copy.title}</h2>
        <p className="auth-description">{copy.description}</p>

        {!configured && <p className="auth-message auth-message-error" role="status">Account sign-in is temporarily unavailable. Please try again later.</p>}
        {notice && <p className="auth-message auth-message-success" role="status"><Check size={18} aria-hidden="true" /><span>{notice}</span></p>}
        {message && <p className="auth-message auth-message-error" role="alert" id={`${formId}-error`}>{message}</p>}

        <form onSubmit={submit} className="auth-form" aria-busy={busy} aria-describedby={message ? `${formId}-error` : undefined}>
          <fieldset disabled={busy}>
            {current === "signup" && <div className="auth-field">
              <label htmlFor={`${formId}-name`}>Name <span className="auth-optional">(optional)</span></label>
              <input id={`${formId}-name`} name="displayName" autoComplete="name" maxLength={80} value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="What should we call you?" />
            </div>}
            {current !== "reset" && <div className="auth-field">
              <label htmlFor={`${formId}-email`}>Email address</label>
              <input id={`${formId}-email`} name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoCapitalize="none" spellCheck={false} />
            </div>}
            {hasPassword && <div className="auth-field">
              <div className="auth-label-row"><label htmlFor={`${formId}-password`}>Password</label>{current === "login" && <button className="auth-text-button" type="button" onClick={() => onNavigate("forgot")}>Forgot password?</button>}</div>
              <div className="auth-password-input">
                <input id={`${formId}-password`} name="password" type={showPassword ? "text" : "password"} autoComplete={choosesPassword ? "new-password" : "current-password"} required minLength={choosesPassword ? 12 : undefined} value={password} onChange={event => { setPassword(event.target.value); setValidation(""); }} aria-describedby={choosesPassword ? `${formId}-password-hint` : undefined} />
                <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button>
              </div>
              {choosesPassword && <p className="auth-field-hint" id={`${formId}-password-hint`}>Use at least 12 characters.</p>}
            </div>}
            {choosesPassword && <div className="auth-field">
              <label htmlFor={`${formId}-confirmation`}>Confirm password</label>
              <input id={`${formId}-confirmation`} name="passwordConfirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} value={confirmation} onChange={event => { setConfirmation(event.target.value); setValidation(""); }} aria-invalid={validation ? true : undefined} aria-describedby={validation ? `${formId}-error` : undefined} />
            </div>}
            <button className="auth-submit" type="submit" disabled={busy || !configured}><span>{busy ? copy.pending : copy.submit}</span>{!busy && <ArrowRight size={18} aria-hidden="true" />}</button>
          </fieldset>
        </form>

        {current === "login" && <p className="auth-switch">New to CoursePilot? <button type="button" onClick={() => onNavigate("signup")} disabled={busy}>Create an account</button></p>}
        {current === "signup" && <p className="auth-switch">Already have an account? <button type="button" onClick={() => onNavigate("login")} disabled={busy}>Sign in</button></p>}
        {(current === "forgot" || current === "reset") && <p className="auth-switch"><button type="button" onClick={() => onNavigate("login")} disabled={busy}>Back to sign in</button></p>}
        <div className="auth-card-footer"><LockKeyhole size={16} aria-hidden="true" /><span>Your account keeps your course choices separate.</span></div>
      </section>
    </div>
  </main>;
}
