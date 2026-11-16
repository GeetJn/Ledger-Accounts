import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in before setting your recovery credential." }, { status: 401 });
    const { password, normalPassword } = await req.json();
    if (typeof password !== "string" || password.length < 12) return NextResponse.json({ error: "Emergency Password must be at least 12 characters." }, { status: 400 });
    if (typeof normalPassword !== "string" || !user.email || normalPassword === password) return NextResponse.json({ error: "Enter a different Emergency Password and verify your normal password." }, { status: 400 });
    const { error: normalError } = await supabase.auth.signInWithPassword({ email: user.email, password: normalPassword });
    if (normalError) return NextResponse.json({ error: "Normal password verification failed." }, { status: 403 });
    const { data: profile } = await supabase.from("profiles").select("shop_id").eq("id", user.id).single();
    if (!profile?.shop_id) throw new Error("Shop profile is missing");
    const admin = createAdminClient();
    const { data: exists } = await admin.from("emergency_credentials").select("shop_id").eq("shop_id", profile.shop_id).maybeSingle();
    if (exists) return NextResponse.json({ error: "A recovery credential already exists. Use the verified security-settings change process." }, { status: 409 });
    const hash = await bcrypt.hash(password, 12);
    const { error } = await admin.from("emergency_credentials").insert({ shop_id: profile.shop_id, password_hash: hash });
    if (error) throw error;
    await admin.from("security_logs").insert({ shop_id: profile.shop_id, actor_id: user.id, event: "emergency_credential_created", success: true });
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not set recovery credential" }, { status: 400 }); }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body = await req.json(); const { currentMethod, currentPassword, password } = body;
    if (typeof password !== "string" || password.length < 12) throw new Error("New Emergency Password must be at least 12 characters.");
    if (typeof currentPassword !== "string") throw new Error("Enter your current verification credential.");
    const { data: profile } = await supabase.from("profiles").select("shop_id").eq("id", user.id).single();
    if (!profile?.shop_id) throw new Error("Shop profile is missing");
    const admin = createAdminClient(); let verified = false;
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await admin.from("security_logs").select("id", { count: "exact", head: true }).eq("shop_id", profile.shop_id).eq("actor_id", user.id).eq("event", "emergency_credential_change_attempt").eq("success", false).gte("created_at", since);
    if ((count || 0) >= 5) return NextResponse.json({ error: "Too many failed attempts. Try again after 15 minutes." }, { status: 429 });
    if (currentMethod === "normal" && user.email) { const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword }); verified = !error; }
    else if (currentMethod === "emergency") { const { data } = await admin.from("emergency_credentials").select("password_hash").eq("shop_id", profile.shop_id).maybeSingle(); verified = Boolean(data?.password_hash && await bcrypt.compare(currentPassword, data.password_hash)); }
    if (!verified) { await admin.from("security_logs").insert({ shop_id: profile.shop_id, actor_id: user.id, event: "emergency_credential_change_attempt", success: false }); return NextResponse.json({ error: "Current credential verification failed." }, { status: 403 }); }
    if (currentMethod === "normal" && currentPassword === password) throw new Error("Emergency Password must be different from the normal password.");
    if (currentMethod === "emergency") { const { data } = await admin.from("emergency_credentials").select("password_hash").eq("shop_id", profile.shop_id).maybeSingle(); if (data?.password_hash && await bcrypt.compare(password, data.password_hash)) throw new Error("Choose a different Emergency Password."); }
    const hash = await bcrypt.hash(password, 12); const { error } = await admin.from("emergency_credentials").upsert({ shop_id: profile.shop_id, password_hash: hash, updated_at: new Date().toISOString() }); if (error) throw error;
    await admin.from("security_logs").insert({ shop_id: profile.shop_id, actor_id: user.id, event: "emergency_credential_changed", success: true });
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not change recovery credential" }, { status: 400 }); }
}
