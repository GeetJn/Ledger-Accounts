import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(req: NextRequest) {
  const admin = createAdminClient(); let shopId: string | null = null; let ownerId: string | null = null;
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    ownerId = user.id;
    const { data: profile } = await supabase.from("profiles").select("shop_id").eq("id", user.id).single(); shopId = profile?.shop_id ?? null;
    if (!shopId) throw new Error("Shop profile is missing");
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: failedCount } = await admin.from("security_logs").select("id", { count: "exact", head: true })
      .eq("shop_id", shopId).eq("actor_id", ownerId).eq("success", false).gte("created_at", since);
    if ((failedCount || 0) >= 5) return NextResponse.json({ error: "Too many failed attempts. Try again after 15 minutes." }, { status: 429 });
    const { method, password, purpose } = await req.json();
    if (!(["bill_edit", "bill_history"] as string[]).includes(purpose) || !["normal", "emergency"].includes(method)) throw new Error("Invalid verification request");
    let verified = false;
    if (method === "normal") {
      if (!user.email || typeof password !== "string") throw new Error("Email and password are required for normal verification");
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password }); verified = !error;
    } else {
      const { data } = await admin.from("emergency_credentials").select("password_hash").eq("shop_id", shopId).maybeSingle();
      verified = Boolean(data?.password_hash && typeof password === "string" && await bcrypt.compare(password, data.password_hash));
    }
    await admin.from("security_logs").insert({ shop_id: shopId, actor_id: ownerId, event: `owner_${purpose}_verification`, success: verified, details: { method } });
    if (!verified) return NextResponse.json({ error: "Verification failed. Check your credential and try again." }, { status: 403 });
    const rawToken = randomBytes(32).toString("hex"); const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const { error } = await admin.from("owner_verifications").insert({ token_hash: tokenHash, owner_id: ownerId, shop_id: shopId, purpose, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
    if (error) throw error;
    const jar = await cookies(); jar.set("ledger_owner_verification", rawToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 600 });
    return NextResponse.json({ success: true, expires_in_seconds: 600 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Verification could not be completed" }, { status: 400 }); }
}
