import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const apiKey = process.env.AI_PROVIDER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Ledger AI is not configured yet. Add AI_PROVIDER_API_KEY in Vercel or .env.local. Your business data has not been sent to an AI provider." }, { status: 503 });
    const { message, conversation_id } = await req.json(); if (typeof message !== "string" || !message.trim()) throw new Error("Enter a question first");
    const { data: profile } = await supabase.from("profiles").select("shop_id").eq("id", user.id).single();
    if (!profile?.shop_id) throw new Error("Shop profile is missing");
    let conversationId = conversation_id as string | undefined;
    if (conversationId) {
      const { data: existing, error } = await supabase.from("ai_conversations").select("id").eq("id",conversationId).single();
      if (error || !existing) throw new Error("Conversation not found");
    } else {
      const { data: created, error } = await supabase.from("ai_conversations").insert({ owner_id:user.id, shop_id:profile.shop_id, title:message.trim().slice(0,70) }).select("id").single();
      if (error) throw error; conversationId=created.id;
    }
    const { data: bills } = await supabase.from("bills").select("bill_number,bill_date,customer_name,final_amount,amount_paid,status").eq("status","finalized").order("bill_date",{ascending:false}).limit(300);
    const { data: payments } = await supabase.from("payments").select("amount,method,paid_at,reversed_at").is("reversed_at",null).order("paid_at",{ascending:false}).limit(300);
    const { data: expenses } = await supabase.from("expenses").select("title,amount,expense_date,category").is("archived_at",null).order("expense_date",{ascending:false}).limit(300);
    const { data: customerBalances } = await supabase.from("bills").select("customer_name,final_amount,amount_paid").eq("status","finalized").limit(500);
    const { error: userSaveError } = await supabase.from("ai_messages").insert({ conversation_id:conversationId, role:"user", content:message.trim() }); if (userSaveError) throw userSaveError;
    const { data: summary, error: summaryError } = await supabase.rpc("business_summary", { p_from: null, p_to: null });
    if (summaryError) throw summaryError;
    const totals = { ...summary, sampleCoverage: { bills: (bills||[]).length, payments: (payments||[]).length, expenses: (expenses||[]).length, customerBills: (customerBalances||[]).length } };
    const endpoint=(process.env.AI_PROVIDER_BASE_URL||"https://api.openai.com/v1").replace(/\/$/,"")+"/chat/completions";
    const upstream=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model:process.env.AI_PROVIDER_MODEL||"gpt-4o-mini",messages:[
      {role:"system",content:"You are Ledger AI, an assistant for the authenticated shop owner. Answer using only the supplied shop data. Clearly state the date range and data coverage where relevant. Never invent figures. Do not expose or discuss private bill revision history. You cannot change financial records. Currency is configured by the user's shop. If the requested details are absent, say so."},
      {role:"system",content:JSON.stringify({totals,bills:(bills||[]).slice(0,200),payments:(payments||[]).slice(0,200),expenses:(expenses||[]).slice(0,200)})},
      {role:"user",content:message.trim()}
    ],temperature:0.2})});
    if(!upstream.ok) throw new Error(`AI provider returned ${upstream.status}. Check the configured API key and model.`);
    const result=await upstream.json(); const answer=String(result.choices?.[0]?.message?.content||"").trim(); if(!answer) throw new Error("AI provider returned an empty response");
    const { error: assistantSaveError } = await supabase.from("ai_messages").insert({ conversation_id:conversationId, role:"assistant", content:answer }); if(assistantSaveError) throw assistantSaveError;
    await supabase.from("ai_conversations").update({updated_at:new Date().toISOString()}).eq("id",conversationId);
    return NextResponse.json({ answer, conversation_id:conversationId, coverage:{ bills:(bills||[]).length, payments:(payments||[]).length, expenses:(expenses||[]).length } });
  } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Ledger AI could not answer"},{status:400}); }
}
