const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Queue & Rate Limiting state (15 requests / 60000ms = 1 request every 4000ms)
const REQUEST_INTERVAL_MS = 4000;
let queue = [];
let isProcessing = false;
let batchStats = { total: 0, completed: 0, success: 0, failed: 0 };
let logs = [];

// Clean and validate Kenyan phone numbers
function formatPhoneNumber(phone) {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.slice(1);
  } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
    cleaned = '254' + cleaned;
  }
  if (/^254[71]\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

// Queue processor
async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  const item = queue.shift();
  const apiKey = process.env.KIFARU_API_KEY;
  const appId = process.env.KIFARU_APP_ID;

  const logEntry = {
    id: item.id,
    phone: item.phone,
    amount: item.amount,
    accountReference: item.accountReference,
    timestamp: new Date().toLocaleTimeString(),
    status: 'processing',
    message: 'Sending STK Push...'
  };

  logs.unshift(logEntry);

  try {
    const response = await axios.post(
      'https://api.kifarupay.co.ke/api/payments/stk-push',
      {
        appId: appId,
        phone: item.phone,
        amount: Number(item.amount),
        accountReference: item.accountReference,
        description: item.description || 'Bulk STK Payment'
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    logEntry.status = 'success';
    logEntry.message = response.data?.message || 'STK Push Sent';
    logEntry.checkoutId = response.data?.data?.CheckoutRequestID || 'N/A';
    batchStats.success++;
  } catch (error) {
    logEntry.status = 'failed';
    logEntry.message = error.response?.data?.message || error.message || 'API Error';
    batchStats.failed++;
  } finally {
    batchStats.completed++;
    
    // Maintain a maximum buffer of 200 log items
    if (logs.length > 200) logs.pop();

    if (queue.length > 0) {
      setTimeout(() => {
        isProcessing = false;
        processQueue();
      }, REQUEST_INTERVAL_MS);
    } else {
      isProcessing = false;
    }
  }
}

// POST endpoint to queue bulk requests
app.post('/api/bulk-stk', (req, res) => {
  const { numbersText, amount, accountReference, description } = req.body;

  if (!numbersText || !amount || !accountReference) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const rawLines = numbersText.split(/[\n,]+/);
  const itemsToQueue = [];
  const invalidNumbers = [];

  rawLines.forEach((rawPhone, index) => {
    const trimmed = rawPhone.trim();
    if (!trimmed) return;
    const formatted = formatPhoneNumber(trimmed);
    if (formatted) {
      itemsToQueue.push({
        id: `${Date.now()}-${index}`,
        phone: formatted,
        amount,
        accountReference,
        description
      });
    } else {
      invalidNumbers.push(trimmed);
    }
  });

  if (itemsToQueue.length === 0) {
    return res.status(400).json({ error: 'No valid phone numbers found.' });
  }

  // Reset batch statistics if queue was empty
  if (queue.length === 0 && !isProcessing) {
    batchStats = { total: itemsToQueue.length, completed: 0, success: 0, failed: 0 };
    logs = [];
  } else {
    batchStats.total += itemsToQueue.length;
  }

  queue.push(...itemsToQueue);
  processQueue();

  res.json({
    message: `Enqueued ${itemsToQueue.length} requests successfully.`,
    queuedCount: itemsToQueue.length,
    invalidCount: invalidNumbers.length,
    invalidNumbers
  });
});

// GET endpoint to poll status & logs
app.get('/api/status', (req, res) => {
  res.json({
    queueLength: queue.length,
    isProcessing,
    batchStats,
    logs
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
