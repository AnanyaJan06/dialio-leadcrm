# dialio-leadcrm

VoIP application combined with the lead CRM.

MERN + Twilio app with separate frontend and backend deployments.

## AI replies for offline agents

When an inbound SMS belongs to a lead and that lead's assigned agent has no active CRM connection (and has AI Auto-Reply ON), the backend generates and sends a catalog-aware AI reply through Twilio. The reply is recorded with `senderType: "ai"`.

### Agent & Admin Controls

- **Logged-in Agents**: Real agents can turn their AI Auto-Reply ON or OFF directly from **Settings** or from the **CRM Leads** header when logged in.
- **Admins**: Administrators can manage and toggle the AI Auto-Reply setting for each agent in the **Admin Dashboard**.
- When an agent sets their AI Auto-Reply to OFF (`isAiAutoReplyActive: false`), automatic AI replies are completely skipped for leads assigned to that agent.

### AI Conversation Flow & Knowledge

The AI assistant generates brief, concise, and customer-focused SMS replies answering key customer questions, recognizing shorthand, slash commands, and common typos:
- **Price**: Quotes accurate USD pricing directly from the live parts catalog. Handles shorthand and commands (`price?`, `price please`, `/price`, `cost?`, `how much?`, `prce`).
- **Warranty**: Confirms tested OEM replacement warranty coverage (typically 30-90 days). Handles typos and commands (`warranty?`, `warrany?`, `waranty?`, `warranty please`, `/warranty`, `guarantee`).
- **Mileage**: Confirms verified low mileage on tested engines, transmissions, and mechanical parts. Handles shorthand and typos (`mileage?`, `mileage`, `milage?`, `miles?`, `/mileage`, `how many miles?`).
- **Shipping**: Informs customers that standard shipping takes approximately **7-14 days** (7-14 business days) with tracking provided.
- **Order Confirmation & Purchase**: When customers confirm or place an order (`i need to confirm the order`, `iam placing the order`, `proceed with their order`, `ready to order`), replies: *"Our representative will contact you soon for confirming the order."* and updates the lead disposition to `Ordered`.
- **Combined Inquiries**: Seamlessly handles multi-topic questions in one unified message (e.g. `price and warranty?`, `price, warranty, mileage`, `price? i need to confirm the order`).

### Environment Configuration

- `AI_AUTO_REPLY_WHEN_AGENT_OFFLINE=false` globally disables automatic AI replies.
- `AI_AUTO_REPLY_COOLDOWN_MS=120000` sets the minimum gap between AI replies for the same lead (two minutes by default).

The feature requires `OPENAI_API_KEY`, Twilio SMS credentials, and a valid `BASE_URL` if you want Twilio delivery-status callbacks.
