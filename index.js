require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

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

// 新版 SDK 的 Client 宣告方式
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text;

  try {
    // 呼叫 Dify API
    const response = await axios.post(`${process.env.DIFY_API_URL}/chat-messages`, {
      inputs: {},
      query: userMessage,
      response_mode: "blocking",
      user: event.source.userId || "default_user"
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const aiAnswer = response.data.answer;

    // 回覆 LINE 用戶 (新版回覆方法)
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: aiAnswer }]
    });

  } catch (error) {
    console.error('Dify API Error:', error.response ? error.response.data : error.message);
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '抱歉，AI 暫時無法回應，請稍後再試。' }]
    });
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服務已啟動，監聽端口：${PORT}`);
});