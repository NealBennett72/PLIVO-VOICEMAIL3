const https = require('https');
const querystring = require('querystring');

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse the incoming Plivo webhook data
    const plivoData = JSON.parse(event.body);
    
    // Extract relevant information from Plivo webhook
    const {
      From: callerNumber,
      To: receivedNumber,
      RecordUrl: recordingUrl,
      TranscriptionText: transcription,
      CallUUID: callId,
      RecordFile: recordingFile
    } = plivoData;

    // Determine recipient based on the number called
    // You'll need to customize this mapping
    const recipientMap = {
      '+1234567890': 'sales@beethovenathome.com',
      '+1234567891': 'support@beethovenathome.com',
      // Add more number mappings as needed
    };

    const recipientEmail = recipientMap[receivedNumber] || process.env.TARGET_EMAIL;

    if (!recipientEmail) {
      console.error('No recipient found for number:', receivedNumber);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No recipient configured for this number' })
      };
    }

    // Prepare email content
    const emailSubject = `New Voicemail from ${callerNumber}`;
    const emailText = `
You have received a new voicemail:

From: ${callerNumber}
To: ${receivedNumber}
Call ID: ${callId}
Recording URL: ${recordingUrl}

Transcription:
${transcription || 'No transcription available'}

You can listen to the recording at: ${recordingUrl}
    `.trim();

    const emailHtml = `
<h2>New Voicemail Received</h2>
<p><strong>From:</strong> ${callerNumber}</p>
<p><strong>To:</strong> ${receivedNumber}</p>
<p><strong>Call ID:</strong> ${callId}</p>
<p><strong>Recording URL:</strong> <a href="${recordingUrl}">${recordingUrl}</a></p>

<h3>Transcription:</h3>
<p>${transcription ? transcription.replace(/\n/g, '<br>') : 'No transcription available'}</p>

<p><a href="${recordingUrl}" style="background-color: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Listen to Recording</a></p>
    `;

    // Prepare Mandrill API request
    const mandrillData = {
      key: process.env.MANDRILL_API_KEY,
      message: {
        from_email: process.env.MANDRILL_USER || 'voicemail@beethovenathome.com',
        from_name: 'Voicemail System',
        to: [
          {
            email: recipientEmail,
            type: 'to'
          }
        ],
        subject: emailSubject,
        text: emailText,
        html: emailHtml,
        important: true,
        track_opens: true,
        track_clicks: true,
        auto_text: true,
        inline_css: true
      }
    };

    // Send email via Mandrill
    const response = await sendMandrillEmail(mandrillData);
    
    console.log('Email sent successfully:', response);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        message: 'Voicemail processed successfully',
        emailSent: true,
        recipient: recipientEmail
      })
    };

  } catch (error) {
    console.error('Error processing webhook:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

// Function to send email via Mandrill API
function sendMandrillEmail(data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: 'mandrillapp.com',
      port: 443,
      path: '/api/1.0/messages/send.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedResponse = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsedResponse);
          } else {
            reject(new Error(`Mandrill API error: ${responseData}`));
          }
        } catch (parseError) {
          reject(new Error(`Failed to parse Mandrill response: ${parseError.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}