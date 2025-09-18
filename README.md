# Plivo Voicemail Webhook

Netlify function that receives Plivo voicemail webhooks and sends email notifications via Mandrill.

## Features
- Receives Plivo voicemail webhooks
- Extracts transcription and recording URL
- Routes to appropriate recipient based on phone number
- Sends formatted email via Mandrill API
- Includes both text and HTML email versions

## Environment Variables

Set these in Netlify dashboard:

**Required:**
- `MANDRILL_API_KEY` - Your Mandrill API key
- `MANDRILL_USER` - Sender email (neal@beethovenathome.com)
- `TARGET_EMAIL` - Default recipient (info@beethovenathome.com)

**Optional:**
- `MANDRILL_HOST` - SMTP host (defaults to smtp.mandrillapp.com)

## Webhook URL

After deployment: `https://your-site.netlify.app/.netlify/functions/plivo-webhook`

## Phone Number Mapping

Edit the `recipientMap` object in `plivo-webhook.js` to route calls to specific emails:
```javascript
const recipientMap = {
  '+15551234567': 'sales@beethovenathome.com',
  '+15559876543': 'support@beethovenathome.com',
};