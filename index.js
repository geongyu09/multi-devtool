// serve-devtools.js
const express = require("express");

const app = express();
const PORT = 13000;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

// const devtoolsPath = path.join(__dirname, 'out/Default/gen/front_end');
// app.use(express.static(devtoolsPath));

app.get("/", async (req, res) => {
  try {
    // 1. Metro DevTools URL 가져오기
    let metroUrl = null;
    try {
      const metroResponse = await fetch("http://localhost:8081/json");
      const metroTargets = await metroResponse.json();
      const rnTarget = metroTargets[0];
      const devtoolsFrontendUrl = rnTarget?.devtoolsFrontendUrl;

      if (devtoolsFrontendUrl) {
        metroUrl = `http://127.0.0.1:8081${devtoolsFrontendUrl}`;
      }
    } catch (metroError) {
      console.warn("Metro 번들러 연결 실패:", metroError.message);
    }

    // 2. WebView 페이지 리스트 URL (web.js의 페이지 목록 UI)
    let webviewUrl = null;
    try {
      // web.js (포트 3001)가 실행 중인지 확인
      const response = await fetch("http://localhost:3001/api/pages");
      if (response.ok) {
        webviewUrl = "http://localhost:3001/";
      }
    } catch (cdpError) {
      console.warn("Web 서버 연결 실패:", cdpError.message);
    }

    // 3. 분할 화면 HTML 반환
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Unified Debugger</title>
        <style>
          body {
            margin: 0;
            display: flex;
            height: 100vh;
            overflow: hidden;
          }
          iframe {
            flex: 1;
            border: none;
            border-right: 2px solid #333;
          }
          iframe:last-child {
            border-right: none;
          }
          .error {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: #721c24;
            background: #f8d7da;
            font-family: Arial, sans-serif;
          }
          .error-content {
            text-align: center;
          }
          .error-content h2 {
            margin-top: 0;
          }
          .error-content code {
            background: #f5c6cb;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
          }
          .error-content ul {
            text-align: left;
            display: inline-block;
          }
        </style>
      </head>
      <body>
        ${metroUrl ? `<iframe src="${metroUrl}"></iframe>` : `
          <div class="error">
            <div class="error-content">
              <h2>Metro Debugger 없음</h2>
              <p>Metro 번들러를 실행해주세요.</p>
              <code>npx expo start</code>
            </div>
          </div>
        `}
        ${webviewUrl ? `<iframe src="${webviewUrl}"></iframe>` : `
          <div class="error">
            <div class="error-content">
              <h2>WebView Debugger 없음</h2>
              <p>Web 서버를 실행해주세요.</p>
              <code>node web.js</code>
              <p style="margin-top: 15px; font-size: 12px;">그리고 CDP 프록시도 실행해주세요:</p>
              <code>node cdp-proxy.js</code>
            </div>
          </div>
        `}
      </body>
      </html>
    `);
  } catch (error) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Unified Debugger - Error</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
          }
          .error {
            background: #f8d7da;
            color: #721c24;
            padding: 20px;
            border-radius: 5px;
          }
          .error h2 {
            margin-top: 0;
          }
          .error code {
            background: #f5c6cb;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
          }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>연결 실패</h2>
          <p>서버에 연결할 수 없습니다.</p>
          <p>다음을 확인하세요:</p>
          <ul>
            <li>Metro 번들러 실행 (포트 8081): <code>npx expo start</code></li>
            <li>CDP 프록시 실행 (포트 3002): <code>node cdp-proxy.js</code></li>
            <li>Web 서버 실행 (포트 3001): <code>node web.js</code></li>
          </ul>
          <p><strong>오류:</strong> ${error.message}</p>
        </div>
      </body>
      </html>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`devtool : http://localhost:${PORT}`);
});
