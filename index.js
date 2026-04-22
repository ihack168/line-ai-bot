require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const FormData = require('form-data');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const app = express();

// LINE Webhook 路由
app.post('/callback', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// --- 修正後的 Client 宣告方式 ---
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

// 這裡修正了導致 Crash 的地方
const lineContentClient = new line.messagingApi.MessagingContentClient({
  channelAccessToken: config.channelAccessToken
});

async function handleEvent(event) {
  if (event.type !== 'message' || (event.message.type !== 'text' && event.message.type !== 'image')) {
    return Promise.resolve(null);
  }

  const userId = event.source.userId || "default_user";

  try {
    let files = [];

    if (event.message.type === 'image') {
      // 使用修正後的 lineContentClient 獲取內容
      const stream = await lineContentClient.getMessageContent(event.message.id);
      
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      const formData = new FormData();
      formData.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
      formData.append('user', userId);

      const uploadRes = await axios.post(`${process.env.DIFY_API_URL}/files/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
        }
      });

      files = [{
        type: "image",
        transfer_method: "local_file",
        upload_file_id: uploadRes.data.id
      }];
    }

    const response = await axios.post(`${process.env.DIFY_API_URL}/chat-messages`, {
      inputs: {},
      query: event.message.type === 'text' ? event.message.text : "這張圖片是什麼？",
      response_mode: "blocking",
      user: userId,
      files: files
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const aiAnswer = response.data.answer;

    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: aiAnswer }]
    });

  } catch (error) {
    console.error('Error Details:', error.response ? error.response.data : error.message);
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '系統忙碌中，請稍後再試。' }]
    });
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服務啟動成功！正在監聽端口：${PORT}`);
});