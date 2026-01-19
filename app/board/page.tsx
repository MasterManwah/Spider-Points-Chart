"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type RewardRow = { cost: number; label: string };

export default function PointsBoard() {
  const [total, setTotal] = useState(0);
  const [nextReward, setNextReward] = useState<RewardRow | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string>("");

  async function loadBoard() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;

    // background from backend
    const { data: settings } = await supabase
      .from("settings")
      .select("board_background_url")
      .eq("user_id", user.id)
      .maybeSingle();

    setBackgroundUrl(settings?.board_background_url ?? "");

    // total from ledger
    const { data: ledger } = await supabase
      .from("ledger")
      .select("delta")
      .eq("user_id", user.id);

    const sum = (ledger ?? []).reduce((a, row) => a + row.delta, 0);
    setTotal(sum);

    // next reward
    const { data: rewards } = await supabase
      .from("rewards")
      .select("label,cost")
      .eq("user_id", user.id)
      .order("cost", { ascending: true });

    const next = (rewards ?? []).find((r) => r.cost > sum) ?? null;
    setNextReward(next);
  }

  useEffect(() => {
    loadBoard();
    const i = setInterval(loadBoard, 30000);
    return () => clearInterval(i);
  }, []);

  const progress =
    nextReward && nextReward.cost > 0 ? Math.min(total / nextReward.cost, 1) : 1;

  return (
    <main
      className="min-h-screen relative flex flex-col items-center justify-center text-center px-6"
      style={
        backgroundUrl
          ? {
              backgroundImage: `url(${backgroundUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : {
              background:
                "radial-gradient(circle at top, rgba(255,255,255,0.15), rgba(0,0,0,0.75))",
            }
      }
    >
      {/* readability overlay */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px]" />

      <div className="relative z-10 w-full flex flex-col items-center justify-center">
        <h1 className="text-4xl sm:text-6xl font-black mb-4 text-white">
          🕷️ Spider Points
        </h1>

        <div className="text-[96px] sm:text-[140px] font-black leading-none mb-6 text-white drop-shadow">
          {total}
        </div>

        {nextReward ? (
          <div className="w-full max-w-md">
            <div className="h-6 rounded-full bg-white/25 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-yellow-400 to-yellow-500 transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            <p className="mt-3 text-lg font-bold text-white">
              {Math.max(nextReward.cost - total, 0)} points to{" "}
              <span className="text-yellow-300">{nextReward.label}</span>
            </p>
          </div>
        ) : (
          <p className="text-xl font-bold text-emerald-300 mt-4">
            🎉 All rewards unlocked!
          </p>
        )}
      </div>
    </main>
  );
}
