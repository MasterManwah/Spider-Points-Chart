"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ActionRow = {
  id: string;
  user_id: string;
  type: "EARN" | "LOSE";
  label: string;
  points: number;
};

type RewardRow = {
  id: string;
  user_id: string;
  label: string;
  cost: number;
};

type LedgerRow = {
  id: string;
  user_id: string;
  kind: "EARN" | "LOSE" | "REDEEM";
  label: string;
  delta: number;
  created_at: string;
};

type SettingsRow = {
  user_id: string;
  background_url: string | null;
  board_background_url: string | null;
  manage_pin: string | null;
  kid_mode?: boolean;
};

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [kidMode, setKidMode] = useState(false);
  const [pointsFx, setPointsFx] = useState<{ id: string; text: string; good: boolean } | null>(null);
  const [shakeId, setShakeId] = useState<string | null>(null);
  const [bounceTotal, setBounceTotal] = useState(false);


  // Auth UI
  const [email, setEmail] = useState("");
  const [authMsg, setAuthMsg] = useState("");

  // App data
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [earnActions, setEarnActions] = useState<ActionRow[]>([]);
  const [loseActions, setLoseActions] = useState<ActionRow[]>([]);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  const [tab, setTab] = useState<"EARN" | "LOSE" | "REWARDS" | "HISTORY" | "SETTINGS">("EARN");

  // Manage mode (PIN gate)
  const [manageUnlocked, setManageUnlocked] = useState(false);
  const [pinEntry, setPinEntry] = useState("");
  const [pinMsg, setPinMsg] = useState("");

  // Redeem modal
  const [redeemTarget, setRedeemTarget] = useState<RewardRow | null>(null);

  // Add forms
  const [newEarnLabel, setNewEarnLabel] = useState("");
  const [newEarnPoints, setNewEarnPoints] = useState(10);

  const [newLoseLabel, setNewLoseLabel] = useState("");
  const [newLosePoints, setNewLosePoints] = useState(5);

  const [newRewardLabel, setNewRewardLabel] = useState("");
  const [newRewardCost, setNewRewardCost] = useState(50);

  // Settings forms
  const [newPin, setNewPin] = useState("");

  // ---------------- AUTH ----------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setUserId(s?.user.id ?? null);
      setManageUnlocked(false);
      setPinEntry("");
      setPinMsg("");
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    setAuthMsg("");
    const { error } = await supabase.auth.signInWithOtp({ email });
    setAuthMsg(error ? error.message : "Check your email for the sign-in link.");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ---------------- LOAD DATA ----------------
  async function loadAll(uid: string) {
    // settings (ensure row exists)
    const s = await supabase
      .from("settings")
      .select("user_id, background_url, board_background_url, manage_pin, kid_mode")
      .eq("user_id", uid)
      .maybeSingle();

    if (!s.data) {
      // create initial settings row
      await supabase.from("settings").insert({ user_id: uid, kid_mode: false, board_background_url: null });

      const s2 = await supabase
        .from("settings")
        .select("user_id, background_url, manage_pin, kid_mode")
        .eq("user_id", uid)
        .maybeSingle();

      const settingsRow = (s2.data ?? null) as SettingsRow | null;
      setSettings(settingsRow);
      setKidMode(!!settingsRow?.kid_mode);
    } else {
      const settingsRow = s.data as SettingsRow;
      setSettings(settingsRow);
      setKidMode(!!settingsRow.kid_mode);
    }

    const a = await supabase
      .from("actions")
      .select("id,user_id,type,label,points")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    const allActions = (a.data ?? []) as ActionRow[];
    setEarnActions(allActions.filter((x) => x.type === "EARN"));
    setLoseActions(allActions.filter((x) => x.type === "LOSE"));

    const r = await supabase
      .from("rewards")
      .select("id,user_id,label,cost")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    setRewards((r.data ?? []) as RewardRow[]);

    const l = await supabase
      .from("ledger")
      .select("id,user_id,kind,label,delta,created_at")
      .order("created_at", { ascending: false })
      .limit(80);

    setLedger((l.data ?? []) as LedgerRow[]);
  }


  useEffect(() => {
    if (userId) loadAll(userId);
  }, [userId]);

  useEffect(() => {
    if (kidMode && tab === "SETTINGS") {
      setTab("EARN");
    }
    if (kidMode && manageUnlocked) {
      lockManage();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kidMode]);

  const totals = useMemo(() => {
    const total = ledger.reduce((acc, r) => acc + r.delta, 0);
    const earned = ledger.filter((r) => r.delta > 0).reduce((a, r) => a + r.delta, 0);
    const lost = Math.abs(ledger.filter((r) => r.delta < 0).reduce((a, r) => a + r.delta, 0));
    return { total, earned, lost };
  }, [ledger]);

  useEffect(() => {
    // bounce on any change after initial load
    if (ledger.length === 0) return;

    setBounceTotal(true);
    const t = setTimeout(() => setBounceTotal(false), 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.total]);

  // ---------------- POINT ACTIONS ----------------
  async function applyEarn(action: ActionRow) {
    if (!userId) return;

    // shake the tapped card (same as lose)
    setShakeId(action.id);
    setTimeout(() => setShakeId(null), 450);

    // points pop (already working)
    setPointsFx({ id: crypto.randomUUID(), text: `+${action.points}`, good: true });

    await supabase.from("ledger").insert({
      user_id: userId,
      kind: "EARN",
      label: action.label,
      delta: action.points,
    });

    loadAll(userId);
  }

  async function applyLose(action: ActionRow) {
    if (!userId) return;

    setShakeId(null);
    requestAnimationFrame(() => {
      setShakeId(action.id);
      setTimeout(() => setShakeId(null), 450);
    });

    setPointsFx({ id: crypto.randomUUID(), text: `-${action.points}`, good: false });

    await supabase.from("ledger").insert({
      user_id: userId,
      kind: "LOSE",
      label: action.label,
      delta: -action.points,
    });

    loadAll(userId);
  }

  async function confirmRedeem(reward: RewardRow) {
    if (!userId) return;
    await supabase.from("ledger").insert({
      user_id: userId,
      kind: "REDEEM",
      label: `Redeemed: ${reward.label}`,
      delta: -reward.cost,
    });
    setRedeemTarget(null);
    loadAll(userId);
    setPointsFx({ id: crypto.randomUUID(), text: `-${reward.cost}`, good: false });
  }

  async function undoLastAction() {
    if (!userId) return;

    // get most recent ledger entry
    const last = await supabase
      .from("ledger")
      .select("id,label,delta,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (last.error) {
      alert(last.error.message);
      return;
    }

    if (!last.data) {
      alert("Nothing to undo.");
      return;
    }

    const ok = confirm(
      `Undo last action?\n\n${last.data.label}\n${last.data.delta >= 0 ? "+" : ""}${last.data.delta} points`
    );
    if (!ok) return;

    const del = await supabase.from("ledger").delete().eq("id", last.data.id);
    if (del.error) {
      alert(del.error.message);
      return;
    }

    await loadAll(userId);
  }


  // ---------------- MANAGE MODE PIN ----------------
  function tryUnlockManage() {
    setPinMsg("");
    if (!settings?.manage_pin) {
      setPinMsg("No PIN set yet. Go to Settings → Set PIN.");
      return;
    }
    if (pinEntry === settings.manage_pin) {
      setManageUnlocked(true);
      setPinEntry("");
      setPinMsg("");
    } else {
      setPinMsg("Wrong PIN.");
    }
  }

  function lockManage() {
    setManageUnlocked(false);
    setPinEntry("");
    setPinMsg("");
  }

  async function savePin() {
    if (!userId) return;
    const clean = newPin.trim();
    if (clean.length < 4) {
      alert("PIN must be at least 4 digits.");
      return;
    }
    const res = await supabase.from("settings").upsert({
      user_id: userId,
      manage_pin: clean,
    });
    if (res.error) return alert(res.error.message);

    setNewPin("");
    await loadAll(userId);
    alert("PIN saved.");
  }

  function requireParentPin(): boolean {
    // If parent already unlocked Manage Mode, allow it
    if (manageUnlocked) return true;

    if (!settings?.manage_pin) {
      alert("No PIN set yet. Please set a Manage PIN first.");
      return false;
    }

    if (pinEntry !== settings.manage_pin) {
      alert("Enter the correct PIN to change Kid Mode.");
      return false;
    }

    return true;
  }

  // ---------------- SETTINGS: BACKGROUND UPLOAD ----------------
  async function uploadBackground(file: File) {
    if (!userId) return;

    const ext = file.name.split(".").pop() || "png";
    const filename = `bg_${userId}_${Date.now()}.${ext}`;

    const upload = await supabase.storage.from("backgrounds").upload(filename, file, { upsert: true });
    if (upload.error) return alert(upload.error.message);

    const { data } = supabase.storage.from("backgrounds").getPublicUrl(filename);
    const url = data.publicUrl;

    const up = await supabase.from("settings").upsert({ user_id: userId, background_url: url });
    if (up.error) return alert(up.error.message);

    await loadAll(userId);
  }

  async function uploadBoardBackground(file: File) {
    if (!userId) return;

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `board_bg_${userId}_${Date.now()}.${ext}`;

    const upload = await supabase.storage
      .from("backgrounds")
      .upload(filename, file, { upsert: true });

    if (upload.error) {
      alert(upload.error.message);
      return;
    }

    const { data } = supabase.storage
      .from("backgrounds")
      .getPublicUrl(filename);

    const url = data.publicUrl;

    const res = await supabase
      .from("settings")
      .update({ board_background_url: url })
      .eq("user_id", userId);

    if (res.error) {
      alert(res.error.message);
      return;
    }

    await loadAll(userId);
  }

  // ---------------- CRUD: ADD ----------------
  async function addAction(type: "EARN" | "LOSE") {
    if (!userId || !manageUnlocked || kidMode) return;

    const label = (type === "EARN" ? newEarnLabel : newLoseLabel).trim();
    const points = type === "EARN" ? newEarnPoints : newLosePoints;
    if (!label || points <= 0) return;

    const res = await supabase.from("actions").insert({ user_id: userId, type, label, points });
    if (res.error) return alert(res.error.message);

    if (type === "EARN") setNewEarnLabel("");
    else setNewLoseLabel("");

    loadAll(userId);
  }

  async function addReward() {
    if (!userId || !manageUnlocked || kidMode) return;

    const label = newRewardLabel.trim();
    if (!label || newRewardCost <= 0) return;

    const res = await supabase.from("rewards").insert({ user_id: userId, label, cost: newRewardCost });
    if (res.error) return alert(res.error.message);

    setNewRewardLabel("");
    loadAll(userId);
  }

  // ---------------- CRUD: EDIT/DELETE (Manage mode) ----------------
  async function updateAction(id: string, patch: Partial<Pick<ActionRow, "label" | "points">>) {
    if (!userId || !manageUnlocked || kidMode) return;
    const res = await supabase.from("actions").update(patch).eq("id", id);
    if (res.error) alert(res.error.message);
    loadAll(userId);
  }

  async function deleteAction(id: string) {
    if (!userId || !manageUnlocked || kidMode) return;
    if (!confirm("Delete this action?")) return;
    const res = await supabase.from("actions").delete().eq("id", id);
    if (res.error) alert(res.error.message);
    loadAll(userId);
  }

  async function updateReward(id: string, patch: Partial<Pick<RewardRow, "label" | "cost">>) {
    if (!userId || !manageUnlocked || kidMode) return;
    const res = await supabase.from("rewards").update(patch).eq("id", id);
    if (res.error) alert(res.error.message);
    loadAll(userId);
  }

  async function deleteReward(id: string) {
    if (!userId || !manageUnlocked || kidMode) return;
    if (!confirm("Delete this reward?")) return;
    const res = await supabase.from("rewards").delete().eq("id", id);
    if (res.error) alert(res.error.message);
    loadAll(userId);
  }

  // ---------------- AUTH SCREEN ----------------
  if (!userId) {
    return (
      <div className="min-h-screen spider-bg bg-gradient-to-b from-red-700 to-blue-900 flex items-center justify-center p-6">
        <div className="spider-card w-full max-w-md p-6">
          <h1 className="text-2xl font-extrabold">Spider Points 🕷️</h1>
          <p className="text-sm spider-muted">Sign in to sync across devices.</p>

          <div className="mt-4 flex gap-2">
            <input
              className="flex-1 border rounded-xl p-3"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="spider-btn spider-primary px-4 py-3" onClick={signIn}>
              Sign in
            </button>
          </div>

          {authMsg ? <p className="text-sm mt-3">{authMsg}</p> : null}
        </div>
      </div>
    );
  }

  const bgUrl = settings?.background_url ?? "";
  const heroBackdrop = bgUrl
    ? { backgroundImage: `url(${bgUrl})`, backgroundSize: "cover", backgroundPosition: "center" as const }
    : { background: "linear-gradient(180deg, rgb(185 28 28) 0%, rgb(30 58 138) 100%)" };

  // ---------------- APP SCREEN ----------------
  return (
    <div className="min-h-screen spider-bg" style={heroBackdrop}>
      <div className="min-h-screen bg-black/35 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Header */}
          <div className="spider-card p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-3xl font-extrabold">Spider Points 🕷️</h1>
                {/* <p className="text-xs spider-faint">kidMode={String(kidMode)} manageUnlocked={String(manageUnlocked)} tab={tab}</p> */}
                <p className="text-sm spider-muted">Tap actions to add/subtract points. Redeem rewards with confirmation.</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button onClick={signOut} className="text-sm underline">
                  Sign out
                </button>
                <>
                  {/* Show Manage status ALWAYS (even in Kid Mode) */}
                  <span className={`manage-pill ${manageUnlocked ? "manage-on" : "manage-off"}`}>
                    {manageUnlocked ? "🔓 Manage: ON" : "🔒 Manage: OFF"}
                  </span>

                  {/* Lock button only when unlocked */}
                  {manageUnlocked && (
                    <button onClick={lockManage} className="manage-pill manage-off">
                      🔒 Lock
                    </button>
                  )}

                  {/* PIN Unlock should ALWAYS be available when locked (so parents can exit Kid Mode) */}
                  {!manageUnlocked && (
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="numeric"
                        className="spider-input rounded-xl p-2 w-28 text-sm"
                        placeholder="PIN"
                        value={pinEntry}
                        onChange={(e) => setPinEntry(e.target.value)}
                      />
                      <button
                        onClick={tryUnlockManage}
                        className="spider-btn spider-primary px-3 py-2 text-sm font-extrabold"
                      >
                        Unlock
                      </button>
                    </div>
                  )}

                  {/* Show PIN errors even in Kid Mode (helps parents) */}
                  {pinMsg ? (
                    <div className="text-xs text-red-200 font-semibold">{pinMsg}</div>
                  ) : null}

                  {/* Undo should be hidden in Kid Mode */}
                  {!kidMode && (
                    <button
                      onClick={undoLastAction}
                      disabled={!manageUnlocked}
                      className={`manage-pill ${manageUnlocked ? "manage-on" : "manage-off opacity-50"}`}
                    >
                      ↩ Undo Last
                    </button>
                  )}
                </>
              </div>
            </div>

            {/* Scoreboard */}
            <div className="relative mt-4">
              <div className="grid grid-cols-3 gap-3">
                <div className={bounceTotal ? "total-bounce" : ""}>
                  <ScoreCard title="Total" value={totals.total} variant="primary" />
                </div>

                {/* Earned slot */}
                <div className="relative">
                  {pointsFx?.good ? (
                    <div
                      key={pointsFx.id}
                      className="point-pop text-emerald-300"
                      style={{ right: "12px", top: "10px" }}
                      onAnimationEnd={() => setPointsFx(null)}
                    >
                      {pointsFx.text}
                    </div>
                  ) : null}
                  <ScoreCard title="Earned" value={totals.earned} variant="good" />
                </div>

                {/* Lost slot */}
                <div className="relative">
                  {pointsFx && !pointsFx.good ? (
                    <div
                      key={pointsFx.id}
                      className="point-pop text-red-300"
                      style={{ right: "12px", top: "10px" }}
                      onAnimationEnd={() => setPointsFx(null)}
                    >
                      {pointsFx.text}
                    </div>
                  ) : null}
                  <ScoreCard title="Lost" value={totals.lost} variant="bad" />
                </div>
              </div>
            </div>

            <div className="mt-4 h-px bg-white/15" />

            {/* Tabs + Manage unlock */}
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <button className={`spider-tab ${tab === "EARN" ? "spider-tab-active" : ""}`} onClick={() => setTab("EARN")}>Earn</button>
              <button className={`spider-tab ${tab === "LOSE" ? "spider-tab-active" : ""}`} onClick={() => setTab("LOSE")}>Lose</button>
              <button className={`spider-tab ${tab === "REWARDS" ? "spider-tab-active" : ""}`} onClick={() => setTab("REWARDS")}>Rewards</button>
              <button className={`spider-tab ${tab === "HISTORY" ? "spider-tab-active" : ""}`} onClick={() => setTab("HISTORY")}>History</button>

              {(!kidMode || manageUnlocked) && (
                <button
                  className={`spider-tab ${tab === "SETTINGS" ? "spider-tab-active" : ""}`}
                  onClick={() => setTab("SETTINGS")}
                >
                  Settings
                </button>
              )}
            </div>
            {pinMsg ? <p className="mt-2 text-sm text-red-700 font-semibold">{pinMsg}</p> : null}
          </div>

          {/* Content */}
          <div className="spider-card p-4 sm:p-6">
            {tab === "EARN" && (
              <ActionGrid
                title="Tap to Earn Points"
                items={earnActions}
                positive
                onTap={applyEarn}
                manageUnlocked={manageUnlocked}
                kidMode={kidMode}
                shakeId={shakeId}
                onEdit={updateAction}
                onDelete={deleteAction}
              />
            )}
            
            {tab === "LOSE" && (
              <ActionGrid
                title="Tap to Lose Points"
                items={loseActions}
                onTap={applyLose}
                manageUnlocked={manageUnlocked}
                kidMode={kidMode}
                shakeId={shakeId}
                onEdit={updateAction}
                onDelete={deleteAction}
              />
            )}

            {tab === "REWARDS" && (
              <div>
                <h2 className="text-lg font-extrabold mb-3">Rewards (Tap to Redeem)</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {rewards.map((r) => (
                    <div key={r.id} className="spider-panel p-4">
                      <button className="w-full text-left" onClick={() => setRedeemTarget(r)}>
                        <div className="font-semibold">{r.label}</div>
                        <div className="text-sm spider-muted">{r.cost} points</div>
                        <div className="text-xs spider-faint mt-1">Confirmation required</div>
                      </button>

                      {manageUnlocked && !kidMode ? (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <input
                            className="border rounded-xl p-2 text-sm col-span-2"
                            value={r.label}
                            onChange={(e) => updateReward(r.id, { label: e.target.value })}
                          />
                          <input
                            className="border rounded-xl p-2 text-sm"
                            type="number"
                            value={r.cost}
                            onChange={(e) => updateReward(r.id, { cost: parseInt(e.target.value || "0", 10) })}
                          />
                          <button
                            className="spider-btn spider-danger px-3 py-2 text-sm col-span-3"
                            onClick={() => deleteReward(r.id)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "HISTORY" && (
              <div>
                <h2 className="text-lg font-extrabold mb-3 text-white">Recent Activity</h2>

                <div className="space-y-2">
                  {ledger.map((l) => (
                    <div
                      key={l.id}
                      className="spider-row flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="spider-row-title truncate">
                          {l.label}
                        </div>
                        <div className="spider-row-sub">
                          {new Date(l.created_at).toLocaleString()}
                        </div>
                      </div>

                      <div
                        className={`font-extrabold text-lg ${
                          l.delta >= 0 ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {l.delta >= 0 ? `+${l.delta}` : `${l.delta}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}


            {tab === "SETTINGS" && !kidMode && (
              <div className="space-y-6">
                {/* Background Upload */}
                <div className="spider-panel p-4">
                  <h2 className="text-lg font-extrabold text-white mb-1">Background</h2>
                  <p className="spider-muted text-sm">Upload a custom background image.</p>

                  <input
                    className="mt-3 spider-input rounded-xl p-3 w-full"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadBackground(f);
                    }}
                  />

                  {settings?.background_url ? (
                    <p className="text-xs spider-faint mt-2 break-all">Current: {settings.background_url}</p>
                  ) : null}
                </div>

                {/* Board Background Upload */}
                <div className="spider-panel p-4">
                  <h2 className="text-lg font-extrabold text-white mb-1">
                    Board Background
                  </h2>
                  <p className="spider-muted text-sm">
                    Background for the kid-facing Points Board display.
                  </p>

                  <input
                    className="mt-3 spider-input rounded-xl p-3 w-full"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadBoardBackground(f);
                    }}
                  />

                  {settings?.board_background_url ? (
                    <p className="text-xs spider-faint mt-2 break-all">
                      Current: {settings.board_background_url}
                    </p>
                  ) : null}
                </div>

                {/* Manage PIN */}
                <div className="spider-panel p-4">
                  <h2 className="text-lg font-extrabold text-white mb-1">Manage PIN</h2>
                  <p className="spider-muted text-sm">Set or change your PIN (4+ digits).</p>

                  <div className="mt-3 flex flex-wrap gap-2 items-center">
                    <input
                      inputMode="numeric"
                      className="spider-input rounded-xl p-3 w-44"
                      placeholder="New PIN"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                    />
                    <button className="spider-btn spider-primary px-4 py-3 font-extrabold" onClick={savePin}>
                      Save PIN
                    </button>
                  </div>
                </div>

                {/* ✅ Kid Mode Toggle */}
                <div className="spider-panel p-4">
                  <h2 className="text-lg font-extrabold text-white mb-1">Kid Mode</h2>
                  <p className="spider-muted text-sm">
                    When ON, Settings and parent controls are hidden from the child.
                  </p>

                  <button
                    onClick={async () => {
                      if (!userId) return;

                      // Require PIN (parent)
                      if (!requireParentPin()) return;

                      await supabase
                        .from("settings")
                        .update({ kid_mode: true })
                        .eq("user_id", userId);

                      setKidMode(true);

                      // lock down immediately
                      setManageUnlocked(false);
                      setPinEntry("");
                      setPinMsg("");
                      setTab("EARN");
                    }}
                    className="manage-pill manage-on mt-3"
                  >
                    👶 Turn Kid Mode ON
                  </button>
                </div>

                {/* Add Items (Parent only) */}
                <div className="spider-panel p-4">
                  <h2 className="text-lg font-extrabold text-white mb-3">Add Items</h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h3 className="font-extrabold text-white">Add Earn Action</h3>
                      <input
                        className="spider-input rounded-xl p-3 w-full"
                        value={newEarnLabel}
                        onChange={(e) => setNewEarnLabel(e.target.value)}
                        placeholder="e.g., Listened first time"
                      />
                      <input
                        className="spider-input rounded-xl p-3 w-full"
                        type="number"
                        value={newEarnPoints}
                        onChange={(e) => setNewEarnPoints(parseInt(e.target.value || "0", 10))}
                      />
                      <button className="spider-btn spider-primary px-4 py-3 w-full font-extrabold" onClick={() => addAction("EARN")}>
                        Add Earn
                      </button>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-extrabold text-white">Add Lose Action</h3>
                      <input
                        className="spider-input rounded-xl p-3 w-full"
                        value={newLoseLabel}
                        onChange={(e) => setNewLoseLabel(e.target.value)}
                        placeholder="e.g., Yelling"
                      />
                      <input
                        className="spider-input rounded-xl p-3 w-full"
                        type="number"
                        value={newLosePoints}
                        onChange={(e) => setNewLosePoints(parseInt(e.target.value || "0", 10))}
                      />
                      <button className="spider-btn spider-primary px-4 py-3 w-full font-extrabold" onClick={() => addAction("LOSE")}>
                        Add Lose
                      </button>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <h3 className="font-extrabold text-white">Add Reward</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          className="spider-input rounded-xl p-3 w-full sm:col-span-2"
                          value={newRewardLabel}
                          onChange={(e) => setNewRewardLabel(e.target.value)}
                          placeholder="e.g., Spider suit"
                        />
                        <input
                          className="spider-input rounded-xl p-3 w-full"
                          type="number"
                          value={newRewardCost}
                          onChange={(e) => setNewRewardCost(parseInt(e.target.value || "0", 10))}
                        />
                      </div>
                      <button className="spider-btn spider-primary px-4 py-3 w-full font-extrabold" onClick={addReward}>
                        Add Reward
                      </button>
                    </div>
                  </div>

                  {!manageUnlocked ? (
                    <p className="text-xs spider-faint mt-3">
                      Tip: Unlock Manage Mode to edit/delete existing items.
                    </p>
                  ) : null}
                </div>
              </div>
            )}

            {tab === "SETTINGS" && kidMode && (
              <div className="spider-panel p-4 text-center text-white">
                <p className="font-extrabold mb-2">🔒 Kid Mode is ON</p>

                <button
                  onClick={async () => {
                    if (!requireParentPin()) return;

                    await supabase
                      .from("settings")
                      .update({ kid_mode: false })
                      .eq("user_id", userId);

                    setKidMode(false);
                    setTab("SETTINGS");
                  }}
                  className="manage-pill manage-off"
                >
                  👨‍👩‍👧 Exit Kid Mode
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Redeem confirmation modal */}
      {redeemTarget ? (
        <ConfirmModal
          title="Redeem Reward?"
          body={
            <>
              <p>
                Redeem <span className="font-extrabold">{redeemTarget.label}</span> for{" "}
                <span className="font-extrabold">{redeemTarget.cost}</span> points?
              </p>
              <p className="text-sm spider-muted mt-2">This will subtract points and add a record to History.</p>
            </>
          }
          confirmText="Yes, Redeem"
          cancelText="Cancel"
          onCancel={() => setRedeemTarget(null)}
          onConfirm={() => confirmRedeem(redeemTarget)}
        />
      ) : null}
    </div>
  );
}

function ScoreCard({ title, value, variant }: { title: string; value: number; variant: "primary" | "good" | "bad" }) {
  const container =
    variant === "primary"
      ? "bg-gradient-to-br from-red-600 to-blue-700 text-white border-transparent"
      : "bg-black/35 border-white/20 text-white";

  const label = variant === "primary" ? "text-white/90" : "text-white/70";
const number =
  variant === "good" ? "text-emerald-300" : variant === "bad" ? "text-red-300" : "text-white";

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 text-center ${container}`}>
      <div className={`text-xs sm:text-sm ${label}`}>{title}</div>
      <div className={`text-2xl sm:text-3xl font-extrabold ${number}`}>{value}</div>
    </div>
  );
}

function ActionGrid({
  title,
  items,
  onTap,
  positive,
  manageUnlocked,
  kidMode,
  shakeId,
  onEdit,
  onDelete,
}: {
  title: string;
  items: ActionRow[];
  onTap: (a: ActionRow) => void;
  positive?: boolean;
  manageUnlocked: boolean;
  kidMode: boolean;
  shakeId?: string | null;
  onEdit: (id: string, patch: Partial<Pick<ActionRow, "label" | "points">>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-extrabold mb-3">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((a) => (
          <div
            key={a.id}
            className={`spider-panel p-4 ${shakeId === a.id ? "shake-card" : ""}`}
          >
            <button className="w-full text-left" onClick={() => onTap(a)}>
              <div className="font-semibold">{a.label}</div>
              <div className={`text-sm font-extrabold ${positive ? "text-green-700" : "text-red-700"}`}>
                {positive ? `+${a.points}` : `-${a.points}`} points
              </div>
              <div className="text-xs spider-faint mt-1">Tap to apply</div>
            </button>

            {manageUnlocked && !kidMode ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <input
                  className="border rounded-xl p-2 text-sm col-span-2"
                  value={a.label}
                  onChange={(e) => onEdit(a.id, { label: e.target.value })}
                />
                <input
                  className="border rounded-xl p-2 text-sm"
                  type="number"
                  value={a.points}
                  onChange={(e) => onEdit(a.id, { points: parseInt(e.target.value || "0", 10) })}
                />
                <button
                  className="spider-btn spider-danger px-3 py-2 text-sm col-span-3"
                  onClick={() => onDelete(a.id)}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  body,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="spider-card w-full max-w-md p-5">
        <div className="text-lg font-extrabold">{title}</div>
        <div className="mt-3 text-sm text-white/90">{body}</div>
        <div className="mt-5 flex gap-2">
          <button
            className="spider-btn spider-danger px-4 py-2"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button 
            className="spider-btn spider-primary px-4 py-3 flex-1 font-extrabold" 
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
