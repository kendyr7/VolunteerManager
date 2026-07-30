import fetch from 'node-fetch';

const token = "EAAWeOY07qiUBSKIP6leFFa0iJ2ozBsMCNZBbZAxnbi7pak06ZC8F0L9osStXhaW5yDxdlYb5o9ntIETjq2RxT3AVovuI8P5pPdKoWXsnMHZBYqkRTz3ZC9WZBLH8szZACpuylSVtdFwp2NJTlOZCfU7faU4OT3ASq4hmndT0CZCqscHZCBX6c02URF7HM8ZADxoVt8JgwZDZD";
const wabaId = "1022207277457331";

async function triggerCalls() {
  try {
    console.log("Triggering Graph API call for whatsapp_business_management...");
    const res1 = await fetch(`https://graph.facebook.com/v21.0/${wabaId}?access_token=${token}`);
    const data1 = await res1.json();
    console.log("WABA Info Response:", res1.status, data1);

    console.log("Triggering Graph API call for business_management...");
    const res2 = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${token}`);
    const data2 = await res2.json();
    console.log("Me Response:", res2.status, data2);

    console.log("Triggering Graph API message templates call...");
    const res3 = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates?access_token=${token}`);
    const data3 = await res3.json();
    console.log("Templates Response:", res3.status, data3?.data ? `Found ${data3.data.length} templates` : data3);
  } catch (e: any) {
    console.error("Error executing API calls:", e.message);
  }
}

triggerCalls();
