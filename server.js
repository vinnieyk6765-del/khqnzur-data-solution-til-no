const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const products = [
  { id: 'daily-1', name: '10MB', category: 'daily', price: 20, details: 'Valid for 1 day' },
  { id: 'daily-2', name: '50MB', category: 'daily', price: 50, details: 'Good for browsing and social media' },
  { id: 'daily-3', name: '100MB', category: 'daily', price: 100, details: 'Affordable daily internet' },
  { id: 'weekly-1', name: '1GB Weekly', category: 'weekly', price: 100, details: '7 days validity' },
  { id: 'weekly-2', name: '2GB Weekly', category: 'weekly', price: 200, details: 'Perfect for work and streaming' },
  { id: 'monthly-1', name: '5GB Monthly', category: 'monthly', price: 500, details: '30 days validity' },
  { id: 'monthly-2', name: '10GB Monthly', category: 'monthly', price: 1000, details: 'Heavy usage package' },
  { id: 'night-1', name: 'Night Bundle', category: 'night', price: 50, details: 'Night browsing package' },
  { id: 'night-2', name: 'Unlimited Night', category: 'night', price: 100, details: 'Unlimited night data' }
];

const transactions = [];
let accessToken = null;
let tokenExpiry = 0;

function normalizePhone(phone) {
  if (!phone) return null;
  let p = phone.trim().replace(/\\s+/g, '').replace(/^\\+/, '');
  if (p.startsWith('0')) p = '254' + p.slice(1);
  if (!/^254\\d{9}$/.test(p)) return null;
  return p;
}

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const auth = Buffer.from(
    `${process.env.SAFARICOM_CONSUMER_KEY}:${process.env.SAFARICOM_CONSUMER_SECRET}`
  ).toString('base64');

  const baseUrl =
    process.env.ENVIRONMENT === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

  const response = await axios.get(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${auth}`
      }
    }
  );

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 10000;

  return accessToken;
}

async function initiateStkPush(phoneNumber, amount, bundleId) {
  const token = await getAccessToken();

  const baseUrl =
    process.env.ENVIRONMENT === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, -3);

  const password = Buffer.from(
    `${process.env.SAFARICOM_SHORTCODE}${process.env.SAFARICOM_PASSKEY}${timestamp}`
  ).toString('base64');

  const payload = {
    BusinessShortCode: process.env.SAFARICOM_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Number(amount),
    PartyA: phoneNumber,
    PartyB: process.env.SAFARICOM_SHORTCODE,
    PhoneNumber: phoneNumber,
    CallBackURL: process.env.CALLBACK_URL,
    AccountReference: bundleId,
    TransactionDesc: `KHQNZUR Data Bundle - ${bundleId}`
  };

  const response = await axios.post(
    `${baseUrl}/mpesa/stkpush/v1/processrequest`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'KHQNZUR API running' });
});

app.get('/api/products', (req, res) => {
  res.json(products);
});

app.post('/api/payment/initiate', async (req, res) => {
  try {
    const { phoneNumber, bundleId } = req.body;

    if (!phoneNumber || !bundleId) {
      return res.status(400).json({ error: 'Phone number and bundle ID are required' });
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const product = products.find(p => p.id === bundleId);
    if (!product) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    const stkResponse = await initiateStkPush(normalizedPhone, product.price, product.id);

    const transaction = {
      id: `TXN-${Date.now()}`,
      phoneNumber: normalizedPhone,
      bundleId: product.id,
      bundleName: product.name,
      amount: product.price,
      status: 'pending',
      checkoutRequestId: stkResponse.CheckoutRequestID || null,
      responseCode: stkResponse.ResponseCode || null,
      createdAt: new Date().toISOString()
    };

    transactions.push(transaction);

    return res.json({
      success: true,
      message: 'STK push sent successfully',
      transaction
    });
  } catch (error) {
    console.error('Payment initiation error:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Payment initiation failed',
      details: error.response?.data || error.message
    });
  }
});

app.post('/api/payment/callback', (req, res) => {
  try {
    const callbackBody = req.body;

    if (!callbackBody || !callbackBody.Body || !callbackBody.Body.stkCallback) {
      return res.status(400).json({ ResultCode: 1, ResultDesc: 'Invalid callback payload' });
    }

    const callback = callbackBody.Body.stkCallback;
    const resultCode = callback.ResultCode;

    const transaction = transactions.find(
      t => t.checkoutRequestId === callback.CheckoutRequestID
    );

    if (transaction) {
      if (resultCode === 0) {
        transaction.status = 'completed';
        transaction.mpesaReceiptNumber =
          callback.CallbackMetadata?.Item?.find(item => item.Name === 'MpesaReceiptNumber')?.Value || null;
        transaction.completedAt = new Date().toISOString();
      } else {
        transaction.status = 'failed';
        transaction.failureReason = callback.ResultDesc || 'Payment failed';
      }
    }

    return res.json({ ResultCode: 0, ResultDesc: 'Callback processed successfully' });
  } catch (error) {
    console.error('Callback processing error:', error);
    return res.status(500).json({ ResultCode: 1, ResultDesc: 'Callback processing failed' });
  }
});

app.get('/api/admin/transactions', (req, res) => {
  res.json(transactions);
});

app.put('/api/admin/product/:id', (req, res) => {
  const { price } = req.body;
  const product = products.find(p => p.id === req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  if (!price || Number(price) <= 0) {
    return res.status(400).json({ error: 'Invalid price' });
  }

  product.price = Number(price);
  return res.json({ success: true, product });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KHQNZUR backend running on http://localhost:${PORT}`);
});