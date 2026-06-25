
const express=require("express");
const axios=require("axios");
require("dotenv").config();
const app=express();
app.use(express.json());
app.use(express.static("public"));

const delay=(ms)=>new Promise(r=>setTimeout(r,ms));

app.post("/api/bulk-stk", async(req,res)=>{
 const {numbers,amount,reference}=req.body;
 const results=[];
 for(const phone of numbers){
   try{
     const resp=await axios.post(
      "https://api.kifarupay.co.ke/api/payments/stk-push",
      {
        appId:process.env.KIFARUPAY_APP_ID,
        phone, amount,
        accountReference:reference,
        transactionDesc:"Bulk STK Payment",
        description:reference
      },
      {headers:{
        Authorization:`Bearer ${process.env.KIFARUPAY_API_KEY}`,
        "Content-Type":"application/json"
      }}
     );
     results.push({phone,status:"success",response:resp.data});
   }catch(e){
     results.push({phone,status:"failed",error:e.response?.data||e.message});
   }
   await delay(2000);
 }
 res.json(results);
});

app.listen(process.env.PORT||3000);
