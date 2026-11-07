const steps=[
 ["1. Create an account","Register with your name, shop name, country, email and normal password. If your Supabase project requires email confirmation, complete verification before signing in."],
 ["2. Set your Emergency Password","Use Settings → Emergency Password. It must be different from your normal password and at least 12 characters. The app stores a salted hash, never the plaintext value."],
 ["3. Add products","Open Add Items and save item name, MRP and unit. You can use the catalogue in Create Bill or add a manual line item."],
 ["4. Create a bill","Select a saved customer or enter a new customer's details, add items, set quantities and rates, then save as a draft. Empty drafts are allowed."],
 ["5. Finalize a bill","Check the total, discount, tax and paid amount. Finalization allocates a sequential number on PostgreSQL; drafts do not consume bill numbers."],
 ["6. Download and share","Download the PDF from the bill list. WhatsApp opens a prepared message and the PDF download; attach the downloaded file in WhatsApp yourself."],
 ["7. Record payments","Open Payments / Customer Ledger and select a finalized invoice. A payment cannot exceed its recorded outstanding amount."],
 ["8. Audit an alteration","Bill Altering History asks for fresh verification. Search by the exact bill number. This owner-only history is never included in the PDF."],
 ["9. Ask Ledger AI","Use typed questions or the microphone. Browser speech recognition availability varies. AI requires a configured provider API key and has read-only access to business summaries."],
 ["10. Back up your data","Use Supabase database backups and exports. This starter project does not yet include a one-click full-business backup/export screen."],
];
export default function AppGuide(){return <><div className="page-head"><div><div className="eyebrow">Help & documentation</div><h1>App Guide</h1><div className="subtitle">A simple walkthrough of the main Ledger Accounts workflows.</div></div></div><div className="grid" style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))"}}>{steps.map(([title,body],i)=><section className="card" key={title}><div className="eyebrow">STEP {String(i+1).padStart(2,"0")}</div><h3 className="section-title" style={{marginBottom:8}}>{title}</h3><p className="subtitle" style={{margin:0}}>{body}</p></section>)}</div><div className="notice" style={{marginTop:16}}>The current delivery is a foundation release. Refer to README.md for provider setup, enabled workflows and features that still need production completion.</div></>}
