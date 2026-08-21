# dialio-leadcrm

VoIP application combined with the lead CRM.

MERN + Twilio app with separate frontend and backend deployments.

## AI replies for offline agents

When an inbound SMS belongs to a lead and that lead's assigned agent has no active CRM connection, the backend generates and sends a catalog-aware AI reply through Twilio. The reply is recorded with `senderType: "ai"`.

This is enabled by default. Configure the backend environment as needed:

- `AI_AUTO_REPLY_WHEN_AGENT_OFFLINE=false` disables automatic AI replies.
- `AI_AUTO_REPLY_COOLDOWN_MS=120000` sets the minimum gap between AI replies for the same lead (two minutes by default).

The feature requires `OPENAI_API_KEY`, Twilio SMS credentials, and a valid `BASE_URL` if you want Twilio delivery-status callbacks.
