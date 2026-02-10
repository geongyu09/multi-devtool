// serve-devtools.js
const express = require("express");
const path = require("node:path");

const app = express();
const PORT = 3001;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

const devtoolsPath = path.join(__dirname, "out/Default/gen/front_end");
app.use(express.static(devtoolsPath));

// 페이지 목록 조회 API 프록시
app.get("/api/pages", async (_req, res) => {
  try {
    const response = await fetch("http://localhost:3002/api/pages");
    const pages = await response.json();
    res.json(pages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 루트: 등록된 페이지 목록 보여주기
app.get("/", async (_req, res) => {
  try {
    const response = await fetch("http://localhost:3002/api/pages");
    const pages = await response.json();

    res.send(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <title>DevTools - 페이지 목록</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 900px;
            margin: 50px auto;
            padding: 20px;
          }
          h1 {
            color: #333;
          }
          .page-list {
            list-style: none;
            padding: 0;
          }
          .page-item {
            background: #f5f5f5;
            margin: 10px 0;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #4CAF50;
          }
          .page-title {
            font-size: 18px;
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
          }
          .page-url {
            color: #666;
            font-size: 14px;
            margin-bottom: 10px;
          }
          .page-meta {
            color: #999;
            font-size: 12px;
            margin-bottom: 10px;
          }
          .inspect-btn {
            display: inline-block;
            background: #4CAF50;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 3px;
            font-size: 14px;
          }
          .inspect-btn:hover {
            background: #45a049;
          }
          .no-pages {
            text-align: center;
            padding: 40px;
            color: #999;
          }
          .refresh-btn {
            background: #2196F3;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
          }
          .refresh-btn:hover {
            background: #0b7dda;
          }
        </style>
      </head>
      <body>
        <h1>Chrome DevTools - 등록된 페이지</h1>
        <button class="refresh-btn" onclick="location.reload()">🔄 새로고침</button>

        ${pages.length === 0 ? `
          <div class="no-pages">
            <p>등록된 페이지가 없습니다.</p>
            <p>웹페이지에 다음 스크립트를 추가하세요:</p>
            <code>&lt;script src="http://localhost:3002/devtools-client.js"&gt;&lt;/script&gt;</code>
          </div>
        ` : `
          <ul class="page-list">
            ${pages.map(page => `
              <li class="page-item">
                <div class="page-title">${page.title || '(제목 없음)'}</div>
                <div class="page-url">${page.url}</div>
                <div class="page-meta">
                  ID: ${page.id} |
                  등록 시간: ${new Date(page.registeredAt).toLocaleString()}
                </div>
                <a href="/inspector.html?ws=localhost:3002/devtools/page/${page.id}"
                   class="inspect-btn">
                  🔍 Inspect
                </a>
              </li>
            `).join('')}
          </ul>
        `}
      </body>
      </html>
    `);
  } catch (error) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>DevTools - Error</title>
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
        </style>
      </head>
      <body>
        <div class="error">
          <h2>연결 실패</h2>
          <p>CDP 프록시 서버에 연결할 수 없습니다.</p>
          <p>다음을 확인하세요:</p>
          <ul>
            <li>cdp-proxy.js 서버가 실행 중인지 확인 (포트 3002)</li>
            <li><code>node cdp-proxy.js</code></li>
          </ul>
          <p>오류: ${error.message}</p>
        </div>
      </body>
      </html>
    `);
  }
});

// app.get('/', async (req, res) => {
//   try {
//     const metroResponse = await fetch('http://localhost:8081/json');
//     const metroTargets = await metroResponse.json();

//     const rnTarget = metroTargets[0];
//     const devtoolsFrontendUrl = rnTarget?.devtoolsFrontendUrl;

//     if(!devtoolsFrontendUrl) {
//       throw new Error('[ERROR] metro bundler에서 devtoolsFrontendUrl 정보를 가져올 수 없습니다.');
//     }

//     //TODO: 포트 직접 받도록 기능 추가 필요
//     const metroUrl = `http://127.0.0.1:8081${devtoolsFrontendUrl}`;

//     // CDP 타겟 가져오기
//     const cdpResponse = await fetch('http://localhost:9222/json');
//     const cdpTargets = await cdpResponse.json();

//     const webviewTarget = cdpTargets.find(t => t.url?.includes('localhost:3000'));
//     const cdpUrl = webviewTarget
//       ? `http://localhost:8090/front_end/devtools_app.html?ws=localhost:9222/devtools/page/${webviewTarget.id}`
//       : '';

//       console.log(cdpUrl)

//     // return res.redirect(cdpUrl);
//     res.send(`
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <title>Unified Debugger</title>
//         <style>
//           body { margin: 0; display: flex; height: 100vh; }
//           iframe { flex: 1; border: none; border-right: 2px solid #333; }
//           iframe:last-child { border-right: none; }
//           .error { padding: 20px; color: red; }
//         </style>
//       </head>
//       <body>
//         ${metroUrl ? `<iframe src="${metroUrl}"></iframe>` : '<div class="error">Metro debugger not found</div>'}
//         ${cdpUrl ? `<iframe src="${cdpUrl}"></iframe>` : '<div class="error">Metro debugger not found</div>'}

//       </body>
//       </html>
//     `);
//   } catch (error) {
//     res.send(`Error: ${error.message}`);
//   }
// });

app.listen(PORT, () => {
  console.log(`devtool : http://localhost:${PORT}`);
});
