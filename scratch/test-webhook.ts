import fetch from 'node-fetch';

async function testWebhook() {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1022207277457331",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "50588273034",
                phone_number_id: "1289239620933573"
              },
              messages: [
                {
                  from: "50588273034",
                  id: "wamid.HBgLODgyNzMwMzQ2FQIAERgSQjE2RDE0NDYyOTExMUI1NzQxAA==",
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: "button",
                  button: {
                    payload: "Confirmar",
                    text: "Confirmar"
                  },
                  context: {
                    id: "wamid.HBgLODgyNzMwMzQ2FQIAERgSQjE2RDE0NDYyOTExMUI1NzQxAA=="
                  }
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  console.log("Sending simulated Meta Webhook request to http://localhost:3000/api/webhooks/whatsapp...");
  try {
    const res = await fetch("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log("Webhook Response status:", res.status, "data:", data);
  } catch (e: any) {
    console.error("Test failed:", e.message);
  }
}

testWebhook();
