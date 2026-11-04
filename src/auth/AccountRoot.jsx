import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { GraduationCap, LogOut, RefreshCw } from "lucide-react";
import AuthScreen from "./AuthScreen";
import { authClient, authRedirect } from "./client";
import { createWorkspaceSync, normalizeWorkspace } from "./workspace";
import { courses as demoCourses, DEFAULT as demoDefaults } from "../data";
import { REAL_DEFAULT as realDefaults } from "../schedules/model";
import catalog from "../schedules/uploaded.json";
import "./auth.css";

const AccountContext = createContext(null);
const normalizerOptions = { demoCourses, realCourses: catalog.courses, demoDefaults, realDefaults };
const normalize = value => normalizeWorkspace(value, normalizerOptions);
const routes = { login: "login", signup: "sign-up", forgot: "forgot-password", reset: "reset-password" };
function initialMode() {
  return Object.keys(routes).find(mode => `#${routes[mode]}` === window.location.hash) || "login";
}
function clearAuthLocation() {
  const url = new URL(window.location.href);
  for (const key of ["auth", "code", "error", "error_code", "error_description"]) url.searchParams.delete(key);
  if (Object.values(routes).includes(url.hash.slice(1)) || /access_token=|error_description=/.test(url.hash)) url.hash = "";
  window.history.replaceState(null, "", url);
}

export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error("A signed-in workspace is required.");
  return account;
}

function StatusScreen({ title, children, error = false }) {
  return <main className="account-status-screen"><section className="account-status-card">
    <GraduationCap size={32} /><h1>{title}</h1><div role={error ? "alert" : "status"}>{children}</div>
  </section></main>;
}

