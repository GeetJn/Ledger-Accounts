import BillEditor from "@/components/BillEditor";
export default async function CreateBill({searchParams}:{searchParams:Promise<{id?:string}>}){const {id}=await searchParams;return <BillEditor key={id||"new"} initialId={id}/>;}
