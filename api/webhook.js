const https = require('https');

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Raw webhook body:', req.body);
    
    const plivoData = req.body;
    console.log('Parsed Plivo data:', plivoData);
    
    // Extract relevant information from Plivo webhook
    const callerNumber = plivoData.From || plivoData.from || plivoData.src;
    const receivedNumber = plivoData.To || plivoData.to || plivoData.dst;
    const recordingUrl = plivoData.RecordUrl || plivoData.record_url || plivoData.recording_url;
    const callId = plivoData.CallUUID || plivoData.call_uuid;

    // Determine recipient based on the number called
    const recipientMap = {
      '+1234567890': 'sales@beethovenathome.com',
      '+1234567891': 'support@beethovenathome.com',
    };

    const recipientEmail = recipientMap[receivedNumber] || process.env.TARGET_EMAIL;

    if (!recipientEmail) {
      console.error('No recipient found for number:', receivedNumber);
      return res.status(400).json({ error: 'No recipient configured for this number' });
    }

    // Get transcription from OpenAI Whisper
    let transcription = 'Transcription not available';
    if (recordingUrl) {
      try {
        transcription = await transcribeWithWhisper(recordingUrl);
        console.log('OpenAI transcription:', transcription);
      } catch (error) {
        console.error('Transcription failed:', error);
        transcription = 'Transcription failed - please listen to recording';
      }
    }

    // Prepare email content
    const emailSubject = `New Voicemail from ${callerNumber}`;
    const emailText = `
You have received a new voicemail:

From: ${callerNumber}
To: ${receivedNumber}
Call ID: ${callId}
Recording URL: ${recordingUrl}

Transcription (AI-generated):
${transcription}

You can listen to the recording at: ${recordingUrl}
    `.trim();

    const emailHtml = `
<h2>New Voicemail Received</h2>
<p><strong>From:</strong> ${callerNumber}</p>
<p><strong>To:</strong> ${receivedNumber}</p>
<p><strong>Call ID:</strong> ${callId}</p>
<p><strong>Recording URL:</strong> <a href="${recordingUrl}">${recordingUrl}</a></p>

<h3>Transcription (AI-generated):</h3>
<p style="background-color: #f5f5f5; padding: 10px; border-left: 4px solid #007cba;">
${transcription.replace(/\n/g, '<br>')}
</p>

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
        auto_html: true
      }
    };

    // Send email via Mandrill
    const response = await sendMandrillEmail(mandrillData);
    
    console.log('Email sent successfully:', response);

    return res.status(200).json({ 
      message: 'Voicemail processed successfully',
      emailSent: true,
      recipient: recipientEmail,
      transcriptionMethod: 'OpenAI Whisper'
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}

// Function to transcribe audio using OpenAI Whisper
async function transcribeWithWhisper(audioUrl) {
  const formData = await createFormDataFromUrl(audioUrl);
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
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
            resolve(parsedResponse.text || 'No transcription available');
          } else {
            reject(new Error(`OpenAI API error (${res.statusCode}): ${responseData}`));
          }
        } catch (parseError) {
          reject(new Error(`Failed to parse OpenAI response: ${parseError.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    formData.pipe(req);
  });
}

// Function to download audio file and create form data
async function createFormDataFromUrl(url) {
  const FormData = require('form-data');
  const form = new FormData();
  
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download audio: ${response.statusCode}`));
        return;
      }
      
      // Add the audio stream to form data
      form.append('file', response, {
        filename: 'voicemail.mp3',
        contentType: 'audio/mpeg'
      });
      form.append('model', 'whisper-1');
      form.append('language', 'en'); // Can be removed for auto-detection
      
      resolve(form);
    }).on('error', reject);
  });
}

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
        let parsedResponse;
        try {
          parsedResponse = JSON.parse(responseData);
        } catch (parseError) {
          return reject(new Error(`Mandrill non-JSON response: ${responseData}`));
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsedResponse);
        } else {
          reject(new Error(`Mandrill API error (${res.statusCode}): ${responseData}`));
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