export default function AccountRoot({ children }) {
  const [user, setUser] = useState(null);
  const verifiedUser = useRef(null);
  const [checking, setChecking] = useState(Boolean(authClient));
  const [mode, setMode] = useState(initialMode);
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!authClient) return;
    let active = true, generation = 0, receivedEvent = false;
    const callbackError = new URLSearchParams(window.location.hash.slice(1)).get("error_description")
      || new URLSearchParams(window.location.search).get("error_description");
    if (callbackError) {
      setError("This email link is invalid or has expired. Request a new link and open it in the same browser.");
      clearAuthLocation();
    }
    function receive(event, session) {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (session && session.user.id === verifiedUser.current?.id) return;
      const current = ++generation;
      if (!session) {
        verifiedUser.current = null;
        setUser(null); setChecking(false); setRecovery(false);
        return;
      }
      setChecking(true);
      // Supabase auth events run under its session lock. Verify outside that callback.
      setTimeout(async () => {
        try {
          const { data, error: verificationError } = await authClient.auth.getUser(session.access_token);
          if (!active || current !== generation) return;
          if (verificationError || !data.user) throw verificationError || new Error("Missing user");
          verifiedUser.current = data.user;
          setUser(data.user);
          if (new URLSearchParams(window.location.search).get("auth") === "recovery" || event === "PASSWORD_RECOVERY") setRecovery(true);
          else clearAuthLocation();
          setError("");
        } catch {
          if (!active || current !== generation) return;
          verifiedUser.current = null; setUser(null);
          setError("Your session could not be verified. Please sign in again.");
        } finally {
          if (active && current === generation) setChecking(false);
        }
      }, 0);
    }
    const { data: { subscription } } = authClient.auth.onAuthStateChange((event, session) => {
      receivedEvent = true;
      receive(event, session);
    });
    authClient.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || receivedEvent) return;
      if (sessionError) {
        if (active) { setChecking(false); setError("Your session could not be restored. Please sign in again."); }
      } else receive("INITIAL_SESSION", data.session);
    }).catch(() => { if (active && !receivedEvent) { setChecking(false); setError("Your session could not be restored. Please sign in again."); } });
    return () => { active = false; generation++; subscription.unsubscribe(); };
  }, []);
  async function navigate(next) {
    if (busy) return;
    if (recovery && next === "login") {
      setBusy(true);
      try { await signOut(); }
      catch { setError("Could not leave password recovery. Please try again."); }
      finally { setBusy(false); }
      return;
    }
    setMode(next); setError(""); setNotice("");
    const url = new URL(window.location.href); url.hash = routes[next];
    window.history.replaceState(null, "", url);
  }
  async function submit({ email, password, displayName }) {
    if (!authClient || busy) return;
    setBusy(true); setError(""); setNotice("");
    const action = recovery && user ? "reset" : mode;
    try {
      let result;
      if (action === "signup") {
        result = await authClient.auth.signUp({ email: email.trim(), password, options: {
          emailRedirectTo: authRedirect("confirm"), data: { display_name: displayName?.trim().slice(0, 80) || "" },
        } });
        if (!result.error) setNotice("Check your email to confirm your account, then return here to sign in. Open the confirmation link in this browser.");
      } else if (action === "forgot") {
        result = await authClient.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect("recovery") });
        if (!result.error) setNotice("If an account exists for this email, a reset link has been sent. Open it in this browser.");
      } else if (action === "reset") {
        if (!user || !recovery) throw new Error("Open a valid password reset link before choosing a new password.");
        result = await authClient.auth.updateUser({ password });
        if (!result.error) { setRecovery(false); setMode("login"); clearAuthLocation(); }
      } else {
        result = await authClient.auth.signInWithPassword({ email: email.trim(), password });
      }
      if (result.error) throw result.error;
    } catch (problem) {
      const code = problem.code || "";
      if (code === "invalid_credentials" || /invalid login credentials/i.test(problem.message || "")) setError("The email address or password is incorrect.");
      else if (code === "email_not_confirmed" || /email not confirmed/i.test(problem.message || "")) setError("Confirm your email address before signing in.");
      else if (/rate|limit/i.test(code)) setError("Too many attempts. Please wait a moment before trying again.");
      else if (problem.name === "AuthRetryableFetchError" || /fetch|network/i.test(problem.message || "")) setError("We could not connect. Check your connection and try again.");
      else setError(problem.message || "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }
  async function signOut() {
    const { error: signOutError } = await authClient.auth.signOut({ scope: "local" });
    if (signOutError) throw signOutError;
    verifiedUser.current = null; setUser(null); setRecovery(false); setMode("login");
    setError(""); setNotice(""); clearAuthLocation();
  }
  if (checking) return <StatusScreen title="Welcome to CoursePilot"><p>Checking your session…</p></StatusScreen>;
  if (!user || recovery) return <AuthScreen key={recovery ? "reset" : mode} mode={recovery ? "reset" : mode} busy={busy} error={error} notice={notice} configured={Boolean(authClient)} onNavigate={navigate} onSubmit={submit} />;
  return <PersonalWorkspace key={user.id} user={user} signOut={signOut}>{children}</PersonalWorkspace>;
}

function PersonalWorkspace({ user, signOut, children }) {
  const [initialWorkspace, setInitialWorkspace] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [syncState, setSyncState] = useState({ status: "saved", error: null });
  const syncRef = useRef(null), statusRef = useRef("saved");
  const [signingOut, setSigningOut] = useState(false);
  const [exitError, setExitError] = useState("");
  const [allowDiscard, setAllowDiscard] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoadError(false);
    authClient.from("user_workspaces").select("workspace").eq("user_id", user.id).maybeSingle().abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        const initial = normalize(data?.workspace);
        syncRef.current = createWorkspaceSync({ initial, onStatus: state => {
          if (active) { statusRef.current = state.status; setSyncState(state); }
        }, write: async snapshot => {
          const { error: saveError } = await authClient.from("user_workspaces").upsert({ user_id: user.id, workspace: normalize(snapshot) }, { onConflict: "user_id" });
          if (saveError) throw saveError;
        } });
        setInitialWorkspace(initial);
      }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; controller.abort(); syncRef.current?.dispose(); syncRef.current = null; };
  }, [user.id, attempt]);
  useEffect(() => {
    function protectChanges(event) {
      if (statusRef.current !== "saved") { event.preventDefault(); event.returnValue = ""; }
    }
    window.addEventListener("beforeunload", protectChanges);
    return () => window.removeEventListener("beforeunload", protectChanges);
  }, []);
  const saveSection = useCallback((section, value) => syncRef.current?.update(section, value), []);
  async function leave(discard = false) {
    if (signingOut) return;
    setSigningOut(true); setExitError(""); setAllowDiscard(false);
    try {
      if (!discard) {
        try { await syncRef.current?.flush(); }
        catch { setAllowDiscard(true); throw new Error("Your latest changes could not be saved. Retry saving, or sign out without them."); }
      }
      await signOut();
    } catch (problem) { setExitError(problem.message || "Could not sign out. Please try again."); }
    finally { setSigningOut(false); }
  }
  function retrySave() {
    setExitError(""); setAllowDiscard(false);
    syncRef.current?.retry().catch(() => {});
  }
  if (loadError) return <StatusScreen title="Your workspace could not be loaded" error>
    <p>Please check your connection and try again.</p>
    <div className="account-status-actions"><button className="account-button" onClick={() => setAttempt(n => n + 1)}>Retry loading workspace</button>
      <button className="account-button account-button-secondary" disabled={signingOut} onClick={() => leave(true)}>Sign out</button></div>{exitError && <p>{exitError}</p>}
  </StatusScreen>;
  if (!initialWorkspace) return <StatusScreen title="Opening your workspace"><p>Loading your saved courses and preferences…</p></StatusScreen>;
  return <AccountContext.Provider value={{ user, initialWorkspace, saveSection, syncState, signingOut, signOut: leave, retrySave, exitError, allowDiscard }}>
    <div inert={signingOut}>{children}</div>
    {signingOut && <div className="account-progress-overlay" role="status"><p>Saving your changes and signing out…</p></div>}
  </AccountContext.Provider>;
}

export function AccountPanel() {
  const { user, syncState, signingOut, signOut, retrySave, exitError, allowDiscard } = useAccount();
  const displayName = user.user_metadata?.display_name;
  const name = (typeof displayName === "string" ? displayName.trim().slice(0, 80) : "") || user.email?.split("@")[0] || "Your account";
  return <div className="account-panel">
    <div className="profile"><span className="avatar">{name.slice(0, 1).toUpperCase()}</span><div className="account-identity"><strong>{name}</strong><small title={user.email}>{user.email}</small></div></div>
    <div className="account-save-status" role={syncState.status === "unsaved" ? "alert" : "status"}>
      {syncState.status === "saved" ? "All changes saved" : syncState.status === "saving" ? "Saving your changes…" : "Changes not saved"}
      {syncState.status === "unsaved" && <button className="account-text-button" onClick={retrySave}><RefreshCw size={14} />Retry save</button>}
    </div>
    <button className="account-sign-out" disabled={signingOut} onClick={() => signOut()}><LogOut size={16} />{signingOut ? "Signing out…" : "Sign out"}</button>
    {exitError && <div className="account-exit-error" role="alert"><p>{exitError}</p>{allowDiscard && <button className="account-text-button" disabled={signingOut} onClick={() => signOut(true)}>Sign out without saving</button>}</div>}
  </div>;
}
